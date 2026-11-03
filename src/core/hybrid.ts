import { bm25Score, DEFAULT_BM25, type BM25Config } from './bm25.js';
import { fieldText, type SearchIndex } from './index-builder.js';
import { tokenize } from './tokenizer.js';
import { buildQueryVector, cosine, vectorSearch, type VectorIndex } from './vsm.js';
import type { ScoreBreakdown } from './types.js';

/**
 * 混合排序
 *
 * 单一信号都有明显短板：BM25 不懂语义、余弦相似度对长文档不敏感、
 * 引用数会把综述顶到前面而忽略相关性。所以这里做加权融合：
 *
 *   final = w1·BM25_norm + w2·cos + w3·citation + w4·recency + w5·phrase
 *
 * 每一项都归一到 [0,1] 再线性组合，权重是唯一需要调的参数，
 * 而且可以直接交给评测脚本做对比实验——这就是「可解释」和「可优化」。
 */
export interface HybridWeights {
  bm25: number;
  vector: number;
  citation: number;
  recency: number;
  phrase: number;
}

/**
 * 默认权重来自 `npm run tune` 的网格搜索结果：
 * 在这个语料上，最优解会退化成「BM25 + 少量短语/向量信号」，
 * 引用与时效的权重必须压得很低，否则会把高被引的老论文顶到前面。
 */
export const DEFAULT_HYBRID: HybridWeights = {
  bm25: 0.7,
  vector: 0.2,
  citation: 0.05,
  recency: 0.05,
  phrase: 0.05,
};

export interface HybridHit {
  docId: string;
  score: number;
  breakdown: ScoreBreakdown;
  matched: Set<string>;
}

const ZERO_BREAKDOWN: ScoreBreakdown = { bm25: 0, vector: 0, citation: 0, recency: 0, phrase: 0 };

export function hybridScore(
  index: SearchIndex,
  vec: VectorIndex,
  terms: string[],
  rawQuery: string,
  weights: HybridWeights = DEFAULT_HYBRID,
  bm25Config: BM25Config = DEFAULT_BM25,
): HybridHit[] {
  const bm25Results = bm25Score(index, terms, bm25Config);
  const maxBm25 = bm25Results.length > 0 ? bm25Results[0].score : 0;

  const queryVector = buildQueryVector(index, terms, vec.fieldWeights);
  const vectorResults = vectorSearch(vec, queryVector);
  const vectorMap = new Map(vectorResults.map((hit) => [hit.docId, hit.score]));

  const candidates = new Set<string>();
  for (const r of bm25Results) candidates.add(r.docId);
  for (const r of vectorResults) candidates.add(r.docId);

  const maxYear = index.papers.reduce((max, p) => Math.max(max, p.year), 2000);
  const phrase = rawQuery.trim().toLowerCase();
  const logMaxCitations = Math.log1p(index.maxCitations) || 1;

  const hits: HybridHit[] = [];
  for (const docId of candidates) {
    const paper = index.byId.get(docId);
    if (!paper) continue;

    const bm25Raw = bm25Results.find((r) => r.docId === docId);
    const bm25Norm = maxBm25 > 0 ? (bm25Raw?.score ?? 0) / maxBm25 : 0;
    const cos = vectorMap.get(docId) ?? 0;
    const citationNorm = Math.log1p(paper.citations) / logMaxCitations;
    // 半衰期约 8 年的时效衰减：老论文不会因为年份被完全压死，但新论文有加成
    const recency = Math.exp(-Math.max(0, maxYear - paper.year) / 8);

    let phraseScore = 0;
    const titleLower = paper.title.toLowerCase();
    if (phrase.length > 0 && titleLower.includes(phrase)) {
      phraseScore = 1;
    } else {
      const titleTerms = new Set(tokenize(fieldText(paper, 'title')));
      const covered = terms.filter((t) => titleTerms.has(t)).length;
      if (terms.length > 0 && covered === terms.length) phraseScore = 0.6;
    }

    const breakdown: ScoreBreakdown = {
      bm25: bm25Norm,
      vector: cos,
      citation: citationNorm,
      recency,
      phrase: phraseScore,
    };

    const score =
      weights.bm25 * bm25Norm +
      weights.vector * cos +
      weights.citation * citationNorm +
      weights.recency * recency +
      weights.phrase * phraseScore;

    hits.push({ docId, score, breakdown, matched: bm25Raw?.matched ?? new Set<string>() });
  }

  return hits.sort((a, b) => b.score - a.score);
}

export { ZERO_BREAKDOWN };
