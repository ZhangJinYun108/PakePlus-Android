/* ============================================================
   模块 2 · 分类结果页（通用外壳 + 三套字段模板）
   外壳：回显原输入 → 三分类 chip → 属性软胶囊(✎可改)
   保存策略：新建(无 id)进入后倒计时，停手即自动落库；编辑(有 id)不自动存，需点"保存"
   ============================================================ */
import { h, esc, toast, editSheet, pickSheet, confirmSheet } from '../utils/dom.js';
import { friendlyDateTime, formatWeekRange, weeksInMonth } from '../utils/time.js';
import { saveRecord, getSettings, todayDigest, deleteRecord } from '../store.js';
import { parseFoods, foodsSummary, foodsToLines, parseFoodLines, sumFoods } from '../utils/kcal.js';
import { parseActivityLines, activitiesToLines, sumBurn, recBurn } from '../utils/exercise.js';
import { go, back } from '../router.js';

const AUTOSAVE_MS = 4000;

const TYPE_META = {
  ledger: { label: '记账',  cls: 'on' },
  wish:   { label: '愿望单', cls: 'on lav' },
  todo:   { label: '待办',  cls: 'on mint' },
  note:   { label: '记事',  cls: 'on sky' },
  exercise: { label: '运动', cls: 'on peach' },
  memorial: { label: '纪念日', cls: 'on butter' },
  weight:   { label: '体重',   cls: 'on lav' },
};

const NOTE_SUBS = ['产品','写作','通用','学习','其他'];
const NOTE_SUB_LABEL = { 产品:'产品', 写作:'写作', 通用:'通用', 学习:'学习', 其他:'其他' };

const ENERGY_LABEL = { low: '低 · 顺手就做', mid: '中 · 需要专注', high: '高 · 挺耗神' };
const PRIO_LABEL   = { high: '高', mid: '中', low: '低' };
const CATEGORIES   = ['餐饮','交通','购物','居家','娱乐','医疗','学习','人情','其他'];
const INCOME_CATS  = ['工资','奖金','报销','退款','理财','红包','其他收入'];

