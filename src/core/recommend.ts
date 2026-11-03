import type { SearchIndex } from './index-builder.js';
import { cosine, type VectorIndex } from './vsm.js';
import type { Paper } from './types.js';

/**
 * 相似文献推荐
 *
 * 直接复用文档的 TF-IDF 向量：两篇论文的向量余弦相似度越高，
 * 说明它们共享的高权重词项越多（且这些词项在全集里越稀有）。
 * 这本质上就是「基于内容的协同过滤」的极简版本，不需要用户行为数据。
 */
export interface RecommendHit {
  paper: Paper;
  score: number;
  sharedTerms: string[];
}

export function recommendSimilar(
  index: SearchIndex,
  vec: VectorIndex,
  docId: string,
  k = 5,
): RecommendHit[] {
  const target = vec.vectors.get(docId);
  if (!target) return [];

  const scored: Array<{ docId: string; score: number }> = [];
  for (const [otherId, otherVec] of vec.vectors) {
    if (otherId === docId) continue;
    const score = cosine(target, otherVec);
    if (score > 0) scored.push({ docId: otherId, score });
  }
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k).flatMap(({ docId: otherId, score }) => {
    const paper = index.byId.get(otherId);
    if (!paper) return [];
    const otherVec = vec.vectors.get(otherId);
    const sharedTerms = otherVec
      ? [...target.entries()]
          .filter(([term]) => otherVec.has(term))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([term]) => term)
      : [];
    return [{ paper, score, sharedTerms }];
  });
}
