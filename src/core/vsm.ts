import type { SearchIndex } from './index-builder.js';
import { FIELDS, type FieldName } from './types.js';

/**
 * 向量空间模型（TF-IDF + 余弦相似度）
 *
 * 权重：w(t, d) = fieldWeight · (1 + log tf) · (log((N+1)/(df+1)) + 1)
 * 对 tf 取对数是为了压缩长文档里词频的膨胀；idf 用加 1 平滑避免除零。
 *
 * 文档向量在构建时就做 L2 归一化，于是余弦相似度退化成点积，
 * 单次比较从「两次开方 + 一次除法」变成纯乘加，批量比较时更省。
 */
export interface VectorIndex {
  vectors: Map<string, Map<string, number>>;
  fieldWeights: Record<FieldName, number>;
}

export const DEFAULT_FIELD_WEIGHTS: Record<FieldName, number> = {
  title: 3.0,
  abstract: 1.0,
  keywords: 2.0,
};

export function buildVectorIndex(
  index: SearchIndex,
  fieldWeights: Record<FieldName, number> = DEFAULT_FIELD_WEIGHTS,
): VectorIndex {
  const vectors = new Map<string, Map<string, number>>();

  for (const field of FIELDS) {
    const fieldWeight = fieldWeights[field];
    for (const [term, posting] of index.postings[field]) {
      const df = index.df[field].get(term) ?? 1;
      const idf = Math.log((index.N + 1) / (df + 1)) + 1;
      for (const [docId, tf] of posting) {
        const weight = fieldWeight * (1 + Math.log(tf)) * idf;
        let vector = vectors.get(docId);
        if (!vector) {
          vector = new Map<string, number>();
          vectors.set(docId, vector);
        }
        vector.set(term, (vector.get(term) ?? 0) + weight);
      }
    }
  }

  for (const vector of vectors.values()) {
    let squared = 0;
    for (const weight of vector.values()) squared += weight * weight;
    const norm = Math.sqrt(squared) || 1;
    for (const [term, weight] of vector) vector.set(term, weight / norm);
  }

  return { vectors, fieldWeights };
}

/** 用查询词项构造一个同样归一化的稀疏向量 */
export function buildQueryVector(
  index: SearchIndex,
  terms: string[],
  fieldWeights: Record<FieldName, number> = DEFAULT_FIELD_WEIGHTS,
): Map<string, number> {
  const acc = new Map<string, number>();
  for (const term of new Set(terms)) {
    let weight = 0;
    for (const field of FIELDS) {
      const df = index.df[field].get(term);
      if (!df) continue;
      const idf = Math.log((index.N + 1) / (df + 1)) + 1;
      weight += fieldWeights[field] * idf;
    }
    if (weight > 0) acc.set(term, weight);
  }

  let squared = 0;
  for (const weight of acc.values()) squared += weight * weight;
  const norm = Math.sqrt(squared) || 1;
  for (const [term, weight] of acc) acc.set(term, weight / norm);
  return acc;
}

/** 两个已归一化向量的余弦相似度 */
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += weight * other;
  }
  return dot;
}

export interface VectorHit {
  docId: string;
  score: number;
}

export function vectorSearch(
  vec: VectorIndex,
  queryVector: Map<string, number>,
): VectorHit[] {
  const hits: VectorHit[] = [];
  for (const [docId, vector] of vec.vectors) {
    const score = cosine(queryVector, vector);
    if (score > 0) hits.push({ docId, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}
