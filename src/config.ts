import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 项目根目录定位：从当前模块所在目录向上查找 package.json。
 * 这样无论运行 dist/src/server.js 还是 dist/test/*.test.js 都能拿到同一个根目录。
 */
function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`无法定位项目根目录，起点：${start}`);
}

export const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const PAPERS_PATH = path.join(DATA_DIR, 'papers.json');
export const QUERIES_PATH = path.join(DATA_DIR, 'queries.json');
