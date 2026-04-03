const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

const WALL_T = 10;
const COLORS = ['#16A34A', '#0284C7', '#B45309', '#D97706', '#64748B', '#7C3AED'];
const POT_DIAMETERS = { 1: 3, 2: 6, 3: 9, 4: 12, 5: 15 }; // cm
// サイズはmm単位で資材ごとに定義（min〜maxのランダム値）
const ADD_COUNTS = { 1: 10, 2: 32, 3: 55, 4: 77, 5: 100 };
const CUP_RATIO = { topW: 0.50, botW: 0.33, hToW: 1.1 };
const SHAPE_ICONS  = { square: '■', circle: '●' };
const SHAPE_LABELS = { square: 'ベラボン', circle: '日向土' };

let currentSize = '3';
// MATERIALS（materials.js）からシミュレーション用の状態を初期化
let objectTypes = MATERIALS.map(m => ({
  ...m,
  size:   'M',
  weight: 1,
}));
let cupBodies = [];
let spawnInterval = null;
let currentCupDims = null;
let shakeOffsetX = 0;

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

    const x = spawnXMin + Math.random() * (spawnXMax - spawnXMin);
    const body = spawnShape(x, topY - 60);
    if (body) Body.setVelocity(body, { x: 0, y: 8 });
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

function applyCanvasSize() {
  render.options.width  = window.innerWidth;
  render.options.height = window.innerHeight;
  render.canvas.width   = window.innerWidth;
  render.canvas.height  = window.innerHeight;
}

// ── 充填率の計算・表示 ──
const fillRateEl = document.getElementById('fillRate');
Events.on(engine, 'afterUpdate', () => {
  if (!currentCupDims) return;
  const { topInnerW, botInnerW, cupHeight, topY, bottomY } = currentCupDims;
  const cupArea = (topInnerW + botInnerW) / 2 * cupHeight;
  const filledArea = Composite.allBodies(engine.world)
    .filter(b => b.isParticle && b.position.y > topY && b.position.y < bottomY)
    .reduce((sum, b) => sum + b.shapeArea, 0);
  const rate = Math.min(100, Math.round(filledArea / cupArea * 100));
  fillRateEl.textContent = `充填率: ${rate}%`;
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
    drainage:       Math.round(avg('drainage')),
    waterRetention: Math.round(avg('waterRetention')),
    aeration:       Math.round(avg('aeration')),
    organic:        Math.round(organicWeight / total * 100),
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

  setBar('bar-drainage', 'pct-drainage', comp?.drainage       ?? null);
  setBar('bar-water',    'pct-water',    comp?.waterRetention ?? null);
  setBar('bar-aeration', 'pct-aeration', comp?.aeration       ?? null);

  // 評価ラベル
  const evalMain = document.getElementById('eval-main');
  const evalSub  = document.getElementById('eval-sub');
  const label = getEvalLabel(comp);
  if (evalMain && evalSub) {
    evalMain.textContent = label ? label.main : '--';
    evalSub.textContent  = label ? label.sub  : 'スライダーで配合を調整';
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

  objectTypes.forEach((type, i) => {
    const card = document.createElement('div');
    card.className = 'obj-card';
    const tipAttr = type.tooltip
      ? `<span class="tip-icon" data-tip="${type.tooltip}">?</span>`
      : '';
    card.innerHTML = `
      <div class="obj-name">${SHAPE_LABELS[type.shape]}${tipAttr}</div>
      <div class="obj-sizes">
        ${['S', 'M', 'L'].map(s =>
          `<button class="obj-size-btn${type.size === s ? ' active' : ''}" data-idx="${i}" data-size="${s}">${s}</button>`
        ).join('')}
      </div>
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
    });
  });

  list.querySelectorAll('.ratio-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const idx = Number(slider.dataset.idx);
      objectTypes[idx].weight = Number(slider.value);
      slider.closest('.ratio-row').querySelector('.ratio-val').textContent = Number(slider.value).toFixed(1);
      updateGraphs();
    });
  });

  setupTooltips(list);
}

// ── 初期化 ──
applyCanvasSize();
renderObjList();
buildCup();
updateGraphs();
setupTooltips(document.getElementById('right-panel'));

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
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSize = btn.dataset.size;
    reset();
  });
});

// ── スタートボタン ──
document.getElementById('startBtn').addEventListener('click', () => {
  reset();
  startSpawning();
});

// ── 追加ボタン ──
document.getElementById('addBtn').addEventListener('click', () => {
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
  const steps = 8;
  const vx = 5;
  const amp = 8;
  let step = 0;
  const origPositions = cupBodies.map(b => ({ x: b.position.x, y: b.position.y }));

  const id = setInterval(() => {
    const dir = step % 2 === 0 ? 1 : -1;
    const decay = 1 - step / steps;
    shakeOffsetX = dir * amp * decay;

    cupBodies.forEach((b, i) => {
      Body.setPosition(b, { x: origPositions[i].x + shakeOffsetX, y: origPositions[i].y });
    });

    Composite.allBodies(engine.world)
      .filter(b => b.isParticle)
      .forEach(b => Body.setVelocity(b, { x: dir * vx * decay, y: b.velocity.y }));

    step++;
    if (step >= steps) {
      cupBodies.forEach((b, i) => Body.setPosition(b, origPositions[i]));
      shakeOffsetX = 0;
      clearInterval(id);
    }
  }, 60);
});

// ── リセットボタン ──
document.getElementById('resetBtn').addEventListener('click', reset);
