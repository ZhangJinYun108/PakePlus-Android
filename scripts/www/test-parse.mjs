import { parseLocal } from './js/ai/rules.js';
import { formatWeekRange, weekMeta, weeksInMonth, friendlyDateTime } from './js/utils/time.js';

const cases = [
  '今天中午在国广吃了安寿司花了88.5',
  '早上打车去公司花了23块',
  '想去日本玩一周',
  '以后想买一台徕卡相机',
  '明天下午3点要交设计稿',
  '记得给妈妈打电话',
  '收到工资 12000',
  '周三15:00预约体检',
];

for (const c of cases) {
  const r = parseLocal(c);
  let brief;
  if (r.type === 'ledger') {
    brief = '¥' + r.amount + ' ' + r.category + ' 地点=' + r.place + ' 品牌=' + r.brand + ' 收入=' + r.isIncome;
  } else if (r.type === 'wish') {
    brief = r.sub + ' 「' + r.title + '」 ' + formatWeekRange(r.planWeek) + ' 预算=' + r.estCost;
  } else {
    brief = '「' + r.title + '」 精力=' + r.energy + ' 时间=' + friendlyDateTime(r.occurredAt);
  }
  console.log('[' + r.type.padEnd(6) + '] ' + c);
  console.log('           -> ' + brief);
}

console.log('\n--- 周规则自检 ---');
const m = weekMeta(new Date());
console.log('今天归属：' + formatWeekRange({ year: m.year, month: m.month, weekStart: m.week, weekEnd: m.week }));

const d = new Date(2026, 7, 31);
const mm = weekMeta(d);
console.log('2026-08-31(周' + '日一二三四五六'[d.getDay()] + ') 归属：' +
  formatWeekRange({ year: mm.year, month: mm.month, weekStart: mm.week, weekEnd: mm.week }));

const d2 = new Date(2026, 8, 2);
const mm2 = weekMeta(d2);
console.log('2026-09-02(周' + '日一二三四五六'[d2.getDay()] + ') 归属：' +
  formatWeekRange({ year: mm2.year, month: mm2.month, weekStart: mm2.week, weekEnd: mm2.week }));

console.log('2026年8月周数：' + weeksInMonth(2026, 8) + '  2027年7月周数：' + weeksInMonth(2027, 7));
