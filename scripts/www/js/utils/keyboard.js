/* ============================================================
   软键盘避让 · 通用方案（聚焦即假定弹出 + 精确校正）
   ------------------------------------------------------------
   实测发现部分安卓 WebView（PakePlus/Tauri 打包）在 adjustPan
   模式下，visualViewport 完全不报告键盘信号（height/offsetTop
   都不变）。旧写法据此判定"没键盘"→ 永远不抬 → 看不见输入。

   新策略：
   1) 只要输入框聚焦，就【假定键盘已弹出】，用估算高度把输入框
      抬到可见（宁略空，不可不见）。
   2) 若 visualViewport 随后给出精确信号（adjustResize / 部分
      adjustPan），改用「只抬被遮部分 + 边距」校正，杜绝空一截。
   3) 输入框失焦 → 复位。
   ============================================================ */

let current = null;        // { el, gap }
let pendingTimer = null;

function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches);
}

/** 移动端软键盘占屏高约 45%~50%，作为「无精确信号时」的兜底抬升量 */
function estimateKeyboardHeight() {
  return Math.min(Math.max(Math.round(window.innerHeight * 0.5), 300), 420);
}

/** 有精确信号时：仅抬「超出可视区域底部的部分 + 边距」；否则返回 null（用估算） */
function preciseDelta() {
  const vv = window.visualViewport;
  if (!vv) return null;
  const active = (vv.height < window.innerHeight - 1) || vv.offsetTop > 1;
  if (!active) return null;
  const rect = current.el.getBoundingClientRect();
  const vvBottom = vv.offsetTop + vv.height;
  const delta = rect.bottom - vvBottom + current.gap;
  return delta > 0 ? delta : 0;   // ≤0 表示系统已顶好，不抬
}

function apply() {
  if (!current) return;
  // 有精确信号 → 用精确值（只抬被遮部分，不空）
  const pd = preciseDelta();
  if (pd !== null) {
    current.el.style.transform = pd > 0 ? `translateY(${-pd}px)` : '';
    return;
  }
  // 无精确信号，但输入框正处在聚焦态（键盘假定已弹出）→ 用估算保证可见
  if (isMobile()) {
    const kb = estimateKeyboardHeight() + current.gap;
    current.el.style.transform = `translateY(${-kb}px)`;
  } else {
    current.el.style.transform = '';
  }
}

export function initKeyboardLift() {
  const vv = window.visualViewport;
  const recompute = () => apply();
  if (vv) {
    vv.addEventListener('resize', recompute);
    vv.addEventListener('scroll', recompute);
  }
  window.addEventListener('resize', recompute);

  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.matches('input, textarea')) return;
    const lift = t.closest('[data-keyboard-lift]');
    if (lift) {
      const gap = parseInt(lift.getAttribute('data-keyboard-lift') || '0', 10) || 0;
      current = { el: lift, gap };
      requestAnimationFrame(apply);            // 立即假定弹出，抬起来（保证可见）
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(apply, 300);   // 键盘动画/信号稳定后二次校准
      pendingTimer = setTimeout(apply, 600);   // 再校准一次，防个别机型延迟报信号
    } else {
      // 没有标记的输入框（如设置页）：滚动进视野
      setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    }
  });

  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || !(a.matches && a.matches('input, textarea'))) {
        current = null;
        clearTimeout(pendingTimer);
        document.querySelectorAll('[data-keyboard-lift]').forEach(el => { el.style.transform = ''; });
      }
    }, 80);
  });

  window.addEventListener('orientationchange', () => requestAnimationFrame(apply));
}
