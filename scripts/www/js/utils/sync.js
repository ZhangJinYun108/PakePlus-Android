/* ============================================================
   多端同步 · GitHub Gist 中转
   - 数据存成一个私有 Gist（仅你的 token 可读写）
   - 手机 / 电脑都读写同一个 Gist → 互通
   - 合并：store.applySyncPayload 按 updatedAt 做 last-write-wins + 墓碑
   依赖：../store.js（getSyncPayload/applySyncPayload/setOnChange/getSettings/setSetting）
         ../utils/dom.js（toast）
   ============================================================ */
import { getSettings, setSetting, getSyncPayload, applySyncPayload, setOnChange } from '../store.js';
import { toast } from './dom.js';

const API = 'https://api.github.com/gists';
const FILENAME = 'jiidian-sync.json';

let initialized = false;
let pushing = false;
let pulling = false;
let pushTimer = null;
let statusCb = null;

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
function setStatus(text, kind) { statusCb?.(text, kind); }

/* ---------- 网络 ---------- */
function authHeaders(token) {
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github+json',
  };
}

async function createGist(token, payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      description: '记点 App 同步数据',
      public: false,
      files: { [FILENAME]: { content: JSON.stringify(payload) } },
    }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'token 无效或无 gist 权限' : '创建失败(' + res.status + ')');
  const data = await res.json();
  return data.id;
}

async function readGist(token, id) {
  const res = await fetch(`${API}/${id}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(res.status === 404 ? 'gist 不存在' : '读取失败(' + res.status + ')');
  const data = await res.json();
  const content = data.files?.[FILENAME]?.content;
  return content ? JSON.parse(content) : null;
}

async function writeGist(token, id, payload) {
  const res = await fetch(`${API}/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ files: { [FILENAME]: { content: JSON.stringify(payload) } } }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'token 无效或无 gist 权限' : '写入失败(' + res.status + ')');
}

/* ---------- 上传（改动后防抖调用） ---------- */
function schedulePush() {
  if (!getSettings().syncEnabled) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushLocal().catch(() => {}), 1500);
}

export async function pushLocal() {
  const s = getSettings();
  if (!s.syncEnabled || !s.syncToken) return;
  if (pushing) return;
  pushing = true;
  setStatus('同步中…', 'busy');
  try {
    const payload = getSyncPayload();
    if (!s.syncGistId) {
      const id = await createGist(s.syncToken, payload);
      setSetting({ syncGistId: id });
      setStatus('已创建并同步 · ' + now(), 'ok');
    } else {
      await writeGist(s.syncToken, s.syncGistId, payload);
      setStatus('已同步 · ' + now(), 'ok');
    }
  } catch (e) {
    setStatus('同步失败：' + (e.message || e), 'err');
  } finally {
    pushing = false;
  }
}

/* ---------- 下拉合并 ---------- */
export async function pullAndMerge() {
  const s = getSettings();
  if (!s.syncEnabled || !s.syncToken || !s.syncGistId) return;
  if (pulling) return;
  pulling = true;
  setStatus('同步中…', 'busy');
  try {
    const remote = await readGist(s.syncToken, s.syncGistId);
    if (remote) {
      const r = applySyncPayload(remote);
      setStatus('已同步 · ' + now(), 'ok');
      window.dispatchEvent(new CustomEvent('records-synced', { detail: r }));
    }
  } catch (e) {
    setStatus('拉取失败：' + (e.message || e), 'err');
  } finally {
    pulling = false;
  }
}

/* ---------- 状态监听 ---------- */
export function setSyncStatusListener(cb) { statusCb = cb; }

/* ---------- 初始化：启动拉取 + 注册自动推送 ---------- */
export function initSync() {
  if (initialized) return;
  const s = getSettings();
  if (!s.syncEnabled || !s.syncToken) return;
  initialized = true;
  setOnChange(() => schedulePush());
  // 启动后先拉一次最新（异步，不阻塞渲染）
  pullAndMerge().catch(() => {});
}

/* 供设置页在「开启同步并填好 token」后手动触发一次 */
export function startSyncNow() {
  initialized = false;
  initSync();
}
