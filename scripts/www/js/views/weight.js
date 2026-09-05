/* ============================================================
   模块 · 体重看板
   顶部：hero（最新体重 + 较上次变化，增粉减绿）+ 概览卡（最新/较上次/平均/最低/最高/次数）
   显示模式：曲线 SVG / 柱状 / 变化（逐条 ▲+ / ▼-）
   列表：全部记录倒序，左滑删除、点按进结果页改体重
   同日记两次 = 更新不新增（去重在 store.saveWeight）
   ============================================================ */
import { h, esc, toast, editSheet } from '../utils/dom.js';
import { allRecords, saveWeight, deleteRecord } from '../store.js';
import { weightStats } from '../utils/stats.js';
import { friendlyDate } from '../utils/time.js';
import { back, go } from '../router.js';
import { setupSwipeDelete } from '../utils/swipe.js';

const WEIGHT_ICO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"/><path d="M7 7l-2.5 11h11z"/><path d="M17 7l-2.5 11h11z"/><path d="M12 3v3"/></svg>`;

const MODES = [
  { key: 'curve', label: '曲线' },
  { key: 'bar',   label: '柱状' },
  { key: 'change', label: '变化' },
];

function weekday(d) { return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]; }

/** 变化文案：▲+1.0（增，粉）/ ▼-1.0（减，绿） */
function deltaText(d) {
  if (d == null) return { txt: '起始', cls: 'flat' };
  if (d > 0) return { txt: `▲ +${d.toFixed(1)}`, cls: 'up' };
  if (d < 0) return { txt: `▼ ${d.toFixed(1)}`, cls: 'down' };
  return { txt: '— 持平', cls: 'flat' };
}

