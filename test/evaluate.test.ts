import assert from 'node:assert/strict';
import { test } from 'node:test';
import { precisionAtK, recallAtK, ndcgAtK, meanReciprocalRank, evaluateQuery } from '../src/core/evaluate.js';

test('P@K 分母固定为 K', () => {
  const relevant = new Set(['a', 'b']);
  assert.equal(precisionAtK(['a', 'x', 'b', 'y', 'z'], relevant, 5), 0.4);
  // 只返回 2 条时，分母仍然是 5，避免「结果少反而精度高」的假象
  assert.equal(precisionAtK(['a', 'b'], relevant, 5), 0.4);
});

test('R@K 分母是相关文档总数', () => {
  const relevant = new Set(['a', 'b', 'c', 'd']);
  assert.equal(recallAtK(['a', 'x', 'b'], relevant, 5), 0.5);
  assert.equal(recallAtK([], relevant, 5), 0);
});

test('NDCG 计算符合标准定义', () => {
  // 排序 a(3), b(0), c(2)：DCG = 7/1 + 0 + 3/log2(4) = 8.5
  // 理想排序 a(3), c(2)：IDCG = 7/1 + 3/log2(3) ≈ 8.8928
  const grades = new Map([
    ['a', 3],
    ['b', 0],
    ['c', 2],
  ]);
  const value = ndcgAtK(['a', 'b', 'c'], grades, 10);
  assert.ok(Math.abs(value - 8.5 / (7 + 3 / Math.log2(3))) < 1e-9, `实际值 ${value}`);
  assert.ok(value < 1);
});

test('NDCG 在完全正确排序时为 1', () => {
  const grades = new Map([
    ['a', 3],
    ['b', 2],
    ['c', 1],
  ]);
  assert.equal(ndcgAtK(['a', 'b', 'c'], grades, 10), 1);
});

test('NDCG 在没有任何相关结果时为 0', () => {
  const grades = new Map([['a', 3]]);
  assert.equal(ndcgAtK(['x', 'y', 'z'], grades, 10), 0);
});

test('MRR 取第一条相关结果的位置', () => {
  const relevant = new Set(['a']);
  assert.equal(meanReciprocalRank(['x', 'a', 'y'], relevant), 0.5);
  assert.equal(meanReciprocalRank(['a', 'x'], relevant), 1);
  assert.equal(meanReciprocalRank(['x', 'y'], relevant), 0);
});

test('evaluateQuery 汇总四个指标', () => {
  const metrics = evaluateQuery(['a', 'b', 'c'], { a: 3, c: 2 }, 10);
  assert.equal(metrics.p5, 0.4);
  assert.equal(metrics.r5, 1);
  assert.equal(metrics.mrr, 1);
  assert.ok(metrics.ndcg10 > 0 && metrics.ndcg10 <= 1);
});
