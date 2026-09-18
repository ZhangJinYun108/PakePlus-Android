/* ============================================================
   必须记 · 语义预判分类器
   规则（按优先级排序，先匹配先赢）：
   1. 含金额 → 收支
   2. 含固定日期生日/纪念日 → 提醒
   3. 「打包清单」「歌单」「playlist」「清单」 → 记事
   4. 「希望」「想」「打算」「待办」「记得」「提醒」+ 名词 → 待办
   5. 旅行/目标/梦想类（含「去 / 旅行 / 入手 / 完成 / 实现 / 报名 / 攒」+ 具体名词） → 愿望
   6. 餐食描述（含「饭 / 面 / 粥 / 沙拉 / 蛋 / 鸡 / 鱼 / 牛 / 猪 / 加餐 / 早餐 / 午餐 / 晚餐」 或 仅食物名词） → 餐食热量
   7. 默认 → 待办
   ============================================================ */

(function (global) {
  'use strict';

  const CATEGORIES = {
    money:    { id: 'money',    label: '收支',     accent: 'green', emoji: '💰' },
    meal:     { id: 'meal',     label: '餐食热量', accent: 'green', emoji: '🍱' },
    todo:     { id: 'todo',     label: '待办',     accent: 'green', emoji: '✓'  },
    wish:     { id: 'wish',     label: '愿望单',   accent: 'green', emoji: '★'  },
    note:     { id: 'note',     label: '记事',     accent: 'green', emoji: '📝' },
    reminder: { id: 'reminder', label: '提醒',     accent: 'green', emoji: '⏰' },
  };

  /** 提取金额 */
  function extractAmount(text) {
    // 匹配：¥ / ￥ / $ 等符号 + 数字；或「午饭 28」「午饭28元」纯数字
    let m = text.match(/(?:[¥￥$]\s*|人民币\s*)?(\d+(?:\.\d+)?)\s*(?:元|块|k)?/i);
    if (m) {
      const v = parseFloat(m[1]);
      if (v < 1000000) return v;
    }
    // 阿拉伯数字结尾
    m = text.match(/(\d+(?:\.\d+)?)\s*(?:元|块|￥|¥|rmb)/i);
    if (m) return parseFloat(m[1]);
    // 纯数字
    m = text.trim().match(/^(\d+(?:\.\d+)?)$/);
    if (m) return parseFloat(m[1]);
    return null;
  }

  /** 提取日期 */
  function extractDate(text) {
    // YYYY-MM-DD / YYYY/MM/DD / MM月DD日 / MM-DD
    const m1 = text.match(/(\d{4})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])/);
    if (m1) return `${m1[1]}-${String(m1[2]).padStart(2,'0')}-${String(m1[3]).padStart(2,'0')}`;
    const m2 = text.match(/(0?[1-9]|1[0-2])\s*月\s*(0?[1-9]|[12]\d|3[01])\s*[日号]?/);
    if (m2) {
      const year = new Date().getFullYear();
      return `${year}-${String(m2[1]).padStart(2,'0')}-${String(m2[2]).padStart(2,'0')}`;
    }
    return null;
  }

  const FOOD_HINT = /(饭|面|粥|沙拉|蛋|鸡|鱼|牛|猪|羊|虾|水果|蔬菜|奶|酸奶|面包|吐司|咖啡|奶茶|水果|坚果|燕麦|三明治|寿司|饺子|馄饨|披萨|蛋糕|汤|排骨|咖喱|烤肉|火锅|凉皮|拉面|烧烤|寿司|天妇罗|意大利面|披萨|贝果|可颂|豆浆|油条|馕|抓饭|烤鸭|红烧|清蒸|糖醋|蒜蓉|麻婆)/;
  const WISH_HINT = /(想(要|去|买)|希望|打算|计划|准备|想去|入(手|一台)|完成(一次)?|实现|报名|准备|攒(钱)?|存钱|争取|梦想|目标)/;
  const TODO_HINT = /(记得|待办|要(做|去|买|联系|确认|回复|发|发送|订)|别忘|一定)/;
  const NOTE_HINT = /(清单|打包|歌单|playlist|playlist书单|影单|playlist|playlist)/i;
  const ANNIV_HINT = /(生日|纪念日|结婚(纪念|日|纪念日)|忌日|周年)/;
  const TRAVEL_HINT = /(旅行|旅行|旅游|出差|去.{1,8}|飞行|机票|酒店)/;

  function predict(text) {
    const t = (text || '').trim();
    if (!t) return null;

    const chips = [CATEGORIES.todo]; // 默认分类
    let primary = CATEGORIES.todo;

    const amount = extractAmount(t);
    const dateStr = extractDate(t);
    const matchesAnniv = ANNIV_HINT.test(t);
    const matchesNote = NOTE_HINT.test(t);
    const matchesWish = WISH_HINT.test(t) || TRAVEL_HINT.test(t);
    const matchesTodo = TODO_HINT.test(t);
    const matchesFood = FOOD_HINT.test(t);

    // 1. 含金额 → 收支（强优先）
    if (amount !== null) {
      primary = CATEGORIES.money;
      chips.push(CATEGORIES.money);
    }
    // 2. 纪念日/生日 + 日期 → 提醒
    if (matchesAnniv && dateStr) {
      primary = CATEGORIES.reminder;
      chips.push(CATEGORIES.reminder);
    }
    // 3. 打包 / 歌单 → 记事
    if (matchesNote) {
      primary = CATEGORIES.note;
      chips.unshift(CATEGORIES.note);
    }
    // 4. 愿望
    if (matchesWish && !matchesAnniv) {
      primary = CATEGORIES.wish;
      chips.push(CATEGORIES.wish);
    }
    // 5. 餐食热量
    if (matchesFood && amount === null) {
      primary = CATEGORIES.meal;
      chips.unshift(CATEGORIES.meal);
    }

    // 构建解析结果
    const parse = [];
    if (amount !== null) {
      parse.push({ label: '金额', value: `¥${amount.toFixed(2)} · ${amount > 200 ? '支出' : '支出'}`, positive: true });
    }
    if (dateStr) {
      parse.push({ label: '日期', value: dateStr });
    }
    if (matchesAnniv) {
      parse.push({ label: '类型', value: '纪念日 / 生日' });
    }
    if (matchesFood) {
      parse.push({ label: '识别', value: '餐食热量' });
    }
    if (parse.length < 3) {
      parse.push({ label: '关联分类', value: primary.label });
    }
    if (parse.length < 3) {
      const now = new Date();
      parse.push({ label: '时间', value: `${now.getMonth()+1}月${now.getDate()}日 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` });
    }

    return {
      primary: primary.id,
      primaryLabel: primary.label,
      chips: uniq([primary, ...chips].map(c => c.id)).map(id => CATEGORIES[id]),
      parse: parse.slice(0, 3),
      amount, date: dateStr,
      raw: t,
    };
  }

  function uniq(arr) { return [...new Set(arr)]; }

  /** 估算餐食热量（非常简单的查表） */
  const CALORIE_TABLE = [
    { kw: '牛肉面', kcal: 680 }, { kw: '沙拉', kcal: 220 }, { kw: '轻食沙拉', kcal: 220 },
    { kw: '燕麦粥', kcal: 320 }, { kw: '酸奶', kcal: 120 }, { kw: '坚果', kcal: 180 },
    { kw: '三明治', kcal: 380 }, { kw: '饺子', kcal: 480 }, { kw: '寿司', kcal: 350 },
    { kw: '披萨', kcal: 720 }, { kw: '咖啡', kcal: 90 }, { kw: '奶茶', kcal: 380 },
    { kw: '面包', kcal: 280 }, { kw: '排骨', kcal: 560 }, { kw: '咖喱饭', kcal: 620 },
    { kw: '烤鸭', kcal: 540 }, { kw: '汉堡', kcal: 600 }, { kw: '炸鸡', kcal: 580 },
    { kw: '火锅', kcal: 700 }, { kw: '麻辣烫', kcal: 480 }, { kw: '盖浇饭', kcal: 660 },
    { kw: '炒面', kcal: 580 }, { kw: '凉皮', kcal: 320 }, { kw: '馄饨', kcal: 320 },
    { kw: '豆浆', kcal: 80 }, { kw: '油条', kcal: 240 }, { kw: '牛排', kcal: 580 },
    { kw: '红烧', kcal: 540 }, { kw: '清蒸', kcal: 240 },
  ];

  function estimateKcal(text) {
    for (const row of CALORIE_TABLE) if (text.includes(row.kw)) return row.kcal;
    return 350; // 默认估值
  }

  /** 收支分类推断（粗略的类别字典） */
  function inferCategory(text) {
    if (/餐饮|饭|面|餐|咖啡|奶茶|外卖|午餐|晚餐|早餐/.test(text)) return '餐饮';
    if (/交通|出租|地铁|公交|高铁|滴滴|加油|停车|打车/.test(text)) return '交通';
    if (/购物|买|商场|天猫|京东|淘宝|拼多多/.test(text)) return '购物';
    if (/居家|水电|物业|网费|房租|手机费/.test(text)) return '居家';
    if (/娱乐|电影|演出|游戏|ktv|演唱会/.test(text)) return '娱乐';
    if (/医疗|药|医院/.test(text)) return '医疗';
    if (/工资|项目|尾款|稿费|兼职|收入/.test(text)) return '收入';
    return '其他';
  }

  global.MustRecord = global.MustRecord || {};
  global.MustRecord.parser = {
    CATEGORIES,
    predict, extractAmount, extractDate, estimateKcal, inferCategory,
  };
})(window);
