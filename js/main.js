const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

const WALL_T = 10;
const POT_DIAMETERS = { 1: 3, 2: 6, 3: 9, 4: 12, 5: 15 }; // cm
const ADD_COUNTS = { 1: 10, 2: 32, 3: 55, 4: 77, 5: 100 };

// ── プリセット配合（resource ID → weight） ──
const PRESETS = {
  balance:  { akadama: 3, hyuga: 2, pumice: 1.5, berabon: 1 },
  drainage: { hyuga: 3, pumice: 3, perlite: 2, berabon: 1 },
  water:    { akadama: 3, vermiculite: 2, peatmoss: 2, berabon: 1 },
  nutrient: { zeolite: 3, vermiculite: 2, akadama: 2, humus: 1 },
};

// ── 資材タグ（params から自動生成） ──
function getMaterialTags(type) {
  const p = type.params;
  const tags = [p.organic ? '有機' : '無機'];
  if (p.drainage          >= 70) tags.push('排水');
  if (p.aeration          >= 78) tags.push('通気');
  if (p.waterRetention    >= 70) tags.push('保水');
  if (p.nutrientRetention >= 65) tags.push('保肥');
  if (tags.length === 1) tags.push('バランス');
  return tags.slice(0, 3);
}

// ── S/M/L サイズ意味テキスト ──
const SIZE_HINTS = { S: '保水寄り・密な充填', M: 'バランス', L: '排水・通気寄り' };
const CUP_RATIO = { topW: 0.50, botW: 0.33, hToW: 1.1 };

let currentSize = '3';
// MATERIALS（materials.js）からシミュレーション用の状態を初期化
let objectTypes = MATERIALS
  .filter(m => m.id !== 'sphagnum')
  .map(m => ({
    ...m,
    size:   'M',
    weight: 0,
  }));
let cupBodies = [];
let spawnInterval = null;
let currentCupDims = null;
let selectedCommercialSoil = null;

// ── お気に入り ──
const FAVORITES_KEY = 'qsoil_favorites';

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch {}
}

function isFavorite(type, id) {
  return favorites.some(f => f.type === type && f.id === id);
}

function toggleFavorite(type, id) {
  if (isFavorite(type, id)) {
    favorites = favorites.filter(f => !(f.type === type && f.id === id));
  } else {
    favorites.push({ type, id });
  }
  saveFavorites();
}

// お気に入りを先頭に安定ソート
function sortedByFavorite(items, type) {
  const favs = items.filter(item => isFavorite(type, item.id));
  const rest = items.filter(item => !isFavorite(type, item.id));
  return [...favs, ...rest];
}

let favorites = loadFavorites();
let compareBaseSnapshot = null; // 比較元スナップショット

const canvasEl = document.getElementById('canvas');
const engine = Engine.create({
  positionIterations: 30,
  velocityIterations: 24,
  constraintIterations: 12,
});
Matter.Resolver._slop = 0;

const render = Render.create({
  canvas: canvasEl,
  engine,
  options: {
    width: window.innerWidth,
    height: window.innerHeight,
    wireframes: false,
    background: '#F1F5F9',
  }
});

const DESKTOP_BREAKPOINT = 768;

function getCupDimensions() {
  const W = render.options.width;
  const H = render.options.height;
  const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;

  const leftOffset   = isDesktop ? Math.round(W * 0.3) : 0;
  const rightOffset  = isDesktop ? Math.round(W * 0.3) : 0;
  const bottomOffset = isDesktop ? 0 : Math.round(H * 0.55);

  const availW = W - leftOffset - rightOffset;
  const availH = H - bottomOffset;
  const cx = leftOffset + availW / 2;

  const mobileScale = isDesktop ? 1.0 : 0.72;
  const refDim = Math.min(availW, availH) * mobileScale;
  let topInnerW = refDim * CUP_RATIO.topW;
  let botInnerW = refDim * CUP_RATIO.botW;
  let cupHeight  = topInnerW * CUP_RATIO.hToW;

  const maxHeight = availH * (isDesktop ? 0.88 : 0.52);
  if (cupHeight > maxHeight) {
    const scale = maxHeight / cupHeight;
    topInnerW *= scale;
    botInnerW *= scale;
    cupHeight  = maxHeight;
  }

  const topY = isDesktop ? (availH - cupHeight) / 2 : 76;
  return { topInnerW, botInnerW, cupHeight, topY, cx };
}

function makeTrapezoidWall(absVerts) {
  const cx = absVerts.reduce((s, v) => s + v.x, 0) / absVerts.length;
  const cy = absVerts.reduce((s, v) => s + v.y, 0) / absVerts.length;
  const rel = absVerts.map(v => ({ x: v.x - cx, y: v.y - cy }));
  return Bodies.fromVertices(cx, cy, rel, {
    isStatic: true,
    render: { fillStyle: '#B45309' }
  });
}

