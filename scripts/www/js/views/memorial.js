/* ============================================================
   模块 · 纪念日 / 生日 总览页
   顶部：近期提醒 + 小计
   列表：按"还剩几天"升序，卡片含图标 / 称呼 / 日期周几 / 倒计时
   每条可「加到日历」（年度重复 + 提前一周/前一天提醒）
   点卡片进结果页编辑；左滑删除
   ============================================================ */
import { h, esc, toast } from '../utils/dom.js';
import { allRecords, deleteRecord } from '../store.js';
import { back, go } from '../router.js';
import { setupSwipeDelete } from '../utils/swipe.js';
import {
  allMemorials, upcomingMemorials, daysUntil, weekdayOf, ageOf, subLabel,
  addToCalendar,
} from '../utils/memorial.js';

const ICON = {
  birthday: '🎂',
  anniversary: '💍',
};

/** 倒计时文案 */
function countdown(days, subType) {
  if (days === 0) return { txt: '就是今天', cls: 'today' };
  if (days === 1) return { txt: '明天', cls: 'soon' };
  if (days <= 7)  return { txt: `还有 ${days} 天`, cls: 'soon' };
  if (days <= 30) return { txt: `还有 ${days} 天`, cls: 'near' };
  if (days <= 365) return { txt: `还有 ${days} 天`, cls: '' };
  return { txt: `明年还有 ${days - 365} 天`, cls: '' };
}

export function MemorialView() {
  const el = h(`
    <div>
      <div class="topbar">
        <button class="topbar-back" data-act="back">‹</button>
        <div class="topbar-title">纪念日 · 生日</div>
        <button class="topbar-add" data-act="add" title="添加">+</button>
      </div>

      <div class="scroll">
        <div id="mem-hero"></div>
        <div class="mem-summary" id="mem-summary"></div>
        <div class="chip-row mem-filters">
          <button class="chip on lav" data-filter="all">全部</button>
          <button class="chip" data-filter="birthday">生日</button>
          <button class="chip" data-filter="anniversary">纪念日</button>
        </div>
        <div id="mem-list"></div>
        <div style="height:14px"></div>
        <button class="mem-all-cal" data-act="all-cal">📅 全部加到日历（自动每年提醒）</button>
        <div style="height:20px"></div>
      </div>
    </div>`);

  const heroEl = el.querySelector('#mem-hero');
  const sumEl  = el.querySelector('#mem-summary');
  const listEl = el.querySelector('#mem-list');
  let filter = 'all';

  function counts() {
    const all = allRecords().filter(r => r.type === 'memorial');
    return {
      total: all.length,
      birthday: all.filter(r => r.subType === 'birthday').length,
      anniversary: all.filter(r => r.subType === 'anniversary').length,
    };
  }

  function renderHero() {
    const up = upcomingMemorials(7);
    if (!up.length) {
      heroEl.innerHTML = `
        <div class="mem-hero empty">
          <div class="mh-emoji">🔔</div>
          <div class="mh-title">近期没有临近的纪念日</div>
          <div class="mh-sub">临近前一周、前一天会自动提醒你</div>
        </div>`;
      return;
    }
    heroEl.innerHTML = `
      <div class="mem-hero">
        <div class="mh-head">⏰ 近期提醒（${up.length}）</div>
        ${up.map(({ rec, days }) => {
          const c = countdown(days, rec.subType);
          return `<div class="mh-item">
            <span class="mh-ico">${ICON[rec.subType] || '📌'}</span>
            <span class="mh-name">${esc(rec.title || subLabel(rec.subType))}</span>
            <span class="mh-when ${c.cls}">${c.txt}</span>
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderSummary() {
    const c = counts();
    sumEl.innerHTML = `
      <div class="ws-item"><span class="ws-val">${c.total}</span><span class="ws-key">个日子</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val">🎂 ${c.birthday}</span><span class="ws-key">生日</span></div>
      <div class="ws-sep"></div>
      <div class="ws-item"><span class="ws-val">💍 ${c.anniversary}</span><span class="ws-key">纪念日</span></div>`;
  }

  function renderList() {
    let items = allMemorials();
    if (filter !== 'all') items = items.filter(x => x.rec.subType === filter);

    if (!items.length) {
      listEl.innerHTML = `
        <div class="mem-empty">
          <div class="we-emoji">📅</div>
          <div class="we-title">还没有${filter === 'birthday' ? '生日' : filter === 'anniversary' ? '纪念日' : '记录'}</div>
          <div class="we-sub">说一句「小明生日5月20日」「结婚纪念日3月14日」就记下了</div>
        </div>`;
      return;
    }

    listEl.innerHTML = items.map(({ rec, days }, i) => {
      const c = countdown(days, rec.subType);
      const age = rec.subType === 'birthday' && rec.year ? ageOf(rec.year) : null;
      return `
        <div class="swipe" data-swipe data-del="${esc(rec.id)}">
          <div class="swipe-action"><button class="swipe-del" data-del="${esc(rec.id)}">删除</button></div>
          <div class="swipe-content">
            <div class="mem-card ${c.cls}" data-id="${esc(rec.id)}" style="animation-delay:${i * 42}ms">
              <div class="mc-ico">${ICON[rec.subType] || '📌'}</div>
              <div class="mc-main">
                <div class="mc-title">${esc(rec.title || subLabel(rec.subType))}</div>
                <div class="mc-meta">${esc(rec.mmdd)} · 周${weekdayOf(rec.mmdd)} · ${esc(subLabel(rec.subType))}${age ? ' · ' + age + '岁' : ''}</div>
                ${rec.note ? `<div class="mc-note">${esc(rec.note)}</div>` : ''}
              </div>
              <div class="mc-right">
                <span class="mc-count ${c.cls}">${c.txt}</span>
                <button class="mc-cal" data-cal="${esc(rec.id)}" title="加到日历">📅</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    setupSwipeDelete(listEl, {
      onDelete: (id) => { deleteRecord(id); toast('已删除'); renderAll(); },
    });
  }

  function renderAll() { renderHero(); renderSummary(); renderList(); }

  el.addEventListener('click', (e) => {
    const t = e.target;

    if (t.closest('[data-act="back"]')) return back();

    if (t.closest('[data-act="add"]')) {
      const rec = {
        type: 'memorial', raw: '', subType: 'birthday', title: '',
        mmdd: '01-01', year: null, note: '',
      };
      return go('result', { draft: rec });
    }

    if (t.closest('[data-act="all-cal"]')) {
      const all = allRecords().filter(r => r.type === 'memorial');
      if (!all.length) return toast('还没有可添加的纪念日');
      addToCalendar(all);
      return toast('已生成日历文件，导入后每年自动提醒');
    }

    const calBtn = t.closest('[data-cal]');
    if (calBtn) {
      e.stopPropagation();
      const rec = allRecords().find(r => r.id === calBtn.dataset.cal);
      if (rec) { addToCalendar(rec); toast('已生成日历文件，导入即可提醒'); }
      return;
    }

    const fBtn = t.closest('[data-filter]');
    if (fBtn) { filter = fBtn.dataset.filter; renderAll(); return; }

    // 点卡片（非展开态）→ 进结果页编辑
    const row = t.closest('[data-swipe]');
    if (row && !row.classList.contains('open')) {
      const rec = allRecords().find(r => r.id === row.dataset.del);
      if (rec) return go('result', { draft: rec });
    }
  });

  renderAll();
  return el;
}
