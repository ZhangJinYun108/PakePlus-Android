/* ============================================================
   记账统计聚合层
   周期规则：
   - 日 = 自然日；月 = 自然月；年 = 自然年（符合直觉，与银行账单一致）
   - 周 = 周一起算的 7 天；命名遵循「周一所在月份」归属规则
   - 月视图的周柱：每天只归入一根柱，总和 === 当月总额，绝不重复计
   ============================================================ */
import { mondayOf, weekMeta, weeksInMonth, friendlyDate } from './time.js';
import { allRecords, getSettings } from '../store.js';
import { isMeal, recKcal } from './kcal.js';
import { recBurn } from './exercise.js';

export const PERIODS = [
  { key: 'day',   label: '日' },
  { key: 'week',  label: '周' },
  { key: 'month', label: '月' },
  { key: 'year',  label: '年' },
];

/* —— 品类配色（马卡龙） —— */
const CAT_COLOR = {
  餐饮: '#FFB3C6', 交通: '#CCE5F7', 购物: '#DDD1F5', 居家: '#FFE09A',
  娱乐: '#A3E3CB', 医疗: '#FFDCC9', 学习: '#C4EFDF', 人情: '#FFD1DF',
  工资: '#5FC3A0', 收入: '#A3E3CB', 其他: '#E4DCE0',
};
export const catColor = (name) => CAT_COLOR[name] || '#E4DCE0';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** 周期区间 [start, end) */
export function periodRange(period, anchor = new Date()) {
  const y = anchor.getFullYear(), m = anchor.getMonth();
  if (period === 'day')   { const s = startOfDay(anchor); return { start: s, end: addDays(s, 1) }; }
  if (period === 'week')  { const s = mondayOf(anchor);   return { start: s, end: addDays(s, 7) }; }
  if (period === 'month') return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
}

/** 前后平移一个周期 */
export function shiftAnchor(period, anchor, delta) {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate();
  if (period === 'day')   return new Date(y, m, d + delta);
  if (period === 'week')  return new Date(y, m, d + delta * 7);
  if (period === 'month') return new Date(y, m + delta, 1);
  return new Date(y + delta, 0, 1);
}

/** 周期标题 */
export function periodLabel(period, anchor) {
  if (period === 'day') {
    const t = startOfDay(new Date()).getTime();
    const a = startOfDay(anchor).getTime();
    if (a === t) return '今天 · ' + friendlyDate(anchor);
    if (a === t - 86400000) return '昨天 · ' + friendlyDate(anchor);
    return friendlyDate(anchor);
  }
  if (period === 'week') {
    const w = weekMeta(anchor);
    return `${w.year}年${w.month}月 第${w.week}周`;
  }
  if (period === 'month') return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;
  return `${anchor.getFullYear()}年`;
}

/** 已是当前周期？（用于禁用「下一个」） */
export function isCurrentPeriod(period, anchor) {
  const { start, end } = periodRange(period, anchor);
  const now = Date.now();
  return now >= start.getTime() && now < end.getTime();
}

/** 该日在其所属月内归入第几根周柱（clamp 保证不漏不重） */
function weekBucketIndex(date, year, month, totalWeeks) {
  const w = weekMeta(date);
  if (w.year === year && w.month === month) return Math.min(w.week, totalWeeks);
  // 月初早于首个周一 → 并入第 1 周；月末周一已跨到下月 → 并入最后一周
  return date.getDate() < 15 ? 1 : totalWeeks;
}

