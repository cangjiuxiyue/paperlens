/** 领域模型与公共类型定义 */

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  topic: string;
  citations: number;
  keywords: string[];
  abstract: string;
}

/** 参与索引的字段。字段权重是 BM25 效果的关键超参数之一。 */
export const FIELDS = ['title', 'abstract', 'keywords'] as const;
export type FieldName = (typeof FIELDS)[number];

export type ScoreMode = 'bm25' | 'vector' | 'hybrid';

export interface EvalQuery {
  id: string;
  query: string;
  /** docId -> 相关性等级（0/1/2/3），用于 NDCG 的折损累计增益计算 */
  relevance: Record<string, number>;
}

/** 单条检索结果的完整解释信息，前端用它渲染「为什么这条排第一」 */
export interface ScoreBreakdown {
  bm25: number;
  vector: number;
  citation: number;
  recency: number;
  phrase: number;
}

export interface SearchHit {
  paper: Paper;
  rank: number;
  score: number;
  breakdown: ScoreBreakdown;
  matchedTerms: string[];
  snippet: string;
}

export interface SearchResponse {
  query: string;
  mode: ScoreMode;
  expandedTerms: string[];
  tookMs: number;
  total: number;
  hits: SearchHit[];
}

export interface Recommendation {
  paper: Paper;
  score: number;
  sharedTerms: string[];
}

export interface Metrics {
  p5: number;
  r5: number;
  ndcg10: number;
  mrr: number;
}

export interface EvalReport {
  queries: number;
  k: number;
  results: Array<{ mode: ScoreMode; metrics: Metrics }>;
  perQuery: Array<{ id: string; query: string; best: ScoreMode; detail: Record<ScoreMode, Metrics> }>;
}
