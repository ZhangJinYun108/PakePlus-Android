/* ============================================================
   全局时间维度规则（用户已确认，跨模块生效）
   - 一周起始 = 周一
   - 「第几周」= 该自然月内的第 1–5 周
   - 跨月的那一周，按【该周周一所在月份】归属，保证每周只属一个月
   ============================================================ */

/** 取某日期所在周的周一（本地时区，零点） */
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7;          // 周一=0 … 周日=6
  d.setDate(d.getDate() - dow);
  return d;
}

/**
 * 归属规则：该周周一所在的月份即为归属月
 * @returns {{year:number, month:number, week:number, monday:Date}}
 */
export function weekMeta(date = new Date()) {
  const mon = mondayOf(date);
  const year = mon.getFullYear();
  const month = mon.getMonth() + 1;

  // 该月第一个周一
  const firstOfMonth = new Date(year, mon.getMonth(), 1);
  let firstMon = mondayOf(firstOfMonth);
  if (firstMon.getMonth() !== mon.getMonth()) {
    firstMon = new Date(firstMon.getFullYear(), firstMon.getMonth(), firstMon.getDate() + 7);
  }
  const week = Math.round((mon - firstMon) / 604800000) + 1;
  return { year, month, week, monday: mon };
}

/** 该月共有几个「周一」→ 即几周 */
export function weeksInMonth(year, month) {
  const first = new Date(year, month - 1, 1);
  let firstMon = mondayOf(first);
  if (firstMon.getMonth() !== month - 1) {
    firstMon = new Date(firstMon.getFullYear(), firstMon.getMonth(), firstMon.getDate() + 7);
  }
  let n = 0;
  const cur = new Date(firstMon);
  while (cur.getMonth() === month - 1) { n++; cur.setDate(cur.getDate() + 7); }
  return n;
}

/** 结构化周对象 → 「2027年7月 第2-3周」 */
export function formatWeekRange(w) {
  if (!w) return '';
  const { year, month, weekStart, weekEnd } = w;
  const wk = (weekEnd && weekEnd !== weekStart) ? `第${weekStart}-${weekEnd}周` : `第${weekStart}周`;
  return `${year}年${month}月 ${wk}`;
}

/** 当前所处周 → 结构化对象 */
export function currentWeekRange() {
  const m = weekMeta(new Date());
  return { year: m.year, month: m.month, weekStart: m.week, weekEnd: m.week };
}

/** 日期 key，用于按日归档 */
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** 周 key，遵循归属规则 */
export function weekKey(d = new Date()) {
  const m = weekMeta(d);
  return `${m.year}-${String(m.month).padStart(2, '0')}-W${m.week}`;
}

/** 友好日期：8月7日 周五 */
export function friendlyDate(d = new Date()) {
  const w = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${w}`;
}

/** 友好时间：今天 12:00 / 明天 09:30 */
export function friendlyDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
     new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  const label = diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天'
    : `${d.getMonth() + 1}月${d.getDate()}日`;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${label} ${hh}:${mm}`;
}
