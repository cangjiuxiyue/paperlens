import { createEngine } from './core/engine.js';
import type { ScoreMode } from './core/types.js';

/**
 * 命令行检索入口：
 *   node dist/src/cli.js "dense retrieval" --mode hybrid --k 5
 */

function parseArgs(argv: string[]): { query: string; mode: ScoreMode; k: number; json: boolean } {
  let mode: ScoreMode = 'hybrid';
  let k = 5;
  let json = false;
  const words: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode' || arg === '-m') {
      mode = (argv[i + 1] as ScoreMode) ?? 'hybrid';
      i += 1;
    } else if (arg === '--k') {
      k = Number(argv[i + 1] ?? 5);
      i += 1;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('用法: cli <query> [--mode bm25|vector|hybrid] [--k N] [--json]');
      process.exit(0);
    } else {
      words.push(arg);
    }
  }

  return { query: words.join(' ').trim(), mode, k, json };
}

const { query, mode, k, json } = parseArgs(process.argv.slice(2));

if (!query) {
  console.error('请提供查询词，例如: cli "dense retrieval" --mode hybrid');
  process.exit(1);
}

const engine = createEngine();
const response = engine.search(query, { mode, k });

if (json) {
  console.log(JSON.stringify(response, null, 2));
} else {
  console.log('');
  console.log(`查询：${response.query}   [模式 ${response.mode}]   用时 ${response.tookMs} ms`);
  console.log(`词项：${response.expandedTerms.join(' · ')}`);
  console.log('');
  if (response.hits.length === 0) {
    console.log('  没有命中任何文献，试试换个说法或放宽查询词。');
  }
  for (const hit of response.hits) {
    const { paper } = hit;
    console.log(`  #${hit.rank}  ${paper.title}`);
    console.log(`       ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ' 等' : ''} · ${paper.year} · ${paper.venue}`);
    console.log(`       相关度 ${hit.score.toFixed(4)}  [BM25 ${hit.breakdown.bm25.toFixed(2)} / 向量 ${hit.breakdown.vector.toFixed(2)} / 引用 ${hit.breakdown.citation.toFixed(2)}]`);
    console.log('');
  }
  console.log(`共 ${response.total} 条结果`);
  console.log('');
}
