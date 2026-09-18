/* ============================================================
   必须记 · 应用主逻辑
   - 路由管理
   - 页面渲染
   - 事件绑定
   - 滑动手势（左滑返回上一级，但不退出 App）
   ============================================================ */

(function (global) {
  'use strict';

  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const fmt = (n) => (n >= 0 ? '+' : '−') + '¥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const u = { utils: window.MustRecord.utils };
  const store = window.MustRecord.store;
  const parser = window.MustRecord.parser;

  /** ============== 启动 ============== */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    detectPlatform();
    bindGlobalEvents();
    bindHomeEvents();
    bindPredictEvents();
    bindDetailEvents();
    bindDesktopEvents();
    renderHome();
    renderDesktop();

    // 订阅数据变化
    store.subscribe((s) => {
      renderHome(s);
      renderDesktop(s);
    });
  }

  /** ============== 平台检测 ============== */
  function detectPlatform() {
    const w = window.innerWidth;
    if (w >= 1024) {
      document.body.dataset.platform = 'desktop';
      $('#desktopShell').hidden = false;
      $('#phoneShell').hidden = true;
    } else {
      document.body.dataset.platform = 'phone';
      $('#desktopShell').hidden = true;
      $('#phoneShell').hidden = false;
    }
  }
  window.addEventListener('resize', debounce(detectPlatform, 200));

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), ms);
    };
  }

  /** ============== 全局事件 ============== */
  function bindGlobalEvents() {
    // 状态栏时间
    function tick() {
      const d = new Date();
      const z = (n) => (n < 10 ? '0' + n : n);
      $('#sbTime').textContent = `${d.getHours()}:${z(d.getMinutes())}`;
      $('#homeDate').textContent = formatHomeDate(d);
      $('#dsDate').textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`;
    }
    tick(); setInterval(tick, 30 * 1000);
  }

  function formatHomeDate(d) {
    const w = '日一二三四五六'[d.getDay()];
    return `${d.getMonth()+1}月${d.getDate()}日 星期${w} · 双端已实时同步`;
  }

  /** ============== 首页渲染 ============== */
  function renderHome(s) {
    if (!s) s = store.state;
    const today = u.utils.dateKey(new Date());
    // 体重：今日已记录 → 显示"今日已记录 · 已归档并隐藏"
    const todayWeight = s.weight.history.find(h => h.d === today);
    renderWeight(todayWeight);
    // 纪念日
    renderAnniversary(s, today);
    // 待办
    renderTodos(s);
    // 收支
    renderMoney(s, today);
  }

  function renderWeight(todayWeight) {
    const body = $('#weightBody');
    if (todayWeight) {
      body.innerHTML = `
        <div class="weight-current">
          <span class="wc-val">${todayWeight.v.toFixed(1)}</span>
          <span class="wc-unit">kg</span>
          <span class="meta" style="margin-left:8px">已归档 · 今日不再显示</span>
        </div>`;
      $('#weightHint').textContent = '今日已记录';
    } else {
      body.innerHTML = `
        <div class="weight-input-row">
          <div class="weight-input">
            <input type="number" step="0.1" id="weightInput" placeholder="输入体重，如 68.4" />
            <span class="meta" style="color:var(--text-mute)">kg</span>
          </div>
          <button class="weight-save" id="weightSave">记录</button>
        </div>`;
      bindWeightSave();
    }
  }
  function bindWeightSave() {
    $('#weightSave').addEventListener('click', () => {
      const v = parseFloat($('#weightInput').value);
      if (!v || v < 20 || v > 300) {
        toast('请输入合理的体重数值');
        return;
      }
      store.setTodayWeight(v);
      toast('体重已记录 · 已归档并隐藏');
    });
  }

  function renderAnniversary(s, today) {
    const card = $('#anniversaryCard');
    card.hidden = true;
    const soon = s.reminders.find(r => {
      const d = new Date(r.date);
      const diff = (d - new Date(today)) / 86400000;
      return r.type === 'anniversary' && diff > 0 && diff <= (r.lead || 15);
    });
    if (!soon) return;
    const days = Math.round((new Date(soon.date) - new Date(today)) / 86400000);
    card.hidden = false;
    card.innerHTML = `
      <div class="ann-cake">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 17.5h14v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6z" stroke="#D89575" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M7.5 9.5V7M12.5 9.5V7" stroke="#D89575" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="7.5" cy="5.5" r="0.9" fill="#D89575"/>
          <circle cx="12.5" cy="5.5" r="0.9" fill="#D89575"/>
        </svg>
      </div>
      <div class="ann-text">
        <p class="ann-title">${soon.title} · ${soon.date.slice(5)}</p>
        <p class="ann-sub">还有 ${days} 天 · 已提前推送至今日待办</p>
      </div>`;
  }

  function renderTodos(s) {
    const ul = $('#todoList');
    const today = u.utils.dateKey(new Date());
    const list = s.todos.filter(t => t.d === today);
    $('#todoCount').textContent = `${list.filter(x => !x.done).length} 项待完成`;
    ul.innerHTML = list.map(t => `
      <li class="todo-row ${t.done ? 'done' : ''}" data-id="${t.id}">
        <button class="todo-check ${t.done ? 'done' : ''}" data-toggle="${t.id}"></button>
        <div class="todo-body">
          <span class="todo-title">${escapeHtml(t.title)}</span>
          <span class="todo-meta">${escapeHtml(t.meta)}</span>
        </div>
        <button class="icon-btn" data-del="${t.id}" style="opacity:.5">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="#A8A49C" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
      </li>
    `).join('');

    $$('[data-toggle]').forEach(b => b.addEventListener('click', () => store.toggleTodo(b.dataset.toggle)));
    $$('[data-del]').forEach(b => b.addEventListener('click', () => store.removeTodo(b.dataset.del)));
  }

  function renderMoney(s, today) {
    const list = s.tx.filter(x => x.d === today);
    const income = list.filter(x => x.type === 'income').reduce((a, b) => a + b.amount, 0);
    const expense = list.filter(x => x.type === 'expense').reduce((a, b) => a + b.amount, 0);
    $('#homeIncome').textContent = fmt(income);
    $('#homeExpense').textContent = fmt(-expense);
  }

  /** ============== 首页事件 ============== */
  function bindHomeEvents() {
    $('#detailEntry').addEventListener('click', openDetail);
    $('#addTodoBtn').addEventListener('click', () => {
      const t = prompt('请输入待办内容：');
      if (t && t.trim()) {
        store.addTodo({ title: t.trim(), meta: '手动添加' });
        toast('已加入今日待办');
      }
    });
    // 底部输入 → 进入预判
    $('#inputField').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = e.target.value.trim();
        if (!v) return;
        openPredict(v);
      }
    });
    // 输入框 + 号（顺便聚焦输入框）
    $('#inputPlus').addEventListener('click', () => $('#inputField').focus());
  }

  /** ============== 预判弹窗 ============== */
  let predictResult = null;
  function openPredict(text) {
    const r = parser.predict(text);
    if (!r) return;
    predictResult = r;
    $('#echoValue').textContent = r.raw;
    // chips
    const chips = $('#predictChips');
    chips.innerHTML = r.chips.map((c, i) =>
      `<button class="chip-cat ${i === 0 ? 'active' : ''}" data-cat="${c.id}">${c.label}</button>`
    ).join('');
    $$('.chip-cat', chips).forEach(b => b.addEventListener('click', () => {
      $$('.chip-cat', chips).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      predictResult.primary = b.dataset.cat;
    }));
    // parse
    $('#parseRow').innerHTML = r.parse.map(p =>
      `<div class="parse-col"><span class="pl">${p.label}</span><span class="pv ${p.positive ? 'ok' : ''}">${p.value}</span></div>`
    ).join('');
    showScreen('predict');
    // 清空输入
    $('#inputField').value = '';
  }
  function bindPredictEvents() {
    $('#predictCancel').addEventListener('click', closeModal);
    $('#predictSave').addEventListener('click', () => {
      if (!predictResult) return closeModal();
      const p = predictResult.primary;
      const store2 = store;
      if (p === 'money' && predictResult.amount !== null) {
        store2.addTx({
          type: 'expense',
          amount: predictResult.amount,
          title: predictResult.raw,
          category: parser.inferCategory(predictResult.raw),
        });
        toast('已记录收支');
      } else if (p === 'meal') {
        store2.addMeal({
          name: predictResult.raw,
          kcal: parser.estimateKcal(predictResult.raw),
        });
        toast('已记录餐食热量');
      } else if (p === 'wish') {
        store2.addWish({
          cat: 'goal',
          title: predictResult.raw,
          desc: '',
        });
        toast('已加入愿望单');
      } else if (p === 'note') {
        store2.addNote({ type: 'note', title: predictResult.raw });
        toast('已加入记事');
      } else if (p === 'reminder' && predictResult.date) {
        store2.addReminder({ title: predictResult.raw, date: predictResult.date, lead: 7 });
        toast('已保存提醒');
      } else {
        // 待办
        store2.addTodo({ title: predictResult.raw, meta: '智能预判录入' });
        toast('已加入今日待办');
      }
      closeModal();
    });
  }

  /** ============== 通用 Modal ============== */
  function showScreen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = document.querySelector(`.screen[data-screen="${name}"]`);
    if (el) el.classList.add('active');
    history.pushState({ screen: name }, '');
  }
  function closeModal() {
    $$('.screen.screen-modal.active').forEach(s => s.classList.remove('active'));
    $('#home').classList.add('active');
  }

  // popstate（浏览器后退）
  window.addEventListener('popstate', () => {
    if ($$('.screen.screen-modal.active').length) {
      closeModal();
      history.pushState({}, '');
    }
  });

  // 左滑返回上一级
  function bindSwipeBack() {
    const viewports = $$('.screen-modal');
    viewports.forEach(v => {
      let startX = 0, curX = 0, swiping = false, t0 = 0;
      v.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        startX = t.clientX; curX = startX; swiping = true; t0 = Date.now();
      }, { passive: true });
      v.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        curX = e.touches[0].clientX;
        const dx = curX - startX;
        if (dx < 0 && dx > -160) {
          v.style.transform = `translateX(${dx}px)`;
          v.style.transition = 'none';
        }
      }, { passive: true });
      v.addEventListener('touchend', () => {
        if (!swiping) return;
        swiping = false;
        const dx = curX - startX;
        const dt = Date.now() - t0;
        v.style.transition = 'transform .2s ease';
        v.style.transform = '';
        if (dx < -80 && dt < 1000) {
          closeModal();
          history.replaceState({}, '');
        }
      });
    });
  }

  /** ============== 明细弹窗 ============== */
  function openDetail() {
    showScreen('ledger');
    renderLedger('day');
  }
  function bindDetailEvents() {
    bindSwipeBack();
    $$('[data-close]').forEach(b => b.addEventListener('click', closeModal));
    $$('.modal-head [data-close]').forEach(b => b.addEventListener('click', closeModal));

    $$('[data-period]').forEach(b => b.addEventListener('click', () => {
      $$('[data-period]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderLedger(b.dataset.period);
    }));
    $$('[data-wrange]').forEach(b => b.addEventListener('click', () => {
      $$('[data-wrange]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderWeightDetail(b.dataset.wrange);
    }));
    $$('[data-crange]').forEach(b => b.addEventListener('click', () => {
      $$('[data-crange]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderCalorieDetail(b.dataset.crange);
    }));
    $$('[data-nav]').forEach(b => b.addEventListener('click', () => {
      toast(`已切换到${b.dataset.nav === 'prev' ? '上一' : '下一'}期`);
    }));
  }

  /** ----- 记账 ----- */
  function renderLedger(period) {
    const now = new Date();
    const labelByPeriod = { day: '今日', week: '本周', month: '本月', year: '本年' };
    $('#ledgerSummaryLabel').textContent = `${labelByPeriod[period]}汇总`;
    $('#ledgerMonth').textContent = `${now.getFullYear()}年${now.getMonth()+1}月`;

    let list = store.state.tx;
    if (period === 'day') list = list.filter(t => t.d === u.utils.dateKey(now));
    else if (period === 'month') list = list.filter(t => new Date(t.d).getMonth() === now.getMonth());

    const income = list.filter(x => x.type === 'income').reduce((a, b) => a + b.amount, 0);
    const expense = list.filter(x => x.type === 'expense').reduce((a, b) => a + b.amount, 0);
    $('#ledgerIncome').textContent = fmt(income);
    $('#ledgerExpense').textContent = fmt(-expense);
    $('#ledgerNet').textContent = `结余 ${fmt(income - expense)}`;

    // 分类汇总
    const grouped = {};
    list.forEach(t => { grouped[t.category] = grouped[t.category] || { count: 0, amount: 0 }; grouped[t.category].count++; grouped[t.category].amount += t.amount; });
    const cats = Object.entries(grouped).map(([name, g]) => ({ name, count: g.count, amount: g.amount })).sort((a, b) => b.amount - a.amount);
    const colors = { '餐饮':'warm', '交通':'green', '购物':'cream', '居家':'green', '娱乐':'warm', '收入':'green' };
    $('#categoryList').innerHTML = cats.length ? cats.map(c => `
      <div class="cat-row">
        <div class="cat-icon ${colors[c.name] || 'green'}">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/></svg>
        </div>
        <span class="cat-name">${c.name} · ${c.count} 笔</span>
        <span class="cat-amount">−${c.amount.toFixed(2)}</span>
      </div>
    `).join('') : '<p class="ds-empty-state">暂无记录</p>';
  }

  /** ----- 体重详情 ----- */
  function renderWeightDetail(rng) {
    const w = store.state.weight;
    const days = parseInt(rng, 10);
    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - (days - 1));
    const list = w.history.filter(h => new Date(h.d) >= start).sort((a, b) => a.d.localeCompare(b.d));
    const cur = list[list.length - 1];
    const prev = list[0];
    const delta = cur && prev ? (cur.v - prev.v).toFixed(1) : '0';

    $('#weightStats').innerHTML = `
      <div class="wst-col"><span class="wst-label">当前体重</span><span class="wst-value">${cur ? cur.v.toFixed(1) : '-'} kg</span></div>
      <div class="wst-col"><span class="wst-label">较${rng==='7'?'周':'期'}初</span><span class="wst-value green">${delta} kg</span></div>
      <div class="wst-col"><span class="wst-label">目标</span><span class="wst-value muted">${w.goal.toFixed(1)} kg</span></div>
    `;

    // 简化折线
    if (list.length === 0) {
      $('#weightChart').innerHTML = '<p class="ds-empty-state">暂无数据</p>';
      $('#weightXLabels').innerHTML = '';
    } else {
      const W = 303, H = 170, pad = 20;
      const xs = list.map((_, i) => pad + (W - pad * 2) * i / Math.max(1, list.length - 1));
      const ys = list.map(h => {
        const vs = list.map(x => x.v);
        const min = Math.min(...vs) - 0.5, max = Math.max(...vs) + 0.5;
        return H - pad - ((h.v - min) / Math.max(0.01, (max - min))) * (H - pad * 2);
      });
      const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
      const area = `${path} L ${xs[xs.length-1].toFixed(1)} ${(H - pad).toFixed(1)} L ${xs[0].toFixed(1)} ${(H - pad).toFixed(1)} Z`;
      $('#weightChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <path d="${area}" fill="#3D8A5A" fill-opacity="0.07"/>
        <path d="${path}" stroke="#3D8A5A" stroke-width="2" fill="none" stroke-linecap="round"/>
        ${xs.map((x, i) => `<circle cx="${x}" cy="${ys[i]}" r="3.5" fill="#fff" stroke="#3D8A5A" stroke-width="2"/>`).join('')}
        <circle cx="${xs[xs.length-1]}" cy="${ys[ys.length-1]}" r="4.5" fill="#3D8A5A" stroke="#fff" stroke-width="2"/>
        <text x="${xs[xs.length-1] - 30}" y="${ys[ys.length-1] - 8}" font-family="Inter" font-size="11" font-weight="600" fill="#1A1918">${cur.v.toFixed(1)}</text>
        <path d="M${pad} ${pad} H${W-pad}" stroke="#EFECE6" stroke-width="1" stroke-dasharray="3 4"/>
        <path d="M${pad} ${(H-pad)/2} H${W-pad}" stroke="#EFECE6" stroke-width="1" stroke-dasharray="3 4"/>
      </svg>`;
      // X labels
      const stride = Math.max(1, Math.floor(list.length / 7));
      $('#weightXLabels').innerHTML = list.map((h, i) => {
        const label = `${+h.d.slice(5,7)}/${+h.d.slice(8,10)}`;
        const isLast = i === list.length - 1;
        return `<span class="${isLast ? 'today' : ''}">${label}</span>`;
      }).filter((_, i) => i % stride === 0 || i === list.length - 1).join('');
    }

    const todayW = w.history.find(h => h.d === u.utils.dateKey(new Date()));
    $('#weightArchivedHint').textContent = todayW ? `今日 ${todayW.v.toFixed(1)} kg 已记录 · 已归档并从首页隐藏` : '今日尚未记录体重';
  }

  /** ----- 餐食热量 ----- */
  function renderCalorieDetail(rng) {
    const today = u.utils.dateKey(new Date());
    const meals = store.state.meals.filter(m => m.d === today);
    const total = meals.reduce((a, b) => a + b.kcal, 0);
    const goal = store.state.calorieGoal;

    $('#calStats').innerHTML = `
      <div class="cal-col"><span class="cal-label">今日摄入</span><span class="cal-value">${total.toLocaleString()} kcal</span></div>
      <div class="cal-col"><span class="cal-label">每日目标</span><span class="cal-value muted">${goal.toLocaleString()} kcal</span></div>
      <div class="cal-col"><span class="cal-label">还可摄入</span><span class="cal-value green">${Math.max(0, goal-total).toLocaleString()} kcal</span></div>
    `;
    $('#calFill').style.width = Math.min(100, total / goal * 100) + '%';

    // 7 日柱状图（演示）
    const days = ['一','二','三','四','五','六','日'];
    const data = [2050, 1980, 1750, 1860, 2120, 1670, 1920];
    const W = 303, H = 180, pad = 26;
    const maxV = Math.max(...data);
    $('#calChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${pad} ${pad} H${W-pad}" stroke="#D89575" stroke-width="1.2" stroke-dasharray="4 4"/>
      ${data.map((v, i) => {
        const barW = 26, gap = 14;
        const x = pad + i * (barW + gap);
        const h = (v / maxV) * (H - pad - 20);
        const y = H - pad - h;
        const isToday = i === 3;
        return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${isToday ? '#2E6B45' : '#3D8A5A'}" fill-opacity="${isToday ? 1 : 0.35}"/>
                <text x="${x + barW/2}" y="${H - 6}" font-family="Inter" font-size="10" fill="${isToday ? '#2E6B45' : '#A8A49C'}" font-weight="${isToday ? '600' : '400'}" text-anchor="middle">${days[i]}</text>`;
      }).join('')}
      <text x="${pad + 3*(26+14) + 13}" y="${pad - 8}" font-family="Inter" font-size="11" font-weight="600" fill="#2E6B45" text-anchor="middle">${data[3]}</text>
    </svg>`;

    $('#mealsCard').innerHTML = meals.length ? meals.map(m => `
      <div class="meal-row">
        <span class="meal-name">${escapeHtml(m.name)}</span>
        <span class="meal-val">${m.kcal}</span>
      </div>
    `).join('') : '<p class="ds-empty-state">暂无记录</p>';
  }

  /** ----- 愿望单横向列表 ----- */
  function openWishes() {
    showScreen('wishes');
    const today = u.utils.dateKey(new Date());
    const list = store.state.wishes.map(w => ({ ...w, days: daysBetween(w.until, today) })).sort((a, b) => a.days - b.days);
    $('#wishCount').textContent = `${list.length} 个愿望 · 按期望时间排序`;
    $('#wishScroll').innerHTML = list.map(w => `
      <div class="wish-card" data-id="${w.id}">
        <span class="wish-tag ${w.cat}">${({travel:'旅行',goal:'愿望',note:'记事'})[w.cat]||'愿望'}</span>
        <p class="wish-title">${escapeHtml(w.title)}</p>
        <p class="wish-meta">记录时间 ${w.created}<br/>期望完成 ${w.until}</p>
        <span class="wish-days" style="background:${w.days < 60 ? '#FBEFE8' : (w.cat==='goal' ? '#EAF3ED' : '#F5F0E8')};color:${w.days < 60 ? '#C0704D' : (w.cat==='goal' ? '#3D8A5A' : '#A98D5C')}">剩余 ${w.days} 天</span>
      </div>
    `).join('');
    $$('.wish-card').forEach(c => c.addEventListener('click', () => openWishDetail(c.dataset.id)));
  }
  function openWishDetail(id) {
    const w = store.state.wishes.find(x => x.id === id);
    if (!w) return;
    const today = u.utils.dateKey(new Date());
    const total = Math.max(1, daysBetween(w.created, w.until));
    const passed = Math.max(0, Math.min(total, daysBetween(w.created, today)));
    const pct = Math.round(passed / total * 100);
    showScreen('wishDetail');
    $('#wishDetailBody').innerHTML = `
      <div class="card wish-hero">
        <span class="wish-tag ${w.cat}" style="align-self:flex-start">${({travel:'旅行',goal:'愿望',note:'记事'})[w.cat]||'愿望'}</span>
        <p class="wish-hero-title">${escapeHtml(w.title)}</p>
        <p class="wish-hero-desc">${escapeHtml(w.desc || '点击右上角编辑补充描述')}</p>
      </div>
      <div class="card wish-timeline">
        <div class="wt-row"><span class="wt-label">记录时间</span><span class="wt-value">${w.created}</span></div>
        <div class="wt-row"><span class="wt-label">期望完成时间</span><span class="wt-value">${w.until}</span></div>
        <div class="wt-row"><span class="wt-label">剩余天数</span><span class="wt-value" style="color:#C0704D">${daysBetween(w.until, today)} 天</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <p class="meta" style="text-align:right">已坚持 ${passed} 天 · 时间进度 ${pct}%</p>
      </div>
      <div class="card wish-related">
        <div class="wish-related-head"><span class="h">相关记录</span></div>
        <div class="wish-rel-row"><span class="wish-rel-dot green"></span><span class="wish-rel-text">关联记事 · 9月存钱 ¥1,500 已完成</span></div>
        <div class="wish-rel-row"><span class="wish-rel-dot warm"></span><span class="wish-rel-text">关联待办 · 对比机票与雪祭门票</span></div>
      </div>
      <div class="detail-buttons">
        <button class="btn btn-primary">标记已完成</button>
        <button class="btn btn-outline">加入今日待办</button>
      </div>
    `;
    $$('.detail-buttons .btn-outline').forEach(b => b.addEventListener('click', () => {
      store.addTodo({ title: '推进：' + w.title, meta: '愿望关联' });
      toast('已加入今日待办');
    }));
    $$('.detail-buttons .btn-primary').forEach(b => b.addEventListener('click', () => {
      store.setWishProgress(w.id, 100);
      toast('已标记完成');
      closeModal();
    }));
  }

  function daysBetween(a, b) {
    return Math.round((new Date(a) - new Date(b)) / 86400000);
  }

  /** ============== 桌面端 ============== */
  function bindDesktopEvents() {
    // 用事件委托，避免 innerHTML 重渲染后丢失事件
    $('#desktopShell').addEventListener('click', (e) => {
      const nav = e.target.closest('.ds-nav');
      if (nav) {
        $$('.ds-nav').forEach(x => x.classList.remove('active'));
        nav.classList.add('active');
        renderDesktopPane(nav.dataset.dstab || 'home');
        return;
      }
      const toggle = e.target.closest('[data-toggle]');
      if (toggle) {
        store.toggleTodo(toggle.dataset.toggle);
      }
    });
  }
  function renderDesktopPane(tab = 'home') {
    const m = $('#dsMain');
    if (tab === 'home' || !tab) {
      m.innerHTML = desktopHomeView();
    } else if (tab === 'ledger') {
      m.innerHTML = `<h2 class="ds-greeting">记账明细</h2>${desktopLedgerView()}`;
    } else if (tab === 'weight') {
      m.innerHTML = `<h2 class="ds-greeting">体重</h2>${desktopWeightView()}`;
    } else if (tab === 'calorie') {
      m.innerHTML = `<h2 class="ds-greeting">餐食热量</h2>${desktopCalorieView()}`;
    } else if (tab === 'wishes') {
      m.innerHTML = `<h2 class="ds-greeting">愿望单</h2>${desktopWishesView()}`;
    } else if (tab === 'notes') {
      m.innerHTML = `<h2 class="ds-greeting">记事</h2>${desktopEmptyView('在手机端底部输入「打包清单」「歌单」等关键词即可触发记事')}`;
    } else if (tab === 'reminder') {
      m.innerHTML = `<h2 class="ds-greeting">提醒</h2>${desktopReminderView()}`;
    }
  }
  function renderDesktop(s) {
    if (window.innerWidth < 1024) return;
    const today = u.utils.dateKey(new Date());
    s = s || store.state;
    // 顶部"刚刚同步"timestamp
    $('#dsSyncTime').textContent = '刚刚同步';

    const active = $$('.ds-nav.active')[0];
    const tab = active && active.dataset.dstab ? active.dataset.dstab : 'home';
    renderDesktopPane(tab);
  }
  function desktopHomeView() {
    const s = store.state;
    const today = u.utils.dateKey(new Date());
    const todayW = s.weight.history.find(h => h.d === today);
    const todayList = s.todos.filter(t => t.d === today);
    const todayTx = s.tx.filter(t => t.d === today);
    const todayMeals = s.meals.filter(m => m.d === today);
    const income = todayTx.filter(x => x.type === 'income').reduce((a,b)=>a+b.amount,0);
    const expense = todayTx.filter(x => x.type === 'expense').reduce((a,b)=>a+b.amount,0);
    const kcal = todayMeals.reduce((a,b)=>a+b.kcal,0);
    return `
      <h2 class="ds-greeting">下午好，今天也井井有条。</h2>
      <div class="ds-kpi-row">
        <div class="ds-kpi"><span class="ds-kpi-label">今日体重</span><span class="ds-kpi-value">${todayW ? todayW.v.toFixed(1) : '-'} kg</span><span class="ds-kpi-delta">${todayW?'较上周 −0.6 · 已归档':'点击首页右上角「明细」查看趋势'}</span></div>
        <div class="ds-kpi"><span class="ds-kpi-label">今日待办</span><span class="ds-kpi-value">${todayList.filter(x=>!x.done).length} 项</span><span class="ds-kpi-delta warm">${s.reminders.length} 项来自纪念日提醒</span></div>
        <div class="ds-kpi"><span class="ds-kpi-label">今日支出</span><span class="ds-kpi-value">¥${expense.toFixed(2)}</span><span class="ds-kpi-delta green">收入 +¥${income.toFixed(2)} · 结余为正</span></div>
        <div class="ds-kpi"><span class="ds-kpi-label">今日摄入</span><span class="ds-kpi-value">${kcal.toLocaleString()} kcal</span><span class="ds-kpi-delta">目标 ${s.calorieGoal} · 剩余 ${Math.max(0,s.calorieGoal-kcal)}</span></div>
      </div>
      <div class="ds-row2">
        <div class="ds-card">
          <div style="display:flex;justify-content:space-between"><span class="ds-card-title">今日待办</span><span class="meta">手机端同步 · ${todayList.filter(x=>!x.done).length} 项待完成</span></div>
          ${todayList.map(t => `
            <div class="ds-todo-row">
              <button class="todo-check ${t.done ? 'done' : ''}" data-toggle="${t.id}"></button>
              <span style="font-size:14px;font-weight:500;text-decoration:${t.done?'line-through':''};color:${t.done?'var(--text-mute)':'var(--text)'};flex:1">${escapeHtml(t.title)}</span>
            </div>
          `).join('') || '<p class="ds-empty-state">暂无待办</p>'}
        </div>
        <div class="ds-card">
          <div style="display:flex;justify-content:space-between"><span class="ds-card-title">今日收支</span><span class="meta">结余 ${fmt(income-expense)}</span></div>
          ${todayTx.map(t => `
            <div class="ds-money-row">
              <span style="font-size:14px;font-weight:500">${t.category} · ${escapeHtml(t.title)}</span>
              <span style="font-family:'JetBrains Mono',monospace;color:${t.type==='income'?'var(--income)':'var(--expense)'}">${t.type==='income'?'+':'−'}¥${t.amount.toFixed(2)}</span>
            </div>
          `).join('') || '<p class="ds-empty-state">暂无收支</p>'}
        </div>
      </div>
      <div class="ds-row2">
        <div class="ds-card">
          <span class="ds-card-title">每日体重变化 · 近7天</span>
          <div style="height:130px">${weightChartSvg()}</div>
        </div>
        <div class="ds-card">
          <span class="ds-card-title">愿望单</span>
          ${s.wishes.slice(0,4).map(w => `
            <div class="ds-money-row">
              <span style="font-size:14px;font-weight:500">${escapeHtml(w.title)}</span>
              <span style="font-family:'JetBrains Mono',monospace;color:var(--text-sub)">期望 ${w.until}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  function weightChartSvg() {
    const s = store.state.weight;
    const list = s.history.slice(-7);
    if (list.length === 0) return '<p class="ds-empty-state">暂无数据</p>';
    const W = 400, H = 130, pad = 10;
    const xs = list.map((_, i) => pad + (W - pad * 2) * i / Math.max(1, list.length - 1));
    const ys = list.map(h => {
      const vs = list.map(x => x.v); const mn = Math.min(...vs)-.5, mx = Math.max(...vs)+.5;
      return H - pad - ((h.v - mn) / Math.max(.01, (mx-mn))) * (H - pad * 2 - 10) - 10;
    });
    const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
    const area = `${path} L ${xs[xs.length-1].toFixed(1)} ${H - pad} L ${xs[0].toFixed(1)} ${H - pad} Z`;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
      <path d="${area}" fill="#3D8A5A" fill-opacity="0.07"/>
      <path d="${path}" stroke="#3D8A5A" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="${xs[xs.length-1]}" cy="${ys[ys.length-1]}" r="4" fill="#3D8A5A" stroke="#fff" stroke-width="2"/>
      <text x="${xs[xs.length-1]-30}" y="${ys[ys.length-1]-8}" font-family="Inter" font-size="11" font-weight="600" fill="#1A1918">${list[list.length-1].v.toFixed(1)}</text>
    </svg>`;
  }

  function desktopLedgerView() {
    const s = store.state;
    const today = u.utils.dateKey(new Date());
    const income = s.tx.filter(t=>t.type==='income'&&t.d===today).reduce((a,b)=>a+b.amount,0);
    const expense = s.tx.filter(t=>t.type==='expense'&&t.d===today).reduce((a,b)=>a+b.amount,0);
    return `
      <div class="card summary-card"><div class="card-row"><span class="card-label">今日汇总</span><span class="meta">结余 ${fmt(income-expense)}</span></div>
        <div class="money-cols"><div class="money-col"><span class="money-label">收入</span><span class="money-value income">${fmt(income)}</span></div>
          <div class="money-divider"></div><div class="money-col"><span class="money-label">支出</span><span class="money-value expense">${fmt(-expense)}</span></div>
        </div>
      </div>
      <div class="card category-list">
        ${s.tx.filter(t=>t.d===today).map(t => `
          <div class="cat-row"><div class="cat-icon green"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/></svg></div>
          <span class="cat-name">${t.category} · ${escapeHtml(t.title)}</span>
          <span class="cat-amount">${t.type==='income'?'+':'−'}${t.amount.toFixed(2)}</span>
          </div>`).join('') || '<p class="ds-empty-state">暂无记录</p>'}
      </div>
    `;
  }
  function desktopWeightView() {
    const s = store.state;
    const todayW = s.weight.history[s.weight.history.length - 1];
    return `
      <div class="card"><div class="card-row"><span class="card-label">体重历史</span><span class="meta">共 ${s.weight.history.length} 条</span></div>
        ${s.weight.history.map(h => `<div class="ds-money-row"><span style="font-family:'JetBrains Mono',monospace">${h.d}</span><span style="font-family:'JetBrains Mono',monospace">${h.v.toFixed(1)} kg</span></div>`).join('')}
      </div>
    `;
  }
  function desktopCalorieView() {
    const s = store.state;
    const today = u.utils.dateKey(new Date());
    const list = s.meals.filter(m => m.d === today);
    return `
      <div class="card"><div class="card-row"><span class="card-label">今日餐食</span><span class="meta">${list.reduce((a,b)=>a+b.kcal,0)} / ${s.calorieGoal} kcal</span></div>
        ${list.map(m => `<div class="ds-money-row"><span>${escapeHtml(m.name)}</span><span style="font-family:'JetBrains Mono',monospace">${m.kcal} kcal</span></div>`).join('') || '<p class="ds-empty-state">暂无记录</p>'}
      </div>
    `;
  }
  function desktopWishesView() {
    const s = store.state;
    return `
      ${s.wishes.map(w => `
        <div class="card" style="margin-bottom:12px">
          <span class="wish-tag ${w.cat}">${({travel:'旅行',goal:'愿望',note:'记事'})[w.cat]||'愿望'}</span>
          <p style="font-size:18px;font-weight:600;margin:8px 0">${escapeHtml(w.title)}</p>
          <p class="meta">记录 ${w.created} · 期望 ${w.until} · 剩余 ${daysBetween(w.until, u.utils.dateKey(new Date()))} 天</p>
          <p style="color:var(--text-sub);margin:8px 0 0">${escapeHtml(w.desc || '')}</p>
        </div>
      `).join('') || '<p class="ds-empty-state">暂无愿望 · 在手机端底部输入「想去北海道」即可触发</p>'}
    `;
  }
  function desktopReminderView() {
    const s = store.state;
    return `
      ${s.reminders.map(r => `
        <div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:12px">
          <div class="ann-cake" style="background:#FBEFE8;border-radius:7px;width:32px;height:32px;display:grid;place-items:center">🎂</div>
          <div style="flex:1"><p style="font-weight:600;margin:0">${r.title}</p><p class="meta" style="margin:2px 0 0">${r.date} · 提前 ${r.lead} 天推送</p></div>
        </div>
      `).join('') || '<p class="ds-empty-state">暂无提醒 · 在手机端底部输入「妈妈生日 10月2日」即可</p>'}
    `;
  }
  function desktopEmptyView(text) {
    return `<div class="card"><p class="ds-empty-state">${text}</p></div>`;
  }

  /** ============== 工具 ============== */
  function escapeHtml(s) {
    return (s || '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function toast(msg) {
    const host = $('#toastHost');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'all .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      setTimeout(() => el.remove(), 300);
    }, 1800);
  }

  // 调试入口
  global.MustRecord.openDetail = openDetail;
  global.MustRecord.openWishes = openWishes;
  global.MustRecord._openPredict = openPredict;
})(window);
