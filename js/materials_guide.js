// 資材ガイドページ描画スクリプト

// ── サイズ補正（analysis.js と同じロジック）──
const GUIDE_SIZE_EFFECT = {
  S: { drainage: -12, waterRetention:  12, aeration: -10, nutrientRetention:  8 },
  M: { drainage:   0, waterRetention:   0, aeration:   0, nutrientRetention:  0 },
  L: { drainage:  12, waterRetention: -12, aeration:  10, nutrientRetention: -8 },
};

function getAdjustedParamsForGuide(mat, size) {
  const effect = GUIDE_SIZE_EFFECT[size] ?? GUIDE_SIZE_EFFECT.M;
  const sens   = mat.sizeSensitivity ?? 0.5;
  const p      = mat.params;
  const clamp  = v => Math.min(100, Math.max(0, Math.round(v)));
  return {
    drainage:          clamp(p.drainage          + effect.drainage          * sens),
    waterRetention:    clamp(p.waterRetention    + effect.waterRetention    * sens),
    aeration:          clamp(p.aeration          + effect.aeration          * sens),
    nutrientRetention: clamp(p.nutrientRetention + effect.nutrientRetention * sens),
  };
}

const BASIC_PARAMS = [
  { key: 'drainage',          label: '排水性', color: '#0284C7' },
  { key: 'waterRetention',    label: '保水性', color: '#16A34A' },
  { key: 'aeration',          label: '通気性', color: '#64748B' },
  { key: 'nutrientRetention', label: '保肥力', color: '#D97706' },
];

const ADV_PARAMS = [
  { key: 'porosity',        label: '空隙率'   },
  { key: 'coarseRatio',     label: '粗粒比率' },
  { key: 'compressibility', label: '圧縮率'   },
  { key: 'infiltration',    label: '浸透速度' },
];

// ── 要約ラベル ──
function getSummaryLabel(params) {
  const d = params.drainage;
  const w = params.waterRetention;
  const a = params.aeration;
  const n = params.nutrientRetention ?? 0;
  if (n >= 80)              return '保肥力が高い';
  if (n >= 65 && w >= 70)   return '保水・保肥型';
  if (w >= 85)              return '高保水型';
  if (d >= 85 && a >= 80)   return '排水・通気特化';
  if (d >= 70 && a >= 70)   return '通気・排水重視';
  if (w >= 70)              return '保水寄り';
  return 'バランス型';
}

// ── HTML部品 ──
function barRow(label, value, color, isAdv = false, paramKey = '') {
  const trackClass = isAdv ? 'mat-adv-bar-track' : 'mat-bar-track';
  const fillStyle  = isAdv
    ? `style="width:${value}%"`
    : `style="width:${value}%; background:${color}"`;
  const fillClass  = isAdv ? 'mat-adv-bar-fill' : 'mat-bar-fill';
  const dataParam  = paramKey ? ` data-param="${paramKey}"` : '';
  return `<div class="mat-bar-row"${dataParam}>
      <span class="mat-bar-label">${label}</span>
      <div class="${trackClass}"><div class="${fillClass}" ${fillStyle}></div></div>
      <span class="mat-bar-pct">${value}%</span>
    </div>`;
}

function sizeRow(sizes) {
  if (!sizes) return '';
  const chips = ['S', 'M', 'L']
    .filter(s => sizes[s])
    .map(s => `<button class="mat-size-chip${s === 'M' ? ' active' : ''}" data-size="${s}">
        <span class="mat-size-label">${s}</span>
        <span class="mat-size-range">${sizes[s].min}〜${sizes[s].max}mm</span>
      </button>`)
    .join('');
  return chips ? `<div class="mat-sizes">${chips}</div>` : '';
}

function renderCard(mat, favIds = new Set()) {
  const isFav  = favIds.has(mat.id);
  const badge  = mat.params.organic
    ? `<span class="mat-badge mat-badge-organic">🌿 有機</span>`
    : `<span class="mat-badge mat-badge-inorganic">🪨 無機</span>`;

  const summary = getSummaryLabel(mat.params);

  const basicBars = BASIC_PARAMS
    .filter(p => mat.params[p.key] !== undefined)
    .map(p => barRow(p.label, mat.params[p.key], p.color, false, p.key))
    .join('');

  const advBars = ADV_PARAMS
    .filter(p => mat.advanced?.[p.key] !== undefined)
    .map(p => barRow(p.label, mat.advanced[p.key], null, true))
    .join('');

  const detailSection = mat.detail ? `
    <div class="mat-detail-wrap">
      <button class="mat-detail-toggle" aria-expanded="false">詳しい説明を見る ▼</button>
      <div class="mat-acc-wrap">
        <div class="mat-acc-inner">
          <p class="mat-detail-text">${mat.detail}</p>
        </div>
      </div>
    </div>` : '';

  const advSection = advBars ? `
    <hr class="mat-divider">
    <div class="mat-params-section">
      <button class="mat-adv-toggle" aria-expanded="false">詳細パラメータを見る ▼</button>
      <div class="mat-acc-wrap">
        <div class="mat-acc-inner">
          <div class="mat-adv-content">${advBars}</div>
        </div>
      </div>
    </div>` : '';

  return `<article class="mat-card" data-id="${mat.id}" data-organic="${mat.params.organic ? '1' : '0'}">
    <div class="mat-card-accent" style="background:${mat.color}"></div>
    <div class="mat-card-body">

      <div class="mat-card-header">
        <div class="mat-card-name-wrap">
          <h2 class="mat-card-name">${mat.name}</h2>
          <span class="mat-summary">${summary}</span>
        </div>
        <div class="mat-card-header-right">
          ${badge}
          <button class="fav-btn${isFav ? ' active' : ''}" data-fav-id="${mat.id}" aria-label="お気に入り">★</button>
        </div>
      </div>

      <p class="mat-desc">${mat.tooltip}</p>

      ${detailSection}

      ${sizeRow(mat.sizes)}

      <hr class="mat-divider">

      <div class="mat-params-section">
        ${basicBars}
      </div>

      ${advSection}

    </div>
  </article>`;
}

