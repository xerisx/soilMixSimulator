// ── 状態チェック ──
function isAllZero() {
  return objectTypes.every(t => t.weight === 0);
}

// ── 空状態オーバーレイ ──
let emptyStateTimer = null;
function showEmptyState() {
  const el = document.getElementById('empty-state');
  if (!el) return;
  el.hidden = false;
  clearTimeout(emptyStateTimer);
  emptyStateTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ── 全て0 ──
function clearAllWeights() {
  objectTypes.forEach(t => { t.weight = 0; });
  selectedCommercialSoil = null;
  if (spawnInterval) { clearInterval(spawnInterval); spawnInterval = null; }
  setParticleControlsDisabled(false);
  renderObjList();
  updateGraphs();
  updateBaseLabel();
}

// ── タブ切替 ──
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `tab-${tabId}`);
  });
  const presetBar = document.getElementById('preset-bar');
  if (presetBar) presetBar.hidden = (tabId === 'commercial');
}

// ── 市販の用土リスト描画 ──
function renderCommercialList() {
  const list = document.getElementById('commercial-list');
  if (!list) return;
  list.innerHTML = '';

  const sorted = sortedByFavorite(COMMERCIAL_SOILS, 'commercial_soil');

  sorted.forEach(soil => {
    const item = document.createElement('div');
    item.className = 'commercial-item' +
      (selectedCommercialSoil?.id === soil.id ? ' selected' : '');
    item.dataset.id = soil.id;
    const favActive = isFavorite('commercial_soil', soil.id) ? ' active' : '';
    item.innerHTML = `
      <div class="commercial-header">
        <div class="commercial-name">${soil.name}</div>
        <button class="fav-btn${favActive}" data-fav-type="commercial_soil" data-fav-id="${soil.id}" aria-label="お気に入り">★</button>
      </div>
      <div class="commercial-meta">
        <span class="commercial-category">${soil.category}</span>
        <span class="commercial-desc">${soil.description}</span>
      </div>
    `;
    // 用土を適用（星ボタン以外のクリック）
    item.addEventListener('click', e => {
      if (!e.target.closest('.fav-btn')) applyCommercialSoil(soil.id);
    });
    // 星ボタン
    item.querySelector('.fav-btn').addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite('commercial_soil', soil.id);
      renderCommercialList();
    });
    list.appendChild(item);
  });
}

// ── 市販の用土を適用 ──
function applyCommercialSoil(soilId) {
  const soil = COMMERCIAL_SOILS.find(s => s.id === soilId);
  if (!soil) return;

  // 全資材をいったんゼロに
  objectTypes.forEach(t => { t.weight = 0; });

  // プリセット値を適用
  soil.materials.forEach(({ id, weight, size }) => {
    const type = objectTypes.find(t => t.id === id);
    if (type) { type.weight = weight; type.size = size; }
  });

  selectedCommercialSoil = soil;
  renderCommercialList();   // selected クラスを更新
  renderObjList();
  updateGraphs();
  updateBaseLabel();
}

// ── ツールチップ ──
const tooltipEl = document.getElementById('tooltip');
let tipHideTimer = null;
let activeTipIcon = null;

function showTip(icon) {
  clearTimeout(tipHideTimer);
  if (activeTipIcon && activeTipIcon !== icon) {
    activeTipIcon.classList.remove('tip-active');
  }
  activeTipIcon = icon;
  icon.classList.add('tip-active');

  tooltipEl.textContent = icon.dataset.tip;
  tooltipEl.style.display = 'block';
  tooltipEl.style.visibility = 'hidden';

  // 位置計算（表示後に幅を取る）
  requestAnimationFrame(() => {
    const ir = icon.getBoundingClientRect();
    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;

    let left = ir.left + ir.width / 2 - tw / 2;
    let top  = ir.top - th - 8;

    // 上が足りなければ下に表示
    if (top < 8) top = ir.bottom + 8;
    // 左右クランプ
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top  = `${top}px`;
    tooltipEl.style.visibility = 'visible';
  });
}

function hideTip() {
  tipHideTimer = setTimeout(() => {
    tooltipEl.style.display = 'none';
    if (activeTipIcon) {
      activeTipIcon.classList.remove('tip-active');
      activeTipIcon = null;
    }
  }, 120);
}

