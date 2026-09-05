/* ============================================================
   本地规则解析引擎（零依赖 / 离线可用 / 云端失败时兜底）
   输出与云端 LLM 完全一致的结构，便于合并
   ============================================================ */
import { currentWeekRange } from '../utils/time.js';
import { parseFoods, sumFoods } from '../utils/kcal.js';
import { parseExercises, sumBurn, isExercise } from '../utils/exercise.js';
import { detectMemorial } from '../utils/memorial.js';
import { getSettings } from '../store.js';

/* —— 一级分类关键词 —— */
const KW_NOTE = /(想法|灵感|创意|点子|笔记|专题|项目|在写|在筹划|想写|想做一个|做个\s*(?:app|应用|网站|小程序|软件|系统|工具|产品)|小说|连载|脑洞|构思|企划|复盘|记录下.*想法|我的.*(?:想法|点子)|点子库|灵感库|筹划做|打算做)/;
const KW_WISH = /(想去|想买|想吃|想要|希望|以后|将来|打算去|种草|心愿|攒钱|愿望|梦想|计划去|有机会去|存钱买)/;
const KW_TODO = /(要|需要|记得|别忘|提醒|待办|安排|约了|预约|开会|提交|完成|处理|准备|联系|回复|交付|跟进|检查)/;
const KW_LEDGER_PAST = /(花了|花费|付了|买了|充了|消费|支付|付款|刷了|扣了|收到|赚了|报销|入账|到账|工资|奖金)/;
/* 吃喝动作：用于「在家煮了两个鸡蛋」这类没花钱、但要计热量的句子 */
const KW_ATE = /(吃了|吃过|喝了|喝过|煮了|炒了|烤了|点了|啃了|干了一|来了一)/;
const KW_INCOME = /(收到|赚了|工资|奖金|入账|到账|报销|退款|红包收|分红|利息)/;

/* —— 消费品类 —— */
const CATEGORIES = [
  ['餐饮', /(吃|饭|餐|外卖|奶茶|咖啡|寿司|火锅|烧烤|早餐|午餐|晚餐|夜宵|食堂|面|喝|茶|甜品|蛋糕|烤肉|日料|快餐|小吃|酒)/],
  ['交通', /(打车|地铁|公交|高铁|火车|机票|飞机|加油|停车|滴滴|出租|共享单车|车票|过路费|油费)/],
  ['购物', /(买|衣服|鞋|裤|裙|包|化妆品|护肤|数码|手机|电脑|耳机|淘宝|京东|拼多多|超市|商场|快递)/],
  ['居家', /(房租|水电|物业|燃气|宽带|话费|家具|日用|洗衣|清洁|纸巾|电费|水费)/],
  ['娱乐', /(电影|游戏|演唱会|KTV|唱歌|健身|旅游|门票|展览|话剧|会员|订阅|按摩|密室|剧本杀)/],
  ['医疗', /(药|医院|看病|体检|挂号|牙|诊所|口罩|保健)/],
  ['学习', /(书|课程|培训|学费|考试|报名|文具|讲座|网课)/],
  ['人情', /(红包|礼物|请客|随礼|份子|孝敬|给妈妈|给爸爸)/],
];

/* —— 愿望单细分小类 —— */
const WISH_SUBS = [
  ['旅游', /(去|旅行|旅游|机票|看海|爬山|自驾|环游|签证|民宿|度假|日本|欧洲|新疆|西藏|云南|三亚|北海道|冰岛)/],
  ['美食', /(吃|餐厅|店|火锅|日料|米其林|甜品|烤肉|探店|打卡.*店)/],
  ['购物', /(买|包|鞋|相机|手机|裙|表|耳机|键盘|沙发|电脑|镜头)/],
];

/* —— 记事本细分小类 —— */
const NOTE_SUBS = [
  ['写作', /(小说|连载|写|脑洞|构思|故事|剧本|散文|诗歌|网文|世界观)/],
  ['产品', /(app|应用|网站|小程序|软件|系统|工具|产品|平台|项目|游戏|开发)/],
  ['学习', /(学习|课程|考证|考试|读书|论文|研究|技能|练)/],
  ['通用', /(想法|灵感|创意|点子|笔记|专题|复盘|企划|记录)/],
];

