/* ============================================================
 * 总览视图（手机桌面 · 图标网格版）
 * 安卓启动器风格：多行多列网格，每个模块是一张独立圆角方形
 * 图标卡，图标下方居中标签，右上角小角标显示实时数据。
 * 汉堡抽屉已移除；AI 解析 / 导入 / 导出 入口统一收进「设置」。
 * ============================================================ */
import { h, esc } from '../utils/dom.js';
import { getSettings, allRecords, todayDigest } from '../store.js';
import { ledgerStats } from '../utils/stats.js';
import { go } from '../router.js';

const money = (n) => '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* 与抽屉同款图标，保持视觉一致 */
const ICON = {
  ledger: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M8 8h7M8 12h7"/></svg>`,
  wish:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z"/></svg>`,
  todo:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`,
  note:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/><path d="M8 9h8M8 13h5"/></svg>`,
  mem:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 12c0 4.7-7 9-7 9z"/><path d="M12 7v5l3 2"/></svg>`,
  meal:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z"/><path d="M8.5 7.5c0-1.6 1.4-2 1.4-4"/><path d="M13.5 7.5c0-1.6 1.4-2 1.4-4"/><path d="M4 20h16"/></svg>`,
  time:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  weight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"/><path d="M7 7l-2.5 11h11z"/><path d="M17 7l-2.5 11h11z"/><path d="M12 3v3"/></svg>`,
  ai:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>`,
  export: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 19h16"/></svg>`,
  import: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m8 7 4-4 4 4"/><path d="M4 19h16"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.1A1.6 1.6 0 0 0 8 1.1V1a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>`,
};

/* 渲染一张图标卡。badge 为空则不显示角标 */
function tile({ go, act, ico, color, label, badge }) {
  const badgeHTML = badge
    ? `<span class="app-badge">${esc(String(badge))}</span>`
    : '';
  const attr = go ? `data-go="${go}"` : `data-act="${act}"`;
  return `
    <button class="app-tile" ${attr}>
      <span class="app-icon ${color}">${ICON[ico]}${badgeHTML}</span>
      <span class="app-label">${esc(label)}</span>
    </button>`;
}

export function DashboardView() {
  const s = getSettings();
  const nick = s.nickname || '朋友';
  const mo = ledgerStats('month', new Date());

  const recs = allRecords();
  const wishCount = recs.filter(r => r.type === 'wish').length;
  const wishCost = recs.filter(r => r.type === 'wish').reduce((a, r) => a + (+r.estCost || 0), 0);
  const noteCount = recs.filter(r => r.type === 'note').length;
  const memCount = recs.filter(r => r.type === 'memorial').length;
  const todoCount = recs.filter(r => r.type === 'todo').length;
  const weights = recs.filter(r => r.type === 'weight')
    .sort((a, b) => new Date(b.occurredAt || b.createdAt) - new Date(a.occurredAt || a.createdAt));
  const latestW = weights[0] ? Number(weights[0].weight) : null;
  const wCount = weights.length;
  const digest = todayDigest();
  const energyUsed = digest.energyUsed;
  const kcalUsed = digest.kcalUsed;

  const el = h(`
    <div>
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <span class="topbar-title">总览</span>
        <button class="topbar-view" data-act="settings" title="设置">${ICON.settings}</button>
      </div>

      <div class="scroll">
        <div class="launcher-greet">嗨，${esc(nick)} 👋</div>

        <div class="app-grid">
          ${tile({ go: 'ledger',  ico: 'ledger', color: 'pink',   label: '记账',     badge: mo.count || '' })}
          ${tile({ go: 'weight',  ico: 'weight', color: 'lav',    label: '体重',     badge: latestW != null ? latestW + 'kg' : '' })}
          ${tile({ go: 'meal',    ico: 'meal',   color: 'peach',  label: '餐食·热量', badge: kcalUsed ? kcalUsed : '' })}
          ${tile({ go: 'wish',    ico: 'wish',   color: 'lav',    label: '愿望单',   badge: wishCount || '' })}

          ${tile({ go: 'todo',    ico: 'todo',   color: 'mint',   label: '待办',     badge: todoCount || '' })}
          ${tile({ go: 'note',    ico: 'note',   color: 'sky',    label: '记事',     badge: noteCount || '' })}
          ${tile({ go: 'memorial',ico: 'mem',    color: 'butter', label: '纪念日',   badge: memCount || '' })}
          ${tile({ go: 'timeline',ico: 'time',   color: 'butter', label: '时间轴',   badge: '' })}
          ${tile({ act: 'settings',ico: 'settings',color: 'mint', label: '设置',     badge: '' })}
        </div>

        <div class="dw-foot">本地存储 · 可导出/导入备份 · 设置里还能多端同步 · v0.3</div>
      </div>
    </div>`);

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="back"]')) return go('home');

    const goTo = e.target.closest('[data-go]')?.dataset.go;
    if (goTo) return go(goTo);

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'settings') return go('settings');
  });

  return el;
}