function buildCup() {
  const { topInnerW, botInnerW, cupHeight, topY, cx } = getCupDimensions();
  const bottomY = topY + cupHeight;

  const wallL = makeTrapezoidWall([
    { x: cx - topInnerW / 2 - WALL_T, y: topY },
    { x: cx - topInnerW / 2,           y: topY },
    { x: cx - botInnerW / 2,           y: bottomY },
    { x: cx - botInnerW / 2 - WALL_T,  y: bottomY },
  ]);
  const wallR = makeTrapezoidWall([
    { x: cx + topInnerW / 2,           y: topY },
    { x: cx + topInnerW / 2 + WALL_T,  y: topY },
    { x: cx + botInnerW / 2 + WALL_T,  y: bottomY },
    { x: cx + botInnerW / 2,           y: bottomY },
  ]);
  const bottom = Bodies.rectangle(
    cx, bottomY + WALL_T / 2,
    botInnerW + WALL_T * 2, WALL_T,
    { isStatic: true, render: { fillStyle: '#B45309' } }
  );

  currentCupDims = { topInnerW, botInnerW, cupHeight, topY, bottomY, cx };
  cupBodies = [wallL, wallR, bottom];
  Composite.add(engine.world, cupBodies);
  positionCenterActions();
  adjustMobilePanelHeight();
  relocateRightPanel();
}

function positionCenterActions() {
  if (window.innerWidth < 768) return;
  const el = document.getElementById('center-actions');
  if (!el || !currentCupDims) return;
  // 鉢の外底辺(bottomY + WALL_T)の直下 14px に top 端を合わせる
  el.style.top    = (currentCupDims.bottomY + WALL_T + 14) + 'px';
  el.style.bottom = 'auto';
}

function adjustMobilePanelHeight() {
  if (window.innerWidth >= DESKTOP_BREAKPOINT) return;
  const spacer = document.getElementById('canvas-spacer');
  if (!spacer || !currentCupDims) return;
  const potBottomY = currentCupDims.bottomY + WALL_T;
  const header = document.getElementById('mobile-header');
  const headerH = header ? header.offsetHeight : 0;
  spacer.style.height = Math.max(potBottomY + 16 - headerH, 0) + 'px';
}

function relocateRightPanel() {
  const rp = document.getElementById('right-panel');
  if (!rp) return;
  if (window.innerWidth < DESKTOP_BREAKPOINT) {
    const container = document.getElementById('tab-materials');
    if (container && rp.parentNode !== container) {
      container.appendChild(rp);
    }
    rp.classList.add('rp-mobile');
  } else {
    if (rp.parentNode !== document.body) {
      document.body.appendChild(rp);
    }
    rp.classList.remove('rp-mobile');
  }
}

function clearDynamicBodies() {
  Composite.allBodies(engine.world)
    .filter(b => !b.isStatic)
    .forEach(b => Composite.remove(engine.world, b));
}

function getObjectSizePx(type) {
  const { topInnerW } = getCupDimensions();
  const pxPerMm = topInnerW / POT_DIAMETERS[currentSize] / 10;
  const { min, max } = type.sizes[type.size];
  return (min + Math.random() * (max - min)) * pxPerMm;
}

function pickObjectType() {
  const total = objectTypes.reduce((s, t) => s + t.weight, 0);
  if (total === 0) return null;
  let r = Math.random() * total;
  for (const t of objectTypes) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return objectTypes[objectTypes.length - 1];
}

// 多角形面積（ shoelace formula ）
function polygonArea(verts) {
  let area = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += verts[i].x * verts[j].y - verts[j].x * verts[i].y;
  }
  return Math.abs(area) / 2;
}

// 薄色の粒子に自動でアウトラインを付与
function lightStroke(color) {
  if (!color || color[0] !== '#') return null;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 190
    ? 'rgba(0,0,0,0.18)' : null;
}

// 正規化済み頂点配列（[-0.5,0.5]）を size でスケールして生成
function spawnPoly(x, y, size, normVerts, color, physics) {
  const scaled = normVerts.map(v => ({ x: v.x * size, y: v.y * size }));
  const stroke = lightStroke(color);
  const body = Bodies.fromVertices(x, y, scaled, {
    ...physics,
    render: { fillStyle: color, ...(stroke ? { strokeStyle: stroke, lineWidth: 1 } : {}) },
  });
  if (!body) return null;
  body.spawnTime = performance.now();
  body.isParticle = true;
  body.shapeArea = polygonArea(scaled);
  Composite.add(engine.world, body);
  Body.setAngle(body, Math.random() * Math.PI * 2);
  Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);
  return body;
}

// フォールバック用（shapeVariants 未定義の資材向け）
function spawnBox(x, y, size, color, physics) {
  const stroke = lightStroke(color);
  const box = Bodies.rectangle(x, y, size, size, {
    ...physics,
    render: { fillStyle: color, ...(stroke ? { strokeStyle: stroke, lineWidth: 1 } : {}) }
  });
  box.spawnTime = performance.now();
  box.isParticle = true;
  box.shapeArea = size * size;
  Composite.add(engine.world, box);
  Body.setAngle(box, Math.random() * Math.PI * 2);
  Body.setAngularVelocity(box, (Math.random() - 0.5) * 0.3);
  return box;
}

function spawnCircle(x, y, size, color, physics) {
  const r = size / 2;
  const stroke = lightStroke(color);
  const circle = Bodies.circle(x, y, r, {
    friction:       0.9,
    frictionStatic: 0.5,
    frictionAir:    0.01,
    density:        0.003,
    restitution:    0,
    render: { fillStyle: color, ...(stroke ? { strokeStyle: stroke, lineWidth: 1 } : {}) }
  });
  circle.spawnTime = performance.now();
  circle.isParticle = true;
  circle.shapeArea = Math.PI * r * r;
  Composite.add(engine.world, circle);
  return circle;
}

