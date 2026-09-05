/* ============================================================
   云端语义解析 · DeepSeek
   Key 仅存本机 localStorage，不上传任何第三方
   浏览器直连若被 CORS 拦截，会自动降级到本地规则引擎
   ============================================================ */
import { currentWeekRange } from '../utils/time.js';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';

function buildPrompt(text) {
  const w = currentWeekRange();
  const now = new Date();
  return `你是一个个人管理 App 的语义解析引擎。把用户的一句自然语言解析成结构化 JSON。

当前时间：${now.toLocaleString('zh-CN')}（${w.year}年${w.month}月 第${w.weekStart}周）

一级分类 type 五选一：
- "ledger" 记账：已经发生的花钱/收钱
- "wish"   愿望单：想做但还没做的事（想去、想买、以后要…）
- "todo"   待办：需要执行的具体事项
- "note"   记事本：长期专项跟进的想法/项目（做 APP、写小说、学一门技能…），带想法/进度/原因等字段
- "exercise" 运动消耗：说了做了什么运动、多久（分钟/小时），用来估算消耗热量。没花钱、只是运动记录

各类型字段规范：

【ledger】
{ "type":"ledger", "amount": 数字(必填), "category": "餐饮|交通|购物|居家|娱乐|医疗|学习|人情|其他"(必填),
  "occurredAt": ISO8601 时间字符串, "place": 地点或 null, "brand": 品牌/店名或 null,
  "isIncome": true/false }
注意：place 是场所/商圈（如"国广"），brand 是店铺或品牌名（如"安寿司"）。识别不到就给 null，不要编造。

【wish】
{ "type":"wish", "title": 简短标题, "sub": "旅游|美食|购物",
  "priority": "high|mid|low", "estCost": 预估开销数字或 null,
  "planWeek": { "year":数字, "month":1-12, "weekStart":1-5, "weekEnd":1-5 },
  "extra": { } }
planWeek 用「年+月+第几周」粒度（该自然月内第几周，周一起算）。用户没说时间就估一个合理的近期计划。
extra 按 sub 填：旅游→{transport,stay,spots}；美食→{address,queue,mustOrder}；购物→{necessity}（必买/可选/观望）。识别不到的键省略。

【todo】
{ "type":"todo", "title": 简短标题, "energy": "low|mid|high",
  "occurredAt": ISO8601 时间字符串, "priority": "high|mid|low", "done": false }
energy 是完成这件事需要的精力：low=顺手就能做，mid=需要专注一会儿，high=很耗神。

【note】
{ "type":"note", "title": 项目/想法简称, "sub": "产品|写作|通用|学习|其他",
  "idea": 核心想法或灵感(必填), "progress": 当前进度(可空), "reason": 为什么做/动机(可空),
  "extra": { } }
extra 按 sub 填：产品→{targetUser:目标用户, platform:平台}；写作→{style:风格, genre:类型, protagonist:主角, outline:大纲}；学习→{goal:目标, source:资料来源}；识别不到的键省略。

【exercise】
{ "type":"exercise", "title": 简短标题(如"晨练"), "activities": [{"name":运动名,"min":分钟数}],
  "burn": 估算消耗千卡数字或 null, "occurredAt": ISO8601 时间字符串 }
activities 把句子里每个运动拆开（如"跑步机40分钟,力量训练30分钟"→两条）。burn 不会算就给 null，本地会补。

只输出 JSON，不要任何解释文字。

用户输入：${text}`;
}

/**
 * @returns {Promise<object|null>} 解析结果；失败返回 null
 */
export async function parseCloud(text, { apiKey, model = 'deepseek-v4-flash', timeout = 12000 } = {}) {
  if (!apiKey) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(text) }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 600,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${detail.slice(0, 160)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('空响应');

    const obj = JSON.parse(content);
    obj.source = 'cloud';
    obj.confidence = 0.95;
    return obj;

  } catch (err) {
    console.warn('[DeepSeek] 解析失败，降级本地规则：', err.message);
    return { __error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** 设置页用：验证 Key 是否可用 */
export async function testKey(apiKey, model = 'deepseek-v4-flash') {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
    });
    if (res.ok) return { ok: true };
    const t = await res.text().catch(() => '');
    if (res.status === 401) return { ok: false, msg: 'Key 无效或已失效' };
    if (res.status === 402) return { ok: false, msg: '余额不足，去平台充值' };
    return { ok: false, msg: `HTTP ${res.status} ${t.slice(0, 80)}` };
  } catch (e) {
    return { ok: false, msg: `网络/CORS 受阻：${e.message}` };
  }
}
