'use strict';

const APP_VERSION = '1.0.0';
const STORAGE_KEY = 'money-memo-v1';

/* ---------- 기본 데이터 ---------- */

const PALETTE = ['#2f6fed', '#f59f00', '#12b886', '#e64980', '#7950f2', '#fd7e14', '#15aabf', '#82c91e', '#868e96', '#fa5252'];

const DEFAULT_CATEGORIES = [
  ['cat-home', '주거'], ['cat-sub', '구독'], ['cat-tel', '통신'], ['cat-ins', '보험'],
  ['cat-move', '교통'], ['cat-util', '공과금'], ['cat-loan', '대출'], ['cat-save', '저축·투자'], ['cat-etc', '기타'],
].map(([id, name], i) => ({ id, name, color: PALETTE[i % PALETTE.length] }));

// 카테고리를 직접 고르지 않으면 이름으로 자동 분류 (위에서부터 먼저 맞는 것)
const AUTO_RULES = [
  ['대출', ['대출', '이자', '할부']],
  ['주거', ['월세', '관리비', '전세', '집세']],
  ['구독', ['구독', '넷플릭스', '유튜브', '클로드', 'claude', 'gpt', '챗지피티', '디즈니', '왓챠', '티빙', '웨이브', '쿠팡', '멜론', '스포티파이', 'spotify', '애플', 'icloud', '아이클라우드', '네이버플러스', '멤버십']],
  ['통신', ['통신', '휴대폰', '핸드폰', '폰요금', '인터넷', 'skt', 'kt', 'lg', '알뜰']],
  ['보험', ['보험', '실비', '실손']],
  ['교통', ['교통', '주유', '기름', '자동차', '주차', '버스', '지하철', '택시']],
  ['공과금', ['전기', '가스', '수도', '공과금', '난방']],
  ['저축·투자', ['적금', '청약', '저축', '투자', '연금', 'isa']],
];

// 개인 데이터는 공개 코드에 넣지 않음. 처음엔 빈 상태로 시작하고 백업 파일로 불러옴.
function seedData() {
  return {
    version: 1,
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    fixed: [],
    portfolios: [],
    tx: [],
    meta: { lastBackup: null, fixedSort: 'category', currentPid: null },
  };
}

/* ---------- 저장 ---------- */

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* 손상된 데이터면 빈 상태로 시작 */ }
  return seedData();
}
function normalize(d) {
  const base = seedData();
  return {
    version: 1,
    categories: Array.isArray(d.categories) ? d.categories : base.categories,
    fixed: Array.isArray(d.fixed) ? d.fixed : [],
    portfolios: Array.isArray(d.portfolios) ? d.portfolios : [],
    tx: Array.isArray(d.tx) ? d.tx : [],
    meta: { ...base.meta, ...(d.meta || {}) },
  };
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('저장에 실패했어요. 백업 파일을 먼저 저장해 주세요.'); }
}

/* ---------- 유틸 ---------- */

const $ = (s, el = document) => el.querySelector(s);
const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
const num = (n) => Number(n).toLocaleString('ko-KR');
const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseAmount = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}

function fmtDate(d) {
  if (!d) return '날짜 미상';
  const [y, m, day] = d.split('-');
  return `${y}.${m}.${day}`;
}

/* ---------- 고정비 ---------- */

function catById(id) { return state.categories.find((c) => c.id === id); }
function autoCategory(name) {
  const lower = name.toLowerCase();
  for (const [catName, words] of AUTO_RULES) {
    if (words.some((w) => lower.includes(w))) {
      const c = state.categories.find((x) => x.name === catName);
      if (c) return c;
    }
  }
  return state.categories.find((x) => x.name === '기타') || state.categories[state.categories.length - 1];
}
function resolveCat(item) {
  const chosen = item.categoryId && catById(item.categoryId);
  if (chosen) return { cat: chosen, auto: false };
  return { cat: autoCategory(item.name), auto: true };
}
const monthly = (item) => item.cycle === 'yearly' ? item.amount / 12 : item.amount;
const yearly = (item) => item.cycle === 'yearly' ? item.amount : item.amount * 12;