function spawnShape(x, y) {
  const type = pickObjectType();
  if (!type) return null;
  const size = getObjectSizePx(type);
  let body;
  if (type.shapeVariants?.length) {
    const verts = type.shapeVariants[Math.floor(Math.random() * type.shapeVariants.length)];
    body = spawnPoly(x, y, size, verts, type.color, type.physics);
  } else if (type.shape === 'circle') {
    body = spawnCircle(x, y, size, type.color, type.physics);
  } else {
    body = spawnBox(x, y, size, type.color, type.physics);
  }
  if (body && isAirView) {
    body._origFill = body.render.fillStyle;
    body._origStroke = body.render.strokeStyle;
    body.render.fillStyle = '#FFFFFF';
    body.render.strokeStyle = '#CBD5E1';
  }
  return body;
}

// 落下中はカード内コントロールを無効化
function setParticleControlsDisabled(disabled) {
  document.querySelectorAll('.obj-size-btn, .ratio-slider').forEach(el => {
    el.disabled = disabled;
  });
}

function startSpawning() {
  if (spawnInterval) { clearInterval(spawnInterval); spawnInterval = null; }
  setParticleControlsDisabled(true);

  const { topInnerW, topY, cx } = getCupDimensions();
  const spawnXMin = cx - topInnerW / 2 + 20;
  const spawnXMax = cx + topInnerW / 2 - 20;

  spawnInterval = setInterval(() => {
    const now = performance.now();
    const bodies = Composite.allBodies(engine.world);

    // 生成から400ms以上経過したボディが鉢上端より上にある → 溢れと判定
    const overflowed = bodies.some(b =>
      !b.isStatic &&
      b.spawnTime !== undefined &&
      now - b.spawnTime > 400 &&
      b.position.y < topY
    );
    if (overflowed) {
      clearInterval(spawnInterval);
      spawnInterval = null;
      setParticleControlsDisabled(false);
      return;
    }

    for (let n = 0; n < 4; n++) {
      const x = spawnXMin + Math.random() * (spawnXMax - spawnXMin);
      const body = spawnShape(x, topY - 60 - n * 18);
      if (body) Body.setVelocity(body, { x: 0, y: 14 });
    }
  }, 80);
}

function reset() {
  if (spawnInterval) { clearInterval(spawnInterval); spawnInterval = null; }
  setParticleControlsDisabled(false);
  cupBodies.forEach(b => Composite.remove(engine.world, b));
  cupBodies = [];
  clearDynamicBodies();
  buildCup();
}

function isAllZero() {
  return objectTypes.every(t => t.weight === 0);
}

let emptyStateTimer = null;
function showEmptyState() {
  const el = document.getElementById('empty-state');
  if (!el) return;
  el.hidden = false;
  clearTimeout(emptyStateTimer);
  emptyStateTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

function clearAllWeights() {
  objectTypes.forEach(t => { t.weight = 0; });
  selectedCommercialSoil = null;
  if (spawnInterval) { clearInterval(spawnInterval); spawnInterval = null; }
  setParticleControlsDisabled(false);
  renderObjList();
  updateGraphs();
  updateBaseLabel();
}

function applyCanvasSize() {
  render.options.width  = window.innerWidth;
  render.options.height = window.innerHeight;
  render.canvas.width   = window.innerWidth;
  render.canvas.height  = window.innerHeight;
}

let lastFillRate = -1;

// ── デバッグ用1cm格子 ──
Events.on(render, 'afterRender', () => {
  if (!currentCupDims) return;
  const { topInnerW } = currentCupDims;
  const pxPerCm = topInnerW / POT_DIAMETERS[currentSize];
  const W = render.options.width;
  const H = render.options.height;
  const ctx = render.context;

  ctx.save();
  ctx.strokeStyle = 'rgba(100,116,139,0.15)';
  ctx.lineWidth = 0.5;

  for (let x = 0; x < W; x += pxPerCm) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += pxPerCm) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();
});