/* —— 精力值预估 —— */
const ENERGY_HIGH = /(报告|方案|设计稿|汇报|面试|搬家|大扫除|复习|考试|装修|谈判|路演|答辩|重构|上线|通宵)/;
const ENERGY_LOW  = /(打电话|买菜|回消息|浇花|取快递|倒垃圾|发消息|点外卖|交水电|签收|打卡|喝水)/;

const num = (s) => (s == null ? null : Number(s));

/** 金额上下文词 —— 出现这些词时，句中的裸数字大概率是钱 */
const KW_MONEY_CTX = /(工资|奖金|收到|赚了|入账|到账|报销|退款|花了|花费|付了|买了|充值|充了|消费|支付|刷了|扣了|价格|多少钱|预算)/;

/** 金额抽取 */
function pickAmount(text) {
  const pats = [
    /(?:花了|花费|付了|支付|消费|收到|赚了|入账|到账|充了|刷了|扣了)\s*(?:¥|￥)?\s*(\d+(?:\.\d+)?)/,
    /(?:¥|￥)\s*(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*(?:块钱|块|元|圆|大洋)/,
    /(\d+(?:\.\d+)?)\s*(?:rmb|RMB)/i,
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (m) return num(m[1]);
  }
  // 兜底：有金钱语境时，取句中最后一个非时间数字（如「收到工资 12000」）
  if (KW_MONEY_CTX.test(text)) {
    const cleaned = text
      .replace(/\d{1,2}\s*[:：]\s*\d{1,2}/g, ' ')   // 15:00
      .replace(/\d{1,2}\s*点(\d{1,2}分?)?/g, ' ')   // 3点半
      .replace(/\d+\s*(?:天|周|个月|月|年|号|日|次|个)/g, ' '); // 玩一周、3天
    const nums = cleaned.match(/\d+(?:\.\d+)?/g);
    if (nums?.length) return num(nums[nums.length - 1]);
  }
  return null;
}

/** 地点抽取：「在XXX吃/买/…」 */
function pickPlace(text) {
  const m = text.match(/在([\u4e00-\u9fa5A-Za-z0-9·]{2,10}?)(?:吃|喝|买|玩|看|花|消费|付|逛|住)/);
  if (m && !/今天|明天|昨天|中午|早上|下午|晚上|路上|家里|公司/.test(m[1])) return m[1];
  return null;
}

/** 品牌抽取：「吃了XXX花了」 */
function pickBrand(text) {
  const m = text.match(/(?:吃了|喝了|买了|用了|点了)\s*([\u4e00-\u9fa5A-Za-z0-9·]{2,10}?)(?=\s*(?:花|用|，|,|。|；|;|\d|$))/);
  if (m && !/一顿|一杯|一份|一点|东西|饭|午饭|晚饭|早饭/.test(m[1])) return m[1];
  return null;
}

/* 体重：单位 公斤/千克/kg/斤，或关键词 体重/称[重量] */
const KW_WEIGHT = /(体重|称[重量了]?|量了?体重)/;
function parseWeight(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(公斤|千克|kg|KG|㎏|斤)/i);
  if (m) {
    let v = parseFloat(m[1]);
    if (m[2] === '斤') v /= 2;              // 1 斤 = 0.5 kg（仅当单位精确为「斤」，避免把「公斤」误除）
    return Math.round(v * 10) / 10;
  }
  if (KW_WEIGHT.test(text)) {
    const n = text.match(/(\d+(?:\.\d+)?)/);
    if (n) return Math.round(parseFloat(n[1]) * 10) / 10;
  }
  return null;
}

