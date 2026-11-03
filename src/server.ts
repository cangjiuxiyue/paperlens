import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { PUBLIC_DIR } from './config.js';
import { createEngine } from './core/engine.js';
import type { ScoreMode } from './core/types.js';

const PORT = Number(process.env.PORT ?? 5178);
const engine = createEngine();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function serveStatic(res: http.ServerResponse, pathname: string): void {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const root = path.resolve(PUBLIC_DIR);
  const filePath = path.resolve(root, relative);

  // 防止 ../ 穿越到项目目录之外
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'not found', path: relative });
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': data.byteLength,
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/stats') {
    sendJson(res, 200, engine.stats());
    return;
  }

  if (pathname === '/api/search') {
    const query = url.searchParams.get('q') ?? '';
    const mode = (url.searchParams.get('mode') ?? 'hybrid') as ScoreMode;
    const k = Number(url.searchParams.get('k') ?? 10);
    if (!['bm25', 'vector', 'hybrid'].includes(mode)) {
      sendJson(res, 400, { error: `unknown mode: ${mode}` });
      return;
    }
    if (!query.trim()) {
      sendJson(res, 200, { query, mode, expandedTerms: [], tookMs: 0, total: 0, hits: [] });
      return;
    }
    sendJson(res, 200, engine.search(query, { mode, k: Number.isFinite(k) ? k : 10 }));
    return;
  }

  if (pathname === '/api/eval') {
    const k = Number(url.searchParams.get('k') ?? 10);
    sendJson(res, 200, engine.evaluate(Number.isFinite(k) ? k : 10));
    return;
  }

  const paperMatch = /^\/api\/paper\/([\w-]+)$/.exec(pathname);
  if (paperMatch) {
    const paper = engine.index.byId.get(paperMatch[1]);
    if (!paper) {
      sendJson(res, 404, { error: 'paper not found' });
      return;
    }
    sendJson(res, 200, { paper, recommendations: engine.recommend(paper.id, 5) });
    return;
  }

  const recMatch = /^\/api\/recommend\/([\w-]+)$/.exec(pathname);
  if (recMatch) {
    const k = Number(url.searchParams.get('k') ?? 5);
    sendJson(res, 200, { items: engine.recommend(recMatch[1], Number.isFinite(k) ? k : 5) });
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'unknown endpoint' });
    return;
  }

  serveStatic(res, pathname);
});

server.listen(PORT, () => {
  const stats = engine.stats();
  console.log('');
  console.log('  PaperLens · 学术文献智能检索与推荐系统');
  console.log('  ───────────────────────────────────────────');
  console.log(`  已加载 ${stats.papers} 篇论文 / ${stats.terms} 个词项 / ${stats.topics.length} 个方向`);
  console.log(`  打开  http://localhost:${PORT}`);
  console.log('');
});
