/* ============================================================
   模块 3 · 记账看板
   顶部 日/周/月/年 软 tab → 下方四块联动刷新：
   ① 收支概览  ② 趋势柱状  ③ 品类占比  ④ 最近记录（带评价色点）
   ============================================================ */
import { h, esc, toast } from '../utils/dom.js';
import { friendlyDateTime } from '../utils/time.js';
import { allRecords, deleteRecord } from '../store.js';
import {
  PERIODS, ledgerStats, periodLabel, shiftAnchor, isCurrentPeriod,
} from '../utils/stats.js';
import { back, go } from '../router.js';
import { setupSwipeDelete } from '../utils/swipe.js';

const money = (n) => '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const RATING_COLOR = { good: 'var(--mint-300)', ok: 'var(--butter-300)', bad: 'var(--pink-300)' };
const RATING_TEXT  = { good: '推荐', ok: '一般', bad: '不推荐' };

/** 原句去掉金额与时间前缀，避免与右侧金额重复 */
function cleanRaw(raw) {
  if (!raw) return '';
  return raw
    .replace(/^(今天|明天|昨天|前天|今晚)?\s*(早上|上午|中午|下午|晚上)?\s*/, '')
    .replace(/(花了|花费|付了|支付|消费|收到|赚了)?\s*(¥|￥)?\d+(\.\d+)?\s*(块钱|块|元|圆|大洋|rmb|RMB)?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function LedgerView(params = {}) {
  let period = params.period || 'month';
  let anchor = params.anchor ? new Date(params.anchor) : new Date();

  const el = h(`
    <div>
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <div class="topbar-title">记账看板</div>
      </div>

      <div class="scroll">
        <div class="chip-row period-tabs">
          ${PERIODS.map(p => `<button class="chip ${p.key === period ? 'on' : ''}" data-period="${p.key}">${p.label}</button>`).join('')}
        </div>

        <div class="period-nav">
          <button class="pn-arrow" data-nav="-1">‹</button>
          <span class="pn-label"></span>
          <button class="pn-arrow" data-nav="1">›</button>
        </div>

        <div class="board"></div>
      </div>
    </div>`);

  const labelEl = el.querySelector('.pn-label');
  const boardEl = el.querySelector('.board');
  const nextBtn = el.querySelector('[data-nav="1"]');

  function render() {
    const st = ledgerStats(period, anchor);
    labelEl.textContent = periodLabel(period, anchor);
    nextBtn.classList.toggle('disabled', isCurrentPeriod(period, anchor));

    boardEl.innerHTML = `
      ${sumCards(st)}
      ${trendCard(st, period)}
      ${categoryCard(st)}
      ${recentCard(st)}
    `;

    // 柱状入场动画
    requestAnimationFrame(() => {
      boardEl.querySelectorAll('.bar-fill').forEach((b, i) => {
        setTimeout(() => { b.style.height = b.dataset.h; }, i * 26);
      });
      boardEl.querySelectorAll('.cat-fill').forEach((b, i) => {
        setTimeout(() => { b.style.width = b.dataset.w; }, 60 + i * 50);
      });
    });
    setupSwipeDelete(boardEl, { onDelete: (id) => { deleteRecord(id); toast('已删除'); render(); } });
  }

  el.addEventListener('click', (e) => {
    const t = e.target;

    if (t.closest('[data-act="back"]')) return back();

    const pBtn = t.closest('[data-period]');
    if (pBtn) {
      period = pBtn.dataset.period;
      anchor = new Date();                       // 切维度回到当前周期
      el.querySelectorAll('[data-period]').forEach(b =>
        b.classList.toggle('on', b.dataset.period === period));
      return render();
    }

    const nav = t.closest('[data-nav]');
    if (nav) {
      const delta = +nav.dataset.nav;
      if (delta > 0 && isCurrentPeriod(period, anchor)) return toast('已经是最新的了');
      anchor = shiftAnchor(period, anchor, delta);
      return render();
    }

    const row = t.closest('.rec-row');
    if (row) {
      const rec = allRecords().find(r => r.id === row.dataset.id);
      if (rec) go('result', { draft: rec });
    }
  });

  render();
  return el;
}

/* —— ① 收支概览 —— */
function sumCards(st) {
  const positive = st.balance >= 0;
  return `
    <div class="sum-row">
      <div class="sum-card exp">
        <span class="sum-key">支出</span>
        <span class="sum-val">${money(st.expense)}</span>
      </div>
      <div class="sum-card inc">
        <span class="sum-key">收入</span>
        <span class="sum-val">${money(st.income)}</span>
      </div>
      <div class="sum-card bal">
        <span class="sum-key">结余</span>
        <span class="sum-val ${positive ? '' : 'neg'}">${positive ? '' : '-'}${money(Math.abs(st.balance))}</span>
      </div>
    </div>`;
}

/* —— ② 趋势柱状 —— */
function trendCard(st, period) {
  const sub = { day: '近 7 日支出', week: '本周每日支出', month: '本月每周支出', year: '本年每月支出' }[period];
  if (!st.trend.some(t => t.value > 0)) {
    return `<div class="card">
      <div class="sec-title">趋势 <span class="sec-sub">${sub}</span></div>
      <div class="board-empty">这段时间还没有支出记录</div>
    </div>`;
  }
  const bars = st.trend.map(t => {
    const pct = Math.max(t.value > 0 ? 6 : 2, t.value / st.trendMax * 100);
    return `
      <div class="bar-col ${t.hi ? 'hi' : ''}">
        <div class="bar-slot">
          <span class="bar-tip">${t.value > 0 ? money(t.value).replace('¥', '') : ''}</span>
          <div class="bar-fill" data-h="${pct}%" style="height:0"></div>
        </div>
        <span class="bar-label">${esc(t.label)}</span>
      </div>`;
  }).join('');
  return `
    <div class="card">
      <div class="sec-title">趋势 <span class="sec-sub">${sub}</span></div>
      <div class="bar-chart">${bars}</div>
    </div>`;
}

/* —— ③ 品类占比 —— */
function categoryCard(st) {
  if (!st.categories.length) {
    return `<div class="card">
      <div class="sec-title">品类占比</div>
      <div class="board-empty">还没有可归类的支出</div>
    </div>`;
  }
  const rows = st.categories.map(c => `
    <div class="cat-row">
      <span class="cat-name"><i style="background:${c.color}"></i>${esc(c.name)}</span>
      <div class="cat-track">
        <div class="cat-fill" data-w="${c.pct.toFixed(1)}%" style="width:0;background:${c.color}"></div>
      </div>
      <span class="cat-val">${money(c.value)}</span>
      <span class="cat-pct">${c.pct.toFixed(0)}%</span>
    </div>`).join('');
  return `<div class="card"><div class="sec-title">品类占比</div>${rows}</div>`;
}

/* —— ④ 最近记录 —— */
function recentCard(st) {
  if (!st.recent.length) {
    return `<div class="card">
      <div class="sec-title">最近记录</div>
      <div class="board-empty">说一句「中午吃面 18 块」就记下了</div>
    </div>`;
  }
  const rows = st.recent.map(r => {
    const dot = r.rating
      ? `<i class="rate-dot" style="background:${RATING_COLOR[r.rating]}" title="${RATING_TEXT[r.rating]}"></i>`
      : '';
    // 标题优先级：品牌 > 地点 > 去掉金额的原句 > 品类
    const title = r.brand || r.place || cleanRaw(r.raw) || r.category || '一笔记录';
    // 副行不重复标题里已有的信息
    const extra = [r.place, r.brand].filter(v => v && v !== title).join(' · ');
    return `
      <div class="swipe" data-swipe data-del="${esc(r.id)}">
        <div class="swipe-action"><button class="swipe-del" data-del="${esc(r.id)}" title="删除">删除</button></div>
        <div class="swipe-content rec-row" data-id="${esc(r.id)}">
          <span class="rec-cat" style="background:${r.isIncome ? 'var(--mint-100)' : 'var(--pink-100)'}">${esc(r.category || '其他')}</span>
          <div class="rec-main">
            <div class="rec-title">${esc(title)}${dot}</div>
            <div class="rec-meta">${esc(friendlyDateTime(r.occurredAt || r.createdAt))}${extra ? ' · ' + esc(extra) : ''}</div>
          </div>
          <span class="rec-amt ${r.isIncome ? 'inc' : ''}">${r.isIncome ? '+' : '-'}${money(r.amount || 0)}</span>
        </div>
      </div>`;
  }).join('');
  return `<div class="card"><div class="sec-title">最近记录 <span class="sec-sub">共 ${st.count} 笔</span></div>${rows}</div>`;
}
