import { termFrequency, tokenize } from './tokenizer.js';
import { FIELDS, type FieldName, type Paper } from './types.js';

/**
 * 倒排索引
 *
 * 结构：postings[field][term][docId] = tf
 * 另外缓存每个文档每个字段的长度（BM25 的长度归一化需要）和文档频率 df。
 * 全部字段合起来算一次 vocabulary，方便前端展示规模。
 */
export interface SearchIndex {
  papers: Paper[];
  byId: Map<string, Paper>;
  N: number;
  postings: Record<FieldName, Map<string, Map<string, number>>>;
  df: Record<FieldName, Map<string, number>>;
  avgLen: Record<FieldName, number>;
  docLen: Map<string, Record<FieldName, number>>;
  vocabSize: number;
  maxCitations: number;
}

export function fieldText(paper: Paper, field: FieldName): string {
  switch (field) {
    case 'title':
      return paper.title;
    case 'abstract':
      return paper.abstract;
    case 'keywords':
      // 关键词字段额外拼上主题和会议名，提升「按方向检索」的召回
      return [...paper.keywords, paper.topic, paper.venue].join(' ');
    default:
      return '';
  }
}

function emptyFieldMap<T>(): Record<FieldName, Map<string, T>> {
  return {
    title: new Map<string, T>(),
    abstract: new Map<string, T>(),
    keywords: new Map<string, T>(),
  };
}

export function buildIndex(papers: Paper[]): SearchIndex {
  const postings = emptyFieldMap<Map<string, number>>();
  const df = emptyFieldMap<number>();
  const docLen = new Map<string, Record<FieldName, number>>();
  const byId = new Map<string, Paper>();
  const vocabulary = new Set<string>();
  let maxCitations = 0;

  for (const paper of papers) {
    byId.set(paper.id, paper);
    maxCitations = Math.max(maxCitations, paper.citations);
    const lengths: Record<FieldName, number> = { title: 0, abstract: 0, keywords: 0 };

    for (const field of FIELDS) {
      const tokens = tokenize(fieldText(paper, field));
      lengths[field] = tokens.length;
      const tf = termFrequency(tokens);
      for (const [term, freq] of tf) {
        vocabulary.add(term);
        let posting = postings[field].get(term);
        if (!posting) {
          posting = new Map<string, number>();
          postings[field].set(term, posting);
        }
        posting.set(paper.id, freq);
        df[field].set(term, (df[field].get(term) ?? 0) + 1);
      }
    }
    docLen.set(paper.id, lengths);
  }

  const avgLen = {} as Record<FieldName, number>;
  for (const field of FIELDS) {
    let total = 0;
    for (const lengths of docLen.values()) total += lengths[field];
    avgLen[field] = papers.length > 0 ? total / papers.length : 0;
  }

  return {
    papers,
    byId,
    N: papers.length,
    postings,
    df,
    avgLen,
    docLen,
    vocabSize: vocabulary.size,
    maxCitations,
  };
}

/** 某个词项在指定字段上的文档频率 */
export function docFreq(index: SearchIndex, field: FieldName, term: string): number {
  return index.df[field].get(term) ?? 0;
}
