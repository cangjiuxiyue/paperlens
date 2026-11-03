import { createEngine } from '../src/core/engine.js';

/**
 * 离线评测脚本：npm run eval
 * 输出三种排序策略的指标对比表，以及逐条查询的胜负情况。
 */

const engine = createEngine();
const report = engine.evaluate(10);

const MODE_LABEL: Record<string, string> = { bm25: 'BM25', vector: '向量空间', hybrid: '混合排序' };
const modes = report.results.map((r) => r.mode);

function pad(text: string, width: number): string {
  // 中文按两个字符宽度算，保证表格对齐
  let display = 0;
  for (const ch of text) display += /[\u4e00-\u9fff]/.test(ch) ? 2 : 1;
  return text + ' '.repeat(Math.max(0, width - display));
}

const metrics: Array<[string, 'p5' | 'r5' | 'ndcg10' | 'mrr']> = [
  ['P@5', 'p5'],
  ['R@5', 'r5'],
  ['NDCG@10', 'ndcg10'],
  ['MRR', 'mrr'],
];

console.log('');
console.log(`  PaperLens 离线评测   ${report.queries} 条查询 · 指标取前 ${report.k} 条结果`);
console.log('  ' + '─'.repeat(58));
console.log('  ' + pad('指标', 12) + modes.map((m) => pad(MODE_LABEL[m], 14)).join(''));
console.log('  ' + '─'.repeat(58));

for (const [label, key] of metrics) {
  const values = report.results.map((r) => r.metrics[key]);
  const best = Math.max(...values);
  const cells = report.results
    .map((r) => pad(`${r.metrics[key].toFixed(4)}${r.metrics[key] === best ? ' ▲' : '  '}`, 14))
    .join('');
  console.log('  ' + pad(label, 12) + cells);
}

console.log('  ' + '─'.repeat(58));

const bm25 = report.results.find((r) => r.mode === 'bm25')!.metrics;
const hybrid = report.results.find((r) => r.mode === 'hybrid')!.metrics;
const lift = bm25.ndcg10 > 0 ? ((hybrid.ndcg10 - bm25.ndcg10) / bm25.ndcg10) * 100 : 0;
console.log(`  混合排序相对 BM25 的 NDCG@10 提升：${lift >= 0 ? '+' : ''}${lift.toFixed(2)}%`);
console.log('');

console.log('  逐条查询（NDCG@10）：');
for (const row of report.perQuery) {
  const cells = modes.map((m) => `${MODE_LABEL[m]} ${row.detail[m].ndcg10.toFixed(3)}`).join('  |  ');
  console.log(`    ${pad(row.query, 44)} ${cells}`);
}
console.log('');

const wins = report.perQuery.filter((q) => q.best === 'hybrid').length;
const bm25Wins = report.perQuery.filter((q) => q.best === 'bm25').length;
console.log(`  混合排序在 ${wins}/${report.queries} 条查询上取得最佳 NDCG，BM25 在 ${bm25Wins} 条上最佳。`);
console.log('');