// ── 鉢上部の直径をキャンバスに描画 ──
Events.on(render, 'afterRender', () => {
  if (!currentCupDims) return;
  const { topInnerW, topY, cx } = currentCupDims;
  const ctx = render.context;
  const diameter = POT_DIAMETERS[currentSize];

  const lineOffset = window.innerWidth >= DESKTOP_BREAKPOINT ? 20 : 10;
  const lineY  = topY - lineOffset;
  const tickH  = 6;
  const leftX  = cx - topInnerW / 2;
  const rightX = cx + topInnerW / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(107,114,128,0.6)';
  ctx.lineWidth = 1.5;

  ctx.beginPath(); ctx.moveTo(leftX, lineY); ctx.lineTo(rightX, lineY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(leftX,  lineY - tickH); ctx.lineTo(leftX,  lineY + tickH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rightX, lineY - tickH); ctx.lineTo(rightX, lineY + tickH); ctx.stroke();

  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = 'rgba(17,24,39,0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`直径 ${diameter}cm`, cx, lineY - tickH - 4);
  ctx.restore();
});

// ── グラフ計算・更新 ──

function calcComposite() {
  const total = objectTypes.reduce((s, t) => s + t.weight, 0);
  if (total === 0) return null;
  const avg = key => objectTypes.reduce((s, t) => s + t.params[key] * t.weight, 0) / total;
  const organicWeight = objectTypes.reduce((s, t) => s + (t.params.organic ? t.weight : 0), 0);
  return {
    drainage:         Math.round(avg('drainage')),
    waterRetention:   Math.round(avg('waterRetention')),
    aeration:         Math.round(avg('aeration')),
    organic:          Math.round(organicWeight / total * 100),
    nutrientRetention: Math.round(avg('nutrientRetention')),
  };
}

function getEvalLabel(comp) {
  if (!comp) return null;
  const diff = comp.drainage - comp.waterRetention;
  if (diff > 30) return { main: '→ 排水寄り',   sub: 'かなり抜けやすい配合です' };
  if (diff > 15) return { main: '→ 排水寄り',   sub: 'やや排水性が高めの配合です' };
  if (diff < -30) return { main: '→ 保水寄り',  sub: 'かなり水を残す配合です' };
  if (diff < -15) return { main: '→ 保水寄り',  sub: 'やや保水性が高めの配合です' };
  if (comp.aeration > 75) return { main: '→ 通気重視型', sub: '空気を多く含む軽い配合です' };
  return { main: '→ バランス型', sub: '排水・保水がよく取れた配合です' };
}

// 数値をカウントアップアニメーション
const _pctAnimFrames = {};
function animatePct(el, toValue, duration = 300) {
  const id = el.id;
  if (_pctAnimFrames[id]) cancelAnimationFrame(_pctAnimFrames[id]);
  const fromText = el.textContent;
  const from = (fromText === '--' || fromText === '') ? 0 : parseInt(fromText);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = `${Math.round(from + (toValue - from) * ease)}%`;
    if (t < 1) _pctAnimFrames[id] = requestAnimationFrame(step);
  };
  _pctAnimFrames[id] = requestAnimationFrame(step);
}

// ── 配合サマリーチップ ──
function updateMixSummary() {
  const el = document.getElementById('mix-summary');
  if (!el) return;
  const active = objectTypes.filter(t => t.weight > 0);
  const total  = active.reduce((s, t) => s + t.weight, 0);
  if (active.length === 0 || total === 0) { el.hidden = true; return; }
  el.hidden = false;
  const sorted = [...active].sort((a, b) => b.weight - a.weight);
  const MAX = 4;
  const shown = sorted.slice(0, MAX);
  const rest  = sorted.length - shown.length;
  const chips = shown.map(t => {
    const pct = Math.round(t.weight / total * 100);
    return `<span class="mix-chip"><span class="mix-chip-dot" style="background:${t.color}"></span>${t.name}&nbsp;${pct}%</span>`;
  });
  if (rest > 0) chips.push(`<span class="mix-chip mix-chip-more">他${rest}種</span>`);
  el.innerHTML = chips.join('');
}

