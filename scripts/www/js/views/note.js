/* ============================================================
   模块 7 · 记事本总览页
   顶部小计 → 细分小类筛选 → 想法卡片网格（sub 色标 + 想法摘要 + 进度 + 专属字段）
   点卡片进结果页编辑；点 + 新建想法
   ============================================================ */
import { h, esc, toast } from '../utils/dom.js';
import { allRecords } from '../store.js';
import { back, go } from '../router.js';

const SUB_LABEL = { 产品:'产品', 写作:'写作', 通用:'通用', 学习:'学习', 其他:'其他' };
const SUB_CLS   = { 产品:'sky', 写作:'lav', 通用:'butter', 学习:'mint', 其他:'peach' };
const FILTERS = [
  { key:'all', label:'全部' }, { key:'产品', label:'产品' }, { key:'写作', label:'写作' },
  { key:'学习', label:'学习' }, { key:'通用', label:'通用' }, { key:'其他', label:'其他' },
];

/** 一句话专属字段摘要 */
function extraNote(rec) {
  const x = rec.extra || {};
  if (rec.sub === '产品') return [x.targetUser, x.platform].filter(Boolean).join(' · ');
  if (rec.sub === '写作') return [x.style, x.genre, x.protagonist].filter(Boolean).join(' · ');
  if (rec.sub === '学习') return [x.goal, x.source].filter(Boolean).join(' · ');
  return '';
}

function clip(s, n = 42) {
  s = (s || '').toString();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function NoteView() {
  let filter = 'all';

  const el = h(`
    <div>
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <div class="topbar-title">记事本</div>
        <button class="topbar-add" data-act="add" title="新建想法">+</button>
      </div>

      <div class="scroll">
        <div class="wish-summary" id="note-summary"></div>
        <div class="chip-row wish-filters" id="note-filters"></div>
        <div class="note-grid" id="note-grid"></div>
        <div style="height:16px"></div>
      </div>
    </div>`);

  const sumEl = el.querySelector('#note-summary');
  const filterEl = el.querySelector('#note-filters');
  const gridEl = el.querySelector('#note-grid');

  function notes() {
    let list = allRecords().filter(r => r.type === 'note');
    if (filter !== 'all') list = list.filter(r => r.sub === filter);
    // 最近更新优先
    return list.sort((a, b) =>
      (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  }

  function renderSummary() {
    const all = allRecords().filter(r => r.type === 'note');
    const subs = new Set(all.map(r => r.sub));
    sumEl.innerHTML = `
      <div class="ws-item"><span class="ws-val">${all.length}</span><span class="ws-key">个想法</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val">${subs.size}</span><span class="ws-key">个小类</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val" style="color:var(--sky-500)">跟踪中</span><span class="ws-key">长期专项</span></div>`;
  }

  function renderFilters() {
    filterEl.innerHTML = FILTERS.map(f =>
      `<button class="chip ${f.key === filter ? 'on sky' : ''}" data-filter="${f.key}">${f.label}</button>`).join('');
  }

  function renderGrid() {
    const list = notes();
    if (!list.length) {
      gridEl.innerHTML = `
        <div class="wish-empty">
          <div class="we-emoji">💡</div>
          <div class="we-title">还没有${filter === 'all' ? '' : SUB_LABEL[filter]}想法</div>
          <div class="we-sub">说一句「想做一个记账APP」「想写一本悬疑小说」就记下了</div>
          <button class="btn btn-primary we-add" data-act="add">＋ 添加第一个想法</button>
        </div>`;
      return;
    }
    gridEl.innerHTML = list.map((r, i) => {
      const cls = SUB_CLS[r.sub] || 'peach';
      const note = extraNote(r);
      const prog = r.progress ? `进度：${esc(clip(r.progress, 30))}` : '';
      return `
        <div class="note-card sub-${cls}" data-id="${esc(r.id)}" style="animation-delay:${i * 42}ms">
          <div class="nc-top">
            <span class="nc-sub sub-${r.sub}">${SUB_LABEL[r.sub] || r.sub}</span>
          </div>
          <div class="nc-title">${esc(r.title || '未命名想法')}</div>
          ${r.idea ? `<div class="nc-idea">${esc(clip(r.idea))}</div>` : ''}
          ${prog ? `<div class="nc-progress">${prog}</div>` : ''}
          ${note ? `<div class="nc-extra">${esc(clip(note, 34))}</div>` : ''}
        </div>`;
    }).join('');
  }

  function render() { renderSummary(); renderFilters(); renderGrid(); }

  el.addEventListener('click', (e) => {
    const t = e.target;

    if (t.closest('[data-act="back"]')) return back();

    if (t.closest('[data-act="add"]')) {
      const def = (filter !== 'all') ? filter : '产品';
      const rec = {
        type: 'note', raw: '', title: '', sub: def,
        idea: '', progress: null, reason: null, extra: {},
        occurredAt: new Date().toISOString(),
      };
      return go('result', { draft: rec });
    }

    const fBtn = t.closest('[data-filter]');
    if (fBtn) { filter = fBtn.dataset.filter; return render(); }

    const card = t.closest('.note-card');
    if (card) {
      const rec = allRecords().find(r => r.id === card.dataset.id);
      if (rec) return go('result', { draft: rec });
    }
  });

  render();
  return el;
}
