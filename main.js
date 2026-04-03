const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

const WALL_T = 10;
const POT_DIAMETERS = { 1: 3, 2: 6, 3: 9, 4: 12, 5: 15, 6: 18, 7: 21 }; // cm
const ADD_COUNTS = { 1: 10, 2: 32, 3: 55, 4: 77, 5: 100, 6: 120, 7: 140 };

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
    weight: 1,
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

const canvasEl = document.getElementById('canvas');
const engine = Engine.create({
  positionIterations: 20,
  velocityIterations: 16,
  constraintIterations: 8,
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
  const bottomOffset = isDesktop ? 0 : (() => {
    const panel = document.getElementById('panel');
    return panel ? (panel.offsetHeight || 150) + 12 : 162;
  })();

  const availW = W - leftOffset - rightOffset;
  const availH = H - bottomOffset;
  const cx = leftOffset + availW / 2;

  const refDim = Math.min(availW, availH);
  let topInnerW = refDim * CUP_RATIO.topW;
  let botInnerW = refDim * CUP_RATIO.botW;
  let cupHeight  = topInnerW * CUP_RATIO.hToW;

  const maxHeight = availH * 0.88;
  if (cupHeight > maxHeight) {
    const scale = maxHeight / cupHeight;
    topInnerW *= scale;
    botInnerW *= scale;
    cupHeight  = maxHeight;
  }

  const topY = (availH - cupHeight) / 2;
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

// 正規化済み頂点配列（[-0.5,0.5]）を size でスケールして生成
function spawnPoly(x, y, size, normVerts, color, physics) {
  const scaled = normVerts.map(v => ({ x: v.x * size, y: v.y * size }));
  const body = Bodies.fromVertices(x, y, scaled, {
    ...physics,
    render: { fillStyle: color },
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
  const box = Bodies.rectangle(x, y, size, size, {
    ...physics,
    render: { fillStyle: color }
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
  const circle = Bodies.circle(x, y, r, {
    ...physics,
    render: { fillStyle: color }
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
  if (type.shapeVariants?.length) {
    const verts = type.shapeVariants[Math.floor(Math.random() * type.shapeVariants.length)];
    return spawnPoly(x, y, size, verts, type.color, type.physics);
  }
  // フォールバック
  if (type.shape === 'circle') return spawnCircle(x, y, size, type.color, type.physics);
  return spawnBox(x, y, size, type.color, type.physics);
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

// ── 充填率の計算・表示 ──
const fillStateEl = document.getElementById('fill-state');
const fillPctEl   = document.getElementById('fill-pct');

function getFillStateLabel(rate) {
  if (rate === 0)  return '未投入';
  if (rate <= 40)  return '充填中';
  if (rate <= 75)  return '積もっています';
  return 'ほぼ満タン';
}

let lastFillRate = -1;
Events.on(engine, 'afterUpdate', () => {
  if (!currentCupDims) return;
  const { topInnerW, botInnerW, cupHeight, topY, bottomY } = currentCupDims;
  const cupArea = (topInnerW + botInnerW) / 2 * cupHeight;
  const filledArea = Composite.allBodies(engine.world)
    .filter(b => b.isParticle && b.position.y > topY && b.position.y < bottomY)
    .reduce((sum, b) => sum + b.shapeArea, 0);
  const rate = Math.min(100, Math.round(filledArea / cupArea * 100));
  if (rate === lastFillRate) return;
  lastFillRate = rate;
  if (fillStateEl) fillStateEl.textContent = getFillStateLabel(rate);
  if (fillPctEl)   fillPctEl.textContent   = rate === 0 ? '' : `${rate}%`;
});

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

  const lineY  = topY - 20;
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
  el.innerHTML = [...active]
    .sort((a, b) => b.weight - a.weight)
    .map(t => {
      const pct = Math.round(t.weight / total * 100);
      return `<span class="mix-chip"><span class="mix-chip-dot" style="background:${t.color}"></span>${t.name}&nbsp;${pct}%</span>`;
    })
    .join('');
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
      .map(t => `<span class="inf-mat" style="color:${t.color}">${t.name}</span>`)
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
function renderObjList() {
  const list = document.getElementById('obj-list');
  list.innerHTML = '';

  // お気に入りを先頭に並べた配列（objectTypesの並び自体は変えない）
  const sorted = sortedByFavorite(objectTypes, 'material');

  sorted.forEach((type) => {
    // objectTypes内のインデックスはIDで引く（ソート後も正しく操作するため）
    const i = objectTypes.findIndex(t => t.id === type.id);
    const card = document.createElement('div');
    card.className = 'obj-card';
    const tipAttr = type.tooltip
      ? `<span class="tip-icon" data-tip="${type.tooltip}">?</span>`
      : '';
    const favActive = isFavorite('material', type.id) ? ' active' : '';
    const tags = getMaterialTags(type);
    const tagsHtml = `<div class="mat-tags">${tags.map(t => `<span class="mat-tag" data-tag="${t}">${t}</span>`).join('')}</div>`;
    const sizeHint = SIZE_HINTS[type.size] ?? '';
    card.innerHTML = `
      <div class="obj-name-row">
        <span class="obj-name">${type.name}${tipAttr}</span>
        <button class="fav-btn${favActive}" data-fav-type="material" data-fav-id="${type.id}" aria-label="お気に入り">★</button>
      </div>
      ${tagsHtml}
      <div class="obj-sizes">
        ${['S', 'M', 'L'].map(s =>
          `<button class="obj-size-btn${type.size === s ? ' active' : ''}" data-idx="${i}" data-size="${s}">${s}</button>`
        ).join('')}
      </div>
      <span class="size-hint">${sizeHint}</span>
      <div class="ratio-row">
        <input type="range" class="ratio-slider" min="0" max="5" step="0.1" value="${type.weight}" data-idx="${i}">
        <span class="ratio-val" data-idx="${i}">${type.weight.toFixed(1)}</span>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('.obj-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      objectTypes[idx].size = btn.dataset.size;
      btn.closest('.obj-sizes').querySelectorAll('.obj-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const hintEl = btn.closest('.obj-card').querySelector('.size-hint');
      if (hintEl) hintEl.textContent = SIZE_HINTS[btn.dataset.size] ?? '';
    });
  });

  list.querySelectorAll('.ratio-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const idx = Number(slider.dataset.idx);
      objectTypes[idx].weight = Number(slider.value);
      slider.closest('.ratio-row').querySelector('.ratio-val').textContent = Number(slider.value).toFixed(1);
      selectedCommercialSoil = null; // 手動変更でベースをクリア
      activePreset = null;
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      updateBaseLabel();
      updateGraphs();
    });
  });

  list.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleFavorite(btn.dataset.favType, btn.dataset.favId);
      renderObjList();
    });
  });

  setupTooltips(list);
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
  detailToggle.textContent = isOpen ? '詳細を隠す ▲' : '詳細を見る ▼';
  detailToggle.setAttribute('aria-expanded', String(isOpen));
  detailPanel.setAttribute('aria-hidden', String(!isOpen));
  if (isOpen) {
    updateAdvanced();
    setupTooltips(detailPanel);
  }
});

Render.run(render);
Runner.run(Runner.create(), engine);

// ── リサイズ対応 ──
let resizeTimer;
window.addEventListener('resize', () => {
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

// ── スタートボタン ──
document.getElementById('startBtn').addEventListener('click', () => {
  if (isAllZero()) { showEmptyState(); return; }
  document.getElementById('canvas-guide')?.setAttribute('hidden', '');
  reset();
  startSpawning();
});

// ── 追加ボタン ──
document.getElementById('addBtn').addEventListener('click', () => {
  if (isAllZero()) { showEmptyState(); return; }
  document.getElementById('canvas-guide')?.setAttribute('hidden', '');
  const count = ADD_COUNTS[currentSize];
  const { topInnerW, topY, cx } = getCupDimensions();
  const spawnXMin = cx - topInnerW / 2 + 20;
  const spawnXMax = cx + topInnerW / 2 - 20;
  const baseType = objectTypes.find(t => t.weight > 0) || objectTypes[0];
  const baseSize = getObjectSizePx({ ...baseType, size: 'M' });
  const cols = Math.ceil(Math.sqrt(count * (spawnXMax - spawnXMin) / (baseSize * 1.2)));
  const colW  = (spawnXMax - spawnXMin) / cols;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = spawnXMin + colW * col + colW * (0.2 + Math.random() * 0.6);
    const y = topY - baseSize - row * (baseSize * 1.3);
    spawnShape(x, y);
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
document.getElementById('resetBtn').addEventListener('click', reset);

// ── 全て0ボタン ──
document.getElementById('clearBtn').addEventListener('click', clearAllWeights);