/** 主聚合 */
export function ledgerStats(period, anchor = new Date()) {
  const { start, end } = periodRange(period, anchor);
  const s = start.getTime(), e = end.getTime();

  const inRange = allRecords()
    .filter(r => r.type === 'ledger')
    .map(r => ({ ...r, _t: new Date(r.occurredAt || r.createdAt).getTime() }))
    .filter(r => r._t >= s && r._t < e);

  const expense = inRange.filter(r => !r.isIncome).reduce((a, r) => a + (+r.amount || 0), 0);
  const income  = inRange.filter(r =>  r.isIncome).reduce((a, r) => a + (+r.amount || 0), 0);

  /* —— 趋势柱 —— */
  const trend = [];
  const bump = (idx, rec) => { if (trend[idx]) trend[idx].value += (+rec.amount || 0); };

  if (period === 'day') {
    // 近 7 日对比，末位为当前锚点日
    for (let i = 6; i >= 0; i--) {
      const d = addDays(start, -i);
      trend.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: 0, hi: i === 0, _d: d });
    }
    const wide = allRecords()
      .filter(r => r.type === 'ledger' && !r.isIncome)
      .map(r => ({ ...r, _t: new Date(r.occurredAt || r.createdAt).getTime() }));
    trend.forEach(b => {
      const bs = b._d.getTime(), be = addDays(b._d, 1).getTime();
      b.value = wide.filter(r => r._t >= bs && r._t < be).reduce((a, r) => a + (+r.amount || 0), 0);
      delete b._d;
    });
  } else if (period === 'week') {
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    const todayKey = startOfDay(new Date()).getTime();
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      trend.push({ label: names[i], value: 0, hi: d.getTime() === todayKey });
    }
    inRange.filter(r => !r.isIncome).forEach(r => {
      const idx = Math.floor((startOfDay(new Date(r._t)) - start) / 86400000);
      bump(idx, r);
    });
  } else if (period === 'month') {
    const y = anchor.getFullYear(), mo = anchor.getMonth() + 1;
    const n = weeksInMonth(y, mo);
    const curW = weekMeta(new Date());
    for (let i = 1; i <= n; i++) {
      trend.push({ label: `第${i}周`, value: 0, hi: curW.year === y && curW.month === mo && curW.week === i });
    }
    inRange.filter(r => !r.isIncome).forEach(r => {
      bump(weekBucketIndex(new Date(r._t), y, mo, n) - 1, r);
    });
  } else {
    const curM = new Date();
    const sameYear = curM.getFullYear() === anchor.getFullYear();
    for (let i = 1; i <= 12; i++) {
      trend.push({ label: `${i}`, value: 0, hi: sameYear && curM.getMonth() + 1 === i });
    }
    inRange.filter(r => !r.isIncome).forEach(r => bump(new Date(r._t).getMonth(), r));
  }

  /* —— 品类占比（只统计支出） —— */
  const catMap = new Map();
  inRange.filter(r => !r.isIncome).forEach(r => {
    const k = r.category || '其他';
    catMap.set(k, (catMap.get(k) || 0) + (+r.amount || 0));
  });
  const categories = [...catMap.entries()]
    .map(([name, value]) => ({ name, value, pct: expense ? value / expense * 100 : 0, color: catColor(name) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  /* —— 最近记录 —— */
  const recent = inRange.sort((a, b) => b._t - a._t).slice(0, 8);

  return {
    expense, income, balance: income - expense,
    count: inRange.length,
    trend, categories, recent,
    trendMax: Math.max(1, ...trend.map(t => t.value)),
  };
}

/* ============================================================
   精力统计聚合层（模块 5 · 待办·精力）
   精力单位：低=1 / 中=2 / 高=3
   统计口径：周期内全部待办（含已完成），代表「精力负荷 / 习惯」
   日视图=近7日 · 周视图=每日 · 月视图=每周 · 年视图=每月
   ============================================================ */
export const ENERGY_MAP = { low: 1, mid: 2, high: 3 };
export const energyValue = (e) => ENERGY_MAP[e] || 0;

export function energyStats(period, anchor = new Date()) {
  const { start, end } = periodRange(period, anchor);
  const s = start.getTime(), e = end.getTime();

  const inRange = allRecords()
    .filter(r => r.type === 'todo')
    .map(r => ({ ...r, _t: new Date(r.occurredAt || r.createdAt).getTime() }))
    .filter(r => r._t >= s && r._t < e);

  const total = inRange.reduce((a, r) => a + energyValue(r.energy), 0);

  const levels = { high: 0, mid: 0, low: 0 };
  inRange.forEach(r => {
    const k = ['low', 'mid', 'high'].includes(r.energy) ? r.energy : 'low';
    levels[k]++;
  });

  const trend = [];
  const bump = (idx, val) => { if (trend[idx]) trend[idx].value += val; };

  if (period === 'day') {
    for (let i = 6; i >= 0; i--) {
      const d = addDays(start, -i);
      trend.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: 0, hi: i === 0, _d: d });
    }
    const wide = allRecords()
      .filter(r => r.type === 'todo')
      .map(r => ({ ...r, _t: new Date(r.occurredAt || r.createdAt).getTime() }));
    trend.forEach(b => {
      const bs = b._d.getTime(), be = addDays(b._d, 1).getTime();
      b.value = wide.filter(r => r._t >= bs && r._t < be).reduce((a, r) => a + energyValue(r.energy), 0);
      delete b._d;
    });
  } else if (period === 'week') {
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    const todayKey = startOfDay(new Date()).getTime();
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      trend.push({ label: names[i], value: 0, hi: d.getTime() === todayKey });
    }
    inRange.forEach(r => {
      const idx = Math.floor((startOfDay(new Date(r._t)) - start) / 86400000);
      bump(idx, energyValue(r.energy));
    });
  } else if (period === 'month') {
    const y = anchor.getFullYear(), mo = anchor.getMonth() + 1;
    const n = weeksInMonth(y, mo);
    const curW = weekMeta(new Date());
    for (let i = 1; i <= n; i++) {
      trend.push({ label: `第${i}周`, value: 0, hi: curW.year === y && curW.month === mo && curW.week === i });
    }
    inRange.forEach(r => bump(weekBucketIndex(new Date(r._t), y, mo, n) - 1, energyValue(r.energy)));
  } else {
    const curM = new Date();
    const sameYear = curM.getFullYear() === anchor.getFullYear();
    for (let i = 1; i <= 12; i++) {
      trend.push({ label: `${i}`, value: 0, hi: sameYear && curM.getMonth() + 1 === i });
    }
    inRange.forEach(r => bump(new Date(r._t).getMonth(), energyValue(r.energy)));
  }

  return {
    total, count: inRange.length, levels,
    trend, trendMax: Math.max(1, ...trend.map(t => t.value)),
  };
}

