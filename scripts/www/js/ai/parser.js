/* ============================================================
   混合解析编排器
   策略：本地规则立即出基线 → 云端 LLM 精修 → 字段级合并
   任一环节失败都不阻塞，永远有结果可用
   ============================================================ */
import { parseLocal } from './rules.js';
import { parseCloud } from './deepseek.js';
import { getSettings } from '../store.js';
import { parseExercises, sumBurn } from '../utils/exercise.js';

const TYPES = ['ledger', 'wish', 'todo', 'note', 'exercise', 'memorial', 'weight'];

/** 云端结果做安全校验，剔除幻觉字段 */
function sanitize(cloud, local) {
  if (!cloud || cloud.__error) return null;
  if (!TYPES.includes(cloud.type)) return null;

  const out = { ...cloud };

  if (out.type === 'ledger') {
    const amt = Number(out.amount);
    // 云端金额若与本地正则抽到的不一致，以本地正则为准（数字抽取正则更可靠）
    if (local.type === 'ledger' && local.amount != null) {
      if (!Number.isFinite(amt) || Math.abs(amt - local.amount) > 0.001) out.amount = local.amount;
    } else if (!Number.isFinite(amt)) {
      out.amount = null;
    }
    if (typeof out.isIncome !== 'boolean') out.isIncome = !!local.isIncome;
    out.place = out.place || null;
    out.brand = out.brand || null;
    out.photos = [];
    out.rating = null;
  }

  if (out.type === 'wish') {
    if (!['旅游', '美食', '购物'].includes(out.sub)) out.sub = local.sub || '购物';
    if (!['high', 'mid', 'low'].includes(out.priority)) out.priority = 'mid';
    const w = out.planWeek || {};
    out.planWeek = {
      year: +w.year || new Date().getFullYear(),
      month: Math.min(12, Math.max(1, +w.month || (new Date().getMonth() + 1))),
      weekStart: Math.min(5, Math.max(1, +w.weekStart || 1)),
      weekEnd: Math.min(5, Math.max(1, +w.weekEnd || +w.weekStart || 1)),
    };
    if (out.planWeek.weekEnd < out.planWeek.weekStart) out.planWeek.weekEnd = out.planWeek.weekStart;
    out.estCost = Number.isFinite(Number(out.estCost)) ? Number(out.estCost) : null;
    out.extra = (out.extra && typeof out.extra === 'object') ? out.extra : {};
  }

  if (out.type === 'todo') {
    if (!['low', 'mid', 'high'].includes(out.energy)) out.energy = local.energy || 'mid';
    if (!['high', 'mid', 'low'].includes(out.priority)) out.priority = 'mid';
    out.energyBy = 'ai';
    out.done = false;
  }

  if (out.type === 'note') {
    if (!['产品', '写作', '通用', '学习', '其他'].includes(out.sub)) out.sub = local.sub || '其他';
    if (typeof out.idea !== 'string') out.idea = local.idea || out.raw || '';
    if (typeof out.progress !== 'string') out.progress = '';
    if (typeof out.reason !== 'string') out.reason = '';
    out.extra = (out.extra && typeof out.extra === 'object') ? out.extra : {};
  }

  if (out.type === 'exercise') {
    // 云端若没给明细，用本地规则补（本地已算好 activities/burn）
    out.activities = (Array.isArray(out.activities) && out.activities.length)
      ? out.activities
      : (local.activities || []);
    if (!out.activities.length && local.raw) {
      out.activities = parseExercises(local.raw, getSettings().weightKg || 60);
    }
    out.burn = Number.isFinite(Number(out.burn)) ? Number(out.burn) : (local.burn || sumBurn(out.activities));
    out.title = out.title || local.title || out.raw || '';
  }

  if (out.type === 'memorial') {
    if (!['birthday', 'anniversary'].includes(out.subType)) out.subType = local.subType || 'birthday';
    if (!/^\d{2}-\d{2}$/.test(out.mmdd || '')) out.mmdd = local.mmdd || '01-01';
    out.year = Number.isFinite(Number(out.year)) ? Number(out.year) : (local.year ?? null);
    if (typeof out.title !== 'string' || !out.title) out.title = local.title || (out.subType === 'birthday' ? '生日' : '纪念日');
    out.note = out.note || local.note || '';
  }

  if (out.type === 'weight') {
    const w = Number(out.weight);
    out.weight = Number.isFinite(w) ? Math.round(w * 10) / 10 : (local.weight ?? null);
    if (typeof out.note !== 'string') out.note = '';
    out.photos = [];
  }

  // 时间兜底：云端给的非法时间一律用本地
  const t = Date.parse(out.occurredAt);
  if (!Number.isFinite(t)) out.occurredAt = local.occurredAt;

  if (out.type !== 'ledger' && !out.title) out.title = local.title || out.raw || '';
  out.raw = local.raw;
  out.source = 'cloud';
  return out;
}

