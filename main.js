const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

const WALL_T = 10;
const COLORS = ['#c4735a', '#d4a84b', '#8ba04e', '#5e9e7a', '#6a9bb5', '#a07a9e'];
const POT_DIAMETERS = { 1: 3, 2: 6, 3: 9, 4: 12, 5: 15 }; // cm
const IRREGULARITY = 0.05; // ±5%
const OBJECT_SIZE_CM = { S: 0.5, M: 1.0, L: 2.0 };
const ADD_COUNTS = { 1: 10, 2: 32, 3: 55, 4: 77, 5: 100 };
const CUP_RATIO = { topW: 0.50, botW: 0.33, hToW: 1.1 };
const SHAPE_ICONS = { square: '■', circle: '●' };

let currentSize = '3';
let objectTypes = [
  { shape: 'square', size: 'M', weight: 1 },
  { shape: 'circle', size: 'M', weight: 1 },
];
let cupBodies = [];
let spawnInterval = null;
let colorIndex = 0;
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
    background: '#f2ede4',
  }
});

const DESKTOP_BREAKPOINT = 768;

function getCupDimensions() {
  const W = render.options.width;
  const H = render.options.height;
  const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;

  const leftOffset   = isDesktop ? Math.round(W * 0.4) : 0;
  const bottomOffset = isDesktop ? 0 : (() => {
    const panel = document.getElementById('panel');
    return panel ? (panel.offsetHeight || 150) + 12 : 162;
  })();

  const availW = W - leftOffset;
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
    render: { fillStyle: '#c4815e' }
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
    { isStatic: true, render: { fillStyle: '#c4815e' } }
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

function getObjectSizePx(sizeName) {
  const { topInnerW } = getCupDimensions();
  const pxPerCm = topInnerW / POT_DIAMETERS[currentSize];
  const base = pxPerCm * OBJECT_SIZE_CM[sizeName];
  return base * (1 - IRREGULARITY + Math.random() * IRREGULARITY * 2);
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

function spawnBox(x, y, size) {
  const box = Bodies.rectangle(x, y, size, size, {
    restitution: 0,
    friction: 0.9,
    frictionAir: 0.08,
    render: { fillStyle: COLORS[colorIndex % COLORS.length] }
  });
  box.spawnTime = performance.now();
  box.isParticle = true;
  box.shapeArea = size * size;
  colorIndex++;
  Composite.add(engine.world, box);
  Body.setAngle(box, Math.random() * Math.PI * 2);
  Body.setAngularVelocity(box, (Math.random() - 0.5) * 0.3);
  return box;
}

function spawnCircle(x, y, size) {
  const r = size / 2;
  const circle = Bodies.circle(x, y, r, {
    restitution: 0,
    friction: 0.9,
    frictionAir: 0.08,
    render: { fillStyle: COLORS[colorIndex % COLORS.length] }
  });
  circle.spawnTime = performance.now();
  circle.isParticle = true;
  circle.shapeArea = Math.PI * r * r;
  colorIndex++;
  Composite.add(engine.world, circle);
  return circle;
}

function spawnShape(x, y) {
  const type = pickObjectType();
  if (!type) return null;
  const size = getObjectSizePx(type.size);
  if (type.shape === 'circle') return spawnCircle(x, y, size);
  return spawnBox(x, y, size);
}

// 落下中はカード内コントロールを無効化
function setParticleControlsDisabled(disabled) {
  document.querySelectorAll('.obj-size-btn, .ratio-slider').forEach(el => {
    el.disabled = disabled;
  });
}

function startSpawning() {
  if (spawnInterval) { clearInterval(spawnInterval); spawnInterval = null; }
  colorIndex = 0;
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
  ctx.strokeStyle = 'rgba(90,60,40,0.5)';
  ctx.lineWidth = 1.5;

  ctx.beginPath(); ctx.moveTo(leftX, lineY); ctx.lineTo(rightX, lineY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(leftX,  lineY - tickH); ctx.lineTo(leftX,  lineY + tickH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rightX, lineY - tickH); ctx.lineTo(rightX, lineY + tickH); ctx.stroke();

  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = 'rgba(90,60,40,0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`直径 ${diameter}cm`, cx, lineY - tickH - 4);
  ctx.restore();
});

// ── 物体リスト UI ──
function renderObjList() {
  const list = document.getElementById('obj-list');
  list.innerHTML = '';

  objectTypes.forEach((type, i) => {
    const card = document.createElement('div');
    card.className = 'obj-card';
    card.innerHTML = `
      <div class="obj-icon">${SHAPE_ICONS[type.shape]}</div>
      <div class="obj-sizes">
        ${['S', 'M', 'L'].map(s =>
          `<button class="obj-size-btn${type.size === s ? ' active' : ''}" data-idx="${i}" data-size="${s}">${s}</button>`
        ).join('')}
      </div>
      <div class="ratio-row">
        <input type="range" class="ratio-slider" min="0" max="10" step="0.1" value="${type.weight}" data-idx="${i}">
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
    });
  });
}

// ── 初期化 ──
applyCanvasSize();
renderObjList();
buildCup();

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
  const baseSize = getObjectSizePx('M');
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