/** 时间抽取 → ISO */
function pickTime(text) {
  const now = new Date();
  const d = new Date(now);
  let touched = false;

  if (/后天/.test(text))      { d.setDate(d.getDate() + 2); touched = true; }
  else if (/明天/.test(text)) { d.setDate(d.getDate() + 1); touched = true; }
  else if (/昨天/.test(text)) { d.setDate(d.getDate() - 1); touched = true; }
  else if (/今天|今晚|今早/.test(text)) { touched = true; }

  const wd = text.match(/(?:周|星期)([一二三四五六日天])/);
  if (wd) {
    const map = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 日:0, 天:0 };
    const target = map[wd[1]];
    const cur = d.getDay();
    let delta = (target - cur + 7) % 7;
    if (delta === 0) delta = 7;
    d.setDate(d.getDate() + delta); touched = true;
  }

  const hm = text.match(/(\d{1,2})\s*[:：点](\d{1,2})?/);
  if (hm) {
    let hh = +hm[1];
    if (/下午|晚上|傍晚/.test(text) && hh < 12) hh += 12;
    d.setHours(hh, hm[2] ? +hm[2] : 0, 0, 0); touched = true;
  } else if (/早上|早晨|上午/.test(text)) { d.setHours(9, 0, 0, 0);  touched = true; }
  else if (/中午/.test(text))             { d.setHours(12, 0, 0, 0); touched = true; }
  else if (/下午/.test(text))             { d.setHours(15, 0, 0, 0); touched = true; }
  else if (/晚上|今晚/.test(text))        { d.setHours(20, 0, 0, 0); touched = true; }

  return touched ? d.toISOString() : now.toISOString();
}

/* —— 收入品类 —— */
const INCOME_CATS = [
  ['工资', /(工资|薪水|月薪|发薪)/],
  ['奖金', /(奖金|年终|提成|分红|绩效)/],
  ['报销', /(报销|贴补)/],
  ['退款', /(退款|退货|返现)/],
  ['理财', /(利息|收益|分红|基金|股票)/],
  ['红包', /(红包|礼金|压岁)/],
];

function pickCategory(text, isIncome) {
  if (isIncome) {
    for (const [name, re] of INCOME_CATS) if (re.test(text)) return name;
    return '其他收入';
  }
  for (const [name, re] of CATEGORIES) if (re.test(text)) return name;
  return '其他';
}

function pickWishSub(text) {
  for (const [name, re] of WISH_SUBS) if (re.test(text)) return name;
  return '购物';
}

function pickNoteSub(text) {
  for (const [name, re] of NOTE_SUBS) if (re.test(text)) return name;
  return '其他';
}

function pickEnergy(text) {
  if (ENERGY_HIGH.test(text)) return 'high';
  if (ENERGY_LOW.test(text))  return 'low';
  return 'mid';
}

/** 一级分类判定（记事本优先，避免「想做一个APP」被误判为愿望单）
 *  优先级要点：一句话里若同时提到「吃了 X」又提到运动，餐饮优先（保住热量/净平衡）；
 *  纯运动句（无吃喝）仍归运动。 */
function pickType(text) {
  const hasMoney = pickAmount(text) != null;
  if (KW_NOTE.test(text)) return 'note';
  // 生日 / 纪念日：含关键词且有日期，优先于愿望单 / 待办（"妈妈生日我要买礼物"应归纪念日）
  if (detectMemorial(text)) return 'memorial';
  if (KW_WISH.test(text)) return 'wish';
  if (hasMoney && KW_LEDGER_PAST.test(text)) return 'ledger';
  // 明确「吃了/喝了 + 食物」→ 餐饮（即便句里也提到运动，餐饮优先）
  const foods = parseFoods(text);
  if (KW_ATE.test(text) && foods.length) return 'ledger';
  if (foods.length && /吃|喝|餐|饭|宵|食/.test(text)) return 'ledger';
  // 没花钱、但说了「运动 + 时长」→ 运动消耗（独立类型，不算记账/待办）
  if (!hasMoney && isExercise(text)) return 'exercise';
  if (parseWeight(text) != null) return 'weight';
  if (KW_TODO.test(text)) return 'todo';
  if (hasMoney) return 'ledger';
  return 'todo';
}

/** 记事本标题：在通用标题清洗基础上，再去掉「做一个 / 写一本」等动作前缀 */
function pickNoteTitle(text) {
  let s = pickTitle(text);
  s = s.replace(/^(?:想写一个|想做|做一个|做个|写一个|写一本|写个|我的|这个|筹划|打算做|准备做|开发)\s*/, '');
  return s.trim() || '未命名想法';
}