/* ============================================================
   餐食热量聚合层（派生自记账 · 不新增任何数据）
   口径：type=ledger 且 非收入 且 品类=餐饮 的记录
   删掉记账里的那笔，餐食这边同时消失，永远对得上
   ============================================================ */
const WD_NAME = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 日期短标签：今天 / 昨天 / 8月10日 */
export function dayLabelOf(d) {
  const t = startOfDay(new Date()).getTime();
  const a = startOfDay(d).getTime();
  if (a === t) return '今天';
  if (a === t - 86400000) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function mealStats(period, anchor = new Date()) {
  const { start, end } = periodRange(period, anchor);
  const s = start.getTime(), e = end.getTime();
  const set = getSettings();
  const limit = set.kcalLimit || 1500;
  const base = set.kcalBase || 1500;

  const meals = allRecords()
    .filter(isMeal)
    .map(r => ({ ...r, _t: new Date(r.occurredAt || r.createdAt).getTime(), _k: recKcal(r) }))
    .filter(r => r._t >= s && r._t < e);

  const ex = allRecords()
    .filter(r => r.type === 'exercise')
    .map(r => ({ ...r, _t: new Date(r.occurredAt || r.createdAt).getTime(), _b: recBurn(r) }))
    .filter(r => r._t >= s && r._t < e);

  const total = meals.reduce((a, r) => a + r._k, 0);
  const burnTotal = ex.reduce((a, r) => a + r._b, 0);
  const spent = meals.reduce((a, r) => a + (+r.amount || 0), 0);

  /* —— 按天分组（明细展开用，倒序：最近的在上） —— */
  const dayMap = new Map();
  const dayOf = (t) => { const d = startOfDay(new Date(t)); const k = d.getTime(); if (!dayMap.has(k)) dayMap.set(k, { key: k, date: d, kcal: 0, burn: 0, amount: 0, recs: [], exRecs: [] }); return dayMap.get(k); };
  meals.forEach(r => { const g = dayOf(r._t); g.kcal += r._k; g.amount += (+r.amount || 0); g.recs.push(r); });
  ex.forEach(r => { const g = dayOf(r._t); g.burn += r._b; g.exRecs.push(r); });

  const days = [...dayMap.values()]
    .sort((a, b) => b.key - a.key)
    .map(g => ({
      ...g,
      recs: g.recs.sort((a, b) => a._t - b._t),
      exRecs: g.exRecs.sort((a, b) => a._t - b._t),
      label: dayLabelOf(g.date),
      weekday: WD_NAME[g.date.getDay()],
      over: g.kcal > limit,
      pct: Math.min(100, limit ? g.kcal / limit * 100 : 0),
      diff: g.kcal - limit,
      net: base - g.kcal + g.burn,
      deficit: base - g.kcal + g.burn >= 0,
    }));

  const overDays = days.filter(d => d.over).length;
  const avg = days.length ? Math.round(total / days.length) : 0;

  /* —— 趋势柱（与记账/精力同款结构，额外带净平衡 net） —— */
  const trend = [];
  const bump = (idx, val) => { if (trend[idx]) trend[idx].value += val; };
  const bumpBurn = (idx, val) => { if (trend[idx]) trend[idx].burn += val; };

  if (period === 'day') {
    for (let i = 6; i >= 0; i--) {
      const d = addDays(start, -i);
      trend.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: 0, burn: 0, hi: i === 0, _d: d });
    }
    const wide = allRecords()
      .filter(isMeal)
      .map(r => ({ _t: new Date(r.occurredAt || r.createdAt).getTime(), _k: recKcal(r) }));
    const wideEx = allRecords()
      .filter(r => r.type === 'exercise')
      .map(r => ({ _t: new Date(r.occurredAt || r.createdAt).getTime(), _b: recBurn(r) }));
    trend.forEach(b => {
      const bs = b._d.getTime(), be = addDays(b._d, 1).getTime();
      b.value = wide.filter(r => r._t >= bs && r._t < be).reduce((a, r) => a + r._k, 0);
      b.burn = wideEx.filter(r => r._t >= bs && r._t < be).reduce((a, r) => a + r._b, 0);
      b.over = b.value > limit;
      delete b._d;
    });
  } else if (period === 'week') {
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    const todayKey = startOfDay(new Date()).getTime();
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      trend.push({ label: names[i], value: 0, burn: 0, hi: d.getTime() === todayKey });
    }
    meals.forEach(r => bump(Math.floor((startOfDay(new Date(r._t)) - start) / 86400000), r._k));
    ex.forEach(r => bumpBurn(Math.floor((startOfDay(new Date(r._t)) - start) / 86400000), r._b));
    trend.forEach(b => { b.over = b.value > limit; });
  } else if (period === 'month') {
    // 月视图看「每周日均」比看总量更有意义
    const y = anchor.getFullYear(), mo = anchor.getMonth() + 1;
    const n = weeksInMonth(y, mo);
    const curW = weekMeta(new Date());
    const daysInBucket = new Array(n).fill(0).map(() => new Set());
    for (let i = 1; i <= n; i++) {
      trend.push({ label: `第${i}周`, value: 0, burn: 0, hi: curW.year === y && curW.month === mo && curW.week === i });
    }
    meals.forEach(r => {
      const idx = weekBucketIndex(new Date(r._t), y, mo, n) - 1;
      bump(idx, r._k);
      daysInBucket[idx]?.add(startOfDay(new Date(r._t)).getTime());
    });
    ex.forEach(r => bumpBurn(weekBucketIndex(new Date(r._t), y, mo, n) - 1, r._b));
    trend.forEach((b, i) => {
      const dn = daysInBucket[i]?.size || 0;
      b.value = dn ? Math.round(b.value / dn) : 0;   // 换成日均
      b.burn = dn ? Math.round(b.burn / dn) : 0;
      b.over = b.value > limit;
    });
  } else {
    const curM = new Date();
    const sameYear = curM.getFullYear() === anchor.getFullYear();
    const daysInMonth = new Array(12).fill(0).map(() => new Set());
    for (let i = 1; i <= 12; i++) {
      trend.push({ label: `${i}`, value: 0, burn: 0, hi: sameYear && curM.getMonth() + 1 === i });
    }
    meals.forEach(r => {
      const d = new Date(r._t);
      bump(d.getMonth(), r._k);
      daysInMonth[d.getMonth()].add(startOfDay(d).getTime());
    });
    ex.forEach(r => bumpBurn(new Date(r._t).getMonth(), r._b));
    trend.forEach((b, i) => {
      const dn = daysInMonth[i].size;
      b.value = dn ? Math.round(b.value / dn) : 0;   // 换成日均
      b.burn = dn ? Math.round(b.burn / dn) : 0;
      b.over = b.value > limit;
    });
  }

  trend.forEach(b => { b.net = base - b.value + b.burn; b.deficit = b.net >= 0; });

  return {
    total, burnTotal, spent, avg, limit, base, overDays,
    count: meals.length, exCount: ex.length,
    dayCount: days.length,
    days, trend,
    trendMax: Math.max(limit, ...trend.map(t => t.value)),
    trendMaxNet: Math.max(1, ...trend.map(t => Math.abs(t.net))),
  };
}

