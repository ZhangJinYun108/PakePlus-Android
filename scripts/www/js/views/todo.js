/* ============================================================
   模块 5 · 待办·精力看板
   ① 今日精力负荷（超上限提醒）② 精力习惯趋势（日/周/月/年）
   ③ 精力构成（高/中/低）④ 待办清单（今天/全部/已完成，可勾选/编辑）
   ============================================================ */
import { h, esc, toast, pickSheet } from '../utils/dom.js';
import { friendlyDateTime, dayKey } from '../utils/time.js';
import { allRecords, saveRecord, getSettings, deleteRecord } from '../store.js';
import {
  PERIODS, energyStats, periodLabel, shiftAnchor, isCurrentPeriod,
} from '../utils/stats.js';
import { back, go } from '../router.js';
import { downloadICS, ALARM_OPTIONS } from '../utils/ics.js';
import { setupSwipeDelete } from '../utils/swipe.js';

const PRIO_LABEL = { high: '高', mid: '中', low: '低' };

export function TodoView(params = {}) {
  let period = params.period || 'week';
  let anchor = new Date();
  let listFilter = 'today';

  const el = h(`
    <div>
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <div class="topbar-title">待办·精力</div>
        <button class="topbar-add" data-act="add" title="新建待办">+</button>
      </div>

      <div class="scroll">
        <div class="energy-today" id="energy-today"></div>

        <div class="chip-row period-tabs" id="period-tabs"></div>
        <div class="period-nav">
          <button class="pn-arrow" data-nav="-1">‹</button>
          <span class="pn-label"></span>
          <button class="pn-arrow" data-nav="1">›</button>
        </div>

        <div class="board" id="board"></div>
        <div style="height:16px"></div>
      </div>
    </div>`);

  const todayEl = el.querySelector('#energy-today');
  const tabsEl = el.querySelector('#period-tabs');
  const labelEl = el.querySelector('.pn-label');
  const boardEl = el.querySelector('#board');
  const nextBtn = el.querySelector('[data-nav="1"]');

  function renderToday() {
    const used = allRecords()
      .filter(r => r.type === 'todo')
      .filter(r => dayKey(new Date(r.occurredAt || r.createdAt)) === dayKey())
      .reduce((s, r) => s + ({ low: 1, mid: 2, high: 3 }[r.energy] || 0), 0);
    const limit = getSettings().energyLimit;
    const pct = Math.min(1, used / limit);
    const over = used > limit;
    todayEl.className = 'energy-today' + (over ? ' over' : '');
    todayEl.innerHTML = `
      <div class="et-head">
        <span class="et-title">今日精力</span>
        <span class="et-num">${used}<i> / ${limit}</i></span>
      </div>
      <div class="et-bar"><div class="et-fill" style="width:${pct * 100}%"></div></div>
      ${over
        ? `<div class="et-warn">⚠️ 今天安排得有点满，留点余力给自己～</div>`
        : `<div class="et-hint">上限 ${limit} · 节奏刚刚好 ✦</div>`}`;
  }

  function renderTabs() {
    tabsEl.innerHTML = PERIODS.map(p =>
      `<button class="chip ${p.key === period ? 'on' : ''}" data-period="${p.key}">${p.label}</button>`).join('');
  }

  function renderNav() {
    labelEl.textContent = periodLabel(period, anchor);
    nextBtn.classList.toggle('disabled', isCurrentPeriod(period, anchor));
  }

  function todosByFilter(f) {
    let list = allRecords().filter(r => r.type === 'todo');
    if (f === 'today') list = list.filter(r => dayKey(new Date(r.occurredAt || r.createdAt)) === dayKey());
    else if (f === 'done') list = list.filter(r => r.done);
    return list.sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return new Date(a.occurredAt || a.createdAt) - new Date(b.occurredAt || b.createdAt);
    });
  }

  function energyTrendCard(st, period) {
    const sub = { day: '近 7 日精力', week: '本周每日精力', month: '本月每周精力', year: '本年每月精力' }[period];
    if (!st.trend.some(t => t.value > 0)) {
      return `<div class="card"><div class="sec-title">精力趋势 <span class="sec-sub">${sub}</span></div><div class="board-empty">这段时间还没有待办记录</div></div>`;
    }
    const bars = st.trend.map(t => {
      const pct = Math.max(t.value > 0 ? 6 : 2, t.value / st.trendMax * 100);
      return `
        <div class="bar-col ${t.hi ? 'hi' : ''}">
          <div class="bar-slot">
            <span class="bar-tip">${t.value > 0 ? t.value : ''}</span>
            <div class="bar-fill energy" data-h="${pct}%" style="height:0"></div>
          </div>
          <span class="bar-label">${esc(t.label)}</span>
        </div>`;
    }).join('');
    return `<div class="card"><div class="sec-title">精力趋势 <span class="sec-sub">${sub}</span></div><div class="bar-chart">${bars}</div></div>`;
  }

  function energyLevelCard(st) {
    const max = Math.max(1, st.levels.high, st.levels.mid, st.levels.low);
    const rows = [['high', '高'], ['mid', '中'], ['low', '低']].map(([k, l]) => {
      const pct = st.levels[k] / max * 100;
      return `
        <div class="lvl-row">
          <span class="lvl-name"><i class="energy-dot ${k}"></i>${l}</span>
          <div class="cat-track"><div class="cat-fill" data-w="${pct.toFixed(0)}%" style="width:0;background:var(--c-${k})"></div></div>
          <span class="lvl-val">${st.levels[k]}</span>
        </div>`;
    }).join('');
    const total = st.levels.high + st.levels.mid + st.levels.low;
    return `<div class="card"><div class="sec-title">精力构成 <span class="sec-sub">共 ${total} 项</span></div>${rows}</div>`;
  }

  function todoListCard() {
    const emptyText = {
      today: '今天还没有待办，说一句「下午写周报」试试',
      all: '还没有任何待办',
      done: '还没有完成的待办，加油～',
    }[listFilter];
    const list = todosByFilter(listFilter);
    if (!list.length) {
      return `<div class="card"><div class="sec-title">待办清单</div><div class="board-empty">${emptyText}</div></div>`;
    }
    const rows = list.map((r, i) => `
      <div class="swipe" data-swipe data-del="${esc(r.id)}">
        <div class="swipe-action"><button class="swipe-del" data-del="${esc(r.id)}" title="删除">删除</button></div>
        <div class="swipe-content todo-item ${r.done ? 'done' : ''}" data-id="${esc(r.id)}" style="animation-delay:${i * 30}ms">
          <button class="ti-check ${r.done ? 'on' : ''}" data-check="${esc(r.id)}"></button>
          <div class="ti-main">
            <div class="ti-title">${esc(r.title || '未命名待办')}</div>
            <div class="ti-meta">${esc(friendlyDateTime(r.occurredAt || r.createdAt))} · ${PRIO_LABEL[r.priority] || ''}</div>
          </div>
          <button class="ti-cal" data-cal="${esc(r.id)}" title="加到日历提醒">📅</button>
          <span class="energy-dot ${r.energy}"></span>
        </div>
      </div>`).join('');
    return `
      <div class="card">
        <div class="sec-title">
          待办清单
          <button class="sec-btn" data-cal-all title="把当前筛选的待办导出到系统日历">📅 加到日历</button>
        </div>
        <div class="todo-filters">
          <button class="chip sm ${listFilter === 'today' ? 'on mint' : ''}" data-list="today">今天</button>
          <button class="chip sm ${listFilter === 'all' ? 'on mint' : ''}" data-list="all">全部</button>
          <button class="chip sm ${listFilter === 'done' ? 'on mint' : ''}" data-list="done">已完成</button>
        </div>
        <div class="todo-list-wrap">${rows}</div>
      </div>`;
  }

  async function exportToCal(recs, label) {
    const arr = Array.isArray(recs) ? recs : [recs];
    const valid = arr.filter(r => r && (r.occurredAt || r.createdAt));
    if (!valid.length) return toast('没有可导出到日历的待办');
    const val = await pickSheet({
      title: '提醒提前量',
      options: ALARM_OPTIONS.map(o => ({ value: String(o.min), label: o.label })),
      current: '15',
    });
    if (val == null) return;
    downloadICS(valid, `待办-${label || '导出'}-${new Date().toISOString().slice(0, 10)}.ics`, { alarmMin: Number(val) });
    toast(arr.length > 1 ? `已生成 .ics，去系统日历导入即可 🔔` : `已生成日历文件，去系统日历导入即可 🔔`);
  }

  function renderBoard() {
    const st = energyStats(period, anchor);
    boardEl.innerHTML = `
      ${energyTrendCard(st, period)}
      ${energyLevelCard(st)}
      ${todoListCard()}
    `;
    requestAnimationFrame(() => {
      boardEl.querySelectorAll('.bar-fill').forEach((b, i) => setTimeout(() => { b.style.height = b.dataset.h; }, i * 26));
      boardEl.querySelectorAll('.cat-fill').forEach((b, i) => setTimeout(() => { b.style.width = b.dataset.w; }, 60 + i * 50));
    });
    setupSwipeDelete(boardEl, { onDelete: (id) => { deleteRecord(id); toast('已删除'); renderBoard(); } });
  }

  function render() { renderToday(); renderTabs(); renderNav(); renderBoard(); }

  el.addEventListener('click', async (e) => {
    const t = e.target;

    if (t.closest('[data-act="back"]')) return back();

    if (t.closest('[data-act="add"]')) {
      const rec = { type: 'todo', raw: '', title: '', energy: 'mid',
        occurredAt: new Date().toISOString(), done: false, energyBy: 'manual', priority: 'mid' };
      return go('result', { draft: rec });
    }

    const pBtn = t.closest('[data-period]');
    if (pBtn) {
      period = pBtn.dataset.period;
      anchor = new Date();
      renderTabs(); renderNav();
      return renderBoard();
    }

    const nav = t.closest('[data-nav]');
    if (nav) {
      const delta = +nav.dataset.nav;
      if (delta > 0 && isCurrentPeriod(period, anchor)) return toast('已经是最新的了');
      anchor = shiftAnchor(period, anchor, delta);
      return renderBoard();
    }

    const lf = t.closest('[data-list]');
    if (lf) { listFilter = lf.dataset.list; return renderBoard(); }

    const calAll = t.closest('[data-cal-all]');
    if (calAll) {
      const set = todosByFilter(listFilter).filter(r => !r.done);
      const label = listFilter === 'today' ? '今天' : listFilter === 'done' ? '已完成' : '全部';
      return exportToCal(set.length ? set : todosByFilter(listFilter), label);
    }

    const cal = t.closest('[data-cal]');
    if (cal) {
      const rec = allRecords().find(r => r.id === cal.dataset.cal);
      return rec ? exportToCal(rec) : undefined;
    }

    const chk = t.closest('[data-check]');
    if (chk) {
      const rec = allRecords().find(r => r.id === chk.dataset.check);
      if (rec) { rec.done = !rec.done; saveRecord(rec); return renderBoard(); }
      return;
    }

    const item = t.closest('.todo-item');
    if (item) {
      const rec = allRecords().find(r => r.id === item.dataset.id);
      if (rec) return go('result', { draft: rec });
    }
  });

  render();
  return el;
}
