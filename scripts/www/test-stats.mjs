/* 统计聚合层验证：周归属规则、月柱总和、品类占比 */
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = v; },
};

const { ledgerStats, periodLabel, periodRange, shiftAnchor } = await import('./js/utils/stats.js');

// 造 2026 年 8 月整月数据：每天一笔 10 元餐饮，另加几笔别的
const recs = [];
for (let d = 1; d <= 31; d++) {
  recs.push({
    id: 'a' + d, type: 'ledger', amount: 10, category: '餐饮', isIncome: false,
    occurredAt: new Date(2026, 7, d, 12, 0).toISOString(),
  });
}
recs.push({ id: 'x1', type: 'ledger', amount: 300, category: '购物', isIncome: false, occurredAt: new Date(2026, 7, 15, 16, 0).toISOString() });
recs.push({ id: 'x2', type: 'ledger', amount: 12000, category: '工资', isIncome: true, occurredAt: new Date(2026, 7, 10, 9, 0).toISOString() });
localStorage.setItem('pm.records.v1', JSON.stringify(recs));

const aug = new Date(2026, 7, 15);

console.log('=== 月视图 2026-08 ===');
const m = ledgerStats('month', aug);
console.log('标题：', periodLabel('month', aug));
console.log('支出：', m.expense, ' 收入：', m.income, ' 结余：', m.balance);
console.log('周柱：', m.trend.map(t => `${t.label}=${t.value}`).join('  '));
const barSum = m.trend.reduce((a, t) => a + t.value, 0);
console.log(`周柱总和 ${barSum} vs 月支出 ${m.expense} →`, barSum === m.expense ? '✅ 不重不漏' : '❌ 对不上');
console.log('品类：', m.categories.map(c => `${c.name} ${c.value}(${c.pct.toFixed(0)}%)`).join('  '));

console.log('\n=== 周视图（含跨月边界 8/31 周一那周）===');
const w = new Date(2026, 7, 31);
console.log('标题：', periodLabel('week', w), '（8/31 是周一，应归 8 月第 5 周）');
const ws = ledgerStats('week', w);
console.log('该周支出：', ws.expense, '（8/31 一笔 10 元 + 9 月无数据）');
console.log('日柱：', ws.trend.map(t => `${t.label}=${t.value}`).join(' '));

console.log('\n=== 年视图 2026 ===');
const y = ledgerStats('year', aug);
console.log('标题：', periodLabel('year', aug), '支出：', y.expense, '收入：', y.income);
console.log('月柱：', y.trend.map(t => `${t.label}月=${t.value}`).filter(s => !s.endsWith('=0')).join('  '));

console.log('\n=== 日视图 2026-08-15 ===');
const d = ledgerStats('day', aug);
console.log('标题：', periodLabel('day', aug), '支出：', d.expense, '（10 餐饮 + 300 购物 = 310）');
console.log('近7日柱：', d.trend.map(t => `${t.label}=${t.value}`).join(' '));

console.log('\n=== 周期平移 ===');
console.log('月 -1 →', periodLabel('month', shiftAnchor('month', aug, -1)));
console.log('周 -1 →', periodLabel('week', shiftAnchor('week', aug, -1)));
console.log('年 +1 →', periodLabel('year', shiftAnchor('year', aug, 1)));
const r = periodRange('month', aug);
console.log('月区间：', r.start.toLocaleDateString('zh-CN'), '→', r.end.toLocaleDateString('zh-CN'));
