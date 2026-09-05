/* ============================================================
   数据层 · 全本地存储（无服务器，隐私不出设备）
   后续可平滑替换为 IndexedDB / Capacitor Preferences
   ============================================================ */
import { dayKey, weekKey, monthKey } from './utils/time.js';
import { isMeal, recKcal } from './utils/kcal.js';

const K_REC = 'pm.records.v1';
const K_SET = 'pm.settings.v1';

const DEFAULT_SETTINGS = {
  nickname: '',          // 空 = 显示中性占位「朋友」
  energyLimit: 10,       // 每日精力上限（设置页可调）
  kcalLimit: 1500,       // 每日热量上限（进食参考值，设置页可调）
  kcalBase: 1500,        // 基础代谢：净平衡公式的「基础值」（设置页可调）
  weightKg: 60,          // 体重：运动消耗估算用（设置页可调）
  kcalWarn: true,        // 接近/超出热量上限时提醒
  weekStart: 1,          // 1 = 周一起算
  aiEnabled: true,       // 云端 AI 解析开关
  aiEstimateEnergy: true,// AI 自动预估精力值
  pushEnabled: true,     // 超上限系统推送
  apiKey: '',            // DeepSeek API Key（仅存本地）
  apiModel: 'deepseek-v4-flash',  // 现役主力模型，1M 上下文，¥1/百万输入
  fontSize: 'm',         // 字体档：s / m / l
  bgTheme: 'pink',       // 背景主题：pink / mint / butter / lav
  theme: 'macaron',      // 视觉风格：macaron / handdrawn / guofeng / dopamine / mono（其余待确认后实装）
  lang: 'zh-CN',         // 语言：当前仅简体中文生效
  // —— 多端同步（GitHub Gist 中转，token 仅存本地）——
  syncEnabled: false,    // 是否开启同步
  syncToken: '',         // GitHub Personal Access Token（需 gist 权限）
  syncGistId: '',        // 同步用的私有 gist id
};

/* —— 变更钩子：保存 / 删除后通知同步层（防循环依赖，用回调而非直接 import） —— */
let _onChange = null;
export function setOnChange(fn) { _onChange = fn; }

/* —— 外观主题：字体档 —— */
export const FONT_TIERS = {
  s: { '--fs-xs':'10px','--fs-sm':'11px','--fs-base':'13px','--fs-md':'14px','--fs-lg':'16px','--fs-xl':'19px','--fs-2xl':'22px','--fs-3xl':'27px' },
  m: { '--fs-xs':'11px','--fs-sm':'12px','--fs-base':'14px','--fs-md':'15px','--fs-lg':'17px','--fs-xl':'20px','--fs-2xl':'24px','--fs-3xl':'30px' },
  l: { '--fs-xs':'12px','--fs-sm':'13px','--fs-base':'15px','--fs-md':'16px','--fs-lg':'19px','--fs-xl':'23px','--fs-2xl':'28px','--fs-3xl':'35px' },
};

/* —— 外观主题：背景渐变 —— */
export const BG_THEMES = [
  { id:'pink',   label:'蜜桃',   css:'linear-gradient(170deg,#FFF4F7 0%,#FFFAFB 32%,#F7F4FD 100%)' },
  { id:'mint',   label:'薄荷',   css:'linear-gradient(170deg,#F1FCF8 0%,#FFFAFB 32%,#E4F1FB 100%)' },
  { id:'butter', label:'奶黄',   css:'linear-gradient(170deg,#FFF6DC 0%,#FFFAFB 32%,#FFEDE3 100%)' },
  { id:'lav',    label:'薰衣草', css:'linear-gradient(170deg,#F7F4FD 0%,#FFFAFB 32%,#ECE5FA 100%)' },
];