// ── お気に入り（main.js と同じキー・同じ形式を参照）──
const FAVORITES_KEY = 'qsoil_favorites';

function getFavoriteMaterialIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY));
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter(f => f.type === 'material').map(f => f.id)
        : []
    );
  } catch { return new Set(); }
}

function toggleFavoriteMaterial(id) {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY));
    let favs = Array.isArray(parsed) ? parsed : [];
    const exists = favs.some(f => f.type === 'material' && f.id === id);
    favs = exists
      ? favs.filter(f => !(f.type === 'material' && f.id === id))
      : [...favs, { type: 'material', id }];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch {}
}

// ── 描画 & コントロール ──
const grid      = document.getElementById('card-grid');
const emptyMsg  = document.getElementById('guide-empty');
const countEl   = document.getElementById('guide-count');
const searchEl  = document.getElementById('guide-search');
const sortEl    = document.getElementById('guide-sort');

// 全カードを一度だけ生成（初期お気に入り状態を反映）
grid.innerHTML = MATERIALS.map(mat => renderCard(mat, getFavoriteMaterialIds())).join('');

// カードグリッドのクリックイベント（お気に入り + アコーディオン）
grid.addEventListener('click', e => {
  // サイズ切り替え（カードごと）
  const sizeChip = e.target.closest('.mat-size-chip');
  if (sizeChip) {
    const card = sizeChip.closest('.mat-card');
    const size = sizeChip.dataset.size;
    card.querySelectorAll('.mat-size-chip').forEach(c => c.classList.remove('active'));
    sizeChip.classList.add('active');
    updateCardBars(card, size);
    return;
  }

  // お気に入りボタン
  const favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    const id = favBtn.dataset.favId;
    toggleFavoriteMaterial(id);
    favBtn.classList.toggle('active');
    applyControls(); // 並び順を再計算
    return;
  }

  // アコーディオン
  const btn = e.target.closest('.mat-adv-toggle, .mat-detail-toggle');
  if (!btn) return;
  const wrap = btn.nextElementSibling; // .mat-acc-wrap
  const isOpen = wrap.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(isOpen));
  if (btn.classList.contains('mat-adv-toggle')) {
    btn.textContent = isOpen ? '詳細パラメータを隠す ▲' : '詳細パラメータを見る ▼';
  } else {
    btn.textContent = isOpen ? '詳しい説明を閉じる ▲' : '詳しい説明を見る ▼';
  }
});

// ── フィルタ・ソート・検索 ──
let currentFilter = 'all';
let currentSort   = '';
let currentSearch = '';

function updateCardBars(card, size) {
  const mat = MATERIALS.find(m => m.id === card.dataset.id);
  if (!mat) return;
  const adj = getAdjustedParamsForGuide(mat, size);

  const summaryEl = card.querySelector('.mat-summary');
  if (summaryEl) summaryEl.textContent = getSummaryLabel(adj);

  BASIC_PARAMS.forEach(p => {
    const row = card.querySelector(`.mat-bar-row[data-param="${p.key}"]`);
    if (!row || adj[p.key] === undefined) return;
    const val = adj[p.key];
    row.querySelector('.mat-bar-fill').style.width = `${val}%`;
    row.querySelector('.mat-bar-pct').textContent = `${val}%`;
  });
}

function applyControls() {
  const cards = Array.from(grid.querySelectorAll('.mat-card'));
  const query = currentSearch.trim().toLowerCase();

  // フィルタ & 検索で表示/非表示
  let visible = 0;
  cards.forEach(card => {
    const isOrganic = card.dataset.organic === '1';
    const name = card.querySelector('.mat-card-name').textContent.toLowerCase();
    const matchFilter =
      currentFilter === 'all' ||
      (currentFilter === 'organic'   &&  isOrganic) ||
      (currentFilter === 'inorganic' && !isOrganic);
    const matchSearch = !query || name.includes(query);
    const show = matchFilter && matchSearch;
    card.hidden = !show;
    if (show) visible++;
  });

  // 並び替え: お気に入り優先、次に currentSort 条件
  // お気に入りが変わる可能性があるため毎回読み込む
  const favIds = getFavoriteMaterialIds();
  const visibleCards = cards.filter(c => !c.hidden);
  visibleCards.sort((a, b) => {
    const favA = favIds.has(a.dataset.id) ? 1 : 0;
    const favB = favIds.has(b.dataset.id) ? 1 : 0;
    if (favB !== favA) return favB - favA; // お気に入りを先頭グループへ
    if (!currentSort) return 0;            // ソート未指定なら同グループ内の順序を維持
    const matA = MATERIALS.find(m => m.id === a.dataset.id);
    const matB = MATERIALS.find(m => m.id === b.dataset.id);
    return (matB.params[currentSort] ?? 0) - (matA.params[currentSort] ?? 0);
  });
  visibleCards.forEach(c => grid.appendChild(c));

  countEl.textContent = `${visible} 件`;
  emptyMsg.hidden = visible > 0;
}

// フィルタボタン
document.querySelectorAll('.guide-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.guide-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyControls();
  });
});

// ソート
sortEl.addEventListener('change', () => {
  currentSort = sortEl.value;
  sortEl.classList.toggle('is-sorting', !!currentSort);
  applyControls();
});

// 検索
searchEl.addEventListener('input', () => {
  currentSearch = searchEl.value;
  applyControls();
});

// 初期表示
applyControls();
