/** 极简 DOM 工具 */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 安全转义，防止用户输入破坏 HTML */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/** 从 HTML 字符串建节点 */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** 轻提示 */
let toastTimer;
export function toast(msg, ms = 1800) {
  const host = document.getElementById('app');
  const old = host.querySelector('.toast');
  if (old) old.remove();
  clearTimeout(toastTimer);
  const el = h(`<div class="toast">${esc(msg)}</div>`);
  host.appendChild(el);
  toastTimer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** 底部弹出式文本编辑 */
export function editSheet({ title, value = '', placeholder = '', type = 'text', multiline = false }) {
  return new Promise(resolve => {
    const host = document.getElementById('app');
    const field = multiline
      ? `<textarea class="modal-input modal-textarea" rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input class="modal-input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">`;
    const mask = h(`
      <div class="modal-mask">
        <div class="modal" data-keyboard-lift="10">
          <div class="modal-title">${esc(title)}</div>
          ${field}
          <div class="modal-actions">
            <button class="btn btn-ghost" data-act="cancel">取消</button>
            <button class="btn btn-primary" data-act="ok">好了</button>
          </div>
        </div>
      </div>`);
    host.appendChild(mask);
    const input = mask.querySelector('.modal-input');
    setTimeout(() => input.focus(), 60);

    const close = (val) => { mask.remove(); resolve(val); };
    mask.addEventListener('click', e => {
      if (e.target === mask) close(null);
      const act = e.target.dataset.act;
      if (act === 'cancel') close(null);
      if (act === 'ok') close(input.value.trim());
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) close(input.value.trim()); });
  });
}

/** 底部弹出式选项选择 */
export function pickSheet({ title, options, current }) {
  return new Promise(resolve => {
    const host = document.getElementById('app');
    const items = options.map(o => {
      const val = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? o : o.label;
      return `<button class="chip ${val === current ? 'on' : ''}" data-val="${esc(val)}">${esc(label)}</button>`;
    }).join('');
    const mask = h(`
      <div class="modal-mask">
        <div class="modal">
          <div class="modal-title">${esc(title)}</div>
          <div class="chip-row" style="margin-bottom:18px">${items}</div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-act="cancel">取消</button>
          </div>
        </div>
      </div>`);
    host.appendChild(mask);
    const close = (v) => { mask.remove(); resolve(v); };
    mask.addEventListener('click', e => {
      if (e.target === mask) return close(null);
      if (e.target.dataset.act === 'cancel') return close(null);
      const chip = e.target.closest('[data-val]');
      if (chip) close(chip.dataset.val);
    });
  });
}

/** 二次确认弹窗（删除等危险操作前用），返回 Promise<boolean> */
export function confirmSheet({ title = '确认', message = '', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise(resolve => {
    const host = document.getElementById('app');
    const mask = h(`
      <div class="modal-mask">
        <div class="modal confirm-modal">
          <div class="modal-title">${esc(title)}</div>
          ${message ? `<div class="confirm-msg">${esc(message)}</div>` : ''}
          <div class="modal-actions">
            <button class="btn btn-ghost" data-act="cancel">${esc(cancelText)}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(okText)}</button>
          </div>
        </div>
      </div>`);
    host.appendChild(mask);
    const close = (v) => { mask.remove(); resolve(v); };
    mask.addEventListener('click', e => {
      if (e.target === mask) return close(false);
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'cancel' || act === 'ok') close(act === 'ok');
    });
  });
}