// ── 影響資材表示 ──
function updateInfluence() {
  const el = document.getElementById('influence-block');
  if (!el) return;
  const active = objectTypes.filter(t => t.weight > 0);
  if (active.length === 0) { el.hidden = true; return; }

  const PARAMS = [
    { key: 'drainage',          label: '排水性', icon: '↓' },
    { key: 'waterRetention',    label: '保水性', icon: '●' },
    { key: 'aeration',          label: '通気性', icon: '〜' },
    { key: 'nutrientRetention', label: '保肥力', icon: '✦' },
  ];

  const rows = PARAMS.map(p => {
    const tops = [...active]
      .sort((a, b) => (b.params[p.key] ?? 0) - (a.params[p.key] ?? 0))
      .slice(0, 2)
      .filter(t => (t.params[p.key] ?? 0) >= 60);
    if (tops.length === 0) return null;
    const names = tops
      .map(t => `<span class="inf-mat"><span class="inf-mat-dot" style="background:${t.color}"></span>${t.name}</span>`)
      .join('<span class="inf-dot">·</span>');
    return `<div class="inf-row"><span class="inf-param">${p.icon}&nbsp;${p.label}</span><span class="inf-arrow">→</span>${names}</div>`;
  }).filter(Boolean);

  if (rows.length === 0) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<p class="inf-title">各特性への貢献が大きい資材</p>` + rows.join('');
}

function updateGraphs() {
  const comp = calcComposite();

  const setBar = (barId, pctId, value) => {
    const bar = document.getElementById(barId);
    const pct = document.getElementById(pctId);
    if (!bar || !pct) return;
    if (value === null) {
      bar.style.width = '0%';
      pct.textContent = '--';
    } else {
      bar.style.width = `${value}%`;
      animatePct(pct, value);
    }
  };

  setBar('bar-drainage',  'pct-drainage',  comp?.drainage          ?? null);
  setBar('bar-water',     'pct-water',     comp?.waterRetention    ?? null);
  setBar('bar-aeration',  'pct-aeration',  comp?.aeration          ?? null);
  setBar('bar-nutrient',  'pct-nutrient',  comp?.nutrientRetention ?? null);

  // モバイル: sticky 3指標バーに同期
  setBar('mms-bar-drainage', 'mms-pct-drainage', comp?.drainage       ?? null);
  setBar('mms-bar-water',    'mms-pct-water',    comp?.waterRetention ?? null);
  setBar('mms-bar-aeration', 'mms-pct-aeration', comp?.aeration       ?? null);

  // 評価ラベル
  const evalMain = document.getElementById('eval-main');
  const evalSub  = document.getElementById('eval-sub');
  const label = getEvalLabel(comp);
  if (evalMain && evalSub) {
    evalMain.textContent = label ? label.main : '--';
    evalSub.textContent  = label ? label.sub  : 'スライダーで配合を調整';
  }

  // 詳細パラメータ（展開中なら更新）
  if (document.getElementById('detail-panel')?.classList.contains('open')) {
    updateAdvanced();
  }

  // スプリットバー（有機/無機）
  const splitBar   = document.getElementById('split-bar-organic');
  const splitLbl   = document.getElementById('split-label');
  const splitVals  = document.getElementById('split-vals');
  if (splitBar && splitLbl && splitVals) {
    const o = comp?.organic ?? 50;
    splitBar.style.width = comp ? `${o}%` : '50%';
    if (comp) {
      const i = 100 - o;
      splitVals.textContent = `有機 ${o}% / 無機 ${i}%`;
      splitLbl.textContent  = o > 60 ? '有機質寄り' : i > 60 ? '無機質寄り' : 'バランス型';
    } else {
      splitVals.textContent = '--';
      splitLbl.textContent  = '--';
    }
  }

  updateMixSummary();
  updateInfluence();
  renderMixRatio();
  updateComparePanel();
}

// ── 配合割合（パネル内） ──
function renderMixRatio() {
  const panel = document.getElementById('mix-ratio-panel');
  if (!panel) return;
  const active = objectTypes.filter(t => t.weight > 0);
  const total  = active.reduce((s, t) => s + t.weight, 0);
  if (active.length === 0 || total === 0) { panel.hidden = true; return; }
  panel.hidden = false;

  const sorted = [...active].sort((a, b) => b.weight - a.weight);

  const barEl = document.getElementById('mix-ratio-bar');
  if (barEl) {
    barEl.innerHTML = sorted.map(t => {
      const pct = t.weight / total * 100;
      return `<span class="mratio-seg" style="width:${pct}%;background:${t.color}"></span>`;
    }).join('');
  }

  const listEl = document.getElementById('mix-ratio-list');
  if (listEl) {
    listEl.innerHTML = sorted.map(t => {
      const pct = Math.round(t.weight / total * 100);
      return `<div class="mratio-item">
        <span class="mratio-dot" style="background:${t.color}"></span>
        <span class="mratio-name">${t.name}</span>
        <span class="mratio-pct">${pct}%</span>
      </div>`;
    }).join('');
  }
}

// ── 詳細パラメータ ──
function calcAdvanced() {
  const total = objectTypes.reduce((s, t) => s + t.weight, 0);
  if (total === 0) return null;
  const avg = key => objectTypes.reduce((s, t) => s + (t.advanced?.[key] ?? 0) * t.weight, 0) / total;
  return {
    porosity:        Math.round(avg('porosity')),
    coarseRatio:     Math.round(avg('coarseRatio')),
    compressibility: Math.round(avg('compressibility')),
    infiltration:    Math.round(avg('infiltration')),
  };
}

function updateAdvanced() {
  const adv = calcAdvanced();

  const setDetBar = (barId, pctId, value) => {
    const bar = document.getElementById(barId);
    const pct = document.getElementById(pctId);
    if (!bar || !pct) return;
    if (value === null) { bar.style.width = '0%'; pct.textContent = '--'; return; }
    bar.style.width = `${value}%`;
    animatePct(pct, value);
  };

  setDetBar('det-porosity',    'dpct-porosity',    adv?.porosity        ?? null);
  setDetBar('det-coarse',      'dpct-coarse',      adv?.coarseRatio     ?? null);
  setDetBar('det-compress',    'dpct-compress',    adv?.compressibility ?? null);
  setDetBar('det-infiltration','dpct-infiltration',adv?.infiltration    ?? null);

  if (adv) {
    const fine = 100 - adv.coarseRatio;
    const fineBar = document.getElementById('det-fine');
    const finePct = document.getElementById('dpct-fine');
    if (fineBar) fineBar.style.width = `${fine}%`;
    if (finePct) animatePct(finePct, fine);
  }
}

// ── タブ ──
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

// ── ベースラベル ──
function updateBaseLabel() {
  const el = document.getElementById('base-label');
  if (!el) return;
  if (selectedCommercialSoil) {
    el.textContent = `ベース: ${selectedCommercialSoil.name}`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
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
  const sizeKey = type.size;
  const grain   = type.sizes[sizeKey];
  const dotSize = Math.round(Math.min(12, Math.max(3, grain.max * 0.5)));
  const sizeHint = SIZE_HINTS[sizeKey] ?? '';
  card.innerHTML = `
    <div class="obj-name-row">
      <span class="obj-name">${type.name}${tipAttr}</span>
      ${tagsHtml}
      <button class="fav-btn${favActive}" data-fav-type="material" data-fav-id="${type.id}" aria-label="お気に入り">★</button>
    </div>
    <div class="obj-main-row">
      <div class="obj-size-row">
        <div class="obj-sizes">
          ${['S', 'M', 'L'].map(s =>
            `<button class="obj-size-btn${type.size === s ? ' active' : ''}" data-idx="${i}" data-size="${s}">${s}</button>`
          ).join('')}
        </div>
        <div class="size-grain-info">
          <span class="size-grain-dot" style="width:${dotSize}px;height:${dotSize}px"></span>
          <span class="size-grain-label">${grain.min}〜${grain.max}mm</span>
          ${sizeHint ? `<span class="size-grain-hint">· ${sizeHint}</span>` : ''}
        </div>
      </div>
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

// ── 初期化 ──
applyCanvasSize();
renderObjList();
renderCommercialList();
buildCup();
updateGraphs();
updatePotHint();
setupTooltips(document.getElementById('right-panel'));

// ── タブボタン ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── 詳細パラメータ トグル ──
const detailToggle = document.getElementById('detail-toggle');
const detailPanel  = document.getElementById('detail-panel');
detailToggle.addEventListener('click', () => {
  const isOpen = detailPanel.classList.toggle('open');
  detailToggle.querySelector('.detail-toggle-chevron').textContent = isOpen ? '▲' : '▼';
  detailToggle.setAttribute('aria-expanded', String(isOpen));
  detailPanel.setAttribute('aria-hidden', String(!isOpen));
  if (isOpen) {
    updateAdvanced();
    setupTooltips(detailPanel);
  }
});

// rAF はモバイルのスクロール中に throttle されて止まるため setInterval で駆動する
// Render.world / Engine.update の両方を同じループで回すことで scroll 中も継続する
const TICK_MS = 1000 / 60;
setInterval(() => {
  Engine.update(engine, TICK_MS);
  Render.world(render);
}, TICK_MS);

// ── リサイズ対応 ──
// 横幅が変わった場合のみ処理する（iOS Safariはスクロール時にアドレスバーの出入りで
// innerHeight が変化し resize が発火するが、それは無視する）
let resizeTimer;
let lastResizeW = window.innerWidth;
window.addEventListener('resize', () => {
  const newW = window.innerWidth;
  if (newW === lastResizeW) return;
  lastResizeW = newW;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    applyCanvasSize();
    reset();
  }, 200);
});