/* —— 视觉风格（主题）：全部已实装，切到 <html data-theme> 即时生效 —— */
export const STYLE_THEMES = [
  { id:'macaron',  label:'马卡龙',    ok:true },
  { id:'handdrawn',label:'手绘卡通',  ok:true },
  { id:'guofeng',  label:'国风新中式', ok:true },
  { id:'dopamine', label:'潮玩多巴胺', ok:true },
  { id:'mono',     label:'极简黑白',  ok:true },
];

/** 把当前设置应用到 #app（字体档 + 背景 + 视觉风格），供设置页实时预览与启动时调用 */
export function applyAppTheme() {
  const s = getSettings();
  // 视觉风格：data-theme 挂到 <html>，[data-theme="..."] 在 tokens.css 里全局覆盖 :root 变量
  document.documentElement.dataset.theme = s.theme || 'macaron';
  // 字体档仍挂在 #app（仅影响 app 子树）
  const app = document.getElementById('app');
  if (app) {
    const ft = FONT_TIERS[s.fontSize] || FONT_TIERS.m;
    for (const [k, v] of Object.entries(ft)) app.style.setProperty(k, v);
  }
}

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { console.warn('存储失败', e); return false; }
}

/* —— 设置 —— */
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...read(K_SET, {}) });
export function setSetting(patch) {
  const next = { ...getSettings(), ...patch };
  write(K_SET, next);
  return next;
}

/* —— 记录 —— */
export const allRecords = () => read(K_REC, []);

/** 今日是否已称体重（首页 banner 用） */
export function todayWeight() {
  const today = dayKey();
  return allRecords().find(r => r.type === 'weight' && dayKey(new Date(r.occurredAt || r.createdAt)) === today) || null;
}

/** 记体重：同日记两次 = 更新不新增（按 dayKey 去重） */
export function saveWeight(weight, iso, note) {
  const dk = dayKey(new Date(iso || Date.now()));
  const list = allRecords();
  const existing = list.find(r => r.type === 'weight' && dayKey(new Date(r.occurredAt || r.createdAt)) === dk);
  if (existing) {
    existing.weight = weight;
    if (note != null) existing.note = note;
    if (iso) existing.occurredAt = iso;
    existing.updatedAt = new Date().toISOString();
    write(K_REC, list);   // 复用同一份 list，保证上面的改动被写回
    _onChange?.('save', existing);
    return existing;
  }
  return saveRecord({ type: 'weight', weight, occurredAt: iso || new Date().toISOString(), note: note || '', photos: [] });
}

export function saveRecord(rec) {
  const list = allRecords();
  if (!rec.id) {
    rec.id = 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    rec.createdAt = rec.createdAt || new Date().toISOString();
    list.unshift(rec);
  } else {
    const i = list.findIndex(r => r.id === rec.id);
    if (i >= 0) list[i] = rec; else list.unshift(rec);
  }
  rec.updatedAt = new Date().toISOString();
  write(K_REC, list);
  _onChange?.('save', rec);
  return rec;
}

/* —— 删除墓碑：记录被删的 id，便于跨设备同步（否则会从另一台设备复活） —— */
const K_DEL = 'pm.deleted.v1';
export const getDeletedIds = () => read(K_DEL, []);
function setDeletedIds(ids) { write(K_DEL, ids); }

export function deleteRecord(id) {
  write(K_REC, allRecords().filter(r => r.id !== id));
  const del = getDeletedIds();
  if (!del.includes(id)) { del.push(id); setDeletedIds(del); }
  _onChange?.('delete', id);
}

/* ============================================================
   多端同步原语：merge 与 payload（网络在 sync.js，存储只在此处）
   合并策略：按记录 id 取 updatedAt 较新者（last-write-wins）；
            删除以墓碑集合为准，两端墓碑取并集。
   ============================================================ */
export function getSyncPayload() {
  return {
    version: 2,
    syncedAt: new Date().toISOString(),
    records: allRecords(),
    deleted: getDeletedIds(),
  };
}

