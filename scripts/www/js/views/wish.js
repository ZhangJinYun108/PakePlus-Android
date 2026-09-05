/* ============================================================
   模块 4 · 愿望单总览页
   顶部小计 → 细分小类筛选 → 心愿卡片网格（优先级色条 + 预计时间 / 预计开销）
   点卡片进结果页编辑；点 + 新建心愿
   ============================================================ */
import { h, esc, toast } from '../utils/dom.js';
import { formatWeekRange, currentWeekRange } from '../utils/time.js';
import { allRecords } from '../store.js';
import { back, go } from '../router.js';

const money = (n) => '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRIO = {
  high: { label: '高', cls: 'high' },
  mid:  { label: '中', cls: 'mid'  },
  low:  { label: '低', cls: 'low'  },
};
const SUB_LABEL = { 旅游: '旅游', 美食: '美食', 购物: '购物' };
const FILTERS = [{ key: 'all', label: '全部' }, { key: '旅游', label: '旅游' }, { key: '美食', label: '美食' }, { key: '购物', label: '购物' }];

/** 计划周排序权重：年份 → 月 → 起始周，越早排前面 */
function planWeight(w) {
  if (!w) return [9999, 99, 99];
  return [w.year || 9999, w.month || 99, w.weekStart || 99];
}

/** 取一行专属字段摘要，卡片里最多露一句 */
function extraNote(rec) {
  const x = rec.extra || {};
  if (rec.sub === '旅游') return x.transport || x.stay || x.spots || '';
  if (rec.sub === '美食') return x.mustOrder || x.address || x.queue || '';
  if (rec.sub === '购物') return x.necessity || '';
  return '';
}

export function WishView(params = {}) {
  let filter = 'all';

  const el = h(`
    <div>
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <div class="topbar-title">愿望单</div>
        <button class="topbar-add" data-act="add" title="新建心愿">+</button>
      </div>

      <div class="scroll">
        <div class="wish-summary" id="wish-summary"></div>

        <div class="chip-row wish-filters" id="wish-filters"></div>

        <div class="wish-grid" id="wish-grid"></div>
        <div style="height:16px"></div>
      </div>
    </div>`);

  const sumEl = el.querySelector('#wish-summary');
  const filterEl = el.querySelector('#wish-filters');
  const gridEl = el.querySelector('#wish-grid');

  function wishes() {
    let list = allRecords().filter(r => r.type === 'wish');
    if (filter !== 'all') list = list.filter(r => r.sub === filter);
    return list.sort((a, b) => {
      const wa = planWeight(a.planWeek), wb = planWeight(b.planWeek);
      for (let i = 0; i < 3; i++) { if (wa[i] !== wb[i]) return wa[i] - wb[i]; }
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }

  function renderSummary() {
    const all = allRecords().filter(r => r.type === 'wish');
    const total = all.length;
    const totalCost = all.reduce((s, r) => s + (+r.estCost || 0), 0);
    const high = all.filter(r => r.priority === 'high').length;
    sumEl.innerHTML = `
      <div class="ws-item"><span class="ws-val">${total}</span><span class="ws-key">个心愿</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val">${money(totalCost)}</span><span class="ws-key">预估总开销</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val prio-hi">${high}</span><span class="ws-key">高优先级</span></div>`;
  }

  function renderFilters() {
    filterEl.innerHTML = FILTERS.map(f =>
      `<button class="chip ${f.key === filter ? 'on lav' : ''}" data-filter="${f.key}">${f.label}</button>`).join('');
  }

  function renderGrid() {
    const list = wishes();
    if (!list.length) {
      gridEl.innerHTML = `
        <div class="wish-empty">
          <div class="we-emoji">🌟</div>
          <div class="we-title">还没有${filter === 'all' ? '' : SUB_LABEL[filter]}心愿</div>
          <div class="we-sub">说一句「想去北海道」「想买 Switch」就记下了</div>
          <button class="btn btn-primary we-add" data-act="add">＋ 添加第一个心愿</button>
        </div>`;
      return;
    }
    gridEl.innerHTML = list.map((r, i) => {
      const p = PRIO[r.priority] || PRIO.mid;
      const note = extraNote(r);
      return `
        <div class="wish-card prio-${p.cls}" data-id="${esc(r.id)}" style="animation-delay:${i * 42}ms">
          <div class="wc-top">
            <span class="wc-sub sub-${r.sub}">${SUB_LABEL[r.sub] || r.sub}</span>
            <span class="wc-prio">${p.label}</span>
          </div>
          <div class="wc-title">${esc(r.title || '未命名心愿')}</div>
          <div class="wc-when">${esc(formatWeekRange(r.planWeek))}</div>
          ${note ? `<div class="wc-note">${esc(note)}</div>` : ''}
          <div class="wc-cost">${money(r.estCost || 0)}</div>
        </div>`;
    }).join('');
  }

  function render() { renderSummary(); renderFilters(); renderGrid(); }

  el.addEventListener('click', (e) => {
    const t = e.target;

    if (t.closest('[data-act="back"]')) return back();

    if (t.closest('[data-act="add"]')) {
      const def = (filter !== 'all') ? filter : '购物';
      const rec = {
        type: 'wish', raw: '', title: '', sub: def, priority: 'mid',
        planWeek: currentWeekRange(), estCost: null, extra: {},
      };
      return go('result', { draft: rec });
    }

    const fBtn = t.closest('[data-filter]');
    if (fBtn) { filter = fBtn.dataset.filter; return render(); }

    const card = t.closest('.wish-card');
    if (card) {
      const rec = allRecords().find(r => r.id === card.dataset.id);
      if (rec) return go('result', { draft: rec });
    }
  });

  render();
  return el;
}