function setupTooltips(root = document) {
  root.querySelectorAll('.tip-icon').forEach(icon => {
    // PC: hover
    icon.addEventListener('mouseenter', () => showTip(icon));
    icon.addEventListener('mouseleave', hideTip);
    // スマホ: タップでトグル
    icon.addEventListener('touchstart', e => {
      e.preventDefault();
      if (activeTipIcon === icon) { hideTip(); } else { showTip(icon); }
    }, { passive: false });
  });
}

// 他の場所をタップしたら閉じる
document.addEventListener('touchstart', e => {
  if (activeTipIcon && !e.target.classList.contains('tip-icon')) hideTip();
});

// ── 物体リスト UI ──
// カード1枚を生成してlistに追加し、イベントを即座にバインド
function appendObjCard(list, type) {
  const i = objectTypes.findIndex(t => t.id === type.id);
  const card = document.createElement('div');
  card.className = 'obj-card';
  const tipAttr = type.tooltip
    ? `<span class="tip-icon" data-tip="${type.tooltip}">?</span>`
    : '';
  const favActive = isFavorite('material', type.id) ? ' active' : '';
  const tags = getMaterialTags(type);
  const tagsHtml = `<div class="mat-tags">${tags.map(t => `<span class="mat-tag" data-tag="${t}">${t}</span>`).join('')}</div>`;
  const leftInfoHtml = type.hasSize === false
    ? `<div class="obj-left-info"></div>`
    : (() => {
        const grain   = type.sizes[type.size];
        const dotSize = Math.round(Math.min(12, Math.max(3, grain.max * 0.5)));
        return `<div class="obj-left-info">
          <div class="obj-sizes">
            ${['S', 'M', 'L'].map(s =>
              `<button class="obj-size-btn${type.size === s ? ' active' : ''}" data-idx="${i}" data-size="${s}">${s}</button>`
            ).join('')}
          </div>
          <div class="size-grain-info">
            <span class="size-grain-dot" style="width:${dotSize}px;height:${dotSize}px"></span>
            <span class="size-grain-label">${grain.min}〜${grain.max}mm</span>
          </div>
        </div>`;
      })();
  card.innerHTML = `
    <div class="obj-name-row">
      <span class="obj-name">${type.name}${tipAttr}</span>
      ${tagsHtml}
      <button class="fav-btn${favActive}" data-fav-type="material" data-fav-id="${type.id}" aria-label="お気に入り">★</button>
    </div>
    <div class="obj-main-row">
      ${leftInfoHtml}
      <div class="ratio-row">
        <input type="range" class="ratio-slider" min="0" max="5" step="0.1" value="${type.weight}" data-idx="${i}">
        <span class="ratio-val${type.weight === 0 ? ' ratio-val-zero' : ''}" data-idx="${i}">${type.weight.toFixed(1)}</span>
      </div>
    </div>
  `;
  list.appendChild(card);

  card.querySelectorAll('.obj-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      objectTypes[idx].size = btn.dataset.size;
      btn.closest('.obj-sizes').querySelectorAll('.obj-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const newSize  = btn.dataset.size;
      const newGrain = objectTypes[idx].sizes[newSize];
      const newDot   = Math.round(Math.min(12, Math.max(3, newGrain.max * 0.5)));
      const c      = btn.closest('.obj-card');
      const dotEl  = c.querySelector('.size-grain-dot');
      const labelEl = c.querySelector('.size-grain-label');
      const hintEl  = c.querySelector('.size-grain-hint');
      if (dotEl)   { dotEl.style.width = newDot + 'px'; dotEl.style.height = newDot + 'px'; }
      if (labelEl) labelEl.textContent = `${newGrain.min}〜${newGrain.max}mm`;
      if (hintEl)  hintEl.textContent  = SIZE_HINTS[newSize] ? `· ${SIZE_HINTS[newSize]}` : '';
      updateGraphs();
    });
  });

  card.querySelector('.ratio-slider').addEventListener('input', (e) => {
    const idx = Number(e.target.dataset.idx);
    const newWeight = Number(e.target.value);
    objectTypes[idx].weight = newWeight;
    const valEl = card.querySelector('.ratio-val');
    valEl.textContent = newWeight.toFixed(1);
    valEl.classList.toggle('ratio-val-zero', newWeight === 0);
    selectedCommercialSoil = null;
    activePreset = null;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    updateBaseLabel();
    updateGraphs();

  });

  // 値確定時（指を離した後 / クリック後）に境界を越えていたらアコーディオン間を移動
  // お気に入りは常にactiveに留まるため対象外
  card.querySelector('.ratio-slider').addEventListener('change', (e) => {
    if (isFavorite('material', type.id)) return;
    const weight = objectTypes[Number(e.target.dataset.idx)].weight;
    const wasActive = card.closest('[data-accordion="active"]') !== null;
    const shouldBeActive = weight > 0;
    if (wasActive !== shouldBeActive) {
      moveBetweenAccordions(card, shouldBeActive);
    }
  });

  card.querySelector('.fav-btn').addEventListener('click', () => {
    toggleFavorite('material', type.id);
    renderObjList();
  });

  setupTooltips(card);
}

