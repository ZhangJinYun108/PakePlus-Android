/* 极简屏幕路由：一次只挂一屏，带前进/后退栈。
   与浏览器/系统返回键同步：每次进入新屏压入一条 history，
   安卓「返回手势 / 返回键」触发 popstate → 回退一屏，而不是直接关掉应用。 */
const routes = new Map();
const stack = [];
let host;

export function register(name, factory) { routes.set(name, factory); }
export function mount(el) { host = el; }

export function go(name, params = {}, { replace = false } = {}) {
  const factory = routes.get(name);
  if (!factory) throw new Error(`未注册的页面：${name}`);

  if (replace) stack.pop(); else if (stack.length > 12) stack.shift();
  stack.push({ name, params });

  render();

  // 同步一条历史记录，使系统返回键走应用内后退（而非关闭 WebView）
  try {
    if (replace) history.replaceState({ jidian: stack.length }, '');
    else history.pushState({ jidian: stack.length }, '');
  } catch (e) {}
}

/* UI 触发的后退（顶栏 ‹ 按钮 / 左滑手势）：走浏览器历史，
   由 popstate 统一回退，保证与系统返回键行为一致。 */
export function back() {
  try { history.back(); } catch (e) { popStack(); }
}

/* 仅回退一屏并重新渲染（由 popstate 调用，不操作 history） */
function popStack() {
  if (stack.length > 1) { stack.pop(); render(); }
}

function render() {
  const cur = stack[stack.length - 1];
  const prev = host.querySelector('.screen');
  if (prev) prev.remove();
  // 清掉遗留浮层
  host.querySelectorAll('.modal-mask, .thinking, .rec-overlay, .drawer-mask').forEach(n => n.remove());

  const el = routes.get(cur.name)(cur.params);
  el.classList.add('screen');
  host.appendChild(el);
}

export const current = () => stack[stack.length - 1];

/* 让系统返回键 / 左滑返回手势回到上一屏，而不是直接关闭应用。
   在栈底多压一条历史，使根页面再按返回为空操作（留在应用内）。 */
export function initRouteGuard() {
  try { history.pushState({ jidian: 'base' }, ''); } catch (e) {}
  window.addEventListener('popstate', () => popStack());
}