// ── 鉢サイズボタン ──
function updatePotHint() {
  const el = document.getElementById('pot-hint');
  if (el) el.textContent = `直径 ${POT_DIAMETERS[currentSize]}cm`;
}

document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSize = btn.dataset.size;
    updatePotHint();
    reset();
  });
});

// ── プリセット ──
let activePreset = null;

function applyPreset(key) {
  const weights = PRESETS[key];
  objectTypes.forEach(t => { t.weight = weights[t.id] ?? 0; });
  activePreset = key;
  selectedCommercialSoil = null;
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === key);
  });
  renderObjList();
  updateGraphs();
  updateBaseLabel();
}

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
});

// 初期状態: バランスプリセットを適用
applyPreset('balance');

// ── 投入状態の切り替え ──
function setPouredState(poured) {
  document.getElementById('center-actions')?.classList.toggle('has-poured', poured);
}

// ── スタートボタン ──
document.getElementById('startBtn').addEventListener('click', () => {
  if (isAllZero()) { showEmptyState(); return; }
  document.getElementById('canvas-guide')?.setAttribute('hidden', '');
  reset();
  startSpawning();
  setPouredState(true);
});

// ── 空気層ビュー: 鉢内部背景を beforeRender で描画 ──
let isAirView = false;

Events.on(render, 'afterRender', () => {
  if (!isAirView || !currentCupDims) return;
  const { topInnerW, botInnerW, topY, bottomY, cx } = currentCupDims;
  const ctx = render.context;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over'; // 既存描画の背面に描く
  ctx.fillStyle = '#93C5FD';
  ctx.beginPath();
  ctx.moveTo(cx - topInnerW / 2, topY);
  ctx.lineTo(cx + topInnerW / 2, topY);
  ctx.lineTo(cx + botInnerW / 2, bottomY);
  ctx.lineTo(cx - botInnerW / 2, bottomY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
});

document.getElementById('airBtn').addEventListener('click', () => {
  isAirView = !isAirView;
  const btn = document.getElementById('airBtn');
  btn.classList.toggle('active', isAirView);

  const bodies = Composite.allBodies(engine.world);
  if (isAirView) {
    bodies.forEach(b => {
      if (b.isStatic) return;
      b._origFill = b.render.fillStyle;
      b._origStroke = b.render.strokeStyle;
      b.render.fillStyle = '#FFFFFF';
      b.render.strokeStyle = '#CBD5E1';
    });
  } else {
    bodies.forEach(b => {
      if (b.isStatic) return;
      if (b._origFill !== undefined) b.render.fillStyle = b._origFill;
      if (b._origStroke !== undefined) b.render.strokeStyle = b._origStroke;
    });
  }
});

// ── トントンボタン ──
document.getElementById('tontonBtn').addEventListener('click', () => {
  const TAPS     = 2;   // 叩く回数
  const JOLT_PX  = 2;   // 瞬間移動量(px)
  const SNAP_MS  = 30;  // 元に戻るまでの時間(ms)
  const INTERVAL = 100; // 次の叩きまでの間隔(ms)
  let tapsDone = 0;

  function doTap() {
    if (cupBodies.length === 0) return;
    const orig = cupBodies.map(b => ({ x: b.position.x, y: b.position.y }));
    const dir = tapsDone % 2 === 0 ? 1 : -1;

    cupBodies.forEach((b, i) => {
      Body.setPosition(b, { x: orig[i].x + dir * JOLT_PX, y: orig[i].y });
    });

    Composite.allBodies(engine.world)
      .filter(b => b.isParticle)
      .forEach(b => {
        Body.setVelocity(b, {
          x: dir * 5 + (Math.random() - 0.5) * 1,
          y: b.velocity.y,
        });
      });

    setTimeout(() => {
      cupBodies.forEach((b, i) => Body.setPosition(b, orig[i]));
      tapsDone++;
      if (tapsDone < TAPS) setTimeout(doTap, INTERVAL);
    }, SNAP_MS);
  }

  doTap();
});

// ── リセットボタン ──
document.getElementById('resetBtn').addEventListener('click', () => {
  if (isAirView) {
    isAirView = false;
    document.getElementById('airBtn').classList.remove('active');
  }
  reset();
  setPouredState(false);
});

// ── 全て0ボタン ──
document.getElementById('clearBtn').addEventListener('click', clearAllWeights);

// ── 右パネル 分析/比較タブ ──
document.querySelectorAll('.rp-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchRpTab(btn.dataset.rpTab));
});
document.getElementById('save-compare-btn')?.addEventListener('click', saveCompareBase);
updateComparePanel();

