/* ============================================================
   模块 6 · 时间轴
   按周(周一归属规则)回看做过什么：记账 / 愿望 / 待办
   ============================================================ */
import { h, esc } from '../utils/dom.js';
import { allRecords } from '../store.js';
import { weekMeta } from '../utils/time.js';
import { back } from '../router.js';

const money = (n) => '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ICON = {
  ledger: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M8 8h7M8 12h7"/></svg>`,
  wish:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z"/></svg>`,
  todo:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`,
  note:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/><path d="M8 9h8M8 13h5"/></svg>`,
  weight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"/><path d="M7 7l-2.5 11h11z"/><path d="M17 7l-2.5 11h11z"/><path d="M12 3v3"/></svg>`,
};

const TYPE_META = {
  ledger: { ico: ICON.ledger, cls: 'pink' },
  wish:   { ico: ICON.wish,   cls: 'lav'  },
  todo:   { ico: ICON.todo,   cls: 'mint' },
  note:   { ico: ICON.note,   cls: 'sky'  },
  weight: { ico: ICON.weight, cls: 'lav'  },
};

function md(d) { return `${d.getMonth() + 1}月${d.getDate()}日`; }

export function TimelineView() {
  const recs = allRecords();

  // 按周归属分组
  const byWeek = new Map();
  for (const r of recs) {
    const d = new Date(r.occurredAt || r.createdAt);
    const m = weekMeta(d);
    const key = `${m.year}-${String(m.month).padStart(2, '0')}-W${m.week}`;
    if (!byWeek.has(key)) byWeek.set(key, { meta: m, items: [] });
    byWeek.get(key).items.push(r);
  }

  // 周降序
  const weeks = [...byWeek.values()].sort((a, b) => b.meta.monday - a.meta.monday);

  const el = h(`
    <div class="timeline">
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <span class="topbar-title">时间轴</span>
        <span style="width:40px"></span>
      </div>
      <div class="scroll">
        <div class="tl-intro">按周回看 —— 这周你记了账、许了愿、也完成了一些事 ✨</div>
        ${weeks.map((w, i) => card(w, i === 0)).join('')}
        <div class="set-foot">共 ${weeks.length} 周 · 数据都在本机</div>
      </div>
    </div>`);

  el.querySelector('[data-act="back"]').addEventListener('click', () => back());
  return el;
}

function card(w, isFirst) {
  const items = w.items.slice().sort((a, b) =>
    new Date(b.occurredAt || b.createdAt) - new Date(a.occurredAt || a.createdAt));

  const expense = items.filter(r => r.type === 'ledger' && !r.isIncome)
    .reduce((s, r) => s + (+r.amount || 0), 0);
  const income  = items.filter(r => r.type === 'ledger' &&  r.isIncome)
    .reduce((s, r) => s + (+r.amount || 0), 0);
  const wishN   = items.filter(r => r.type === 'wish').length;
  const noteN   = items.filter(r => r.type === 'note').length;
  const weightN = items.filter(r => r.type === 'weight').length;
  const todos   = items.filter(r => r.type === 'todo');
  const doneN   = todos.filter(t => t.done).length;

  const sun = new Date(w.meta.monday);
  sun.setDate(sun.getDate() + 6);
  const range = `${md(w.meta.monday)} – ${md(sun)}`;

  const highlights = items.slice(0, 4).map(r => {
    const tm = TYPE_META[r.type] || TYPE_META.todo;
    let sub = '';
    if (r.type === 'ledger') sub = (r.isIncome ? '收入 ' : '支出 ') + money(r.amount || 0);
    else if (r.type === 'wish') sub = `预估 ${money(r.estCost || 0)} · ${r.priority === 'high' ? '高优先' : r.priority === 'mid' ? '中优先' : '低优先'}`;
    else if (r.type === 'note') sub = `想法 · ${r.sub || '其他'}${r.progress ? ' · ' + r.progress : ''}`;
    else if (r.type === 'weight') sub = `体重 ${r.weight} kg`;
    else sub = `精力 ${r.energy === 'high' ? '高' : r.energy === 'mid' ? '中' : '低'}${r.done ? ' · 已完成' : ''}`;
    return `
      <div class="tl-item">
        <span class="tl-item-ico ${tm.cls}">${tm.ico}</span>
        <div class="tl-item-main">
          <div class="tl-item-title">${esc(r.title || r.raw || '未命名')}</div>
          <div class="tl-item-sub">${esc(sub)}</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="tl-week ${isFirst ? 'first' : ''}">
      <div class="tl-rail"><span class="tl-dot"></span></div>
      <div class="tl-card">
        <div class="tl-card-head">
          <div>
            <div class="tl-week-label">${w.meta.year}年${w.meta.month}月 第${w.meta.week}周</div>
            <div class="tl-week-range">${range}</div>
          </div>
          <div class="tl-badges">
            ${expense ? `<span class="tl-badge exp">支 ${money(expense)}</span>` : ''}
            ${income ? `<span class="tl-badge inc">收 ${money(income)}</span>` : ''}
            ${wishN ? `<span class="tl-badge wish">愿 ${wishN}</span>` : ''}
            ${noteN ? `<span class="tl-badge note">记 ${noteN}</span>` : ''}
            ${weightN ? `<span class="tl-badge wish">重 ${weightN}</span>` : ''}
            ${todos.length ? `<span class="tl-badge todo">办 ${doneN}/${todos.length}</span>` : ''}
          </div>
        </div>
        ${highlights ? `<div class="tl-items">${highlights}</div>` : '<div class="tl-empty">这周还没有记录</div>'}
      </div>
    </div>`;
}
