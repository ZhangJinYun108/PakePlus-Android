/* ============================================================
   必须记 · 数据层
   - 持久化：localStorage
   - 跨窗口实时同步：BroadcastChannel（同一设备）+ storage 事件兜底
   - 跨设备同步：内置云同步适配器（syncAdapter），可替换为
     WebSocket / Server-Sent Events / WebRTC / 第三方 BaaS
   ============================================================ */

(function (global) {
  'use strict';

  const NS = 'bixu_ji_v1';
  const KEY = `${NS}:state`;

  /** 默认数据 */
  function defaultState() {
    const today = dateKey(new Date());
    return {
      version: 1,
      deviceId: getDeviceId(),
      weight: {
        today: 68.4,
        goal: 65.0,
        history: [
          { d: '2026-09-11', v: 69.2 },
          { d: '2026-09-12', v: 68.9 },
          { d: '2026-09-13', v: 69.1 },
          { d: '2026-09-14', v: 68.7 },
          { d: '2026-09-15', v: 68.8 },
          { d: '2026-09-16', v: 69.0 },
          { d: today, v: 68.4 },
        ],
      },
      calorieGoal: 2100,
      meals: [
        { d: today, name: '早餐 · 燕麦粥 + 水煮蛋', kcal: 420 },
        { d: today, name: '午餐 · 牛肉面', kcal: 680 },
        { d: today, name: '加餐 · 酸奶 + 坚果', kcal: 260 },
        { d: today, name: '晚餐 · 轻食沙拉', kcal: 500 },
      ],
      tx: [
        { d: today, t: '13:42', type: 'expense', amount: 28, category: '餐饮', title: '午餐 牛肉面' },
        { d: today, t: '12:05', type: 'income',  amount: 3280, category: '收入', title: '项目尾款' },
        { d: today, t: '18:50', type: 'expense', amount: 458.5, category: '购物', title: '猫粮 + 日用品' },
      ],
      todos: [
        { id: genId(), d: today, title: '给妈妈挑选生日礼物', meta: '来自纪念日提醒 · 建议 9月25日前完成', done: false },
        { id: genId(), d: today, title: '晚上 8 点 · 跑步 30 分钟', meta: '健康 · 每日习惯', done: false },
        { id: genId(), d: today, title: '回复客户方案邮件', meta: '工作 · 今日 18:00 前', done: false },
      ],
      wishes: [
        { id: genId(), cat: 'travel', title: '北海道冬季旅行', desc: '和小林一起看雪祭、泡温泉，住一晚星空房。基金定投每月存 ¥1,500。', created: '2026-06-12', until: '2027-01-31' },
        { id: genId(), cat: 'goal',   title: '入手一台胶片相机', desc: 'Olympus Mju II / 黑白胶卷', created: '2026-08-02', until: '2026-12-25' },
        { id: genId(), cat: 'travel', title: '完成一次半程马拉松', desc: '完成 21.0975 km · 训练计划已规划', created: '2026-07-20', until: '2026-11-15' },
        { id: genId(), cat: 'note',   title: '给家里换一台洗碗机', desc: '西门子 12 套 · 嵌入式', created: '2026-09-01', until: '2027-06-30' },
      ],
      reminders: [
        { id: genId(), type: 'anniversary', title: '妈妈生日', date: '2026-10-02', lead: 15 },
      ],
      notes: [],
      wishesProgress: {}, // { wishId: { pct: 42 } }
      bundle: [], // 打包清单 / 歌单
      updatedAt: Date.now(),
    };
  }

  function genId() {
    return 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
  function dateKey(d) {
    const z = (n) => (n < 10 ? '0' + n : n);
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function getDeviceId() {
    let id = localStorage.getItem(`${NS}:deviceId`);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(`${NS}:deviceId`, id);
    }
    return id;
  }

  /** 数据访问 */
  class Store {
    constructor() {
      this.state = this.load();
      this.listeners = new Set();
      this.bc = null;
      this._initSync();
    }

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) {
          const s = defaultState();
          this._save(s);
          return s;
        }
        const s = JSON.parse(raw);
        // 简单 schema 迁移
        if (!s.version) s.version = 1;
        if (!s.deviceId) s.deviceId = getDeviceId();
        return s;
      } catch (e) {
        return defaultState();
      }
    }
    _save(s) {
      s.updatedAt = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 容量满？忽略 */ }
    }
    save() { this._save(this.state); this._broadcast(); }

    /** 订阅变更，fn 返回布尔决定是否触发 UI 刷新 */
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit() { this.listeners.forEach(fn => { try { fn(this.state); } catch (e) {} }); }

    /** ===== 业务操作 ===== */

    /** 设置今日体重。返回 { archived: boolean } */
    setTodayWeight(value) {
      const today = dateKey(new Date());
      const arr = this.state.weight.history;
      const idx = arr.findIndex(h => h.d === today);
      if (idx >= 0) arr[idx].v = value; else arr.push({ d: today, v: value });
      this.state.weight.today = value;
      this.save();
      this.emit();
      return { archived: true };
    }

    /** 添加收支 */
    addTx(tx) {
      const today = dateKey(new Date());
      const d = tx.date || today;
      const t = tx.time || formatTime(new Date());
      this.state.tx.unshift({
        d, t,
        type: tx.type,
        amount: tx.amount,
        category: tx.category || (tx.type === 'income' ? '收入' : '餐饮'),
        title: tx.title || '',
      });
      this.save(); this.emit();
    }

    /** 添加餐食记录 */
    addMeal(meal) {
      const today = dateKey(new Date());
      const d = meal.date || today;
      this.state.meals.unshift({ d, name: meal.name, kcal: meal.kcal });
      this.save(); this.emit();
    }

    /** 添加待办 */
    addTodo(todo) {
      const today = dateKey(new Date());
      this.state.todos.unshift({
        id: genId(),
        d: today,
        title: todo.title,
        meta: todo.meta || '手动添加',
        done: false,
      });
      this.save(); this.emit();
    }
    toggleTodo(id) {
      const t = this.state.todos.find(x => x.id === id);
      if (t) { t.done = !t.done; this.save(); this.emit(); }
    }
    removeTodo(id) {
      this.state.todos = this.state.todos.filter(x => x.id !== id);
      this.save(); this.emit();
    }

    /** 添加愿望 */
    addWish(wish) {
      const id = genId();
      const today = dateKey(new Date());
      this.state.wishes.push({
        id,
        cat: wish.cat || 'goal',
        title: wish.title,
        desc: wish.desc || '',
        created: today,
        until: wish.until || (today),
      });
      this.save(); this.emit();
      return id;
    }
    setWishProgress(id, pct) {
      this.state.wishesProgress[id] = { pct };
      this.save(); this.emit();
    }

    /** 添加纪念日（提醒） */
    addReminder(r) {
      this.state.reminders.push({
        id: genId(),
        type: 'anniversary',
        title: r.title,
        date: r.date,
        lead: r.lead || 7,
      });
      this.save(); this.emit();
    }

    /** 添加记事（打包清单 / 歌单等） */
    addNote(note) {
      this.state.notes.unshift({
        id: genId(),
        type: note.type || 'note',
        title: note.title,
        content: note.content || '',
        d: dateKey(new Date()),
      });
      this.save(); this.emit();
    }

    /** ===== 同步 ===== */
    _initSync() {
      // 1) BroadcastChannel：同一设备多窗口立刻同步
      try {
        if ('BroadcastChannel' in global) {
          this.bc = new BroadcastChannel(NS);
          this.bc.onmessage = (ev) => {
            if (ev.data && ev.data.type === 'state' && ev.data.from !== this.state.deviceId) {
              this.state = Object.assign(this.state, ev.data.payload);
              this._save(this.state);
              this.emit();
            }
          };
        }
      } catch (e) {}

      // 2) storage 事件：不同 Profile 之间的兜底
      global.addEventListener('storage', (e) => {
        if (e.key !== KEY) return;
        try {
          const s = JSON.parse(e.newValue);
          if (s && s.updatedAt && s.updatedAt > this.state.updatedAt) {
            this.state = s;
            this.emit();
          }
        } catch (err) {}
      });

      // 3) Supabase 跨设备同步（如页面注入了配置）
      if (global.SUPABASE_URL && global.SUPABASE_ANON_KEY && global.supabase) {
        this._initSupabase();
      }
    }

    _initSupabase() {
      try {
        const sb = global.supabase.createClient(global.SUPABASE_URL, global.SUPABASE_ANON_KEY);
        // 首次拉取
        sb.from('state').select('payload').eq('id', 'global').single()
          .then(({ data }) => {
            if (data && data.payload && data.payload.updatedAt > this.state.updatedAt) {
              this.state = Object.assign(this.state, data.payload);
              this._save(this.state);
              this.emit();
              console.log('[sync] cloud bootstrap @', new Date().toLocaleTimeString());
            }
          });
        // 订阅 realtime
        sb.channel('bixu-ji-state')
          .on('postgres_changes',
            { event: '*', schema: 'public', table: 'state', filter: 'id=eq.global' },
            (payload) => {
              const remote = payload.new && payload.new.payload;
              if (!remote) return;
              if (remote.deviceId === this.state.deviceId) return;
              if (remote.updatedAt > this.state.updatedAt) {
                this.state = Object.assign(this.state, remote);
                this._save(this.state);
                this.emit();
                console.log('[sync] cloud pull @', new Date().toLocaleTimeString());
              }
            })
          .subscribe();
        this.sb = sb;
        console.log('[sync] supabase realtime 已就绪');
      } catch (e) {
        console.warn('[sync] supabase init failed', e.message);
      }
    }

    _broadcast() {
      // 跨窗口
      if (this.bc) {
        try { this.bc.postMessage({ type: 'state', from: this.state.deviceId, payload: this.state }); } catch (e) {}
      }
      // 跨设备（如果启用了 Supabase）
      if (this.sb) {
        this.sb.from('state').upsert({
          id: 'global',
          payload: this.state,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.warn('[sync] cloud push error', error.message);
        });
      }
    }
  }

  function formatTime(d) {
    const z = (n) => (n < 10 ? '0' + n : n);
    return z(d.getHours()) + ':' + z(d.getMinutes());
  }

  // 导出
  global.MustRecord = global.MustRecord || {};
  global.MustRecord.store = new Store();
  global.MustRecord.utils = {
    dateKey, formatTime, genId,
  };
})(window);