// ── 比較機能 ──
function switchRpTab(tabId) {
  document.querySelectorAll('.rp-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.rpTab === tabId);
  });
  document.querySelectorAll('.rp-tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `rp-tab-${tabId}`);
  });
}

function saveCompareBase() {
  const comp = calcComposite();
  if (!comp) return;
  const total = objectTypes.reduce((s, t) => s + t.weight, 0);
  compareBaseSnapshot = {
    metrics: {
      drainage:          comp.drainage,
      waterRetention:    comp.waterRetention,
      aeration:          comp.aeration,
      nutrientRetention: comp.nutrientRetention,
    },
    materials: objectTypes
      .filter(t => t.weight > 0)
      .map(t => ({
        id:   t.id,
        name: t.name,
        pct:  Math.round(t.weight / total * 100),
      })),
  };
  updateComparePanel();
  switchRpTab('compare');
}

function clearCompareBase() {
  compareBaseSnapshot = null;
  updateComparePanel();
  switchRpTab('analysis');
}

function calcMatDiffs() {
  if (!compareBaseSnapshot) return [];
  const total = objectTypes.reduce((s, t) => s + t.weight, 0);
  const allIds = new Set([
    ...compareBaseSnapshot.materials.map(m => m.id),
    ...objectTypes.filter(t => t.weight > 0).map(t => t.id),
  ]);
  const diffs = [];
  for (const id of allIds) {
    const snapMat  = compareBaseSnapshot.materials.find(m => m.id === id);
    const currType = objectTypes.find(t => t.id === id);
    const aPct = snapMat ? snapMat.pct : 0;
    const bPct = (currType && total > 0) ? Math.round(currType.weight / total * 100) : 0;
    const diff = bPct - aPct;
    if (diff !== 0) {
      diffs.push({ name: currType?.name ?? snapMat?.name, diff, absDiff: Math.abs(diff) });
    }
  }
  diffs.sort((a, b) => b.absDiff - a.absDiff);
  return diffs.slice(0, 3);
}

