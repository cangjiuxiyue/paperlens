import fs from 'node:fs';
import { PAPERS_PATH, QUERIES_PATH } from '../config.js';
import { bm25Score } from './bm25.js';
import { evaluateQueries } from './evaluate.js';
import { hybridScore, ZERO_BREAKDOWN, type HybridWeights } from './hybrid.js';
import { buildIndex, type SearchIndex } from './index-builder.js';
import { expandChineseTerms } from './queryExpansion.js';
import { recommendSimilar, type RecommendHit } from './recommend.js';
import { tokenize } from './tokenizer.js';
import type {
  EvalQuery,
  EvalReport,
  Paper,
  ScoreBreakdown,
  ScoreMode,
  SearchHit,
  SearchResponse,
} from './types.js';
import { buildQueryVector, buildVectorIndex, vectorSearch, type VectorIndex } from './vsm.js';

export function loadPapers(path = PAPERS_PATH): Paper[] {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as Paper[];
}

export function loadQueries(path = QUERIES_PATH): EvalQuery[] {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as EvalQuery[];
}

export interface SearchOptions {
  mode?: ScoreMode;
  k?: number;
  /** 仅 hybrid 模式生效，便于做权重实验 */
  weights?: HybridWeights;
}

export interface EngineStats {
  papers: number;
  terms: number;
  avgTitleLength: number;
  avgAbstractLength: number;
  topics: Array<{ topic: string; count: number }>;
  yearRange: [number, number];
}

export interface Engine {
  index: SearchIndex;
  vectors: VectorIndex;
  papers: Paper[];
  queries: EvalQuery[];
  search(query: string, options?: SearchOptions): SearchResponse;
  recommend(docId: string, k?: number): RecommendHit[];
  evaluate(k?: number): EvalReport;
  stats(): EngineStats;
}

interface RawHit {
  docId: string;
  score: number;
  breakdown: ScoreBreakdown;
  matched: Set<string>;
}

/** 截取摘要中最早出现查询词的位置，前后各留一段上下文 */
function makeSnippet(abstract: string, matched: string[]): string {
  const lower = abstract.toLowerCase();
  let at = -1;
  for (const term of matched) {
    const idx = lower.indexOf(term);
    if (idx >= 0 && (at === -1 || idx < at)) at = idx;
  }
  if (at === -1) return abstract.length > 220 ? `${abstract.slice(0, 220).trim()}…` : abstract;
  const start = Math.max(0, at - 90);
  const end = Math.min(abstract.length, at + 160);
  return `${start > 0 ? '…' : ''}${abstract.slice(start, end).trim()}${end < abstract.length ? '…' : ''}`;
}

export function createEngine(papers: Paper[] = loadPapers(), queries: EvalQuery[] = loadQueries()): Engine {
  const index = buildIndex(papers);
  const vectors = buildVectorIndex(index);

  function rawSearch(query: string, mode: ScoreMode, k: number, weights?: HybridWeights): RawHit[] {
    // 中文查询先做词表改写，再和原有词项合并去重
    const expanded = [...new Set([...tokenize(query), ...expandChineseTerms(query)])];
    if (expanded.length === 0) return [];

    if (mode === 'bm25') {
      const results = bm25Score(index, expanded);
      const max = results.length > 0 ? results[0].score : 1;
      return results.slice(0, k).map((r) => ({
        docId: r.docId,
        score: r.score,
        breakdown: { ...ZERO_BREAKDOWN, bm25: max > 0 ? r.score / max : 0 },
        matched: r.matched,
      }));
    }

    if (mode === 'vector') {
      const queryVector = buildQueryVector(index, expanded, vectors.fieldWeights);
      return vectorSearch(vectors, queryVector)
        .slice(0, k)
        .map((r) => ({
          docId: r.docId,
          score: r.score,
          breakdown: { ...ZERO_BREAKDOWN, vector: r.score },
          matched: new Set<string>(),
        }));
    }

    return hybridScore(index, vectors, expanded, query, weights).slice(0, k);
  }

  function search(query: string, options: SearchOptions = {}): SearchResponse {
    const mode = options.mode ?? 'hybrid';
    const k = Math.max(1, Math.min(options.k ?? 10, 50));
    const started = performance.now();
    const raw = rawSearch(query, mode, k, options.weights);
    const tookMs = performance.now() - started;

    const hits: SearchHit[] = raw.flatMap((hit, i) => {
      const paper = index.byId.get(hit.docId);
      if (!paper) return [];
      return [
        {
          paper,
          rank: i + 1,
          score: Number(hit.score.toFixed(6)),
          breakdown: {
            bm25: Number(hit.breakdown.bm25.toFixed(4)),
            vector: Number(hit.breakdown.vector.toFixed(4)),
            citation: Number(hit.breakdown.citation.toFixed(4)),
            recency: Number(hit.breakdown.recency.toFixed(4)),
            phrase: Number(hit.breakdown.phrase.toFixed(4)),
          },
          matchedTerms: [...hit.matched].slice(0, 12),
          snippet: makeSnippet(paper.abstract, [...hit.matched]),
        },
      ];
    });

    return {
      query,
      mode,
      expandedTerms: [...new Set([...tokenize(query), ...expandChineseTerms(query)])].slice(0, 16),
      tookMs: Number(tookMs.toFixed(2)),
      total: hits.length,
      hits,
    };
  }

  function recommend(docId: string, k = 5): RecommendHit[] {
    return recommendSimilar(index, vectors, docId, k);
  }

  function evaluate(k = 10): EvalReport {
    return evaluateQueries(
      queries,
      (query, mode, limit) => search(query, { mode, k: limit }).hits.map((h) => h.paper.id),
      k,
    );
  }

  function stats(): EngineStats {
    const topicCount = new Map<string, number>();
    for (const paper of papers) topicCount.set(paper.topic, (topicCount.get(paper.topic) ?? 0) + 1);
    const years = papers.map((p) => p.year);
    return {
      papers: papers.length,
      terms: index.vocabSize,
      avgTitleLength: Number(index.avgLen.title.toFixed(1)),
      avgAbstractLength: Number(index.avgLen.abstract.toFixed(1)),
      topics: [...topicCount.entries()]
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count),
      yearRange: [Math.min(...years), Math.max(...years)],
    };
  }

  return { index, vectors, papers, queries, search, recommend, evaluate, stats };
}
