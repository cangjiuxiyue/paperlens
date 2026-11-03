import type { SearchIndex } from './index-builder.js';
import { FIELDS, type FieldName } from './types.js';

/**
 * BM25 打分
 *
 * score(q, d) = Σ_t IDF(t) · ( tf · (k1 + 1) ) / ( tf + k1 · (1 - b + b · |d| / avgdl) )
 *
 * 两个超参数的直觉：
 *  - k1 控制词频饱和速度：一个词出现 10 次不该比出现 1 次重要 10 倍
 *  - b 控制长度归一化强度：长文档天然更容易命中词项，需要打折
 *
 * 字段加权是把标题命中放大 3 倍、关键词 2 倍，这是检索系统里最便宜的精度提升手段。
 */
export interface BM25Config {
  k1: number;
  b: number;
  fieldWeights: Record<FieldName, number>;
}

export const DEFAULT_BM25: BM25Config = {
  k1: 1.2,
  b: 0.75,
  fieldWeights: { title: 3.0, abstract: 1.0, keywords: 2.0 },
};

export interface BM25Result {
  docId: string;
  score: number;
  perField: Record<FieldName, number>;
  matched: Set<string>;
}

export function bm25Score(
  index: SearchIndex,
  terms: string[],
  config: BM25Config = DEFAULT_BM25,
): BM25Result[] {
  const unique = [...new Set(terms)];
  const results = new Map<string, BM25Result>();

  for (const term of unique) {
    for (const field of FIELDS) {
      const posting = index.postings[field].get(term);
      if (!posting || posting.size === 0) continue;

      const df = index.df[field].get(term) ?? 0;
      // 加 1 的平滑形式，保证 IDF 恒为正，避免极高频词拿到负分
      const idf = Math.log(1 + (index.N - df + 0.5) / (df + 0.5));
      const avgdl = index.avgLen[field] || 1;
      const fieldWeight = config.fieldWeights[field];

      for (const [docId, tf] of posting) {
        const dl = index.docLen.get(docId)?.[field] ?? avgdl;
        const denominator = tf + config.k1 * (1 - config.b + (config.b * dl) / avgdl);
        const contribution = fieldWeight * idf * ((tf * (config.k1 + 1)) / denominator);

        let entry = results.get(docId);
        if (!entry) {
          entry = {
            docId,
            score: 0,
            perField: { title: 0, abstract: 0, keywords: 0 },
            matched: new Set<string>(),
          };
          results.set(docId, entry);
        }
        entry.score += contribution;
        entry.perField[field] += contribution;
        entry.matched.add(term);
      }
    }
  }

  return [...results.values()].sort((a, b) => b.score - a.score);
}
