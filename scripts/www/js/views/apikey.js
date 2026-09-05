/* ============================================================
   AI 设置面板（临时入口，模块 6 完整设置页会吸收它）
   Key 只写入本机 localStorage，不会发往任何第三方
   ============================================================ */
import { h, esc, toast } from '../utils/dom.js';
import { getSettings, setSetting } from '../store.js';
import { testKey } from '../ai/deepseek.js';

export function openAISettings() {
  const s = getSettings();
  const host = document.getElementById('app');
  const mask = h(`
    <div class="modal-mask">
      <div class="modal" data-keyboard-lift="10">
        <div class="modal-title">AI 语义解析</div>

        <div style="font-size:var(--fs-sm);color:var(--text-2);line-height:1.7;margin-bottom:14px">
          填入 DeepSeek 的 API Key，识别会明显更准（能听懂「在国广吃安寿司」这种复杂句）。<br>
          <span style="color:var(--text-3)">不填也能用 —— 本地规则引擎会兜底，完全离线。</span>
        </div>

        <input class="modal-input" id="k" type="password" placeholder="sk-…"
               value="${esc(s.apiKey)}" autocomplete="off" spellcheck="false">

        <div style="display:flex;align-items:center;justify-content:space-between;
                    background:var(--surface-2);border-radius:var(--r-md);padding:12px 16px;margin-bottom:16px">
          <span style="font-size:var(--fs-base)">启用云端解析</span>
          <button class="chip sm ${s.aiEnabled ? 'on mint' : ''}" id="toggle">${s.aiEnabled ? '已开启' : '已关闭'}</button>
        </div>

        <div id="status" style="font-size:var(--fs-sm);color:var(--text-3);margin-bottom:14px;min-height:20px"></div>

        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="test">测一下</button>
          <button class="btn btn-primary" data-act="save">保存</button>
        </div>
      </div>
    </div>`);

  host.appendChild(mask);
  const input = mask.querySelector('#k');
  const status = mask.querySelector('#status');
  const toggle = mask.querySelector('#toggle');
  let aiEnabled = s.aiEnabled;

  toggle.addEventListener('click', () => {
    aiEnabled = !aiEnabled;
    toggle.className = `chip sm ${aiEnabled ? 'on mint' : ''}`;
    toggle.textContent = aiEnabled ? '已开启' : '已关闭';
  });

  mask.addEventListener('click', async (e) => {
    if (e.target === mask) return mask.remove();
    const act = e.target.closest('[data-act]')?.dataset.act;

    if (act === 'test') {
      const key = input.value.trim();
      if (!key) { status.textContent = '先填 Key 再测'; return; }
      status.textContent = '正在连接 DeepSeek…';
      const r = await testKey(key, s.apiModel);
      status.innerHTML = r.ok
        ? '<span style="color:var(--mint-500)">连通正常，可以用了 ✓</span>'
        : `<span style="color:var(--pink-400)">${esc(r.msg)}</span>`;
    }

    if (act === 'save') {
      setSetting({ apiKey: input.value.trim(), aiEnabled });
      mask.remove();
      toast(input.value.trim() ? '已保存，识别会更聪明了' : '已切回本地规则模式');
    }
  });
}
