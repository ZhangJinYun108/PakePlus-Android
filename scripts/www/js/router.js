/* 极简屏幕路由：一次只挂一屏，带前进/后退栈 */
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
}

export function back() {
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
