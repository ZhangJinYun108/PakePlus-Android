/* ============================================================
   左滑删除通用模块
   把任意列表行包成：
     <div class="swipe" data-swipe data-del="ID">
       <div class="swipe-action"><button class="swipe-del" data-del="ID">删除</button></div>
       <div class="swipe-content">…原行内容…</div>
     </div>
   左滑露出红色「删除」→ 点击二次确认 → onDelete(id)
   ① 仅横向手势拦截，不挡纵向滚动
   ② 同时只展开一行
   ③ 已展开时，点内容区域收起（不再误触进入编辑）
   ============================================================ */
import { confirmSheet } from './dom.js';

const ACTION_W = 76;          // 删除按钮宽度(px)，须与 CSS 中 .swipe-action width 一致
let openRow = null;           // 当前展开的行 { el, content }

function closeOpen() {
  if (openRow && openRow.el && openRow.el.isConnected) {
    openRow.el.classList.remove('open');
    if (openRow.content) openRow.content.style.transform = '';
  }
  openRow = null;
}

/**
 * 给 root 内所有 [data-swipe] 行绑定左滑删除。
 * @param {HTMLElement} root      渲染容器（其内部 [data-swipe] 都会被接管）
 * @param {{onDelete:(id:string)=>void}} opts  onDelete 由调用方提供（负责删除+重渲染）
 */
export function setupSwipeDelete(root, { onDelete } = {}) {
  if (!root) return;
  // DOM 已重建，旧引用失效，先复位
  openRow = null;

  const rows = (root.classList && root.matches('[data-swipe]')) ? [root] : [...root.querySelectorAll('[data-swipe]')];
  rows.forEach(row => {
    if (row._swipeBound) return;
    row._swipeBound = true;

    const content = row.querySelector(':scope > .swipe-content');
    const delBtn = row.querySelector(':scope > .swipe-action .swipe-del');
    if (!content) return;

    let startX = 0, startY = 0, dragging = false, decided = false, horiz = false;
    let justDragged = false;        // 刚刚滑过，抑制随后的误触点击

    const onDown = (e) => {
      // 只认主键 / 触摸 / 笔
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (openRow && openRow.el !== row) closeOpen();
      startX = e.clientX; startY = e.clientY;
      dragging = false; decided = false; horiz = false;
    };

    const onMove = (e) => {
      if (!startX && !startY) return;
      const mx = e.clientX - startX, my = e.clientY - startY;
      if (!decided) {
        if (Math.abs(mx) > 6 || Math.abs(my) > 6) { decided = true; horiz = Math.abs(mx) > Math.abs(my); }
        else return;
      }
      if (horiz) {
        dragging = true;
        if (e.cancelable) e.preventDefault();   // 拦掉浏览器的横向默认行为
        row.classList.add('dragging');
        const base = row.classList.contains('open') ? -ACTION_W : 0;
        const t = Math.max(-ACTION_W, Math.min(0, base + mx));
        content.style.transform = `translateX(${t}px)`;
      }
    };

    const onUp = (e) => {
      row.classList.remove('dragging');
      if (!decided) { startX = startY = 0; return; }
      if (horiz && dragging) {
        const moved = e.clientX - startX;
        if (moved < -ACTION_W / 2) {                 // 滑过半 → 展开
          content.style.transform = `translateX(${-ACTION_W}px)`;
          row.classList.add('open');
          openRow = { el: row, content };
        } else {                                      // 没滑够 → 回弹
          content.style.transform = '';
          row.classList.remove('open');
          if (openRow && openRow.el === row) openRow = null;
        }
      } else if (row.classList.contains('open')) {    // 展开态下轻点 → 收起
        closeOpen();
      }
      // 发生过横向拖动（无论是否过阈）→ 抑制紧随的 click，避免误进编辑
      if (horiz && dragging) {
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 0);
      }
      startX = startY = 0; dragging = false;
    };

    row.addEventListener('pointerdown', onDown);
    row.addEventListener('pointermove', onMove, { passive: false });
    row.addEventListener('pointerup', onUp);
    row.addEventListener('pointercancel', onUp);

    if (delBtn && onDelete) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = row.dataset.del || delBtn.dataset.del;
        const ok = await confirmSheet({
          title: '删除这条记录？', message: '删除后不可恢复', okText: '删除', danger: true,
        });
        if (ok) onDelete(id);
        closeOpen();
      });
    }

    // 展开态下：点内容区域收起（阻止冒泡到视图自身的点击→进入编辑）
    content.addEventListener('click', (e) => {
      if (justDragged) { e.stopPropagation(); e.preventDefault(); return; }
      if (row.classList.contains('open')) {
        e.stopPropagation();
        e.preventDefault();
        closeOpen();
      }
    }, true);
  });
}
