/* ============================================================
   必须记 · Supabase 跨设备实时同步参考实现
   —— 替代 js/data.js 中的 _initSync() / _broadcast()
   ============================================================ */

/* ----------------------------------------------------------
   步骤 0. 在 index.html 的 <head> 末尾加入：
   ----------------------------------------------------------
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   并删掉或注释掉原 <script src="./js/data.js"></script> 之前的引用（保留 data.js 自身即可，下面会替换它的方法）
   ---------------------------------------------------------- */

/* ----------------------------------------------------------
   步骤 1. 拿到你的 supabaseUrl 和 anonKey
   在 supabase.com 控制台 → Project Settings → API
   ---------------------------------------------------------- */

const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';      // ← 改
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_ANON_KEY'; // ← 改

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ----------------------------------------------------------
   步骤 2. 在 supabase SQL Editor 执行：
   ----------------------------------------------------------
   create table if not exists state (
     id text primary key,
     payload jsonb not null,
     updated_at timestamptz default now()
   );
   alter publication supabase_realtime add table state;
   ---------------------------------------------------------- */

/* ----------------------------------------------------------
   步骤 3. 用下面的两个方法「替换」js/data.js 的 _initSync() / _broadcast()
   ---------------------------------------------------------- */

// 替换：_initSync()
function _initSync() {
  // 1) 拉取最新 state（首次打开应用时）
  sb.from('state').select('payload').eq('id', 'global').single()
    .then(({ data, error }) => {
      if (data && data.payload) {
        const remote = data.payload;
        if (remote.updatedAt > store.state.updatedAt) {
          // 云端比本地新 → 采用云端
          store.state = Object.assign(store.state, remote);
          store._save(store.state);
          store.emit();
        }
      }
    });

  // 2) 订阅 realtime 变化
  sb.channel('state-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'state', filter: 'id=eq.global' },
      (payload) => {
        if (payload.new && payload.new.payload) {
          const remote = payload.new.payload;
          // 过滤掉自己刚刚的写回（避免循环）
          if (remote.deviceId === store.state.deviceId) return;
          if (remote.updatedAt > store.state.updatedAt) {
            store.state = Object.assign(store.state, remote);
            store._save(store.state);
            store.emit();
            console.log('[sync] pulled from cloud @', new Date().toLocaleTimeString());
          }
        }
      }
    )
    .subscribe();
}

// 替换：_broadcast()
function _broadcast() {
  // 把当前 state 推送到云端
  sb.from('state').upsert({
    id: 'global',
    payload: store.state,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  .then(({ error }) => {
    if (error) console.warn('[sync] push error', error.message);
    else console.log('[sync] pushed to cloud @', new Date().toLocaleTimeString());
  });
}

/* ============================================================
   使用方法：
   1) 把上述 SUPABASE_URL / SUPABASE_ANON_KEY 填成你自己的
   2) 在 SQL Editor 执行建表 SQL
   3) 把 js/data.js 里的 _initSync() / _broadcast() 整段替换为本文件的两个函数
      （或者更省事：直接在 data.js 末尾加上本文件作为补丁）
   4) 重启 PakePlus 即可生效
   ============================================================ */
