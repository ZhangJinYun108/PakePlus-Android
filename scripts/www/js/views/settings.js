/* ============================================================
   模块 6 · 完整设置页
   个人资料 / 外观(字体·背景·语言) / 精力与周期 / 提醒 / AI 语义解析
   ============================================================ */
import { h, esc, toast } from '../utils/dom.js';
import { getSettings, setSetting, applyAppTheme, FONT_TIERS, BG_THEMES, STYLE_THEMES, exportJSON, importJSON } from '../store.js';
import { testKey } from '../ai/deepseek.js';
import { go, back } from '../router.js';
import { setSyncStatusListener, startSyncNow, pullAndMerge, pushLocal } from '../utils/sync.js';

const money = (n) => '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FONTS = [
  { id:'s', label:'小' },
  { id:'m', label:'标准' },
  { id:'l', label:'大' },
];
const WEEKS = [
  { id:1, label:'周一' },
  { id:0, label:'周日' },
];
const LANGS = [
  { id:'zh-CN', label:'简体中文', ok:true },
  { id:'zh-TW', label:'繁體中文', ok:false },
  { id:'en',    label:'English',  ok:false },
];

export function SettingsView() {
  const s = getSettings();
  const host = document.getElementById('app');
  const el = h(`
    <div class="settings">
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <span class="topbar-title">设置</span>
        <span style="width:40px"></span>
      </div>

      <div class="scroll">

        <!-- 个人资料 -->
        <div class="set-sec">
          <div class="set-sec-title">个人资料</div>
          <div class="set-card set-profile">
            <div class="set-avatar" id="avatar">${esc((s.nickname || '朋').slice(0, 1))}</div>
            <div class="set-profile-main">
              <div class="set-label">昵称</div>
              <input class="set-input" id="nick" maxlength="12" placeholder="朋友"
                     value="${esc(s.nickname)}" autocomplete="off">
            </div>
          </div>
        </div>

        <!-- 外观 -->
        <div class="set-sec">
          <div class="set-sec-title">外观</div>

          <div class="set-card">
            <div class="set-row">
              <span class="set-label">字体大小</span>
              <div class="chips" data-grp="font">
                ${FONTS.map(f => `<button class="chip ${s.fontSize === f.id ? 'on lav' : ''}" data-id="${f.id}">${f.label}</button>`).join('')}
              </div>
            </div>
            <div class="set-div"></div>
            <div class="set-row">
              <span class="set-label">背景主题</span>
              <div class="chips" data-grp="bg">
                ${BG_THEMES.map(b => `<button class="chip ${s.bgTheme === b.id ? 'on pink' : ''}" data-id="${b.id}"><i class="set-bg-dot" style="background:${b.css}"></i>${b.label}</button>`).join('')}
              </div>
            </div>
            <div class="set-div"></div>
            <div class="set-row">
              <span class="set-label">语言</span>
              <div class="chips" data-grp="lang">
                ${LANGS.map(l => `<button class="chip ${s.lang === l.id ? 'on mint' : ''} ${l.ok ? '' : 'disabled'}" data-id="${l.id}" ${l.ok ? '' : 'disabled'}>${l.label}${l.ok ? '' : ' · 即将上线'}</button>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- 主题（视觉风格） -->
        <div class="set-sec">
          <div class="set-sec-title">主题</div>
          <div class="set-card">
            <div class="set-hint" style="margin-bottom:12px">
              整体视觉风格，点一下立即切换。马卡龙 / 手绘卡通 / 国风新中式 / 潮玩多巴胺 / 极简黑白，共 5 套。
            </div>
            <div class="chips" data-grp="theme">
              ${STYLE_THEMES.map(t => `<button class="chip ${s.theme === t.id ? 'on lav' : ''} ${t.ok ? '' : 'disabled'}" data-id="${t.id}" ${t.ok ? '' : 'disabled'}>${esc(t.label)}${t.ok ? '' : ' · 预览中'}</button>`).join('')}
            </div>
          </div>
        </div>

        <!-- 精力与周期 -->
        <div class="set-sec">
          <div class="set-sec-title">精力与周期</div>
          <div class="set-card">
            <div class="set-row">
              <span class="set-label">每日精力上限</span>
              <div class="stepper">
                <button class="step-btn" data-act="dec">−</button>
                <span class="step-val" id="limit">${s.energyLimit}</span>
                <button class="step-btn" data-act="inc">＋</button>
              </div>
            </div>
            <div class="set-div"></div>
            <div class="set-row">
              <span class="set-label">一周起始</span>
              <div class="chips" data-grp="week">
                ${WEEKS.map(w => `<button class="chip ${s.weekStart === w.id ? 'on lav' : ''}" data-id="${w.id}">${w.label}</button>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- 饮食与热量 -->
        <div class="set-sec">
          <div class="set-sec-title">饮食与热量</div>
          <div class="set-card">
            <div class="set-row">
              <div>
                <div class="set-label">每日热量上限</div>
                <div class="set-hint">进食参考线，超过会提醒</div>
              </div>
              <div class="stepper">
                <button class="step-btn" data-act="kdec">−</button>
                <span class="step-val" id="kcalLimit">${s.kcalLimit}</span>
                <button class="step-btn" data-act="kinc">＋</button>
              </div>
            </div>
            <div class="set-div"></div>
            <div class="set-row">
              <div>
                <div class="set-label">基础代谢（净平衡用）</div>
                <div class="set-hint">净平衡 = 基础值 − 进食 + 运动</div>
              </div>
              <div class="stepper">
                <button class="step-btn" data-act="bdec">−</button>
                <span class="step-val" id="kcalBase">${s.kcalBase}</span>
                <button class="step-btn" data-act="binc">＋</button>
              </div>
            </div>
            <div class="set-div"></div>
            <div class="set-row">
              <div>
                <div class="set-label">体重</div>
                <div class="set-hint">估算运动消耗用：千卡 = MET×体重×时长/60</div>
              </div>
              <div class="stepper">
                <button class="step-btn" data-act="wdec">−</button>
                <span class="step-val" id="weightKg">${s.weightKg}</span>
                <button class="step-btn" data-act="winc">＋</button>
              </div>
            </div>
            <div class="set-div"></div>
            <div class="set-row">
              <div>
                <div class="set-label">接近/超出提醒</div>
                <div class="set-hint">记完一餐后，达到 85% 就提醒你</div>
              </div>
              <button class="switch ${s.kcalWarn ? 'on' : ''}" data-act="kwarn"><i></i></button>
            </div>
          </div>
        </div>

        <!-- 提醒 -->
        <div class="set-sec">
          <div class="set-sec-title">提醒</div>
          <div class="set-card">
            <div class="set-row">
              <div>
                <div class="set-label">超上限推送</div>
                <div class="set-hint">安排超过每日精力时温柔提醒你</div>
              </div>
              <button class="switch ${s.pushEnabled ? 'on' : ''}" data-act="push"><i></i></button>
            </div>
          </div>
        </div>

        <!-- AI 语义解析 -->
        <div class="set-sec">
          <div class="set-sec-title">AI 语义解析</div>
          <div class="set-card">
            <div class="set-hint" style="margin-bottom:12px">
              填入 DeepSeek 的 API Key，识别会明显更准（能听懂「在国广吃安寿司」这种复杂句）。不填也能用 —— 本地规则引擎会兜底，完全离线。
            </div>
            <input class="set-input full" id="key" type="password" placeholder="sk-…"
                   value="${esc(s.apiKey)}" autocomplete="off" spellcheck="false">
            <div class="set-row" style="margin-top:14px">
              <span class="set-label">启用云端解析</span>
              <button class="switch ${s.aiEnabled ? 'on' : ''}" data-act="ai"><i></i></button>
            </div>
            <div class="set-div"></div>
            <div class="set-row">
              <span class="set-label">AI 自动预估精力</span>
              <button class="switch ${s.aiEstimateEnergy ? 'on' : ''}" data-act="est"><i></i></button>
            </div>
            <div id="aiStatus" class="set-hint" style="min-height:18px;margin:12px 0 4px"></div>
            <button class="btn btn-ghost full" data-act="test">测试连接</button>
          </div>
        </div>

        <!-- 多端同步 -->
        <div class="set-sec">
          <div class="set-sec-title">多端同步</div>
          <div class="set-card">
            <div class="set-hint" style="margin-bottom:12px">
              用 <b>GitHub Gist</b> 做中转，电脑和手机读写同一个文件即可互通。需要你生成一个 <b>带 gist 权限</b> 的 Personal Access Token（github.com → 头像 → Settings → Developer settings → Personal access tokens → 选 classic → Generate，只勾 <b>gist</b>）。Token 只存在本机、不会上传。
            </div>
            <input class="set-input full" id="syncToken" type="password" placeholder="ghp_…（GitHub PAT，需 gist 权限）"
                   value="${esc(s.syncToken)}" autocomplete="off" spellcheck="false">
            <div class="set-row" style="margin-top:14px">
              <div>
                <div class="set-label">开启多端同步</div>
                <div class="set-hint">开启后自动上传，打开时自动拉取</div>
              </div>
              <button class="switch ${s.syncEnabled ? 'on' : ''}" data-act="sync"><i></i></button>
            </div>
            <div id="syncStatus" class="set-hint" style="min-height:18px;margin:12px 0 4px"></div>
            <button class="btn btn-ghost full" data-act="syncnow">立即同步</button>
          </div>
        </div>

        <!-- 数据备份（导入 / 导出） -->
        <div class="set-sec">
          <div class="set-sec-title">数据备份</div>
          <div class="set-card">
            <div class="set-hint" style="margin-bottom:12px">
              全部数据只存在本机。导出为 JSON 文件随时带走；导入可恢复或合并之前的备份（按更新时间合并，不会删掉本地独有记录）。
            </div>
            <button class="btn btn-ghost full" data-act="export">导出备份（JSON）</button>
            <div class="set-div"></div>
            <button class="btn btn-ghost full" data-act="import">导入备份（选择文件）</button>
          </div>
        </div>

        <div class="set-foot">数据默认只存在这台设备上 · 当前 v0.3</div>
      </div>
    </div>`);

  // —— 昵称 ——
  const nick = el.querySelector('#nick');
  const avatar = el.querySelector('#avatar');
  nick.addEventListener('input', () => {
    const v = nick.value.trim();
    avatar.textContent = (v || '朋').slice(0, 1);
    setSetting({ nickname: v });
    applyAppTheme();
  });

  // —— chip 组（字体 / 背景 / 语言 / 周起始）——
  el.querySelectorAll('.chips[data-grp]').forEach(grp => {
    const name = grp.dataset.grp;
    grp.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.disabled) return;
      const id = btn.dataset.id;
      const map = { font:'fontSize', bg:'bgTheme', lang:'lang', week:'weekStart', theme:'theme' };
      const patch = {}; patch[map[name]] = (name === 'week') ? Number(id) : id;
      setSetting(patch);
      applyAppTheme();
      grp.querySelectorAll('.chip').forEach(c => c.classList.remove('on', 'lav', 'pink', 'mint'));
      const onCls = { font:'lav', bg:'pink', lang:'mint', week:'lav', theme:'lav' }[name];
      btn.classList.add('on', onCls);
      if (name === 'lang') toast('语言切换将在后续版本完整支持');
    });
  });

  // —— 精力上限 stepper ——
  const limitEl = el.querySelector('#limit');
  el.querySelector('[data-act="inc"]').addEventListener('click', () => {
    const v = Math.min(20, (+limitEl.textContent) + 1);
    limitEl.textContent = v; setSetting({ energyLimit: v }); toast('已更新每日精力上限');
  });
  el.querySelector('[data-act="dec"]').addEventListener('click', () => {
    const v = Math.max(4, (+limitEl.textContent) - 1);
    limitEl.textContent = v; setSetting({ energyLimit: v }); toast('已更新每日精力上限');
  });

  // —— 热量上限 stepper（步进 50）——
  const kcalEl = el.querySelector('#kcalLimit');
  el.querySelector('[data-act="kinc"]').addEventListener('click', () => {
    const v = Math.min(4000, (+kcalEl.textContent) + 50);
    kcalEl.textContent = v; setSetting({ kcalLimit: v }); toast('已更新每日热量上限');
  });
  el.querySelector('[data-act="kdec"]').addEventListener('click', () => {
    const v = Math.max(800, (+kcalEl.textContent) - 50);
    kcalEl.textContent = v; setSetting({ kcalLimit: v }); toast('已更新每日热量上限');
  });

  // —— 基础代谢 stepper ——
  const baseEl = el.querySelector('#kcalBase');
  el.querySelector('[data-act="binc"]').addEventListener('click', () => {
    const v = Math.min(3000, (+baseEl.textContent) + 50);
    baseEl.textContent = v; setSetting({ kcalBase: v }); toast('已更新基础代谢');
  });
  el.querySelector('[data-act="bdec"]').addEventListener('click', () => {
    const v = Math.max(1000, (+baseEl.textContent) - 50);
    baseEl.textContent = v; setSetting({ kcalBase: v }); toast('已更新基础代谢');
  });

  // —— 体重 stepper ——
  const wtEl = el.querySelector('#weightKg');
  el.querySelector('[data-act="winc"]').addEventListener('click', () => {
    const v = Math.min(150, (+wtEl.textContent) + 1);
    wtEl.textContent = v; setSetting({ weightKg: v }); toast('已更新体重');
  });
  el.querySelector('[data-act="wdec"]').addEventListener('click', () => {
    const v = Math.max(30, (+wtEl.textContent) - 1);
    wtEl.textContent = v; setSetting({ weightKg: v }); toast('已更新体重');
  });

  // —— 开关组 ——
  const bindSwitch = (act, key) => {
    const sw = el.querySelector(`[data-act="${act}"]`);
    sw.addEventListener('click', () => {
      const on = !sw.classList.contains('on');
      sw.classList.toggle('on', on);
      setSetting({ [key]: on });
      toast(on ? '已开启' : '已关闭');
    });
  };
  bindSwitch('push', 'pushEnabled');
  bindSwitch('kwarn', 'kcalWarn');
  bindSwitch('ai', 'aiEnabled');
  bindSwitch('est', 'aiEstimateEnergy');

  // —— AI 测试连接 ——
  const key = el.querySelector('#key');
  const status = el.querySelector('#aiStatus');
  el.querySelector('[data-act="test"]').addEventListener('click', async () => {
    const k = key.value.trim();
    if (!k) { status.textContent = '先填 Key 再测'; status.style.color = 'var(--text-3)'; return; }
    status.textContent = '正在连接 DeepSeek…'; status.style.color = 'var(--text-2)';
    const r = await testKey(k, s.apiModel);
    status.innerHTML = r.ok
      ? '<span style="color:var(--mint-500)">连通正常，可以用了 ✓</span>'
      : `<span style="color:var(--pink-400)">${esc(r.msg)}</span>`;
  });

  // —— 返回 ——
  el.querySelector('[data-act="back"]').addEventListener('click', () => back());

  // —— 导出备份 ——
  el.querySelector('[data-act="export"]').addEventListener('click', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `个人管理备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('备份已下载');
  });

  // —— 导入备份 ——
  el.querySelector('[data-act="import"]').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const r = importJSON(text);
        toast(`已导入 · 新增 ${r.added} 条 · 更新 ${r.updated} 条`);
      } catch (err) {
        toast('导入失败：' + (err && err.message ? err.message : '文件无法识别'));
      }
    };
    inp.click();
  });

  // —— 多端同步 ——
  const syncStatus = el.querySelector('#syncStatus');
  setSyncStatusListener((text, kind) => {
    if (!syncStatus) return;
    syncStatus.textContent = text || '';
    syncStatus.style.color = kind === 'ok' ? 'var(--mint-500)'
      : kind === 'err' ? 'var(--pink-400)'
      : 'var(--text-2)';
  });

  const syncToken = el.querySelector('#syncToken');
  syncToken.addEventListener('input', () => setSetting({ syncToken: syncToken.value.trim() }));

  const syncSw = el.querySelector('[data-act="sync"]');
  syncSw.addEventListener('click', () => {
    const on = !syncSw.classList.contains('on');
    syncSw.classList.toggle('on', on);
    setSetting({ syncEnabled: on });
    toast(on ? '已开启多端同步' : '已关闭多端同步');
    if (on) {
      const t = getSettings().syncToken;
      if (!t) { syncStatus.textContent = '请先填入 GitHub Token 再开启'; syncStatus.style.color = 'var(--pink-400)'; return; }
      startSyncNow();
    }
  });

  el.querySelector('[data-act="syncnow"]').addEventListener('click', async () => {
    const st = getSettings();
    if (!st.syncEnabled) { syncStatus.textContent = '请先开启「多端同步」开关'; syncStatus.style.color = 'var(--pink-400)'; return; }
    if (!st.syncToken)  { syncStatus.textContent = '请先填入 GitHub Token'; syncStatus.style.color = 'var(--pink-400)'; return; }
    syncStatus.textContent = '同步中…'; syncStatus.style.color = 'var(--text-2)';
    try {
      await pullAndMerge();   // 先拉远端（合并进本地）
      await pushLocal();      // 再推本地（双向收敛）
      toast('同步完成');
    } catch (e) {
      syncStatus.textContent = '同步失败：' + (e.message || e);
      syncStatus.style.color = 'var(--pink-400)';
    }
  });

  return el;
}