function updateComparePanel() {
  const panel = document.getElementById('rp-tab-compare');
  if (!panel) return;

  if (!compareBaseSnapshot) {
    panel.innerHTML = `
      <div class="cmp-empty">
        <p class="cmp-empty-title">比較元がまだありません</p>
        <p class="cmp-empty-sub">分析タブで現在の配合を比較元に保存すると、比較できます</p>
        <button class="save-compare-btn" id="cmp-empty-save-btn">この配合を比較元にする</button>
      </div>`;
    document.getElementById('cmp-empty-save-btn')?.addEventListener('click', saveCompareBase);
    return;
  }

  const comp = calcComposite();
  const B = comp ?? { drainage: 0, waterRetention: 0, aeration: 0, nutrientRetention: 0 };
  const A = compareBaseSnapshot.metrics;

  const METRICS = [
    { key: 'drainage',          label: '排水性', icon: '↓' },
    { key: 'waterRetention',    label: '保水性', icon: '●' },
    { key: 'aeration',          label: '通気性', icon: '〜' },
    { key: 'nutrientRetention', label: '保肥力', icon: '✦' },
  ];
  const THRESHOLD = 2;

  const metricsHtml = METRICS.map(m => {
    const a = A[m.key];
    const b = B[m.key];
    const diff = b - a;

    let diffStr, diffClass;
    if (diff > 0)      { diffStr = `+${diff} ↑`; diffClass = 'cmp-diff-pos'; }
    else if (diff < 0) { diffStr = `${diff} ↓`;  diffClass = 'cmp-diff-neg'; }
    else               { diffStr = '差なし';        diffClass = 'cmp-diff-zero'; }

    let verdictStr, verdictClass;
    if (diff > THRESHOLD)       { verdictStr = 'Bの方が高い'; verdictClass = 'cmp-verdict-b'; }
    else if (diff < -THRESHOLD) { verdictStr = 'Aの方が高い'; verdictClass = 'cmp-verdict-a'; }
    else                        { verdictStr = 'ほぼ同等';    verdictClass = 'cmp-verdict-eq'; }

    return `
      <div class="cmp-metric-row">
        <div class="cmp-metric-header">
          <span class="cmp-metric-label">${m.icon} ${m.label}</span>
          <div class="cmp-metric-header-right">
            <span class="cmp-diff-val ${diffClass}">${diffStr}</span>
            <span class="cmp-verdict ${verdictClass}">${verdictStr}</span>
          </div>
        </div>
        <div class="cmp-metric-vals">
          <div class="cmp-val-row cmp-row-a">
            <span class="cmp-val-lbl cmp-lbl-a">A</span>
            <div class="cmp-bar-track"><div class="cmp-bar-fill cmp-bar-a" style="width:${a}%"></div></div>
            <span class="cmp-val-num">${a}%</span>
          </div>
          <div class="cmp-val-row cmp-row-b">
            <span class="cmp-val-lbl cmp-lbl-b">B</span>
            <div class="cmp-bar-track"><div class="cmp-bar-fill cmp-bar-b" style="width:${b}%"></div></div>
            <span class="cmp-val-num">${b}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  // 変化の主因
  const top3 = calcMatDiffs();
  const matDiffHtml = top3.length > 0 ? `
    <div class="cmp-block cmp-matdiff-block">
      <p class="cmp-section-title">変化の主因</p>
      ${top3.map((m, i) => {
        const cls = m.diff > 0 ? 'cmp-diff-pos' : 'cmp-diff-neg';
        const str = m.diff > 0 ? `+${m.diff}% ↑` : `${m.diff}% ↓`;
        const nameHtml = i === 0
          ? `<span class="cmp-cause-prefix">主因：</span><span class="cmp-matdiff-name">${m.name}</span>`
          : `<span class="cmp-matdiff-name">${m.name}</span>`;
        return `<div class="cmp-matdiff-row${i === 0 ? ' cmp-matdiff-top' : ''}">
          <div class="cmp-matdiff-name-wrap">${nameHtml}</div>
          <span class="cmp-diff-val ${cls}">${str}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  // まとめ（方向性 + 上昇/低下）
  const dirLine   = getDirectionLine(A, B);
  const upLabels   = METRICS.filter(m => B[m.key] - A[m.key] >  THRESHOLD).map(m => m.label);
  const downLabels = METRICS.filter(m => B[m.key] - A[m.key] < -THRESHOLD).map(m => m.label);
  const detailLines = [];
  if (upLabels.length   > 0) detailLines.push(`<span class="cmp-sum-pos">${upLabels.join('・')}</span>が上昇`);
  if (downLabels.length > 0) detailLines.push(`<span class="cmp-sum-neg">${downLabels.join('・')}</span>がやや低下`);
  if (!dirLine && detailLines.length === 0) detailLines.push('大きな変化はありません');

  const dirItemHtml    = dirLine ? `<li class="cmp-summary-item cmp-summary-direction">→ ${dirLine}</li>` : '';
  const detailItemsHtml = detailLines.map(l => `<li class="cmp-summary-item">${l}</li>`).join('');
  const summaryHtml = `
    <div class="cmp-block cmp-summary-block">
      <p class="cmp-section-title">変化のまとめ</p>
      <ul class="cmp-summary-list">
        ${dirItemHtml}
        ${detailItemsHtml}
      </ul>
    </div>`;

  panel.innerHTML = `
    <div class="cmp-header">
      <div class="cmp-header-labels">
        <span class="cmp-lbl-badge cmp-lbl-a">A 基準配合</span>
        <span class="cmp-lbl-badge cmp-lbl-b">B 現在の配合</span>
      </div>
      <div class="cmp-header-actions">
        <button class="cmp-action-btn" id="cmp-update-btn">基準を更新</button>
        <button class="cmp-action-btn cmp-action-clear" id="cmp-clear-btn">比較終了</button>
      </div>
    </div>
    <div class="cmp-block cmp-metrics-block">
      <p class="cmp-section-title">総合特性の比較</p>
      ${metricsHtml}
    </div>
    ${matDiffHtml}
    ${summaryHtml}`;

  document.getElementById('cmp-update-btn')?.addEventListener('click', saveCompareBase);
  document.getElementById('cmp-clear-btn')?.addEventListener('click', clearCompareBase);
}

function getDirectionLine(A, B) {
  const candidates = [
    { diff: B.drainage - A.drainage,
      posLine: 'やや排水寄りの配合に変化',       negLine: 'やや保水寄りの配合に変化' },
    { diff: B.waterRetention - A.waterRetention,
      posLine: 'やや保水寄りの配合に変化',       negLine: 'やや排水寄りの配合に変化' },
    { diff: B.aeration - A.aeration,
      posLine: '通気性が高まった配合に変化',     negLine: '通気性がやや下がった配合に変化' },
    { diff: B.nutrientRetention - A.nutrientRetention,
      posLine: '保肥力が向上した配合に変化',     negLine: '保肥力がやや低下した配合に変化' },
  ];
  const sig = candidates
    .filter(c => Math.abs(c.diff) >= 5)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  if (!sig.length) return null;
  return sig[0].diff > 0 ? sig[0].posLine : sig[0].negLine;
}
