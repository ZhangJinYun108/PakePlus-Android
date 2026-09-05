/* ============================================================
   纪念日 / 生日 工具
   - 从自然语言里识别「谁 + 什么日子 + 几月几号」
   - 归集到「纪念日」页，按"还剩几天"排序
   - 提醒：① 系统日历(.ics 年度重复 + 提前7天/1天 VALARM) ② App 内打开提示
   ============================================================ */
import { allRecords } from '../store.js';
import { downloadMemorialICS } from './ics.js';

const pad = (n) => String(n).padStart(2, '0');
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/* —— 日期抽取：支持「5月20日 / 5.20 / 05-20 / 2027年5月20日」 —— */
const RE_FULL = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/;
const RE_MD   = /(\d{1,2})\s*[月.\/\-]\s*(\d{1,2})\s*[日号]?/;

function parseMemorialDate(text) {
  let m = text.match(RE_FULL);
  if (m) return { mmdd: `${pad(m[2])}-${pad(m[3])}`, year: +m[1], raw: m[0] };
  m = text.match(RE_MD);
  if (m) return { mmdd: `${pad(m[1])}-${pad(m[2])}`, year: null, raw: m[0] };
  return null;
}

/* —— 清洗称呼：去掉代词 / 关系词 / 尾巴 —— */
function cleanName(s) {
  return String(s || '')
    .replace(/^(我|我们|我家|我的|老公|老婆|男朋友|女朋友|和|跟|与)\s*/, '')
    .replace(/\s*(结婚|恋爱|在一起|交往|认识|纪念|的|是|日)\s*$/, '')
    .trim();
}

/* —— 主识别：返回 {subType,title,mmdd,year} 或 null —— */
export function detectMemorial(text) {
  const isBirthday = /(生日|诞辰)/.test(text);
  const isAnniv = /(纪念日|周年|忌日|结婚|恋爱|在一起|认识|交往)/.test(text);
  if (!isBirthday && !isAnniv) return null;

  const date = parseMemorialDate(text);
  if (!date) return null;            // 没给日期，不算有效纪念日

  const t2 = text.replace(date.raw, ' ');   // 去掉日期部分再取称呼

  let subType, title;
  if (isBirthday) {
    subType = 'birthday';
    const kw = t2.search(/生日|诞辰/);
    const name = cleanName(kw >= 0 ? t2.slice(0, kw) : '');
    title = name || '生日';
  } else {
    subType = 'anniversary';
    const map = [
      [/纪念日/, '纪念日'],
      [/忌日/, '忌日'],
      [/结婚/, '结婚纪念日'],
      [/恋爱|在一起|交往/, '恋爱纪念日'],
      [/(\d+)\s*周年/, null],        // 用实际匹配文本当后缀
      [/认识/, '认识纪念日'],
    ];
    let pos = 1e9, suffix = '';
    for (const [re, suf] of map) {
      const mm = t2.match(re);
      if (mm && mm.index < pos) { pos = mm.index; suffix = suf || mm[0]; }
    }
    const name = cleanName(pos < 1e9 ? t2.slice(0, pos) : '');
    title = (name ? name : '') + suffix;
    if (!title) title = '纪念日';
  }

  return { subType, title, mmdd: date.mmdd, year: date.year };
}

/* —— 下次发生（年度，本地零点） —— */
export function nextOccurrence(mmdd, from = new Date()) {
  const [m, d] = mmdd.split('-').map(Number);
  const now = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let cand = new Date(now.getFullYear(), m - 1, d);
  if (cand < now) cand = new Date(now.getFullYear() + 1, m - 1, d);
  return cand;
}

/* —— 还剩几天（今天=0，明天=1） —— */
export function daysUntil(mmdd, from = new Date()) {
  const next = nextOccurrence(mmdd, from);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((next - today) / 86400000);
}

export function weekdayOf(mmdd, from = new Date()) {
  return WEEK[nextOccurrence(mmdd, from).getDay()];
}

export function ageOf(year, from = new Date()) {
  return year ? (from.getFullYear() - year) : null;
}

/* —— 全部纪念日，按剩余天数升序 —— */
export function allMemorials() {
  return allRecords()
    .filter(r => r.type === 'memorial' && r.mmdd)
    .map(r => ({ rec: r, days: daysUntil(r.mmdd) }))
    .sort((a, b) => a.days - b.days);
}

/* —— 临近提醒（≤ N 天） —— */
export function upcomingMemorials(withinDays = 7) {
  return allMemorials().filter(x => x.days <= withinDays);
}

/* —— App 内打开时的弹窗提醒：正好提前一周 / 提前一天 / 当天 —— */
export function memorialReminders() {
  return allMemorials().filter(x => x.days === 0 || x.days === 1 || x.days === 7);
}

const SUB_LABEL = { birthday: '生日', anniversary: '纪念日' };
export const subLabel = (s) => SUB_LABEL[s] || '纪念日';

/**
 * 一行文案：🎂 小明生日 还有6天（提前一周提醒）
 */
export function reminderText() {
  const list = memorialReminders();
  if (!list.length) return null;
  return list.map(({ rec, days }) => {
    const who = rec.title || (rec.subType === 'birthday' ? '生日' : '纪念日');
    const tag = days === 0 ? '就是今天' : days === 1 ? '明天就到' : '提前一周';
    return `${rec.subType === 'birthday' ? '🎂' : '💍'} ${who} ${days === 0 ? '' : '还有' + days + '天'}（${tag}）`;
  }).join(' · ');
}

/** 单条 / 全部 加到系统日历（年度重复 + 双提醒） */
export function addToCalendar(rec) {
  downloadMemorialICS(Array.isArray(rec) ? rec : [rec]);
}
