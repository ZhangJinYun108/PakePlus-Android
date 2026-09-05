/* ============================================================
   模块 8 · 餐食·热量
   数据来源：记账里「品类=餐饮」的支出，不是新分类，不重复记录
   ① 今日热量环（对比每日上限）② 热量趋势 ③ 按天展开的进食明细
   ============================================================ */
import { h, esc, toast } from '../utils/dom.js';
import { allRecords, getSettings, todayDigest, deleteRecord } from '../store.js';
import { recKcal, foodsSummary } from '../utils/kcal.js';
import { activitiesSummary } from '../utils/exercise.js';
import { dayKey } from '../utils/time.js';
import {
  PERIODS, mealStats, periodLabel, shiftAnchor, isCurrentPeriod,
} from '../utils/stats.js';
import { back, go } from '../router.js';
import { setupSwipeDelete } from '../utils/swipe.js';

const money = (n) => '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hhmm = (t) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 原句去掉金额与时间前缀，作为兜底名称 */
function cleanRaw(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/^(今天|明天|昨天|前天|今晚)?\s*(早上|上午|中午|下午|晚上)?\s*/, '')
    .replace(/(花了|花费|付了|支付|消费)?\s*(¥|￥)?\d+(\.\d+)?\s*(块钱|块|元|圆|大洋|rmb|RMB)?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 一条记录在明细里显示的名字 */
const recName = (r) =>
  foodsSummary(r.foods) || r.brand || cleanRaw(r.raw) || r.place || '一餐';

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

export function MealView(params = {}) {
  let period = params.period || 'week';
  let anchor = new Date();
  const openDays = new Set();     // 展开状态：天的时间戳
  let firstRender = true;

  const el = h(`
    <div>
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <div class="topbar-title">餐食 · 热量</div>
        <button class="topbar-add" data-act="add" title="记一餐">+</button>
      </div>

      <div class="scroll">
        <div id="kc-net"></div>
        <div id="kc-today"></div>

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

  const todayEl = el.querySelector('#kc-today');
  const netEl = el.querySelector('#kc-net');
  const tabsEl = el.querySelector('#period-tabs');
  const labelEl = el.querySelector('.pn-label');
  const boardEl = el.querySelector('#board');
  const nextBtn = el.querySelector('[data-nav="1"]');

  /* —— ① 今日热量环 —— */
  function renderToday() {
    const s = getSettings();
    const limit = s.kcalLimit || 1500;
    const used = todayDigest().kcalUsed;
    const mealCount = todayDigest().mealCount;
    const ratio = limit ? used / limit : 0;
    const over = used > limit;
    const near = !over && ratio >= 0.85;
    const offset = RING_C * (1 - Math.min(1, ratio));

    const desc = over
      ? `超出 ${used - limit} 千卡`
      : near
        ? `快到上限了，还剩 ${limit - used} 千卡`
        : `还可以吃 ${limit - used} 千卡`;

    todayEl.className = 'kc-today' + (over ? ' over' : near ? ' near' : '');
    todayEl.innerHTML = `
      <div class="kc-ring">
        <svg viewBox="0 0 120 120">
          <circle class="kc-ring-bg" cx="60" cy="60" r="${RING_R}"></circle>
          <circle class="kc-ring-fg" cx="60" cy="60" r="${RING_R}"
                  stroke-dasharray="${RING_C.toFixed(1)}"
                  stroke-dashoffset="${RING_C.toFixed(1)}"
                  data-off="${offset.toFixed(1)}"></circle>
        </svg>
        <div class="kc-ring-center">
          <b>${used}</b>
          <i>/ ${limit}</i>
        </div>
      </div>
      <div class="kc-today-side">
        <div class="kc-t-title">今天摄入</div>
        <div class="kc-t-desc">${esc(desc)}</div>
        <div class="kc-t-meta">${mealCount ? `${mealCount} 笔进食记录` : '今天还没记吃的'}</div>
        ${over ? '<div class="kc-t-warn">⚠️ 今天吃超啦，晚点走两步～</div>' : ''}
      </div>`;

    // 环形入场动画
    requestAnimationFrame(() => {
      const fg = todayEl.querySelector('.kc-ring-fg');
      if (fg) setTimeout(() => { fg.style.strokeDashoffset = fg.dataset.off; }, 60);
    });
  }

  /* —— ①-b 今日净平衡（基础值 - 摄入 + 消耗） —— */
  function renderNet() {
    const s = getSettings();
    const base = s.kcalBase || 1500;
    const dig = todayDigest();
    const food = dig.kcalUsed;
    const burn = dig.burnUsed;
    const net = base - food + burn;
    const deficit = net >= 0;

    netEl.className = 'bal-hero ' + (deficit ? 'deficit' : 'surplus');
    netEl.innerHTML = `
      <div class="bal-hero-top">
        <span class="bal-label">今日净平衡</span>
        <span class="bal-tag">${deficit ? '热量缺口 🟢' : '热量超标 🔴'}</span>
      </div>
      <div class="bal-num">${deficit ? '' : '+'}${Math.abs(net)}<i>千卡</i></div>
      <div class="bal-comp">
        <span>基础 <b>${base}</b></span>
        <span>摄入 <b>${food}</b></span>
        <span>消耗 <b>${burn}</b></span>
      </div>
      <div class="bal-formula">基础值 − 进食 + 运动</div>`;
  }

  function renderTabs() {
    tabsEl.innerHTML = PERIODS.map(p =>
      `<button class="chip ${p.key === period ? 'on' : ''}" data-period="${p.key}">${p.label}</button>`).join('');
  }

  function renderNav() {
    labelEl.textContent = periodLabel(period, anchor);
    nextBtn.classList.toggle('disabled', isCurrentPeriod(period, anchor));
  }

  /* —— ② 概览三卡 —— */
  function sumCard(st) {
    return `
      <div class="sum-row">
        <div class="sum-card kc">
          <span class="sum-key">日均</span>
          <span class="sum-val">${st.avg}<i class="sum-unit">千卡</i></span>
        </div>
        <div class="sum-card kc">
          <span class="sum-key">记录天数</span>
          <span class="sum-val">${st.dayCount}<i class="sum-unit">天</i></span>
        </div>
        <div class="sum-card kc">
          <span class="sum-key">超标</span>
          <span class="sum-val ${st.overDays ? 'neg' : ''}">${st.overDays}<i class="sum-unit">天</i></span>
        </div>
      </div>`;
  }

  /* —— ②-b 今日运动卡 —— */
  function exCard(st) {
    const dig = todayDigest();
    const burn = dig.burnUsed;
    const acts = allRecords()
      .filter(r => r.type === 'exercise')
      .filter(r => dayKey(new Date(r.occurredAt || r.createdAt)) === dayKey())
      .flatMap(r => r.activities || []);
    if (!burn) {
      return `<div class="card">
        <div class="sec-title">今日运动</div>
        <div class="board-empty">说一句「跑步机走了40分钟，力量训练练了30分钟」就能记下来</div>
      </div>`;
    }
    const items = acts.map(a => `
      <div class="ex-item">
        <span class="ex-item-name">${esc(a.name)}</span>
        <span class="ex-item-meta">${a.min} 分钟 · ${a.kcal} 千卡</span>
      </div>`).join('');
    return `
      <div class="card">
        <div class="sec-title">今日运动 <span class="sec-sub">消耗 ${burn} 千卡</span></div>
        ${items}
        <div class="kcal-tip">估算值按基础代谢与体重粗算，仅供参考，点明细可改</div>
      </div>`;
  }

  /* —— ②-c 净平衡趋势（缺口/超标） —— */
  function netTrendCard(st) {
    const sub = { day: '近 7 日净平衡', week: '本周每日净平衡', month: '本月每周净平衡', year: '本年每月净平衡' }[period];
    if (!st.trend.some(t => t.net !== 0)) {
      return `<div class="card">
        <div class="sec-title">热量净平衡 <span class="sec-sub">${sub}</span></div>
        <div class="board-empty">记录进食和运动后，这里会显示每天的缺口或超标</div>
      </div>`;
    }
    const bars = st.trend.map(t => {
      const v = Math.abs(t.net);
      const pct = Math.max(v > 0 ? 6 : 2, st.trendMaxNet ? v / st.trendMaxNet * 100 : 0);
      return `
        <div class="bar-col">
          <div class="bar-slot">
            <span class="bar-tip">${t.net > 0 ? '+' : ''}${t.net}</span>
            <div class="bar-fill net ${t.deficit ? 'deficit' : 'surplus'}" data-h="${pct}%" style="height:0"></div>
          </div>
          <span class="bar-label">${esc(t.label)}</span>
        </div>`;
    }).join('');
    return `
      <div class="card">
        <div class="sec-title">热量净平衡 <span class="sec-sub">${sub}</span></div>
        <div class="bar-chart net-chart">${bars}</div>
        <div class="net-legend">
          <span class="net-dot deficit"></span>缺口（绿，在瘦）
          <span class="net-dot surplus"></span>超标（粉，在囤）
        </div>
      </div>`;
  }

  /* —— ③ 趋势柱：横线 = 每日上限 —— */
  function trendCard(st) {
    const sub = { day: '近 7 日摄入', week: '本周每日摄入', month: '本月每周日均', year: '本年每月日均' }[period];
    if (!st.trend.some(t => t.value > 0)) {
      return `<div class="card">
        <div class="sec-title">热量趋势 <span class="sec-sub">${sub}</span></div>
        <div class="board-empty">这段时间还没有进食记录</div>
      </div>`;
    }
    const limitPct = Math.min(100, st.limit / st.trendMax * 100);
    const bars = st.trend.map(t => {
      const pct = Math.max(t.value > 0 ? 6 : 2, t.value / st.trendMax * 100);
      return `
        <div class="bar-col ${t.hi ? 'hi' : ''}">
          <div class="bar-slot">
            <span class="bar-tip">${t.value > 0 ? t.value : ''}</span>
            <div class="bar-fill kcal ${t.over ? 'over' : ''}" data-h="${pct}%" style="height:0"></div>
          </div>
          <span class="bar-label">${esc(t.label)}</span>
        </div>`;
    }).join('');
    return `
      <div class="card">
        <div class="sec-title">热量趋势 <span class="sec-sub">${sub}</span></div>
        <div class="bar-chart kcal-chart">
          <div class="kc-limit-line" style="bottom:calc(${limitPct}% + 22px)">
            <span>上限 ${st.limit}</span>
          </div>
          ${bars}
        </div>
      </div>`;
  }

  /* —— ④ 按天明细（点开看当天吃了什么） —— */
  function daysCard(st) {
    if (!st.days.length) {
      return `<div class="card">
        <div class="sec-title">进食明细</div>
        <div class="board-empty">说一句「中午吃了碗牛肉面 25」就记下了<br>餐饮类记账会自动算热量</div>
      </div>`;
    }

    const rows = st.days.map((d, i) => {
      const open = openDays.has(d.key);
      const items = d.recs.map(r => {
        const k = recKcal(r);
        return `
          <div class="swipe" data-swipe data-del="${esc(r.id)}">
            <div class="swipe-action"><button class="swipe-del" data-del="${esc(r.id)}" title="删除">删除</button></div>
            <div class="swipe-content kc-item" data-id="${esc(r.id)}">
              <span class="kc-item-dot"></span>
              <div class="kc-item-main">
                <div class="kc-item-name">${esc(recName(r))}</div>
                <div class="kc-item-meta">${hhmm(r.occurredAt || r.createdAt)}${r.amount != null ? ' · ' + money(r.amount) : ' · 没花钱'}${r.place ? ' · ' + esc(r.place) : ''}</div>
              </div>
              <span class="kc-item-kcal">${k}<i>千卡</i></span>
            </div>
          </div>`;
      }).join('');

      const exItems = (d.exRecs || []).map(r => `
        <div class="swipe" data-swipe data-del="${esc(r.id)}">
          <div class="swipe-action"><button class="swipe-del" data-del="${esc(r.id)}" title="删除">删除</button></div>
          <div class="swipe-content kc-item ex" data-id="${esc(r.id)}">
            <span class="kc-item-dot ex"></span>
            <div class="kc-item-main">
              <div class="kc-item-name">${esc(r.title || activitiesSummary(r.activities))}</div>
              <div class="kc-item-meta">${hhmm(r.occurredAt || r.createdAt)} · 消耗 ${r.burn} 千卡</div>
            </div>
            <span class="kc-item-kcal">+${r.burn}<i>千卡</i></span>
          </div>
        </div>`).join('');

      const netBadge = d.burn
        ? `<span class="kc-day-net ${d.deficit ? 'deficit' : 'surplus'}">${d.deficit ? '缺口' : '超标'} ${Math.abs(d.net)}</span>`
        : '';

      return `
        <div class="kc-day ${open ? 'open' : ''} ${d.over ? 'over' : ''}" data-day="${d.key}" style="animation-delay:${i * 30}ms">
          <div class="kc-day-head">
            <div class="kc-day-l">
              <b>${esc(d.label)}</b>
              <i>${esc(d.weekday)} · ${d.recs.length} 餐${d.exRecs?.length ? ' · ' + d.exRecs.length + ' 练' : ''}</i>
            </div>
            <div class="kc-day-mid">
              <div class="kc-day-track"><div class="kc-day-fill" data-w="${d.pct.toFixed(0)}%" style="width:0"></div></div>
              <span class="kc-day-diff">${d.over ? `超 ${d.diff}` : `余 ${-d.diff}`}</span>
              ${netBadge}
            </div>
            <div class="kc-day-r">
              <b>${d.kcal}</b><i>千卡</i>
            </div>
            <span class="kc-day-arrow">›</span>
          </div>
          <div class="kc-day-body">${items}${exItems}</div>
        </div>`;
    }).join('');

    return `
      <div class="card">
        <div class="sec-title">进食明细 <span class="sec-sub">点一天看吃了什么</span></div>
        ${rows}
      </div>`;
  }

  function renderBoard() {
    const st = mealStats(period, anchor);

    // 首次进入自动展开最近一天
    if (firstRender && st.days.length) { openDays.add(st.days[0].key); firstRender = false; }

    boardEl.innerHTML = `
      ${sumCard(st)}
      ${exCard(st)}
      ${netTrendCard(st)}
      ${trendCard(st)}
      ${daysCard(st)}`;

    requestAnimationFrame(() => {
      boardEl.querySelectorAll('.bar-fill').forEach((b, i) =>
        setTimeout(() => { b.style.height = b.dataset.h; }, i * 26));
      boardEl.querySelectorAll('.kc-day-fill').forEach((b, i) =>
        setTimeout(() => { b.style.width = b.dataset.w; }, 60 + i * 40));
    });
    setupSwipeDelete(boardEl, { onDelete: (id) => { deleteRecord(id); toast('已删除'); renderBoard(); } });
  }

  function render() { renderNet(); renderToday(); renderTabs(); renderNav(); renderBoard(); }

  el.addEventListener('click', async (e) => {
    const t = e.target;

    if (t.closest('[data-act="back"]')) return back();

    if (t.closest('[data-act="add"]')) {
      const rec = {
        type: 'ledger', raw: '', amount: null, category: '餐饮',
        place: null, brand: null, isIncome: false, rating: null, photos: [],
        foods: [], kcal: null, kcalBy: 'manual',
        occurredAt: new Date().toISOString(),
      };
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

    // 点具体一餐 → 进编辑（改热量 / 改食物）
    const item = t.closest('.kc-item');
    if (item) {
      const rec = allRecords().find(r => r.id === item.dataset.id);
      if (rec) return go('result', { draft: rec });
      return;
    }

    // 点某天 → 展开 / 收起
    const dayEl = t.closest('.kc-day');
    if (dayEl) {
      const key = +dayEl.dataset.day;
      if (openDays.has(key)) openDays.delete(key); else openDays.add(key);
      dayEl.classList.toggle('open');
    }
  });

  render();
  return el;
}
