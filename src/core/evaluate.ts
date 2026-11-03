import type { EvalQuery, EvalReport, Metrics, ScoreMode } from './types.js';

/**
 * 离线评测
 *
 * 一个检索系统如果没有指标，就只能靠「感觉还行」来判断好坏——这在实验室里是站不住的。
 * 这里实现四个最常用的指标，全部按标准定义手写：
 *
 *  P@5      : 前 5 条里有多少条是相关的
 *  R@5      : 前 5 条覆盖了全部相关文档的多大比例
 *  NDCG@10  : 考虑相关性等级和位置折损，最贴近真实排序质量
 *  MRR      : 第一条相关结果排名的倒数，衡量「用户是否一眼看到答案」
 */

export type SearchFn = (query: string, mode: ScoreMode, k: number) => string[];

export function precisionAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (k <= 0) return 0;
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  const hits = top.filter((id) => relevant.has(id)).length;
  return hits / k;
}

export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const top = ranked.slice(0, k);
  const hits = top.filter((id) => relevant.has(id)).length;
  return hits / relevant.size;
}

function dcg(gains: number[]): number {
  return gains.reduce((sum, gain, index) => sum + (Math.pow(2, gain) - 1) / Math.log2(index + 2), 0);
}

export function ndcgAtK(ranked: string[], grades: Map<string, number>, k: number): number {
  const idealGains = [...grades.values()].filter((g) => g > 0).sort((a, b) => b - a).slice(0, k);
  const ideal = dcg(idealGains);
  if (ideal === 0) return 0;
  const actual = dcg(ranked.slice(0, k).map((id) => grades.get(id) ?? 0));
  return actual / ideal;
}

export function meanReciprocalRank(ranked: string[], relevant: Set<string>): number {
  const position = ranked.findIndex((id) => relevant.has(id));
  return position === -1 ? 0 : 1 / (position + 1);
}

export function evaluateQuery(
  ranked: string[],
  relevance: Record<string, number>,
  k: number,
): Metrics {
  const grades = new Map(Object.entries(relevance));
  const relevant = new Set(grades.keys());
  return {
    p5: precisionAtK(ranked, relevant, 5),
    r5: recallAtK(ranked, relevant, 5),
    ndcg10: ndcgAtK(ranked, grades, Math.max(k, 10)),
    mrr: meanReciprocalRank(ranked, relevant),
  };
}

const MODES: ScoreMode[] = ['bm25', 'vector', 'hybrid'];

function average(list: Metrics[]): Metrics {
  if (list.length === 0) return { p5: 0, r5: 0, ndcg10: 0, mrr: 0 };
  const sum = list.reduce(
    (acc, m) => ({
      p5: acc.p5 + m.p5,
      r5: acc.r5 + m.r5,
      ndcg10: acc.ndcg10 + m.ndcg10,
      mrr: acc.mrr + m.mrr,
    }),
    { p5: 0, r5: 0, ndcg10: 0, mrr: 0 },
  );
  return {
    p5: sum.p5 / list.length,
    r5: sum.r5 / list.length,
    ndcg10: sum.ndcg10 / list.length,
    mrr: sum.mrr / list.length,
  };
}

export function evaluateQueries(
  queries: EvalQuery[],
  searchFn: SearchFn,
  k = 10,
): EvalReport {
  const byMode: Record<ScoreMode, Metrics[]> = { bm25: [], vector: [], hybrid: [] };
  const perQuery: EvalReport['perQuery'] = [];

  for (const query of queries) {
    const detail = {} as Record<ScoreMode, Metrics>;
    for (const mode of MODES) {
      const ranked = searchFn(query.query, mode, Math.max(k, 10));
      const metrics = evaluateQuery(ranked, query.relevance, k);
      detail[mode] = metrics;
      byMode[mode].push(metrics);
    }
    const best = MODES.reduce((a, b) => (detail[b].ndcg10 > detail[a].ndcg10 ? b : a), MODES[0]);
    perQuery.push({ id: query.id, query: query.query, best, detail });
  }

  return {
    queries: queries.length,
    k,
    results: MODES.map((mode) => ({ mode, metrics: average(byMode[mode]) })),
    perQuery,
  };
}
