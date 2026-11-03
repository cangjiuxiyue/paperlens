const state = {
  mode: 'hybrid',
  query: '',
  hitsById: new Map(),
  stats: null,
  evalLoaded: false,
};

const MODE_LABEL = { bm25: 'BM25', vector: '向量空间', hybrid: '混合排序' };
const COMPONENTS = [
  { key: 'bm25', label: 'BM25 词项', color: '#ffb86b' },
  { key: 'vector', label: '向量余弦', color: '#4fd1c5' },
  { key: 'citation', label: '引用热度', color: '#7c9cff' },
  { key: 'recency', label: '时效衰减', color: '#8b93a7' },
  { key: 'phrase', label: '短语命中', color: '#c792ea' },
];

const $ = (sel) => document.querySelector(sel);

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 用命中词项给文本加高亮：词干是单词前缀，所以匹配整个词 */
function highlight(text, terms) {
  let out = esc(text);
  for (const term of terms.slice(0, 10)) {
    if (!term || term.length < 3) continue;
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b(${safe}[a-z]*)`, 'gi'), '<mark>$1</mark>');
  }
  return out;
}

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

/* ---------------- 顶栏统计 ---------------- */
function renderPills(stats) {
  $('#pills').innerHTML = `
    <span class="pill">文献 <b>${stats.papers}</b></span>
    <span class="pill">词项 <b>${stats.terms}</b></span>
    <span class="pill">摘要均长 <b>${stats.avgAbstractLength}</b> 词</span>
    <span class="pill">${stats.yearRange[0]}–${stats.yearRange[1]}</span>
  `;
}

/* ---------------- 检索结果 ---------------- */
function renderResults(data) {
  const meta = $('#meta');
  if (!data.query) {
    meta.innerHTML = '';
    return;
  }

  meta.innerHTML = `
    <span>模式 <b style="color:var(--text)">${MODE_LABEL[data.mode]}</b></span>
    <span>${data.total} 条结果</span>
    <span>${data.tookMs} ms</span>
    <span>词项 ${data.expandedTerms.slice(0, 8).map((t) => `<code>${esc(t)}</code>`).join(' ')}</span>
  `;

  const box = $('#results');
  if (data.hits.length === 0) {
    box.innerHTML = `<div class="empty"><p>没有命中文献。</p><p class="muted">换个说法，或者切到「向量空间」模式试试语义匹配。</p></div>`;
    return;
  }

  state.hitsById = new Map(data.hits.map((h) => [h.paper.id, h]));

  box.innerHTML = data.hits
    .map((hit) => {
      const p = hit.paper;
      const bars = COMPONENTS.map(
        (c) =>
          `<span class="bar-slot" title="${c.label} ${hit.breakdown[c.key].toFixed(3)}"><i style="width:${(hit.breakdown[c.key] * 100).toFixed(1)}%;background:${c.color}"></i></span>`,
      ).join('');
      const tags = [
        `<span class="tag topic">${esc(p.topic)}</span>`,
        `<span class="tag">引用 ${p.citations >= 1000 ? (p.citations / 1000).toFixed(1) + 'k' : p.citations}</span>`,
        ...hit.matchedTerms.slice(0, 4).map((t) => `<span class="tag match">${esc(t)}</span>`),
      ].join('');

      return `
        <article class="card" data-id="${p.id}">
          <div class="card-top">
            <div class="rank">${String(hit.rank).padStart(2, '0')}</div>
            <div class="card-main">
              <h3>${highlight(p.title, hit.matchedTerms)}</h3>
              <div class="byline">
                ${esc(p.authors.slice(0, 3).join(', '))}${p.authors.length > 3 ? ' 等' : ''}
                <span class="dot">·</span>${p.year}
                <span class="dot">·</span>${esc(p.venue)}
              </div>
              <div class="snippet">${esc(hit.snippet)}</div>
              <div class="tags">${tags}</div>
              <div class="bars">${bars}</div>
            </div>
            <div class="score-box">
              <div class="score-value">${hit.score.toFixed(3)}</div>
              <div class="score-label">score</div>
            </div>
          </div>
        </article>`;
    })
    .join('');

  box.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', () => openPaper(el.dataset.id));
  });
}

async function runSearch(query) {
  const q = query ?? $('#q').value.trim();
  if (!q) return;
  state.query = q;
  const data = await api(`/api/search?q=${encodeURIComponent(q)}&mode=${state.mode}&k=10`);
  renderResults(data);
}

/* ---------------- 详情抽屉 ---------------- */
async function openPaper(id) {
  const detail = await api(`/api/paper/${id}`);
  const p = detail.paper;
  const hit = state.hitsById.get(id);
  const drawer = $('#drawer');

  const breakdown = hit
    ? COMPONENTS.map((c) => {
        const v = hit.breakdown[c.key];
        return `
          <div class="breakdown-row">
            <span class="label">${c.label}</span>
            <div class="track"><i style="width:${Math.max(1.5, v * 100).toFixed(1)}%;background:${c.color}"></i></div>
            <span class="val">${v.toFixed(3)}</span>
          </div>`;
      }).join('')
    : '<p class="muted" style="font-size:12px">这条不是本次检索结果，暂无打分拆解。</p>';

  const recs = detail.recommendations
    .map(
      (r) => `
      <div class="rec-item" data-id="${r.paper.id}">
        <div class="t">${esc(r.paper.title)}</div>
        <div class="s">相似度 ${r.score.toFixed(3)} · ${r.paper.year} · ${esc(r.sharedTerms.slice(0, 3).join(' / '))}</div>
      </div>`,
    )
    .join('');

  $('#drawer-body').innerHTML = `
    <span class="tag topic">${esc(p.topic)}</span>
    <h2>${esc(p.title)}</h2>
    <div class="byline">${esc(p.authors.join(', '))}<br>${esc(p.venue)} · ${p.year} · 被引 ${p.citations}</div>

    <h4>摘要</h4>
    <p class="abstract">${esc(p.abstract)}</p>

    <h4>打分构成</h4>
    ${breakdown}

    <h4>相关文献（TF-IDF 余弦）</h4>
    ${recs || '<p class="muted" style="font-size:12px">暂无相似文献。</p>'}
  `;

  drawer.hidden = false;
  $('#drawer-body').querySelectorAll('.rec-item').forEach((el) => {
    el.addEventListener('click', () => openPaper(el.dataset.id));
  });
}

/* ---------------- 评测看板 ---------------- */
function renderEval(report) {
  const modes = ['bm25', 'vector', 'hybrid'];
  const get = (mode) => report.results.find((r) => r.mode === mode).metrics;
  const bm25 = get('bm25');
  const vector = get('vector');
  const hybrid = get('hybrid');

  const strongest = modes.reduce((a, b) => (get(b).ndcg10 > get(a).ndcg10 ? b : a), modes[0]);
  const delta = bm25.ndcg10 > 0 ? ((hybrid.ndcg10 - bm25.ndcg10) / bm25.ndcg10) * 100 : 0;

  const wins = { bm25: 0, vector: 0, hybrid: 0 };
  let vectorBest = { query: '', diff: -Infinity };
  for (const row of report.perQuery) {
    const best = modes.reduce((a, b) => (row.detail[b].ndcg10 > row.detail[a].ndcg10 ? b : a), modes[0]);
    wins[best] += 1;
    const diff = row.detail.vector.ndcg10 - row.detail.bm25.ndcg10;
    if (diff > vectorBest.diff) vectorBest = { query: row.query, diff };
  }
  const sameRecall = report.results.every((r) => Math.abs(r.metrics.p5 - bm25.p5) < 1e-9);

  $('#kpis').innerHTML = `
    <div class="kpi accent">
      <div class="k-label">最强基线 NDCG@10</div>
      <div class="k-value">${get(strongest).ndcg10.toFixed(4)}</div>
      <div class="k-sub">${MODE_LABEL[strongest]}（${report.queries} 条查询均值）</div>
    </div>
    <div class="kpi teal">
      <div class="k-label">混合排序 NDCG@10</div>
      <div class="k-value">${hybrid.ndcg10.toFixed(4)}</div>
      <div class="k-sub">相对 BM25 ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%</div>
    </div>
    <div class="kpi amber">
      <div class="k-label">MRR</div>
      <div class="k-value">${hybrid.mrr.toFixed(4)}</div>
      <div class="k-sub">第一条相关结果的平均倒数排名</div>
    </div>
    <div class="kpi">
      <div class="k-label">评测规模</div>
      <div class="k-value">${report.queries}</div>
      <div class="k-sub">条带相关性标注的查询</div>
    </div>
  `;

  const rows = [
    ['P@5', 'p5'],
    ['R@5', 'r5'],
    ['NDCG@10', 'ndcg10'],
    ['MRR', 'mrr'],
  ];

  const header = `<thead><tr><th>指标</th><th>BM25</th><th>向量空间</th><th>混合排序</th></tr></thead>`;
  const body = rows
    .map(([label, key]) => {
      const values = modes.map((m) => get(m)[key]);
      const max = Math.max(...values);
      const uniqueBest = values.filter((v) => Math.abs(v - max) < 1e-9).length === 1;
      const cells = values
        .map((v) => `<td class="${uniqueBest && Math.abs(v - max) < 1e-9 ? 'best' : ''}">${v.toFixed(4)}</td>`)
        .join('');
      return `<tr><td class="metric-name">${label}</td>${cells}</tr>`;
    })
    .join('');

  $('#metric-table').innerHTML = header + `<tbody>${body}</tbody>`;

  const conclusion = [];
  conclusion.push(
    `<b>${MODE_LABEL[strongest]} 是最强基线。</b>NDCG@10 ${get(strongest).ndcg10.toFixed(4)}，混合排序 ${hybrid.ndcg10.toFixed(4)}（${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%）。这与 BEIR 基准的结论一致：语料规模小、查询与标题词汇高度重叠时，词项匹配已经接近最优，额外信号只会稀释它。`,
  );
  if (sameRecall) {
    conclusion.push(
      '<b>三种模式的召回集合完全一致。</b>P@5 与 R@5 三列相同，说明差异只体现在<b>排序顺序</b>上——这正是 NDCG 和 MRR 才能区分的部分，也是排序模型真正要解决的问题。',
    );
  }
  if (vectorBest.diff > 0) {
    conclusion.push(
      `<b>向量空间模型在查询词稀疏时更稳。</b>在「${esc(vectorBest.query)}」上它比 BM25 高 ${(vectorBest.diff * 100).toFixed(1)} 个 NDCG 点，因为余弦相似度会被稀有词主导，不会被长文档稀释。`,
    );
  }
  conclusion.push(
    `<b>引用与时效先验是噪声。</b>权重网格搜索（<code>npm run tune</code>，1440 组候选）的最优解会把这两项压到接近 0：高被引论文普遍偏老，会把 Transformer 这类综述顶到与查询无关的位置。`,
  );
  conclusion.push(
    `<b>各模式胜出次数：</b>BM25 ${wins.bm25} 条 · 向量空间 ${wins.vector} 条 · 混合排序 ${wins.hybrid} 条。结论是「默认用 BM25，混合排序保留为可解释的多信号框架」——在真实场景需要接入引用、时效、业务先验等异构信号时，这套融合机制才是必需的。`,
  );

  $('#conclusion').innerHTML = `<h3>实验结论</h3><ol>${conclusion.map((c) => `<li>${c}</li>`).join('')}</ol>`;

  $('#perquery').innerHTML = report.perQuery
    .map((row) => {
      const bars = modes
        .map((m) => {
          const v = row.detail[m].ndcg10;
          const color = m === 'bm25' ? '#ffb86b' : m === 'vector' ? '#4fd1c5' : '#7c9cff';
          return `<span class="b" title="${MODE_LABEL[m]} ${v.toFixed(3)}" style="width:${(v * 34).toFixed(1)}px;background:${color};opacity:${m === 'hybrid' ? 1 : 0.5}"></span>`;
        })
        .join('');
      return `<div class="pq-row"><div class="pq-q">${esc(row.query)}</div><div class="pq-bars">${bars}</div></div>`;
    })
    .join('');
}

/* ---------------- 视图切换与事件 ---------------- */
function switchView(view) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $('#view-search').hidden = view !== 'search';
  $('#view-eval').hidden = view !== 'eval';
  if (view === 'eval' && !state.evalLoaded) {
    state.evalLoaded = true;
    api('/api/eval?k=10').then(renderEval);
  }
}

function bind() {
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) switchView(btn.dataset.view);
  });

  $('#go').addEventListener('click', () => runSearch());
  $('#q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });

  $('#chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $('#q').value = chip.dataset.q;
    runSearch(chip.dataset.q);
  });

  $('#modes').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    state.mode = btn.dataset.mode;
    document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('active', b === btn));
    if (state.query) runSearch(state.query);
  });

  $('#drawer-close').addEventListener('click', () => {
    $('#drawer').hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('#drawer').hidden = true;
  });
}

async function init() {
  bind();
  state.stats = await api('/api/stats');
  renderPills(state.stats);

  // 支持分享链接：/?q=... 直接检索，/?view=eval 直接打开评测看板
  const params = new URLSearchParams(location.search);
  const preset = params.get('q');
  $('#q').value = preset || 'dense retrieval for open domain question answering';

  if (params.get('view') === 'eval') switchView('eval');
  if (preset) await runSearch(preset);
  else if (params.get('view') !== 'eval') await runSearch();
  if (params.get('paper')) openPaper(params.get('paper'));
}

init();