export function ResultView({ draft }) {
  // 深拷贝，避免污染上游
  let rec = JSON.parse(JSON.stringify(draft));
  const isEdit = !!rec.id; // 有 id = 编辑已有记录；无 id = 新建

  const el = h(`
    <div>
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <div class="topbar-title">AI 帮你归好类了</div>
      </div>
      <div class="scroll">
        <div class="echo-wrap" style="margin-bottom:18px">
          <span class="echo-label">你说的是</span>
          <div class="echo-pill">${esc(rec.raw || '')}</div>
        </div>

        <div class="sec-title">分类 · 点一下可改</div>
        <div class="chip-row" id="type-row"></div>

        <div id="fields"></div>
      </div>

      <div class="autosave">
        <div class="autosave-track"><div class="autosave-fill"></div></div>
        <span class="autosave-text">停手就自动记下</span>
        <div class="autosave-actions">
          ${isEdit ? `<button class="autosave-del" data-act="delete" title="删除这条记录">删除</button>` : ''}
          <button class="autosave-now" data-act="save-now">立即记下</button>
        </div>
      </div>
    </div>`);

  const typeRow = el.querySelector('#type-row');
  const fieldsEl = el.querySelector('#fields');
  const fill = el.querySelector('.autosave-fill');

  // 编辑模式：去掉倒计时自动保存，改为手动点"保存"
  if (isEdit) {
    const bar = el.querySelector('.autosave');
    bar.classList.add('edit-mode');
    bar.querySelector('.autosave-track').style.display = 'none';
    bar.querySelector('.autosave-text').textContent = '修改后点保存';
    bar.querySelector('.autosave-now').textContent = '保存';
  }

  /* —— 自动保存倒计时 —— */
  let t0 = Date.now(), raf = null, saved = false;
  function tick() {
    const p = Math.min(1, (Date.now() - t0) / AUTOSAVE_MS);
    fill.style.width = (p * 100) + '%';
    if (p >= 1) { commit(); return; }
    raf = requestAnimationFrame(tick);
  }
  function resetTimer() { t0 = Date.now(); }
  function stopTimer() { if (raf) cancelAnimationFrame(raf); raf = null; }

  function commit() {
    if (saved) return;
    saved = true; stopTimer();
    saveRecord(rec);
    checkEnergyOverflow();
    checkKcalOverflow();
    toast(isEdit ? '已保存 ✓' : '已记下 ✓');
    setTimeout(() => go('home', {}, { replace: true }), 500);
  }

  /* —— 超精力上限提醒（模块 5 规则） —— */
  function checkEnergyOverflow() {
    if (rec.type !== 'todo') return;
    const s = getSettings();
    const used = todayDigest().energyUsed;
    if (used > s.energyLimit) {
      setTimeout(() => toast(`今天精力已用 ${used} / ${s.energyLimit}，有点超载啦～`, 3000), 900);
    }
  }

  /* —— 热量接近 / 超出每日上限提醒 —— */
  function checkKcalOverflow() {
    if (rec.type !== 'ledger' || rec.isIncome || rec.category !== '餐饮') return;
    const s = getSettings();
    if (s.kcalWarn === false) return;
    const used = todayDigest().kcalUsed;
    const limit = s.kcalLimit || 1500;
    if (used > limit) {
      setTimeout(() => toast(`今天已摄入 ${used} / ${limit} 千卡，超出 ${used - limit} 啦～`, 3200), 900);
    } else if (used >= limit * 0.85) {
      setTimeout(() => toast(`今天已摄入 ${used} / ${limit} 千卡，快到上限了`, 3000), 900);
    }
  }

  /* —— 渲染分类 chip —— */
  function renderTypes() {
    typeRow.innerHTML = Object.entries(TYPE_META).map(([k, m]) =>
      `<button class="chip ${rec.type === k ? m.cls : ''}" data-type="${k}">${m.label}</button>`
    ).join('');
  }

  /* —— 切换分类：套用对应模板，保留能复用的值 —— */
  function switchType(next) {
    if (next === rec.type) return;
    const base = { id: rec.id, raw: rec.raw, occurredAt: rec.occurredAt, source: rec.source, type: next };
    if (next === 'ledger') {
      rec = { ...base, amount: rec.estCost ?? rec.amount ?? null, category: rec.category || '其他',
              place: null, brand: null, isIncome: false, rating: null, photos: [] };
    } else     if (next === 'wish') {
      const now = new Date();
      rec = { ...base, title: rec.title || rec.raw, sub: '购物', priority: 'mid',
              planWeek: rec.planWeek || { year: now.getFullYear(), month: now.getMonth() + 1, weekStart: 1, weekEnd: 1 },
              estCost: rec.amount ?? null, extra: {}, photos: [] };
    } else if (next === 'note') {
      rec = { ...base, sub: '通用', title: rec.title || rec.raw,
              idea: rec.idea || rec.raw || '', progress: null, reason: null, extra: {}, photos: [] };
    } else if (next === 'exercise') {
      rec = { ...base, title: rec.title || rec.raw,
              activities: rec.activities || [], burn: rec.burn ?? null, burnBy: 'manual', photos: [] };
    } else if (next === 'memorial') {
      rec = { ...base, title: rec.title || rec.raw,
              subType: rec.subType || 'birthday', mmdd: rec.mmdd || '01-01',
              year: rec.year ?? null, note: rec.note || '', photos: [] };
    } else if (next === 'weight') {
      rec = { ...base, weight: rec.weight ?? null, note: rec.note || '', photos: [] };
    } else {
      rec = { ...base, title: rec.title || rec.raw, energy: rec.energy || 'mid',
              energyBy: 'manual', priority: 'mid', done: false, photos: [] };
    }
    renderTypes(); renderFields(); resetTimer();
  }

  /* —— 字段模板 —— */
  function fieldRow(key, val, { req = false, act, cls = '', tag } = {}) {
    const tagHTML = req ? '<span class="req-tag">必填</span>'
                        : (tag === false ? '' : '<span class="opt-tag">选填</span>');
    const empty = (val === null || val === undefined || val === '') ;
    return `<div class="field ${cls}" data-act="${act}">
      <span class="field-key">${esc(key)}</span>
      <span class="field-val ${empty ? 'empty' : ''}">${empty ? '点这里填' : esc(val)}</span>
      ${tagHTML}<span class="field-pen">✎</span>
    </div>`;
  }

  /* —— 图片附件行（各类型复用，记账已在模板内自带，这里给其余类型补上） —— */
  function photoRowHTML(rec) {
    const photos = (rec.photos || []).map((p, i) =>
      `<img class="photo-thumb" src="${p}" data-photo="${i}">`).join('');
    return `<div class="sec-title">留张照片</div>
      <div class="photo-row">${photos}<button class="photo-add" data-act="photo">+</button></div>
      <div style="height:8px"></div>`;
  }

  function renderFields() {
    if (rec.type === 'ledger') {
      const ratingChips = ['推荐','一般','不推荐'].map(r =>
        `<button class="chip sm ${rec.rating === r ? (r === '推荐' ? 'on mint' : r === '一般' ? 'on butter' : 'on') : ''}"
          data-rating="${r}">${r}</button>`).join('');
      const photos = (rec.photos || []).map((p, i) =>
        `<img class="photo-thumb" src="${p}" data-photo="${i}">`).join('');

      // 餐饮专属：吃了什么 + 热量（只在餐饮支出时出现）
      const isMealRec = !rec.isIncome && rec.category === '餐饮';
      const mealRows = isMealRec ? `
        <div class="sec-title">
          这顿吃了什么
          ${rec.kcalBy === 'auto' && rec.kcal != null ? '<span class="ai-badge">热量估算</span>' : ''}
        </div>
        ${fieldRow('食物', foodsSummary(rec.foods), { act: 'foods', tag: false })}
        ${fieldRow('热量', rec.kcal != null ? `${rec.kcal} 千卡` : null, { act: 'kcal', cls: 'kcal', tag: false })}
        <div class="kcal-tip">估算值仅供参考，点一下就能改成实际的</div>` : '';

      fieldsEl.innerHTML = `
        <div class="sec-title">提取到的信息</div>
        <div class="chip-row" style="margin-bottom:10px">
          <button class="chip sm ${!rec.isIncome ? 'on' : ''}" data-inout="out">支出</button>
          <button class="chip sm ${rec.isIncome ? 'on mint' : ''}" data-inout="in">收入</button>
        </div>
        ${fieldRow('品类', rec.category, { req: true, act: 'category' })}
        ${fieldRow(rec.isIncome ? '收入' : '金额', rec.amount != null ? `¥${rec.amount}` : null, { req: true, act: 'amount', cls: 'amount' })}
        ${fieldRow('时间', friendlyDateTime(rec.occurredAt), { act: 'time', tag: false })}
        ${fieldRow('地点', rec.place, { act: 'place' })}
        ${fieldRow('品牌', rec.brand, { act: 'brand' })}
        ${mealRows}
        <div class="sec-title">这次值得回头吗</div>
        <div class="chip-row">${ratingChips}</div>
        <div class="sec-title">留张照片</div>
        <div class="photo-row">${photos}<button class="photo-add" data-act="photo">+</button></div>
        <div style="height:8px"></div>`;
      return;
    }

    if (rec.type === 'wish') {
      const subs = ['旅游','美食','购物'].map(x =>
        `<button class="chip sm ${rec.sub === x ? 'on lav' : ''}" data-sub="${x}">${x}</button>`).join('');
      const prios = [['high','高'],['mid','中'],['low','低']].map(([k, l]) =>
        `<button class="chip sm ${rec.priority === k ? (k==='high'?'on':k==='mid'?'on butter':'on mint') : ''}"
          data-prio="${k}">${l}</button>`).join('');

      let extraRows = '';
      if (rec.sub === '旅游') {
        extraRows = fieldRow('交通', rec.extra?.transport, { act: 'x-transport' })
                  + fieldRow('住宿', rec.extra?.stay, { act: 'x-stay' })
                  + fieldRow('景点', rec.extra?.spots, { act: 'x-spots' });
      } else if (rec.sub === '美食') {
        extraRows = fieldRow('地址', rec.extra?.address, { act: 'x-address' })
                  + fieldRow('排队', rec.extra?.queue, { act: 'x-queue' })
                  + fieldRow('必点', rec.extra?.mustOrder, { act: 'x-must' });
      } else {
        extraRows = fieldRow('必要性', rec.extra?.necessity, { act: 'x-necessity' });
      }

      fieldsEl.innerHTML = `
        <div class="sec-title">想做的事</div>
        ${fieldRow('心愿', rec.title, { req: true, act: 'title' })}
        <div class="sec-title">细分小类 · 必选</div>
        <div class="chip-row">${subs}</div>
        <div class="sec-title">优先级 · 必选</div>
        <div class="chip-row">${prios}</div>
        <div class="sec-title">计划与预算</div>
        ${fieldRow('预计时间', formatWeekRange(rec.planWeek), { req: true, act: 'planweek' })}
        ${fieldRow('预计开销', rec.estCost != null ? `¥${rec.estCost}` : null, { req: true, act: 'estcost' })}
        <div class="sec-title">${rec.sub}专属 · 可以先空着</div>
        ${extraRows}
        ${photoRowHTML(rec)}
        <div style="height:8px"></div>`;
      return;
    }

    if (rec.type === 'note') {
      const subs = NOTE_SUBS.map(x =>
        `<button class="chip sm ${rec.sub === x ? (x === '写作' ? 'on lav' : x === '产品' ? 'on sky' : x === '学习' ? 'on mint' : x === '其他' ? 'on butter' : 'on') : ''}" data-sub="${x}">${NOTE_SUB_LABEL[x]}</button>`).join('');

      let extraRows = '';
      if (rec.sub === '产品') {
        extraRows = fieldRow('目标用户', rec.extra?.targetUser, { act: 'n-targetUser' })
                  + fieldRow('平台', rec.extra?.platform, { act: 'n-platform' });
      } else if (rec.sub === '写作') {
        extraRows = fieldRow('风格', rec.extra?.style, { act: 'n-style' })
                  + fieldRow('类型', rec.extra?.genre, { act: 'n-genre' })
                  + fieldRow('主角', rec.extra?.protagonist, { act: 'n-protagonist' })
                  + fieldRow('大纲', rec.extra?.outline, { act: 'n-outline' });
      } else if (rec.sub === '学习') {
        extraRows = fieldRow('目标', rec.extra?.goal, { act: 'n-goal' })
                  + fieldRow('资料来源', rec.extra?.source, { act: 'n-source' });
      } else {
        extraRows = '';
      }

      fieldsEl.innerHTML = `
        <div class="sec-title">想法 / 项目</div>
        ${fieldRow('名称', rec.title, { req: true, act: 'title' })}
        <div class="sec-title">细分小类 · 必选</div>
        <div class="chip-row">${subs}</div>
        <div class="sec-title">核心想法 · 必填</div>
        ${fieldRow('想法', rec.idea, { req: true, act: 'idea' })}
        ${fieldRow('进度', rec.progress, { act: 'progress' })}
        ${fieldRow('为什么做', rec.reason, { act: 'reason' })}
        ${extraRows ? `<div class="sec-title">${rec.sub}专属 · 可以先空着</div>${extraRows}` : ''}
        ${photoRowHTML(rec)}
        <div style="height:8px"></div>`;
      return;
    }

    if (rec.type === 'exercise') {
      const acts = rec.activities || [];
      fieldsEl.innerHTML = `
        <div class="sec-title">运动明细</div>
        ${fieldRow('活动', activitiesToLines(acts) || null, { act: 'activities', tag: false })}
        ${fieldRow('消耗', rec.burn != null ? `${rec.burn} 千卡` : null, { act: 'burn', cls: 'kcal', tag: false })}
        <div class="kcal-tip">一行一个：运动名 + 时长（如「跑步机 40分钟」），会按体重估热量；留空就自己填消耗</div>
        <div class="sec-title">时间</div>
        ${fieldRow('什么时候', friendlyDateTime(rec.occurredAt), { act: 'time', tag: false })}
        ${photoRowHTML(rec)}
        <div style="height:8px"></div>`;
      return;
    }

    if (rec.type === 'memorial') {
      const subs = [['birthday','生日'],['anniversary','纪念日']].map(([k, l]) =>
        `<button class="chip sm ${rec.subType === k ? (k === 'birthday' ? 'on butter' : 'on lav') : ''}" data-msub="${k}">${l}</button>`).join('');
      const age = rec.year ? `（今年 ${new Date().getFullYear() - rec.year} 岁）` : '';
      fieldsEl.innerHTML = `
        <div class="sec-title">这是</div>
        <div class="chip-row" style="margin-bottom:10px">${subs}</div>
        ${fieldRow('称呼 / 名称', rec.title, { req: true, act: 'title' })}
        ${fieldRow('日期', `${rec.mmdd}（每年）${age}`, { req: true, act: 'mmdd' })}
        ${fieldRow('出生 / 起始年', rec.year ? String(rec.year) : '（可不填，填了能算年龄）', { act: 'year' })}
        ${fieldRow('备注', rec.note || null, { act: 'memo' })}
        <div class="kcal-tip">保存后会出现在「纪念日」页，并在到期前一周、前一天提醒你（也可一键加到系统日历）</div>
        ${photoRowHTML(rec)}
        <div style="height:8px"></div>`;
      return;
    }

    if (rec.type === 'weight') {
      fieldsEl.innerHTML = `
        <div class="sec-title">体重</div>
        ${fieldRow('数值', rec.weight != null ? `${rec.weight} kg` : null, { req: true, act: 'weight-val', cls: 'kcal' })}
        ${fieldRow('时间', friendlyDateTime(rec.occurredAt), { act: 'time', tag: false })}
        ${fieldRow('备注', rec.note || null, { act: 'wnote' })}
        <div style="height:8px"></div>`;
      return;
    }

    // todo
    const energies = [['low','低'],['mid','中'],['high','高']].map(([k, l]) =>
      `<button class="chip sm ${rec.energy === k ? (k==='high'?'on':k==='mid'?'on butter':'on mint') : ''}"
        data-energy="${k}">${l}</button>`).join('');
    const prios = [['high','高'],['mid','中'],['low','低']].map(([k, l]) =>
      `<button class="chip sm ${rec.priority === k ? (k==='high'?'on':k==='mid'?'on butter':'on mint') : ''}"
        data-prio="${k}">${l}</button>`).join('');

    fieldsEl.innerHTML = `
      <div class="sec-title">要做的事</div>
      ${fieldRow('内容', rec.title, { req: true, act: 'title' })}
      <div class="sec-title">
        精力值 · 必填
        ${rec.energyBy !== 'manual' ? '<span class="ai-badge">AI 预估</span>' : ''}
      </div>
      <div class="chip-row">${energies}</div>
      <div style="font-size:var(--fs-xs);color:var(--text-3);margin-top:8px">${ENERGY_LABEL[rec.energy] || ''}</div>
      <div class="sec-title">时间</div>
      ${fieldRow('什么时候', friendlyDateTime(rec.occurredAt), { act: 'time', tag: false })}
        <div class="sec-title">优先级</div>
        <div class="chip-row">${prios}</div>
        ${photoRowHTML(rec)}
        <div style="height:8px"></div>`;
  }

  /* —— 交互 —— */
  el.addEventListener('click', async (e) => {
    resetTimer();

    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn) return switchType(typeBtn.dataset.type);

    const subBtn = e.target.closest('[data-sub]');
    if (subBtn) { rec.sub = subBtn.dataset.sub; rec.extra = {}; return renderFields(); }

    const prioBtn = e.target.closest('[data-prio]');
    if (prioBtn) { rec.priority = prioBtn.dataset.prio; return renderFields(); }

    const enBtn = e.target.closest('[data-energy]');
    if (enBtn) { rec.energy = enBtn.dataset.energy; rec.energyBy = 'manual'; return renderFields(); }

    const ioBtn = e.target.closest('[data-inout]');
    if (ioBtn) {
      const next = ioBtn.dataset.inout === 'in';
      if (next !== rec.isIncome) {
        rec.isIncome = next;
        rec.category = next ? '其他收入' : '其他';
      }
      return renderFields();
    }

    const rateBtn = e.target.closest('[data-rating]');
    if (rateBtn) { rec.rating = rec.rating === rateBtn.dataset.rating ? null : rateBtn.dataset.rating; return renderFields(); }

    const msubBtn = e.target.closest('[data-msub]');
    if (msubBtn) { rec.subType = msubBtn.dataset.msub; return renderFields(); }

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;

    // 删除（仅编辑已有记录时出现）：二次确认，防误删
    if (act === 'delete') {
      stopTimer();
      const ok = await confirmSheet({
        title: '删除这条记录？',
        message: '删除后不可恢复',
        okText: '删除',
        danger: true,
      });
      if (ok) {
        deleteRecord(rec.id);
        toast('已删除 ✓');
        setTimeout(() => go('home', {}, { replace: true }), 400);
      }
      return;
    }

    stopTimer();
    await handleAct(act);
    renderFields();
    resetTimer();
    if (!saved && !isEdit) { stopTimer(); raf = requestAnimationFrame(tick); }
  });

  async function handleAct(act) {
    switch (act) {
      case 'back': return back();
      case 'save-now': return commit();

      case 'category': {
        const v = await pickSheet({
          title: rec.isIncome ? '这笔收入算哪一类？' : '这笔算哪一类？',
          options: rec.isIncome ? INCOME_CATS : CATEGORIES,
          current: rec.category,
        });
        if (v) {
          rec.category = v;
          // 手动切到餐饮时补一次热量估算
          if (!rec.isIncome && v === '餐饮' && rec.foods === undefined) {
            const foods = parseFoods(rec.raw || '');
            rec.foods = foods;
            rec.kcal = foods.length ? sumFoods(foods) : null;
            rec.kcalBy = 'auto';
          }
        }
        break;
      }
      case 'foods': {
        const v = await editSheet({
          title: '吃了什么？一行一样',
          value: foodsToLines(rec.foods),
          multiline: true,
          placeholder: '鸡蛋 78\n豆浆 90\n（只写名字也行，会自动估热量）',
        });
        if (v !== null) {
          rec.foods = parseFoodLines(v);
          rec.kcal = rec.foods.length ? sumFoods(rec.foods) : null;
          rec.kcalBy = 'manual';
        }
        break;
      }
      case 'kcal': {
        const v = await editSheet({ title: '这顿大概多少千卡？', value: rec.kcal ?? '', type: 'number', placeholder: '例如 560' });
        if (v !== null && v !== '') { rec.kcal = Math.round(Number(v)); rec.kcalBy = 'manual'; }
        else if (v === '') { rec.kcal = null; }
        break;
      }
      case 'activities': {
        const v = await editSheet({
          title: '做了什么运动？一行一个',
          value: activitiesToLines(rec.activities),
          multiline: true,
          placeholder: '跑步机 40分钟\n力量训练 30分钟',
        });
        if (v !== null) {
          const weight = getSettings().weightKg || 60;
          rec.activities = parseActivityLines(v, weight);
          rec.burn = rec.activities.length ? sumBurn(rec.activities) : null;
          rec.burnBy = 'manual';
        }
        break;
      }
      case 'burn': {
        const v = await editSheet({ title: '这次消耗多少千卡？', value: rec.burn ?? '', type: 'number', placeholder: '例如 430' });
        if (v !== null && v !== '') { rec.burn = Math.round(Number(v)); rec.burnBy = 'manual'; }
        else if (v === '') { rec.burn = null; }
        break;
      }
      case 'weight-val': {
        const v = await editSheet({ title: '体重是多少 kg？', value: rec.weight ?? '', type: 'number', placeholder: '例如 65.0' });
        if (v !== null && v !== '') { const w = Math.round(Number(v) * 10) / 10; if (Number.isFinite(w) && w > 0) rec.weight = w; else toast('请输入有效体重'); }
        else if (v === '') rec.weight = null;
        break;
      }
      case 'wnote': { const v = await editSheet({ title: '备注', value: rec.note ?? '', placeholder: '想记点什么…' }); if (v !== null) rec.note = v || ''; break; }

      case 'amount': {
        const v = await editSheet({ title: '金额是多少？', value: rec.amount ?? '', type: 'number', placeholder: '例如 88.5' });
        if (v !== null && v !== '') rec.amount = Number(v); break;
      }
      case 'place':  { const v = await editSheet({ title: '在哪儿？', value: rec.place ?? '', placeholder: '例如 国广' }); if (v !== null) rec.place = v || null; break; }
      case 'brand':  { const v = await editSheet({ title: '哪家店 / 什么牌子？', value: rec.brand ?? '', placeholder: '例如 安寿司' }); if (v !== null) rec.brand = v || null; break; }
      case 'title':  { const v = await editSheet({ title: '写清楚一点', value: rec.title ?? '' }); if (v) rec.title = v; break; }
      case 'mmdd':   {
        const v = await editSheet({ title: '几月几号？（每年重复）', value: rec.mmdd ?? '01-01', placeholder: '例如 05-20' });
        if (v && /^\d{1,2}[-\/.]\d{1,2}$/.test(v.trim())) {
          const [m, d] = v.trim().split(/[-\/.]/).map(n => String(n).padStart(2, '0'));
          rec.mmdd = `${m}-${d}`;
        } else if (v !== null) {
          toast('日期格式不对，用 05-20 这种');
        }
        break;
      }
      case 'year':   {
        const v = await editSheet({ title: '出生 / 起始年份？', value: rec.year ?? '', type: 'number', placeholder: '例如 1990（可不填）' });
        if (v === '') rec.year = null;
        else if (v != null && v !== '' && Number.isFinite(+v)) rec.year = +v;
        break;
      }
      case 'memo':   { const v = await editSheet({ title: '备注', value: rec.note ?? '', placeholder: '想记点什么…' }); if (v !== null) rec.note = v || ''; break; }
      case 'estcost':{ const v = await editSheet({ title: '大概要花多少？', value: rec.estCost ?? '', type: 'number', placeholder: '例如 8000' }); if (v !== null && v !== '') rec.estCost = Number(v); break; }

      case 'idea':    { const v = await editSheet({ title: '核心想法是什么？', value: rec.idea ?? '', multiline: true, placeholder: '一句话讲清这个想法…' }); if (v !== null) rec.idea = v || null; break; }
      case 'progress':{ const v = await editSheet({ title: '现在进展到哪了？', value: rec.progress ?? '', multiline: true, placeholder: '比如：刚起步 / 已完成 30% / 搁置中' }); if (v !== null) rec.progress = v || null; break; }
      case 'reason':  { const v = await editSheet({ title: '为什么想做这个？', value: rec.reason ?? '', multiline: true, placeholder: '动机、初衷、想解决什么问题…' }); if (v !== null) rec.reason = v || null; break; }

      case 'time': {
        const cur = new Date(rec.occurredAt);
        const pad = n => String(n).padStart(2, '0');
        const v = await editSheet({
          title: '什么时候？',
          value: `${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(cur.getDate())}T${pad(cur.getHours())}:${pad(cur.getMinutes())}`,
          type: 'datetime-local',
        });
        if (v) { const d = new Date(v); if (!isNaN(d)) rec.occurredAt = d.toISOString(); }
        break;
      }

      case 'planweek': {
        const v = await weekPicker(rec.planWeek);
        if (v) rec.planWeek = v; break;
      }

      case 'photo': {
        const file = await pickImage();
        if (file) {
          const dataUrl = await shrinkImage(file);
          rec.photos = [...(rec.photos || []), dataUrl];
        }
        break;
      }

      default:
        if (act.startsWith('x-')) {
          const map = { 'x-transport':['transport','交通怎么走'], 'x-stay':['stay','住哪儿'], 'x-spots':['spots','想去哪些地方'],
                        'x-address':['address','地址'], 'x-queue':['queue','排队情况'], 'x-must':['mustOrder','必点什么'],
                        'x-necessity':['necessity','有多必要'] };
          const [key, title] = map[act] || [];
          if (!key) break;
          rec.extra = rec.extra || {};
          if (key === 'necessity') {
            const v = await pickSheet({ title: '有多必要？', options: ['必买','可选','观望'], current: rec.extra.necessity });
            if (v) rec.extra.necessity = v;
          } else {
            const v = await editSheet({ title, value: rec.extra[key] ?? '' });
            if (v !== null) rec.extra[key] = v || undefined;
          }
        } else if (act.startsWith('n-')) {
          const map = { 'n-targetUser':['targetUser','目标用户是谁'], 'n-platform':['platform','跑在哪个平台'],
                        'n-style':['style','小说风格'], 'n-genre':['genre','类型'], 'n-protagonist':['protagonist','主角叫什么'],
                        'n-outline':['outline','大纲/设定'], 'n-goal':['goal','想达到什么目标'], 'n-source':['source','资料从哪来'] };
          const [key, title] = map[act] || [];
          if (!key) break;
          rec.extra = rec.extra || {};
          const v = await editSheet({ title, value: rec.extra[key] ?? '', multiline: true });
          if (v !== null) rec.extra[key] = v || undefined;
        }
    }
  }

  renderTypes();
  renderFields();
  if (!isEdit) raf = requestAnimationFrame(tick);
  return el;
}