/* ============================================================
   体重聚合层（模块 · 体重）
   口径：type=weight 的记录，按时间升序成序列
   概览：最新 / 较上次 / 平均 / 最低 / 最高 / 次数
   逐条 delta：相对上一条的变化（用于「变化」视图，增粉减绿）
   ============================================================ */
export function weightStats() {
  const recs = allRecords()
    .filter(r => r.type === 'weight')
    .map(r => ({ ...r, _t: new Date(r.occurredAt || r.createdAt).getTime(), w: Number(r.weight) }))
    .sort((a, b) => a._t - b._t);

  if (!recs.length) {
    return { series: [], latest: null, prev: null, delta: null, count: 0, avg: null, min: null, max: null };
  }

  const series = recs.map((r, i) => ({
    t: r._t, date: new Date(r._t), weight: r.w, note: r.note || '', id: r.id,
    // 较上一条变化（首条为起始，无 delta）
    delta: i > 0 ? Math.round((r.w - recs[i - 1].w) * 10) / 10 : null,
  }));

  const latest = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const vals = series.map(s => s.weight);
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10;

  return {
    series,
    latest, prev,
    delta: prev ? Math.round((latest.weight - prev.weight) * 10) / 10 : null,
    count: series.length, avg,
    min: Math.min(...vals), max: Math.max(...vals),
  };
}