function renderFixed() {
  const items = state.fixed;
  const mTotal = items.reduce((s, i) => s + monthly(i), 0);
  const yTotal = items.reduce((s, i) => s + yearly(i), 0);
  $('#fixed-month-total').textContent = won(mTotal);
  $('#fixed-year-total').textContent = won(yTotal);

  // 카테고리 막대
  const byCat = new Map();
  for (const it of items) {
    const { cat } = resolveCat(it);
    const g = byCat.get(cat.id) || { cat, total: 0, items: [] };
    g.total += monthly(it); g.items.push(it);
    byCat.set(cat.id, g);
  }
  const groups = [...byCat.values()].sort((a, b) => b.total - a.total);
  $('#category-bars').innerHTML = groups.length ? groups.map((g) => {
    const pct = mTotal ? (g.total / mTotal) * 100 : 0;
    return `<div class="bar-row">
      <span class="bar-name">${esc(g.cat.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${g.cat.color}"></div></div>
      <span class="bar-val">${won(g.total)} · ${pct.toFixed(0)}%</span>
    </div>`;
  }).join('') : '<p class="muted small">항목을 추가하면 비중이 보여요.</p>';

  // 목록
  document.querySelectorAll('#fixed-sort button').forEach((b) => b.classList.toggle('on', b.dataset.sort === state.meta.fixedSort));
  const row = (it) => {
    const { cat, auto } = resolveCat(it);
    const sub = [cat.name + (auto ? ' (자동)' : ''), it.cycle === 'yearly' ? `연 ${won(it.amount)}` : '', it.memo].filter(Boolean).join(' · ');
    return `<button class="row" data-fixed="${esc(it.id)}">
      <span class="dot" style="background:${cat.color}"></span>
      <span class="row-main"><div class="row-name">${esc(it.name)}${it.cycle === 'yearly' ? '<span class="badge">연납</span>' : ''}</div><div class="row-sub">${esc(sub)}</div></span>
      <span class="row-amt">${won(monthly(it))}<div class="row-sub">/월</div></span>
    </button>`;
  };
  let html;
  if (state.meta.fixedSort === 'amount') {
    const sorted = [...items].sort((a, b) => monthly(b) - monthly(a));
    html = sorted.length ? `<div class="group">${sorted.map(row).join('')}</div>` : '';
  } else {
    html = groups.map((g) => `<div class="group">
      <div class="group-head"><span>${esc(g.cat.name)}</span><span>${won(g.total)}</span></div>
      ${g.items.sort((a, b) => monthly(b) - monthly(a)).map(row).join('')}
    </div>`).join('');
  }
  $('#fixed-list').innerHTML = html;
  $('#fixed-empty').hidden = items.length > 0;
}

