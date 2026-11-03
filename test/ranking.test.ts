import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEngine } from '../src/core/engine.js';

const engine = createEngine();

test('数据集完整加载', () => {
  assert.equal(engine.papers.length, 50);
  assert.equal(engine.queries.length, 19);
  assert.ok(engine.index.vocabSize > 500, `词表规模 ${engine.index.vocabSize}`);
});

test('精确标题查询应把目标论文排在第一', () => {
  const hit = engine.search('PageRank citation ranking web graph', { mode: 'bm25', k: 3 }).hits[0];
  assert.equal(hit.paper.id, 'p009');

  const hit2 = engine.search('Chinese word segmentation conditional random field', { mode: 'bm25', k: 3 }).hits[0];
  assert.equal(hit2.paper.id, 'p021');
});

test('三种模式都能返回结果且分数单调不增', () => {
  for (const mode of ['bm25', 'vector', 'hybrid'] as const) {
    const { hits } = engine.search('retrieval augmented generation', { mode, k: 10 });
    assert.ok(hits.length > 0, `${mode} 无结果`);
    for (let i = 1; i < hits.length; i += 1) {
      assert.ok(hits[i - 1].score >= hits[i].score, `${mode} 分数未排序`);
    }
  }
});

test('中文查询通过词表改写可以召回英文文献', () => {
  const { hits, expandedTerms } = engine.search('注意力机制', { mode: 'hybrid', k: 5 });
  assert.ok(hits.length > 0, '中文查询没有召回任何文献');
  assert.ok(expandedTerms.includes('attention'));
  const ids = hits.map((h) => h.paper.id);
  assert.ok(ids.includes('p012') || ids.includes('p018'), `召回结果 ${ids.join(',')}`);
});

test('相似文献推荐不包含自身', () => {
  const recs = engine.recommend('p012', 5);
  assert.equal(recs.length, 5);
  assert.ok(recs.every((r) => r.paper.id !== 'p012'));
  // Transformer 与 BERT 应该互为近邻
  assert.ok(recs.some((r) => r.paper.id === 'p013'), recs.map((r) => r.paper.id).join(','));
});

test('混合排序把短语命中作为额外信号', () => {
  const { hits } = engine.search('Attention Is All You Need', { mode: 'hybrid', k: 3 });
  assert.equal(hits[0].paper.id, 'p012');
  assert.equal(hits[0].breakdown.phrase, 1);
});

test('评测报告包含三种模式和完整查询数', () => {
  const report = engine.evaluate(10);
  assert.equal(report.queries, 19);
  assert.deepEqual(
    report.results.map((r) => r.mode),
    ['bm25', 'vector', 'hybrid'],
  );
  for (const row of report.results) {
    assert.ok(row.metrics.ndcg10 >= 0 && row.metrics.ndcg10 <= 1);
    assert.ok(row.metrics.mrr >= 0 && row.metrics.mrr <= 1);
  }
});

test('空查询返回空结果而不是报错', () => {
  const res = engine.search('', { mode: 'hybrid' });
  assert.equal(res.total, 0);
});