/* —— 年月第几周 三段式选择器 —— */
function weekPicker(current) {
  return new Promise(resolve => {
    const now = new Date();
    let year  = current?.year  || now.getFullYear();
    let month = current?.month || now.getMonth() + 1;
    let ws = current?.weekStart || 1;
    let we = current?.weekEnd || ws;
    let pendingStart = true;

    const host = document.getElementById('app');
    const mask = h(`<div class="modal-mask"><div class="modal"></div></div>`);
    const modal = mask.querySelector('.modal');
    host.appendChild(mask);

    function draw() {
      const nw = weeksInMonth(year, month);
      if (ws > nw) ws = nw;
      if (we > nw) we = nw;
      modal.innerHTML = `
        <div class="modal-title">预计什么时候</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <button class="chip sm" data-y="-1">‹</button>
          <span style="font-size:var(--fs-lg);font-weight:600">${year} 年</span>
          <button class="chip sm" data-y="1">›</button>
        </div>
        <div class="chip-row" style="margin-bottom:16px">
          ${Array.from({length:12}, (_,i) => i+1).map(m =>
            `<button class="chip sm ${m===month?'on lav':''}" data-m="${m}" style="min-width:52px;justify-content:center">${m}月</button>`).join('')}
        </div>
        <div style="font-size:var(--fs-sm);color:var(--text-2);margin-bottom:8px">
          第几周 · 点两次可选区间
        </div>
        <div class="chip-row" style="margin-bottom:16px">
          ${Array.from({length:nw}, (_,i) => i+1).map(w =>
            `<button class="chip sm ${(w>=ws&&w<=we)?'on':''}" data-w="${w}">第${w}周</button>`).join('')}
        </div>
        <div style="text-align:center;font-size:var(--fs-md);font-weight:600;color:var(--pink-400);margin-bottom:16px">
          ${formatWeekRange({ year, month, weekStart: ws, weekEnd: we })}
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="cancel">取消</button>
          <button class="btn btn-primary" data-act="ok">就这样</button>
        </div>`;
    }

    mask.addEventListener('click', e => {
      if (e.target === mask) { mask.remove(); return resolve(null); }
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.y) { year += +t.dataset.y; return draw(); }
      if (t.dataset.m) { month = +t.dataset.m; ws = we = 1; pendingStart = true; return draw(); }
      if (t.dataset.w) {
        const w = +t.dataset.w;
        if (pendingStart) { ws = we = w; pendingStart = false; }
        else { if (w >= ws) we = w; else { ws = w; we = w; } pendingStart = true; }
        return draw();
      }
      if (t.dataset.act === 'cancel') { mask.remove(); return resolve(null); }
      if (t.dataset.act === 'ok') { mask.remove(); return resolve({ year, month, weekStart: ws, weekEnd: we }); }
    });

    draw();
  });
}

/* —— 图片选择与压缩（避免撑爆本地存储） —— */
function pickImage() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => resolve(inp.files?.[0] || null);
    inp.click();
  });
}

function shrinkImage(file, max = 720, quality = .72) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