function moveBetweenAccordions(card, toActive) {
  const list = document.getElementById('obj-list');
  if (!list) return;
  const targetBody = list.querySelector(
    toActive ? '[data-accordion="active"]' : '[data-accordion="inactive"]'
  );
  if (targetBody) targetBody.appendChild(card);
  updateAccordionHeaders(list);
}

function updateAccordionHeaders(list) {
  const activeBody   = list.querySelector('[data-accordion="active"]');
  const inactiveBody = list.querySelector('[data-accordion="inactive"]');
  if (!activeBody || !inactiveBody) return;
  const activeHeader   = activeBody.closest('.mat-accordion').querySelector('span:first-child');
  const inactiveHeader = inactiveBody.closest('.mat-accordion').querySelector('span:first-child');
  if (activeHeader)   activeHeader.textContent   = `使用中 / お気に入り（${activeBody.querySelectorAll('.obj-card').length}件）`;
  if (inactiveHeader) inactiveHeader.textContent = `その他の資材（${inactiveBody.querySelectorAll('.obj-card').length}件）`;
}

function createMatAccordion(label, open, key) {
  const el = document.createElement('div');
  el.className = 'mat-accordion';

  const header = document.createElement('button');
  header.className = 'mat-accordion-header' + (open ? ' open' : '');
  header.innerHTML = `<span>${label}</span><span class="mat-accordion-arrow">▾</span>`;

  const body = document.createElement('div');
  body.className = 'mat-accordion-body';
  if (key) body.dataset.accordion = key;
  if (!open) body.hidden = true;

  header.addEventListener('click', () => {
    const nowOpen = body.hidden;
    body.hidden = !nowOpen;
    header.classList.toggle('open', nowOpen);
  });

  el.appendChild(header);
  el.appendChild(body);
  return { el, body };
}

function renderObjList() {
  const list = document.getElementById('obj-list');

  // 再描画前にアコーディオンの開閉状態を保存
  const prevActiveOpen   = (() => { const b = list.querySelector('[data-accordion="active"]');   return b ? !b.hidden : true;  })();
  const prevInactiveOpen = (() => { const b = list.querySelector('[data-accordion="inactive"]'); return b ? !b.hidden : false; })();

  list.innerHTML = '';

  // お気に入り・使用中: 全お気に入り（上部）→ 非お気に入りでweight>0（下部）
  const favActive    = objectTypes.filter(t => isFavorite('material', t.id) && t.weight > 0);
  const favZero      = objectTypes.filter(t => isFavorite('material', t.id) && t.weight === 0);
  const nonFavActive = objectTypes.filter(t => !isFavorite('material', t.id) && t.weight > 0);
  const activeAll = [...favActive, ...favZero, ...nonFavActive];

  // その他: weight===0 かつ非お気に入り
  const inactive = sortedByFavorite(
    objectTypes.filter(t => t.weight === 0 && !isFavorite('material', t.id)),
    'material'
  );

  // アコーディオン1: 使用中 / お気に入り
  const activeSection = createMatAccordion(`使用中 / お気に入り（${activeAll.length}件）`, prevActiveOpen, 'active');
  activeAll.forEach(type => appendObjCard(activeSection.body, type));
  list.appendChild(activeSection.el);

  // アコーディオン2: その他の資材
  const inactiveSection = createMatAccordion(`その他の資材（${inactive.length}件）`, prevInactiveOpen, 'inactive');
  inactive.forEach(type => appendObjCard(inactiveSection.body, type));
  list.appendChild(inactiveSection.el);
}