/** 去掉时间前缀与意图词，提炼干净标题 */
function pickTitle(text) {
  let s = String(text).trim();

  // 1) 逐层剥离时间前缀（可能叠加：明天 + 下午 + 3点）
  for (let i = 0; i < 3; i++) {
    s = s.replace(/^(今天|明天|后天|大后天|昨天|前天|今晚|今早)\s*/, '')
         .replace(/^(早上|早晨|上午|中午|下午|傍晚|晚上|夜里)\s*/, '')
         .replace(/^(?:这|下|本)?(?:周|星期)[一二三四五六日天]\s*/, '')
         .replace(/^\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*/, '')
         .replace(/^\s*\d{1,2}\s*点(?:\s*\d{1,2}\s*分?|半)?\s*/, '');
  }

  // 2) 剥离意图词
  s = s.replace(/^(记得|别忘了|别忘|提醒我|需要|得|要)\s*/, '')
       .replace(/^我?想(?=[去买吃要试看])/, '')
       .replace(/^(以后|将来|有机会|打算|希望|计划)\s*/, '')
       .replace(/^我?想(?=[去买吃要试看])/, '')
       .replace(/^要\s*/, '');

  // 3) 去掉句尾金额尾巴
  s = s.replace(/[，,、]?\s*(?:花了|花费|付了|支付|消费|充了|刷了)[^，,。；;]*$/, '');

  return s.trim() || String(text).trim();
}

/** 主入口 */
export function parseLocal(text) {
  const raw = String(text || '').trim();
  const type = pickType(raw);
  const base = { type, raw, occurredAt: pickTime(raw), source: 'local', confidence: 0.6 };

  if (type === 'ledger') {
    const isIncome = KW_INCOME.test(raw);
    const category = pickCategory(raw, isIncome);
    const rec = {
      ...base,
      amount: pickAmount(raw),
      category,
      place: pickPlace(raw),
      brand: pickBrand(raw),
      isIncome,
      rating: null,
      photos: [],
    };
    // 餐饮支出：顺手估算食物明细与热量（用户可在结果页改）
    if (!isIncome && category === '餐饮') {
      const foods = parseFoods(raw);
      if (foods.length) {
        rec.foods = foods;
        rec.kcal = sumFoods(foods);
        rec.kcalBy = 'auto';
      } else {
        rec.foods = [];
        rec.kcal = null;
        rec.kcalBy = 'auto';
      }
    }
    return rec;
  }

  if (type === 'memorial') {
    const m = detectMemorial(raw);
    return {
      ...base,
      subType: m?.subType || 'birthday',
      title: m?.title || (raw || '纪念日'),
      mmdd: m?.mmdd || '01-01',
      year: m?.year ?? null,
      note: '',
    };
  }

  if (type === 'exercise') {
    const weight = getSettings().weightKg || 60;
    const activities = parseExercises(raw, weight);
    const burn = sumBurn(activities);
    return {
      ...base,
      title: activities.length ? activities.map(a => `${a.name}${a.min}分钟`).join(' · ') : raw,
      activities,
      burn,
      burnBy: 'auto',
    };
  }

  if (type === 'wish') {
    const w = currentWeekRange();
    return {
      ...base,
      title: pickTitle(raw),
      sub: pickWishSub(raw),
      priority: 'mid',
      // 预计时间默认「下个月 第1周」，用户可改
      planWeek: { year: w.year, month: w.month === 12 ? 1 : w.month + 1,
                  weekStart: 1, weekEnd: 1 },
      estCost: pickAmount(raw),
      extra: {},
    };
  }

  if (type === 'note') {
    const sub = pickNoteSub(raw);
    return {
      ...base,
      sub,
      title: pickNoteTitle(raw),
      idea: pickTitle(raw),   // 想法先填原句，用户可润色
      progress: null,
      reason: null,
      extra: {},
    };
  }

  if (type === 'weight') {
    return {
      ...base,
      weight: parseWeight(raw),
      note: '',
      photos: [],
    };
  }

  return {
    ...base,
    title: pickTitle(raw),
    energy: pickEnergy(raw),
    energyBy: 'local',
    priority: 'mid',
    done: false,
  };
}