function openFixedSheet(id) {
  const it = id ? state.fixed.find((x) => x.id === id) : { name: '', amount: '', cycle: 'monthly', categoryId: null, memo: '' };
  if (!it) return;
  const cats = [{ id: '', name: '자동' }, ...state.categories];
  openSheet(id ? '고정비 수정' : '고정비 추가', `
    <label class="field"><span>이름</span><input name="name" value="${esc(it.name)}" placeholder="예: 월세, 넷플릭스" required maxlength="30"></label>
    <div class="two">
      <label class="field"><span>금액(원)</span><input name="amount" inputmode="numeric" value="${it.amount ? num(it.amount) : ''}" placeholder="0" required></label>
      <label class="field"><span>결제 주기</span>
        <select name="cycle">
          <option value="monthly" ${it.cycle !== 'yearly' ? 'selected' : ''}>매월</option>
          <option value="yearly" ${it.cycle === 'yearly' ? 'selected' : ''}>매년</option>
        </select>
      </label>
    </div>
    <div class="field"><span>카테고리</span>
      <div class="cat-picks">${cats.map((c) => `<label class="${c.id ? '' : 'auto'}"><input type="radio" name="categoryId" value="${esc(c.id)}" ${(it.categoryId || '') === c.id ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div>
      <div class="hint" id="auto-hint"></div>
    </div>
    <label class="field"><span>메모 (선택)</span><input name="memo" value="${esc(it.memo)}" maxlength="50"></label>
    <div class="sheet-actions">
      ${id ? '<button type="button" class="btn danger" data-act="delete">삭제</button>' : ''}
      <button class="btn primary">${id ? '저장' : '추가'}</button>
    </div>`,
  (f) => {
    const data = {
      name: f.name.value.trim(),
      amount: parseAmount(f.amount.value),
      cycle: f.cycle.value,
      categoryId: f.categoryId.value || null,
      memo: f.memo.value.trim(),
    };
    if (!data.name || !data.amount) { toast('이름과 금액을 입력해 주세요.'); return false; }
    if (id) Object.assign(it, data); else state.fixed.push({ id: uid('fx'), ...data });
    save(); renderFixed(); toast(id ? '수정했어요' : '추가했어요');
  },
  () => {
    if (!confirm(`'${it.name}' 항목을 삭제할까요?`)) return false;
    state.fixed = state.fixed.filter((x) => x.id !== id);
    save(); renderFixed(); toast('삭제했어요');
  });

  const f = $('#sheet-form');
  const hint = () => {
    const name = f.name.value.trim();
    $('#auto-hint').textContent = name ? `자동으로 두면 '${autoCategory(name).name}'(으)로 분류돼요.` : '';
  };
  f.name.addEventListener('input', hint); hint();
  attachAmountFormat(f.amount);
}

function attachAmountFormat(input) {
  input.addEventListener('input', () => {
    const v = parseAmount(input.value);
    input.value = v ? num(v) : '';
  });
}

/* ---------- 투자 ---------- */

const TX_LABEL = { buy: '매수', sell: '매도', deposit: '입금', withdraw: '출금' };

function currentPortfolio() {
  let p = state.portfolios.find((x) => x.id === state.meta.currentPid);
  if (!p) { p = state.portfolios[0]; if (p) state.meta.currentPid = p.id; }
  return p;
}
function orderedTx(pid) {
  // 날짜 없는 기록은 맨 앞(가장 오래된 것), 같은 날짜는 입력 순서
  return state.tx
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.pid === pid)
    .sort((a, b) => (a.t.date || '').localeCompare(b.t.date || '') || a.i - b.i)
    .map(({ t }) => t);
}
function computePortfolio(pid) {
  const r = { deposit: 0, withdraw: 0, buy: 0, sell: 0, realized: 0, holdings: new Map() };
  for (const t of orderedTx(pid)) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'deposit') r.deposit += amt;
    else if (t.type === 'withdraw') r.withdraw += amt;
    else if (t.type === 'buy' || t.type === 'sell') {
      const h = r.holdings.get(t.asset) || { asset: t.asset, qty: 0, cost: 0, brokers: new Set(), realized: 0 };
      const qty = Number(t.qty) || 0;
      if (t.type === 'buy') {
        h.qty += qty; h.cost += amt; r.buy += amt;
      } else {
        const avg = h.qty ? h.cost / h.qty : 0;
        const costOut = avg * Math.min(qty, h.qty);
        h.realized += amt - costOut; r.realized += amt - costOut;
        h.cost -= costOut; h.qty -= qty; r.sell += amt;
        if (h.qty <= 0) { h.qty = 0; h.cost = 0; }
      }
      if (t.broker) h.brokers.add(t.broker);
      r.holdings.set(t.asset, h);
    }
  }
  r.cash = r.deposit - r.withdraw - r.buy + r.sell;
  r.active = [...r.holdings.values()].filter((h) => h.qty > 0).sort((a, b) => b.cost - a.cost);
  r.closed = [...r.holdings.values()].filter((h) => h.qty <= 0);
  r.invested = r.active.reduce((s, h) => s + h.cost, 0);
  return r;
}

function renderInvest() {
  const p = currentPortfolio();
  $('#portfolio-chips').innerHTML = state.portfolios.map((x) =>
    `<button class="chip ${p && x.id === p.id ? 'on' : ''}" data-pid="${esc(x.id)}">${esc(x.name)}</button>`).join('');

  if (!p) {
    $('#pf-name').textContent = '투자 묶음이 없어요';
    $('#pf-invested').textContent = won(0);
    $('#pf-stats').innerHTML = ''; $('#pf-note').textContent = '설정 탭에서 투자 묶음을 추가해 주세요.';
    $('#holdings').innerHTML = ''; $('#tx-list').innerHTML = '';
    return;
  }
  const r = computePortfolio(p.id);
  $('#pf-name').textContent = p.name;
  $('#pf-invested').textContent = won(r.invested);
  $('#pf-note').textContent = p.note || '';
  const sign = (v) => (v > 0 ? 'plus' : v < 0 ? 'minus' : '');
  $('#pf-stats').innerHTML = [
    ['받은 원금', won(r.deposit), ''],
    ['빼서 쓴 돈', won(r.withdraw), ''],
    ['실현 손익', (r.realized > 0 ? '+' : '') + won(r.realized), sign(r.realized)],
    ['남은 현금', won(r.cash), r.cash < 0 ? 'minus' : ''],
  ].map(([k, v, c]) => `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`).join('');

  $('#holdings').innerHTML = r.active.length ? r.active.map((h) => {
    const w = r.invested ? (h.cost / r.invested) * 100 : 0;
    return `<div class="holding">
      <div class="holding-top"><span>${esc(h.asset)}</span><span>${won(h.cost)}</span></div>
      <div class="holding-sub"><span>${num(h.qty)}주 · ${esc([...h.brokers].join(', '))}</span><span>비중 ${w.toFixed(1)}%</span></div>
      <div class="weight-track"><div class="weight-fill" style="width:${w.toFixed(1)}%"></div></div>
    </div>`;
  }).join('') + (r.closed.length ? `<p class="muted small">정리한 종목: ${r.closed.map((h) => `${esc(h.asset)} (${h.realized >= 0 ? '+' : ''}${won(h.realized)})`).join(', ')}</p>` : '')
    : '<p class="muted small">보유 종목이 없어요.</p>';

  const list = orderedTx(p.id).reverse();
  $('#tx-list').innerHTML = list.length ? `<div class="group">${list.map((t) => {
    const isTrade = t.type === 'buy' || t.type === 'sell';
    const title = isTrade ? `${t.asset}` : TX_LABEL[t.type];
    const sub = [fmtDate(t.date), isTrade ? `${TX_LABEL[t.type]} ${num(t.qty)}주` : '', t.broker, t.memo].filter(Boolean).join(' · ');
    const plus = t.type === 'deposit' || t.type === 'sell';
    return `<button class="row" data-tx="${esc(t.id)}">
      <span class="row-main"><div class="row-name">${esc(title)}${isTrade ? `<span class="badge">${TX_LABEL[t.type]}</span>` : ''}</div><div class="row-sub">${esc(sub)}</div></span>
      <span class="row-amt ${plus ? 'plus' : ''}">${plus ? '+' : '-'}${won(t.amount)}</span>
    </button>`;
  }).join('')}</div>` : '<p class="empty">거래 기록이 없어요. + 버튼으로 추가해 보세요.</p>';
}

function openTxSheet(id) {
  const p = currentPortfolio();
  if (!p) { toast('먼저 설정 탭에서 투자 묶음을 추가해 주세요.'); return; }
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const t = id ? state.tx.find((x) => x.id === id) : { type: 'buy', date: today, asset: '', qty: '', amount: '', broker: '', memo: '' };
  if (!t) return;
  const assets = [...new Set(state.tx.map((x) => x.asset).filter(Boolean))];
  const brokers = [...new Set(['토스증권', '미래에셋', ...state.tx.map((x) => x.broker).filter(Boolean)])];
  openSheet(id ? '거래 수정' : `거래 추가 · ${p.name}`, `
    <div class="two">
      <label class="field"><span>종류</span>
        <select name="type">${Object.entries(TX_LABEL).map(([k, v]) => `<option value="${k}" ${t.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <label class="field"><span>날짜</span><input type="date" name="date" value="${esc(t.date)}"></label>
    </div>
    <div class="trade-only">
      <label class="field"><span>종목</span><input name="asset" list="asset-list" value="${esc(t.asset)}" placeholder="예: QQQM"></label>
      <datalist id="asset-list">${assets.map((a) => `<option value="${esc(a)}">`).join('')}</datalist>
    </div>
    <div class="two">
      <label class="field trade-only"><span>수량(주)</span><input name="qty" inputmode="decimal" value="${t.qty || ''}" placeholder="0"></label>
      <label class="field"><span>금액(원)</span><input name="amount" inputmode="numeric" value="${t.amount ? num(t.amount) : ''}" placeholder="0" required></label>
    </div>
    <label class="field trade-only"><span>증권사</span><input name="broker" list="broker-list" value="${esc(t.broker)}"></label>
    <datalist id="broker-list">${brokers.map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
    <label class="field"><span>메모 (선택)</span><input name="memo" value="${esc(t.memo)}" maxlength="80" placeholder="예: 2,500달러, 내 계좌로 이체"></label>
    <div class="sheet-actions">
      ${id ? '<button type="button" class="btn danger" data-act="delete">삭제</button>' : ''}
      <button class="btn primary">${id ? '저장' : '추가'}</button>
    </div>`,
  (f) => {
    const type = f.type.value;
    const isTrade = type === 'buy' || type === 'sell';
    const data = {
      type, date: f.date.value,
      asset: isTrade ? f.asset.value.trim() : '',
      qty: isTrade ? parseAmount(f.qty.value) : 0,
      amount: parseAmount(f.amount.value),
      broker: isTrade ? f.broker.value.trim() : '',
      memo: f.memo.value.trim(),
    };
    if (!data.amount || (isTrade && (!data.asset || !data.qty))) { toast(isTrade ? '종목, 수량, 금액을 입력해 주세요.' : '금액을 입력해 주세요.'); return false; }
    if (id) Object.assign(t, data); else state.tx.push({ id: uid('tx'), pid: p.id, ...data });
    save(); renderInvest(); toast(id ? '수정했어요' : '추가했어요');
  },
  () => {
    if (!confirm('이 거래 기록을 삭제할까요?')) return false;
    state.tx = state.tx.filter((x) => x.id !== id);
    save(); renderInvest(); toast('삭제했어요');
  });

  const f = $('#sheet-form');
  const sync = () => {
    const isTrade = f.type.value === 'buy' || f.type.value === 'sell';
    f.querySelectorAll('.trade-only').forEach((el) => { el.hidden = !isTrade; });
  };
  f.type.addEventListener('change', sync); sync();
  attachAmountFormat(f.amount);
}

function openPortfolioSheet(id) {
  const p = id ? state.portfolios.find((x) => x.id === id) : { name: '', note: '' };
  if (!p) return;
  openSheet(id ? '투자 묶음 수정' : '투자 묶음 추가', `
    <label class="field"><span>이름</span><input name="name" value="${esc(p.name)}" placeholder="예: 토스증권 내 돈" required maxlength="20"></label>
    ${id ? '' : '<label class="field"><span>시작 원금(원, 선택)</span><input name="principal" inputmode="numeric" placeholder="0"><div class="hint">입력하면 \'입금\' 기록으로 들어가요.</div></label>'}
    <label class="field"><span>설명 (선택)</span><textarea name="note" maxlength="120">${esc(p.note)}</textarea></label>
    <div class="sheet-actions">
      ${id ? '<button type="button" class="btn danger" data-act="delete">삭제</button>' : ''}
      <button class="btn primary">${id ? '저장' : '추가'}</button>
    </div>`,
  (f) => {
    const name = f.name.value.trim();
    if (!name) return false;
    if (id) { p.name = name; p.note = f.note.value.trim(); }
    else {
      const np = { id: uid('pf'), name, note: f.note.value.trim() };
      state.portfolios.push(np);
      const principal = parseAmount(f.principal.value);
      if (principal) state.tx.push({ id: uid('tx'), pid: np.id, type: 'deposit', date: '', asset: '', qty: 0, amount: principal, broker: '', memo: '시작 원금' });
      state.meta.currentPid = np.id;
    }
    save(); renderAll(); toast(id ? '수정했어요' : '추가했어요');
  },
  () => {
    const count = state.tx.filter((x) => x.pid === id).length;
    if (!confirm(`'${p.name}' 묶음과 거래 기록 ${count}건을 모두 삭제할까요?`)) return false;
    state.portfolios = state.portfolios.filter((x) => x.id !== id);
    state.tx = state.tx.filter((x) => x.pid !== id);
    save(); renderAll(); toast('삭제했어요');
  });
  if (!id) attachAmountFormat($('#sheet-form').principal);
}

/* ---------- 설정 ---------- */

function renderSettings() {
  $('#app-version').textContent = APP_VERSION;
  $('#last-backup').textContent = state.meta.lastBackup
    ? `마지막 백업: ${new Date(state.meta.lastBackup).toLocaleString('ko-KR')}`
    : '아직 백업한 적이 없어요.';

  $('#category-manage').innerHTML = state.categories.map((c) => {
    const used = state.fixed.filter((f) => resolveCat(f).cat.id === c.id).length;
    return `<div class="manage-row">
      <span class="dot" style="background:${c.color}"></span>
      <span class="grow">${esc(c.name)} <span class="muted small">${used ? used + '개' : ''}</span></span>
      <button class="icon-btn" data-cat-rename="${esc(c.id)}">이름 변경</button>
      <button class="icon-btn" data-cat-del="${esc(c.id)}">삭제</button>
    </div>`;
  }).join('');

  $('#portfolio-manage').innerHTML = state.portfolios.map((p) => `<div class="manage-row">
      <span class="grow">${esc(p.name)}</span>
      <button class="icon-btn" data-pf-edit="${esc(p.id)}">수정</button>
    </div>`).join('');
}

async function exportBackup() {
  const stamp = new Date();
  const prevBackup = state.meta.lastBackup;
  state.meta.lastBackup = stamp.toISOString();
  const json = JSON.stringify({ app: 'money-memo', exportedAt: stamp.toISOString(), ...state }, null, 2);
  const ymd = stamp.toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `money-memo-backup-${ymd}.json`;
  const file = new File([json], filename, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '머니메모 백업' });
      save(); renderSettings(); toast('백업 파일을 저장했어요');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') { state.meta.lastBackup = prevBackup; return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  save(); renderSettings(); toast('백업 파일을 저장했어요');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!Array.isArray(d.fixed) || !Array.isArray(d.tx)) throw new Error('형식 오류');
      const msg = `백업 파일을 불러올까요?\n고정비 ${d.fixed.length}개, 거래 ${d.tx.length}건\n지금 폰에 있는 데이터는 이 파일로 바뀌어요.`;
      if (!confirm(msg)) return;
      state = normalize(d);
      save(); renderAll(); toast('불러왔어요');
    } catch (e) {
      toast('머니메모 백업 파일이 아니에요.');
    }
  };
  reader.readAsText(file);
}

