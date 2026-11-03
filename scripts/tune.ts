import { createEngine } from '../src/core/engine.js';
import { DEFAULT_HYBRID, type HybridWeights } from '../src/core/hybrid.js';

/**
 * 权重网格搜索：npm run tune
 *
 * 混合排序里 5 个权重是唯一的超参数。与其凭直觉拍一组，不如在带标注的查询集上
 * 做一次穷举，把「调参」这件事变成可复现的实验。
 *
 * 注意：这里用的是同一份评测集，存在过拟合风险。更严谨的做法是切分
 * 开发集/测试集，或者做 k 折交叉验证——这一点在 README 里写清楚了。
 */

const engine = createEngine();

const GRID = {
  bm25: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
  vector: [0, 0.1, 0.2, 0.3, 0.4],
  citation: [0, 0.03, 0.06, 0.1],
  recency: [0, 0.03, 0.06],
  phrase: [0, 0.05, 0.1, 0.15],
};

interface Candidate {
  weights: HybridWeights;
  ndcg: number;
  p5: number;
  mrr: number;
}

function evaluateWeights(weights: HybridWeights): Candidate {
  let ndcg = 0;
  let p5 = 0;
  let mrr = 0;

  for (const query of engine.queries) {
    const ranked = engine
      .search(query.query, { mode: 'hybrid', k: 10, weights })
      .hits.map((h) => h.paper.id);

    const grades = new Map(Object.entries(query.relevance));
    const ideal = [...grades.values()].sort((a, b) => b - a).slice(0, 10);
    const dcg = (gains: number[]) =>
      gains.reduce((s, g, i) => s + (Math.pow(2, g) - 1) / Math.log2(i + 2), 0);

    const idcg = dcg(ideal);
    ndcg += idcg > 0 ? dcg(ranked.slice(0, 10).map((id) => grades.get(id) ?? 0)) / idcg : 0;

    const top5 = ranked.slice(0, 5);
    p5 += top5.filter((id) => grades.has(id)).length / 5;
    const first = ranked.findIndex((id) => grades.has(id));
    mrr += first === -1 ? 0 : 1 / (first + 1);
  }

  const n = engine.queries.length || 1;
  return { weights, ndcg: ndcg / n, p5: p5 / n, mrr: mrr / n };
}

const candidates: Candidate[] = [];
for (const bm25 of GRID.bm25) {
  for (const vector of GRID.vector) {
    for (const citation of GRID.citation) {
      for (const recency of GRID.recency) {
        for (const phrase of GRID.phrase) {
          candidates.push(evaluateWeights({ bm25, vector, citation, recency, phrase }));
        }
      }
    }
  }
}

candidates.sort((a, b) => b.ndcg - a.ndcg || b.mrr - a.mrr);

const fmt = (w: HybridWeights) =>
  `bm25=${w.bm25.toFixed(2)} vector=${w.vector.toFixed(2)} citation=${w.citation.toFixed(2)} recency=${w.recency.toFixed(2)} phrase=${w.phrase.toFixed(2)}`;

const baseline = evaluateWeights(DEFAULT_HYBRID);
const bm25Only = evaluateWeights({ bm25: 1, vector: 0, citation: 0, recency: 0, phrase: 0 });

console.log('');
console.log(`  权重网格搜索：${candidates.length} 组候选 × ${engine.queries.length} 条查询`);
console.log('  ' + '─'.repeat(74));
console.log(`  当前默认   NDCG@10 ${baseline.ndcg.toFixed(4)}   P@5 ${baseline.p5.toFixed(4)}   MRR ${baseline.mrr.toFixed(4)}`);
console.log(`  纯 BM25    NDCG@10 ${bm25Only.ndcg.toFixed(4)}   P@5 ${bm25Only.p5.toFixed(4)}   MRR ${bm25Only.mrr.toFixed(4)}`);
console.log('  ' + '─'.repeat(74));
console.log('  最优前 5 组：');
for (const c of candidates.slice(0, 5)) {
  console.log(`    NDCG ${c.ndcg.toFixed(4)}  P@5 ${c.p5.toFixed(4)}  MRR ${c.mrr.toFixed(4)}`);
  console.log(`      ${fmt(c.weights)}`);
}
console.log('');
