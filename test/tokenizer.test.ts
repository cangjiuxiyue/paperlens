import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenize } from '../src/core/tokenizer.js';

test('去掉停用词', () => {
  const tokens = tokenize('the quick brown fox and the lazy dog');
  assert.ok(!tokens.includes('the'));
  assert.ok(!tokens.includes('and'));
  assert.ok(tokens.includes('quick'));
  assert.ok(tokens.includes('fox'));
});

test('词干化让同一词根的不同形态归一', () => {
  const a = tokenize('ranking ranked ranks');
  assert.deepEqual(a, ['rank', 'rank', 'rank']);

  const b = tokenize('embedding embeddings');
  assert.deepEqual(b, ['embed', 'embed']);

  const c = tokenize('normalization normalize');
  assert.equal(c[0], c[1]);
});

test('复数与 es 结尾的处理', () => {
  assert.deepEqual(tokenize('networks'), ['network']);
  assert.deepEqual(tokenize('processes'), ['process']);
  assert.deepEqual(tokenize('boxes'), ['box']);
  // 以 ss / us / is 结尾的词不应被截断
  assert.deepEqual(tokenize('class'), ['class']);
  assert.deepEqual(tokenize('analysis'), ['analysis']);
});

test('中文按 bigram 切分', () => {
  assert.deepEqual(tokenize('注意力机制'), ['注意', '意力', '力机', '机制']);
  assert.deepEqual(tokenize('图'), ['图']);
});

test('混合中英文与标点', () => {
  const tokens = tokenize('BM25 检索: an efficient algorithm!');
  assert.ok(tokens.includes('bm25'));
  assert.ok(tokens.includes('检索'));
  assert.ok(tokens.includes('effici') || tokens.includes('efficient'));
  assert.ok(!tokens.some((t) => t.includes(':')));
});

test('空输入返回空数组', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   '), []);
});