/* ---------- 바텀시트 ---------- */

let sheetHandlers = null;
function openSheet(title, html, onSubmit, onDelete) {
  $('#sheet-title').textContent = title;
  $('#sheet-form').innerHTML = html;
  sheetHandlers = { onSubmit, onDelete };
  $('#sheet').hidden = false; $('#sheet-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true;
  document.body.style.overflow = '';
  sheetHandlers = null;
}

/* ---------- 탭, 이벤트 ---------- */

const TAB_TITLE = { fixed: '고정비', invest: '투자', settings: '설정' };
let currentTab = 'fixed';
function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + tab));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#page-title').textContent = TAB_TITLE[tab];
  $('#fab').hidden = tab === 'settings';
  window.scrollTo(0, 0);
}

function renderAll() { renderFixed(); renderInvest(); renderSettings(); }

document.addEventListener('click', (e) => {
  const el = e.target.closest('button, [data-fixed], [data-tx]');
  if (!el) return;
  const d = el.dataset;
  if (d.tab) showTab(d.tab);
  else if (d.sort) { state.meta.fixedSort = d.sort; save(); renderFixed(); }
  else if (d.fixed) openFixedSheet(d.fixed);
  else if (d.tx) openTxSheet(d.tx);
  else if (d.pid) { state.meta.currentPid = d.pid; save(); renderInvest(); }
  else if (d.pfEdit) openPortfolioSheet(d.pfEdit);
  else if (d.catRename) {
    const c = catById(d.catRename);
    const name = prompt('새 카테고리 이름', c.name);
    if (name && name.trim()) { c.name = name.trim().slice(0, 12); save(); renderAll(); }
  } else if (d.catDel) {
    const c = catById(d.catDel);
    if (state.categories.length <= 1) { toast('카테고리는 하나 이상 있어야 해요.'); return; }
    if (!confirm(`'${c.name}' 카테고리를 삭제할까요?\n여기 직접 지정한 항목은 '자동'으로 바뀌어요.`)) return;
    state.categories = state.categories.filter((x) => x.id !== c.id);
    state.fixed.forEach((f) => { if (f.categoryId === c.id) f.categoryId = null; });
    save(); renderAll();
  } else if (d.act === 'delete' && sheetHandlers) {
    if (sheetHandlers.onDelete() !== false) closeSheet();
  }
});

$('#sheet-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (sheetHandlers && sheetHandlers.onSubmit(e.target) !== false) closeSheet();
});
$('#sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

$('#fab').addEventListener('click', () => {
  if (currentTab === 'fixed') openFixedSheet(null);
  else if (currentTab === 'invest') openTxSheet(null);
});
$('#btn-export').addEventListener('click', exportBackup);
$('#import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importBackup(file);
  e.target.value = '';
});
$('#btn-add-portfolio').addEventListener('click', () => openPortfolioSheet(null));
$('#category-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name) return;
  if (state.categories.some((c) => c.name === name)) { toast('이미 있는 카테고리예요.'); return; }
  state.categories.push({ id: uid('cat'), name, color: PALETTE[state.categories.length % PALETTE.length] });
  e.target.reset(); save(); renderAll(); toast('카테고리를 추가했어요');
});
$('#btn-reset').addEventListener('click', () => {
  if (!confirm('지금 데이터를 모두 지우고 빈 상태로 되돌릴까요?\n필요하면 먼저 백업 파일을 저장하세요.')) return;
  state = seedData(); save(); renderAll(); toast('초기화했어요');
});

renderAll();
save();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
