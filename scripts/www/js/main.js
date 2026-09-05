import { register, mount, go, current } from './router.js';
import { HomeView } from './views/home.js';
import { ResultView } from './views/result.js';
import { LedgerView } from './views/ledger.js';
import { WishView } from './views/wish.js';
import { TodoView } from './views/todo.js';
import { NoteView } from './views/note.js';
import { MealView } from './views/meal.js';
import { SettingsView } from './views/settings.js';
import { TimelineView } from './views/timeline.js';
import { MemorialView } from './views/memorial.js';
import { WeightView } from './views/weight.js';
import { DashboardView } from './views/dashboard.js';

register('home', HomeView);
register('result', ResultView);
register('ledger', LedgerView);
register('wish', WishView);
register('todo', TodoView);
register('note', NoteView);
register('meal', MealView);
register('memorial', MemorialView);
register('weight', WeightView);
register('settings', SettingsView);
register('timeline', TimelineView);
register('dashboard', DashboardView);

mount(document.getElementById('app'));

// 启动即套用已保存的外观主题（字体档 / 背景）
import { applyAppTheme } from './store.js';
applyAppTheme();

// 软键盘避让：输入框聚焦时自动抬到键盘上方，避免被遮挡看不到输入
import { initKeyboardLift } from './utils/keyboard.js';
initKeyboardLift();

// 多端同步：若已开启，启动即拉取最新数据并注册自动上传
import { initSync } from './utils/sync.js';
initSync();

// 同步完成后，若正在看数据页（非设置页，避免打断 token 输入），刷新当前屏
window.addEventListener('records-synced', () => {
  const cur = current();
  if (!cur || cur.name === 'settings') return;
  go(cur.name, cur.params, { replace: true });
});

// 开发调试入口：?demo=result|voice|ledger|wish|todo|note|meal|settings|timeline|memorial
const p = new URLSearchParams(location.search);
const demo = p.get('demo');

if (demo === 'result') {
  go('result', { draft: JSON.parse(p.get('draft')) });
} else if (demo === 'ledger') {
  go('ledger', { period: p.get('period') || 'month' });
} else if (demo === 'wish') {
  go('wish');
} else if (demo === 'todo') {
  go('todo');
} else if (demo === 'note') {
  go('note');
} else if (demo === 'meal') {
  go('meal');
} else if (demo === 'settings') {
  go('settings');
} else if (demo === 'timeline') {
  go('timeline');
} else if (demo === 'memorial') {
  go('memorial');
} else {
  go('home');
  if (demo === 'voice') {
    setTimeout(() => document.querySelector('.voice-btn')?.click(), 80);
  }
}

// 移动端：阻止双指缩放与下拉刷新，贴近原生手感
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
