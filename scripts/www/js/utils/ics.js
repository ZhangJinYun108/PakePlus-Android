/* ============================================================
   待办 → 系统日历（.ics 标准日程文件）
   为什么是这条路：
   - 网页/WebView 无权静默写入系统闹钟或日历，这是系统安全设计
   - 但生成 .ics 让系统日历接管是标准能力，导入后
     日历的提醒会出现在锁屏上，等效于「到点提醒」
   - 事件里带 VALARM，所以是「日历 + 闹钟」二合一
   ============================================================ */

/** Date → 20260811T060000Z（UTC，规避时区歧义） */
const utc = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** ICS 文本转义 */
const esc = (s) => String(s || '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/** 提醒提前量选项（分钟） */
export const ALARM_OPTIONS = [
  { label: '准点提醒', min: 0 },
  { label: '提前 5 分钟', min: 5 },
  { label: '提前 15 分钟', min: 15 },
  { label: '提前 30 分钟', min: 30 },
  { label: '提前 1 小时', min: 60 },
  { label: '提前 1 天', min: 1440 },
];

const ENERGY_TXT = { low: '低', mid: '中', high: '高' };
const PRIO_TXT = { low: '低', mid: '中', high: '高' };

/** 单条待办 → VEVENT */
function toEvent(rec, alarmMin, durMin) {
  const start = new Date(rec.occurredAt || rec.createdAt || Date.now());
  const end = new Date(start.getTime() + durMin * 60000);
  const title = rec.title || rec.raw || '待办';
  const desc = [
    '来自「记点」',
    rec.energy ? `精力 ${ENERGY_TXT[rec.energy] || ''}` : '',
    rec.priority ? `优先级 ${PRIO_TXT[rec.priority] || ''}` : '',
  ].filter(Boolean).join(' · ');

  const alarm = [
    'BEGIN:VALARM',
    `TRIGGER:${alarmMin > 0 ? `-PT${alarmMin}M` : 'PT0M'}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)}`,
    'END:VALARM',
  ];

  return [
    'BEGIN:VEVENT',
    `UID:${esc(rec.id || 'r' + start.getTime())}@jidian`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(desc)}`,
    `PRIORITY:${rec.priority === 'high' ? 1 : rec.priority === 'low' ? 9 : 5}`,
    ...alarm,
    'END:VEVENT',
  ].join('\r\n');
}

/** 生成 .ics 全文 */
export function buildICS(recs, { alarmMin = 15, durMin = 30 } = {}) {
  const list = Array.isArray(recs) ? recs : [recs];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//jidian//JiDian Todo//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...list.map(r => toEvent(r, alarmMin, durMin)),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** 触发下载 / 唤起系统日历导入 */
export function downloadICS(recs, filename, opts) {
  const text = buildICS(recs, opts);
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `待办-${new Date().toISOString().slice(0, 10)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ============================================================
   纪念日 / 生日 → 系统日历（每年重复 + 提前一周 / 前一天 双提醒）
   等价于「到点提醒」：导入后锁屏会出现日历提醒
   ============================================================ */

/** 单条纪念日 → 年度 VEVENT（带两个 VALARM） */
function toMemorialEvent(rec) {
  const [m, d] = (rec.mmdd || '01-01').split('-').map(Number);
  const yr = rec.year || 2000;                       // 起始年只影响首实例；RRULE 让它每年都来
  const start = new Date(yr, m - 1, d, 9, 0, 0);
  const end   = new Date(yr, m - 1, d, 10, 0, 0);
  const age = rec.year ? `今年 ${new Date().getFullYear() - rec.year} 岁` : '';
  const title = `${esc(rec.title || '纪念日')}${rec.subType === 'birthday' ? ' 生日' : ''}`;
  const desc  = ['来自「记点」', age, rec.note || ''].filter(Boolean).join(' · ');

  const alarm = (trigger, txt) => [
    'BEGIN:VALARM',
    `TRIGGER:${trigger}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(txt)}`,
    'END:VALARM',
  ].join('\r\n');

  return [
    'BEGIN:VEVENT',
    `UID:${esc(rec.id || 'm' + Date.now())}@jidian`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    'RRULE:FREQ=YEARLY',
    `SUMMARY:${title}`,
    `DESCRIPTION:${esc(desc)}`,
    alarm('-P7D', `${title} 还有一周`),
    alarm('-P1D', `${title} 明天就到啦`),
    'END:VEVENT',
  ].join('\r\n');
}

/** 生成纪念日 .ics 全文（年度重复） */
export function buildMemorialICS(recs) {
  const list = Array.isArray(recs) ? recs : [recs];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//jidian//JiDian Memorial//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...list.map(toMemorialEvent),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** 触发下载 / 唤起系统日历导入（纪念日） */
export function downloadMemorialICS(recs, filename) {
  const text = buildMemorialICS(recs);
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `纪念日-${new Date().toISOString().slice(0, 10)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