/**
 * 解析一句话
 * @param {string} text
 * @param {(stage:string)=>void} onStage 阶段回调，用于 UI 展示
 */
export async function parse(text, onStage = () => {}) {
  const local = parseLocal(text);
  onStage('local');

  const s = getSettings();
  if (!s.aiEnabled || !s.apiKey) {
    return { ...local, source: 'local', note: s.apiKey ? '云端已关闭' : '未配置 Key' };
  }

  onStage('cloud');
  const cloud = await parseCloud(text, { apiKey: s.apiKey, model: s.apiModel });

  if (cloud?.__error) {
    return { ...local, source: 'local', note: '云端不可用，已用本地规则', error: cloud.__error };
  }

  const merged = sanitize(cloud, local);
  if (!merged) {
    return { ...local, source: 'local', note: '云端结果异常，已用本地规则' };
  }
  return merged;
}

/* —— 长句切分：只在「强分隔」处断开 ——
   说明：逗号「，」、顿号「、」不再作为切分符——中文里它们常用来连接同一件事
   （如「吃了一顿寿司，在国广花了158，还挺好吃」是同一笔消费）。只有句号/分号等
   整句结束，或「然后/还有/另外」这类明确连接词，才视为多件事。 */
const SPLIT_RE = /[。；！？\n\r]+|然后|之后|接着|还有|另外|顺便|以及|并且|而且/g;
const LEAD_CONN = /^(然后|之后|接着|还有|另外|顺便|以及|并且|而且|顺手|又|也|还)\s*/g;
const LEAD_TIME = /^(今天|明天|后天|大后天|昨天|前天|今晚|今早|早上|早晨|上午|中午|下午|傍晚|晚上|夜里)\s*/g;

/**
 * 一句话里可能包含多件事（"跑步机40分，力量30分，中午吃了牛肉面"）。
 * 离线、零依赖地把它拆成多条本地记录；相邻的运动项会合并成一条（多项活动）。
 * 返回记录数组（可能为空、可能只有 1 条）。
 */
export function parseAll(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const segs = raw.split(SPLIT_RE)
    .map(s => s.replace(/^[，。；、\s]+|[，。；、\s]+$/g, '').trim())
    .filter(Boolean);

  const recs = [];
  for (let seg of segs) {
    let s = seg.replace(LEAD_CONN, '').replace(LEAD_TIME, '').trim();
    if (s.length < 2) continue;                 // 纯连接词 / 过短，丢弃
    const r = parseLocal(s);
    if (r) recs.push(r);
  }

  // 合并相邻的「运动」记录（同一段运动里的多项活动合到一条）
  const merged = [];
  for (const r of recs) {
    const prev = merged[merged.length - 1];
    if (r.type === 'exercise' && prev && prev.type === 'exercise') {
      prev.activities = [...(prev.activities || []), ...(r.activities || [])];
      prev.burn = (prev.burn || 0) + (r.burn || 0);
      prev.title = [prev.title, r.title].filter(Boolean).join(' · ');
      prev.raw = [prev.raw, r.raw].filter(Boolean).join('，');
    } else {
      merged.push(r);
    }
  }
  return merged;
}
