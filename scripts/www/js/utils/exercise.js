/* ============================================================
   运动消耗估算（派生自记账同类思路，独立记录类型 exercise）
   公式：千卡 = MET × 体重(kg) × 时长(分) / 60
   说明：MET 为常见活动强度系数（参考 Compendium of Physical Activities），
   估算值仅供粗略参考，用户可在结果页手改 burn。
   ============================================================ */

/* —— 活动 MET 库（长名在前，匹配优先级更高） —— */
const EXERCISE_DB = {
  '跑步机': 7.0, '快跑': 9.8, '慢跑': 7.0, '跑步': 7.0,
  '快走': 4.3, '健走': 4.3, '走路': 3.5, '散步': 3.0,
  '力量训练': 5.0, '举铁': 5.0, '撸铁': 5.0, '抗阻': 5.0, '健身': 5.0, '训练': 5.0,
  '自由泳': 8.0, '蛙泳': 6.0, '游泳': 6.0,
  '动感单车': 7.0, '骑行': 6.5, '骑车': 6.5, '单车': 6.5,
  '普拉提': 3.0, '瑜伽': 2.5,
  '跳绳': 11.0,
  '爬楼梯': 8.0, '爬楼': 8.0,
  '爬山': 6.0, '登山': 6.0,
  '椭圆机': 5.0, '划船机': 7.0, '拉伸': 2.0,
};

/* —— 运动关键词（用于判定一句话是不是在说运动） —— */
const KW_EXERCISE = /(跑步机|跑步|慢跑|快跑|快走|健走|走路|散步|力量训练|举铁|撸铁|抗阻|健身|训练|自由泳|蛙泳|游泳|动感单车|骑行|骑车|单车|普拉提|瑜伽|跳绳|爬楼梯|爬楼|爬山|登山|椭圆机|划船机|拉伸|运动|锻炼)/;

const CN_NUM = '(?:零|一|两|二|三|四|五|六|七|八|九|十|半|\\d+\\.?\\d*)';

/** 中文/数字 → 数值（支持 半 / 0-99 / 小数） */
function cnToNum(str) {
  if (str == null) return 0;
  str = String(str).trim();
  if (str === '') return 0;
  if (/半/.test(str)) return 0.5;
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  const d = { 零: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (str === '十') return 10;
  if (str.includes('十')) {
    const [a, b] = str.split('十');
    const tens = a ? (d[a] || 1) : 1;
    const ones = b ? (d[b] || 0) : 0;
    return tens * 10 + ones;
  }
  return d[str] ?? 0;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYS = Object.keys(EXERCISE_DB).sort((a, b) => b.length - a.length);
const KEY_RE = KEYS.map(escapeRe).join('|');
// 活动名 (动词可夹 0~8 个非数字) 数量 (可选"个") 单位(小时/分钟/分/min)
const PARSE_RE = new RegExp(`(${KEY_RE})([^\\d]{0,8}?)(\\d+|${CN_NUM})\\s*(?:个)?(小时|分钟|分|min|Min|MIN)`, 'g');

/** 一句话里有没有「运动 + 时长」 */
export function isExercise(text) {
  if (!KW_EXERCISE.test(text)) return false;
  return /\d+\s*(?:分钟|分|min)/i.test(text)
      || /[一二两三四五六七八九十半]\s*个?(?:小时|分钟|分)/.test(text);
}

/** 解析运动明细 → [{name, min, met, kcal}] */
export function parseExercises(text, weightKg = 60) {
  const out = [];
  if (!text) return out;
  let m;
  PARSE_RE.lastIndex = 0;
  while ((m = PARSE_RE.exec(text)) !== null) {
    const name = m[1];
    const qty = cnToNum(m[3]);
    const unit = m[4];
    const min = unit.startsWith('小时') ? qty * 60 : qty;
    if (!min || min <= 0 || min > 600) continue;
    const met = EXERCISE_DB[name] || 5;
    const kcal = Math.round(met * weightKg * min / 60);
    out.push({ name, min, met, kcal });
  }
  return out;
}

/** 总消耗 */
export function sumBurn(acts) {
  return (acts || []).reduce((s, a) => s + (a.kcal || 0), 0);
}

/** 一条运动记录的实际消耗（手填优先，否则按明细求和） */
export function recBurn(rec) {
  if (!rec) return 0;
  if (rec.burn != null) return rec.burn;
  return sumBurn(rec.activities);
}

/** 明细 → 可读摘要：跑步机40分钟 · 力量训练30分钟 */
export function activitiesSummary(acts) {
  return (acts || []).map(a => `${a.name}${a.min}分钟`).join(' · ');
}

/** 明细 → 多行文本（可编辑） */
export function activitiesToLines(acts) {
  return (acts || []).map(a => `${a.name} ${a.min}分钟`).join('\n');
}

/** 多行文本 → 明细（用于结果页编辑后回写） */
export function parseActivityLines(text, weightKg = 60) {
  if (!text) return [];
  return text.split(/\r?\n/).flatMap(line => parseExercises(line.trim(), weightKg))
    .filter(Boolean);
}

/** 是否运动记录 */
export const isExRec = (r) => r && r.type === 'exercise';