export function WeightView() {
  let mode = 'curve';

  const el = h(`
    <div>
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <div class="topbar-title">体重</div>
        <button class="topbar-add" data-act="add" title="记一次体重">+</button>
      </div>

      <div class="scroll">
        <div id="w-hero"></div>
        <div class="wish-summary" id="w-overview"></div>

        <div class="chip-row w-modes" id="w-modes"></div>
        <div id="w-chart"></div>

        <div class="sec-title" style="margin-top:6px">全部记录</div>
        <div id="w-list"></div>
        <div style="height:18px"></div>
      </div>
    </div>`);

  const heroEl = el.querySelector('#w-hero');
  const ovEl = el.querySelector('#w-overview');
  const modesEl = el.querySelector('#w-modes');
  const chartEl = el.querySelector('#w-chart');
  const listEl = el.querySelector('#w-list');

  /* —— hero —— */
  function renderHero(st) {
    if (!st.latest) {
      heroEl.innerHTML = `
        <div class="w-hero empty">
          <div class="w-hero-emoji">⚖️</div>
          <div class="w-hero-val">—</div>
          <div class="w-hero-sub">还没有体重记录，点右上角「+」记一下</div>
        </div>`;
      return;
    }
    const d = deltaText(st.delta);
    heroEl.innerHTML = `
      <div class="w-hero">
        <div class="w-hero-main">
          <div class="w-hero-val">${st.latest.weight.toFixed(1)}<i>kg</i></div>
          <div class="w-hero-sub">更新于 ${friendlyDate(st.latest.date)} ${weekday(st.latest.date)}</div>
        </div>
        <div class="w-hero-delta ${d.cls}">${d.txt}</div>
      </div>`;
  }

  /* —— 概览卡：最新 / 较上次 / 平均 / 最低 / 最高 / 次数 —— */
  function renderOverview(st) {
    const d = deltaText(st.delta);
    ovEl.innerHTML = `
      <div class="ws-item"><span class="ws-val">${st.latest ? st.latest.weight.toFixed(1) : '—'}</span><span class="ws-key">最新 (kg)</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val ${d.cls === 'up' ? 'prio-hi' : d.cls === 'down' ? 'prio-lo' : ''}">${st.delta == null ? '—' : st.delta.toFixed(1)}</span><span class="ws-key">较上次</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val">${st.avg != null ? st.avg.toFixed(1) : '—'}</span><span class="ws-key">平均</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val">${st.min != null ? st.min.toFixed(1) : '—'}</span><span class="ws-key">最低</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val">${st.max != null ? st.max.toFixed(1) : '—'}</span><span class="ws-key">最高</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val">${st.count}</span><span class="ws-key">次记录</span></div>`;
  }

  /* —— 模式切换条 —— */
  function renderModes() {
    modesEl.innerHTML = MODES.map(m =>
      `<button class="chip sm ${m.key === mode ? 'on peach' : ''}" data-mode="${m.key}">${m.label}</button>`).join('');
  }

  /* —— 曲线 SVG —— */
  function renderCurve(series) {
    if (!series.length) return emptyChart('还没有数据，先记一次体重吧');
    const W = 320, H = 150, pad = 20;
    const vals = series.map(s => s.weight);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = (max - min) || 1;
    const n = series.length;
    const x = i => n === 1 ? W / 2 : pad + i * (W - 2 * pad) / (n - 1);
    const y = v => H - pad - ((v - min) / span) * (H - 2 * pad);
    const pts = series.map((s, i) => [x(i), y(s.weight)]);
    const line = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${x(0).toFixed(1)},${H - pad} ${line} ${x(n - 1).toFixed(1)},${H - pad}`;
    const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--pink-400)"/>`).join('');
    const labels = series.map((s, i) =>
      (i === 0 || i === n - 1)
        ? `<text x="${x(i).toFixed(1)}" y="${H - 5}" font-size="9" fill="var(--text-3)" text-anchor="middle">${s.date.getMonth() + 1}/${s.date.getDate()}</text>`
        : '').join('');
    return `<svg class="w-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polygon points="${area}" fill="rgba(255,140,170,.12)"/>
      <polyline points="${line}" fill="none" stroke="var(--pink-400)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}${labels}
    </svg>`;
  }

  /* —— 柱状 —— */
  function renderBar(series) {
    if (!series.length) return emptyChart('还没有数据，先记一次体重吧');
    const max = Math.max(...series.map(s => s.weight));
    const min = Math.min(...series.map(s => s.weight));
    const base = Math.max(0, min - (max - min) * 0.5);
    return `<div class="w-bars">` + series.map(s => {
      const pct = Math.max(10, ((s.weight - base) / (max - base || 1)) * 100);
      return `<div class="w-bar">
        <div class="w-bar-col"><div class="w-bar-fill" style="height:${pct}%"></div></div>
        <div class="w-bar-val">${s.weight.toFixed(1)}</div>
        <div class="w-bar-lab">${s.date.getMonth() + 1}/${s.date.getDate()}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  /* —— 变化（逐条 ▲+ / ▼-） —— */
  function renderChange(series) {
    if (!series.length) return emptyChart('还没有数据，先记一次体重吧');
    return `<div class="w-change">` + series.slice().reverse().map(s => {
      const d = deltaText(s.delta);
      return `<div class="w-change-row">
        <span class="wc-date">${friendlyDate(s.date)}</span>
        <span class="wc-val">${s.weight.toFixed(1)}<i>kg</i></span>
        <span class="wc-delta ${d.cls}">${d.txt}</span>
      </div>`;
    }).join('') + `</div>`;
  }

  function emptyChart(msg) {
    return `<div class="w-empty">${msg}</div>`;
  }

  function renderChart(st) {
    if (mode === 'curve') chartEl.innerHTML = renderCurve(st.series);
    else if (mode === 'bar') chartEl.innerHTML = renderBar(st.series);
    else chartEl.innerHTML = renderChange(st.series);
  }

  /* —— 全部记录列表（倒序，左滑删除 + 点按编辑） —— */
  function renderList(series) {
    const rev = series.slice().reverse();
    if (!rev.length) {
      listEl.innerHTML = `<div class="w-list-empty">记录会出现在这里，左滑可删除</div>`;
      return;
    }
    listEl.innerHTML = rev.map(s => {
      const d = deltaText(s.delta);
      return `<div class="swipe" data-swipe data-del="${esc(s.id)}">
        <div class="swipe-action"><button class="swipe-del" data-del="${esc(s.id)}">删除</button></div>
        <div class="swipe-content">
          <div class="w-row" data-id="${esc(s.id)}">
            <div class="w-row-main">
              <div class="w-row-date">${friendlyDate(s.date)} ${weekday(s.date)}</div>
              ${s.note ? `<div class="w-row-note">${esc(s.note)}</div>` : ''}
            </div>
            <div class="w-row-right">
              <span class="w-row-val">${s.weight.toFixed(1)}<i>kg</i></span>
              <span class="wc-delta ${d.cls}">${d.txt}</span>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    setupSwipeDelete(listEl, {
      onDelete: (id) => { deleteRecord(id); toast('已删除'); renderAll(); },
    });
  }

  function renderAll() {
    const st = weightStats();
    renderHero(st);
    renderOverview(st);
    renderModes();
    renderChart(st);
    renderList(st.series);
  }

  /* —— 交互 —— */
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-act="back"]')) return back();

    if (e.target.closest('[data-act="add"]')) {
      const v = await editSheet({ title: '记一次体重', value: '', type: 'number', placeholder: '例如 65.0（单位 kg）' });
      if (v !== null && v !== '') {
        const w = Math.round(Number(v) * 10) / 10;
        if (Number.isFinite(w) && w > 0) { saveWeight(w); toast('已记下 ✓'); renderAll(); }
        else toast('请输入有效体重');
      }
      return;
    }

    const mBtn = e.target.closest('[data-mode]');
    if (mBtn) { mode = mBtn.dataset.mode; renderModes(); renderChart(weightStats()); return; }

    // 点列表行（非展开态）→ 进结果页改体重
    const row = e.target.closest('[data-swipe]');
    if (row && !row.classList.contains('open')) {
      const rec = allRecords().find(r => r.id === row.dataset.del);
      if (rec) return go('result', { draft: rec });
    }
  });

  renderAll();
  return el;
}