export function applySyncPayload(remote) {
  if (!remote || !Array.isArray(remote.records)) return { merged: 0, deleted: 0 };
  const localDel  = new Set(getDeletedIds());
  const remoteDel = new Set(remote.deleted || []);
  const skip = new Set([...localDel, ...remoteDel]); // 任一侧删过的，都不进合并结果

  const map = new Map();
  for (const r of allRecords()) {
    if (skip.has(r.id)) continue;
    map.set(r.id, r);
  }
  for (const r of remote.records) {
    if (skip.has(r.id)) continue;
    const cur = map.get(r.id);
    if (!cur || new Date(r.updatedAt || 0) >= new Date(cur.updatedAt || 0)) map.set(r.id, r);
  }
  const result = [...map.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  write(K_REC, result);
  const allDel = [...new Set([...localDel, ...remoteDel])];
  setDeletedIds(allDel);
  return { merged: result.length, deleted: allDel.length };
}

export const byType = (type) => allRecords().filter(r => r.type === type);

/* —— 归档索引：日 / 周 / 月 / 年 —— */
export function bucketOf(rec) {
  const d = new Date(rec.occurredAt || rec.createdAt);
  return { day: dayKey(d), week: weekKey(d), month: monthKey(d), year: String(d.getFullYear()) };
}

/* —— 首页今日概览需要的数据 —— */
export function todayDigest() {
  const today = dayKey();
  const recs = allRecords();

  const todos = recs
    .filter(r => r.type === 'todo')
    .filter(r => dayKey(new Date(r.occurredAt || r.createdAt)) === today)
    .slice(0, 4);

  const ledgers = recs
    .filter(r => r.type === 'ledger')
    .filter(r => dayKey(new Date(r.occurredAt || r.createdAt)) === today);

  const expense = ledgers.filter(r => !r.isIncome).reduce((s, r) => s + (+r.amount || 0), 0);
  const income  = ledgers.filter(r =>  r.isIncome).reduce((s, r) => s + (+r.amount || 0), 0);
  const topExp  = ledgers.filter(r => !r.isIncome).sort((a, b) => (+b.amount) - (+a.amount))[0] || null;

  // 精力口径：今日全部待办（含已完成）= 当天的精力负荷，用于超上限提醒
  const energyUsed = todos
    .reduce((s, t) => s + ({ low: 1, mid: 2, high: 3 }[t.energy] || 0), 0);

  // 热量口径：今日餐饮支出条目的热量之和（餐食视图与记账同一份数据）
  const meals = ledgers.filter(isMeal);
  const kcalUsed = meals.reduce((s, r) => s + recKcal(r), 0);

  // 运动消耗：今日 exercise 类型记录的消耗之和
  const exercises = recs
    .filter(r => r.type === 'exercise')
    .filter(r => dayKey(new Date(r.occurredAt || r.createdAt)) === today);
  const burnUsed = exercises.reduce((s, r) => s + (+r.burn || 0), 0);

  return {
    todos, expense, income, topExp, energyUsed,
    kcalUsed, mealCount: meals.length,
    burnUsed, exerciseCount: exercises.length,
  };
}

/* —— 导出 / 导入备份 —— */
export function exportJSON() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    records: allRecords(),
  }, null, 2);
}

/** 导入备份文件（JSON 文本）：按 updatedAt last-write-wins 与本地合并，不删除本地独有记录
 *  返回 { added, updated, total }；格式不对抛错 */
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.records)) throw new Error('不是有效的备份文件');
  const map = new Map(allRecords().map(r => [r.id, r]));
  let added = 0, updated = 0;
  for (const r of data.records) {
    if (!r || !r.id) continue;
    const cur = map.get(r.id);
    if (!cur) { map.set(r.id, r); added++; }
    else if (new Date(r.updatedAt || 0) >= new Date(cur.updatedAt || 0)) { map.set(r.id, r); updated++; }
  }
  const result = [...map.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  write(K_REC, result);
  return { added, updated, total: result.length };
}
