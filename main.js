const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

const WALL_T = 10;
const COLORS = ['#e94560', '#f4a261', '#2a9d8f', '#e9c46a', '#a8dadc', '#533483'];
const POT_DIAMETERS = { 1: 3, 2: 6, 3: 9, 4: 12, 5: 15 }; // cm

// 物体は1cm固定（±25%の不規則性）
// px/cm = topInnerW / 直径cm で号数ごとに算出
const IRREGULARITY = 0.05; // ±5%
const OBJECT_SIZE_CM = { S: 0.5, M: 1.0, L: 2.0 };
let currentObjectSize = 'M';

function getObjectSizePx() {
  const { topInnerW } = getCupDimensions();
  const pxPerCm = topInnerW / POT_DIAMETERS[currentSize];
  const base = pxPerCm * OBJECT_SIZE_CM[currentObjectSize];
  return base * (1 - IRREGULARITY + Math.random() * IRREGULARITY * 2);
}

const ADD_COUNTS = { 1: 10, 2: 32, 3: 55, 4: 77, 5: 100 };

// 鉢は固定サイズ（画面基準）
const CUP_RATIO = { topW: 0.50, botW: 0.33, hToW: 1.1 };

let currentSize = '3';
let cupBodies = [];
let spawnInterval = null;
let colorIndex = 0;
let currentCupDims = null;

const canvasEl = document.getElementById('canvas');
const engine = Engine.create({
  positionIterations: 20,
  velocityIterations: 16,
  constraintIterations: 8,
});

// 物体同士の許容重複量をゼロに（デフォルト0.05）
Matter.Resolver._slop = 0;

const render = Render.create({
  canvas: canvasEl,
  engine,
  options: {
    width: window.innerWidth,
    height: window.innerHeight,
    wireframes: false,
    background: '#0f0f23',
  }
});

function getCupDimensions() {
  const W = render.options.width;
  const H = render.options.height;
  const refDim = Math.min(W, H);
  let topInnerW = refDim * CUP_RATIO.topW;
  let botInnerW = refDim * CUP_RATIO.botW;
  let cupHeight  = topInnerW * CUP_RATIO.hToW;

  const maxHeight = H * 0.84;
  if (cupHeight > maxHeight) {
    const scale = maxHeight / cupHeight;
    topInnerW *= scale;
    botInnerW *= scale;
    cupHeight  = maxHeight;
  }

  const topY = (H - cupHeight) / 2 - H * 0.04;
  return { topInnerW, botInnerW, cupHeight, topY, cx: W / 2 };
}

function makeTrapezoidWall(absVerts) {
  const cx = absVerts.reduce((s, v) => s + v.x, 0) / absVerts.length;
  const cy = absVerts.reduce((s, v) => s + v.y, 0) / absVerts.length;
  const rel = absVerts.map(v => ({ x: v.x - cx, y: v.y - cy }));
  return Bodies.fromVertices(cx, cy, rel, {
    isStatic: true,
    render: { fillStyle: '#7ec8e3' }
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
    { isStatic: true, render: { fillStyle: '#7ec8e3' } }
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

function spawnBox(x, y, size) {
  const box = Bodies.rectangle(x, y, size, size, {
    restitution: 0,
    friction: 0.9,
    frictionAir: 0.08,
    render: { fillStyle: COLORS[colorIndex % COLORS.length] }
  });
  box.spawnTime = performance.now();
  box.boxSize = size;
  colorIndex++;
  Composite.add(engine.world, box);
  Body.setAngle(box, Math.random() * Math.PI * 2);
  Body.setAngularVelocity(box, (Math.random() - 0.5) * 0.3);
  return box;
}

function setObjBtnsDisabled(disabled) {
  document.querySelectorAll('.obj-btn').forEach(b => b.disabled = disabled);
}

function startSpawning() {
  if (spawnInterval) { clearInterval(spawnInterval); spawnInterval = null; }
  colorIndex = 0;
  setObjBtnsDisabled(true);

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
      setObjBtnsDisabled(false);
      return;
    }

    const size = getObjectSizePx();
    const x = spawnXMin + Math.random() * (spawnXMax - spawnXMin);
    const box = spawnBox(x, topY - 60, size);
    Body.setVelocity(box, { x: 0, y: 8 });
  }, 80);
}

function reset() {
  if (spawnInterval) { clearInterval(spawnInterval); spawnInterval = null; }
  setObjBtnsDisabled(false);
  cupBodies.forEach(b => Composite.remove(engine.world, b));
  cupBodies = [];
  clearDynamicBodies();
  buildCup();
  document.getElementById('startBtn').disabled = false;
}

function applyCanvasSize() {
  render.options.width  = window.innerWidth;
  render.options.height = window.innerHeight;
  render.canvas.width   = window.innerWidth;
  render.canvas.height  = window.innerHeight;
}

// 充填率の計算・表示
const fillRateEl = document.getElementById('fillRate');
Events.on(engine, 'afterUpdate', () => {
  if (!currentCupDims) return;
  const { topInnerW, botInnerW, cupHeight, topY, bottomY } = currentCupDims;
  const cupArea = (topInnerW + botInnerW) / 2 * cupHeight;
  const filledArea = Composite.allBodies(engine.world)
    .filter(b => !b.isStatic && b.boxSize && b.position.y > topY && b.position.y < bottomY)
    .reduce((sum, b) => sum + b.boxSize * b.boxSize, 0);
  const rate = Math.min(100, Math.round(filledArea / cupArea * 100));
  fillRateEl.textContent = `充填率: ${rate}%`;
});

// 鉢上部の直径をキャンバスに描画
Events.on(render, 'afterRender', () => {
  if (!currentCupDims) return;
  const { topInnerW, topY, cx } = currentCupDims;
  const ctx = render.context;
  const diameter = POT_DIAMETERS[currentSize];

  const lineY   = topY - 20;
  const tickH   = 6;
  const leftX   = cx - topInnerW / 2;
  const rightX  = cx + topInnerW / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;

  // 水平線
  ctx.beginPath();
  ctx.moveTo(leftX, lineY);
  ctx.lineTo(rightX, lineY);
  ctx.stroke();

  // 左端の縦ティック
  ctx.beginPath();
  ctx.moveTo(leftX, lineY - tickH);
  ctx.lineTo(leftX, lineY + tickH);
  ctx.stroke();

  // 右端の縦ティック
  ctx.beginPath();
  ctx.moveTo(rightX, lineY - tickH);
  ctx.lineTo(rightX, lineY + tickH);
  ctx.stroke();

  // ラベル
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`直径 ${diameter}cm`, cx, lineY - tickH - 4);
  ctx.restore();
});

// 初期化
applyCanvasSize();
buildCup();

// リサイズ対応
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    applyCanvasSize();
    reset();
  }, 200);
});

// 物体サイズボタン
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSize = btn.dataset.size;
    reset();
  });
});

// 追加ボタン
document.getElementById('addBtn').addEventListener('click', () => {
  const count = ADD_COUNTS[currentSize];
  const { topInnerW, topY, cx } = getCupDimensions();
  const spawnXMin = cx - topInnerW / 2 + 20;
  const spawnXMax = cx + topInnerW / 2 - 20;
  const baseSize = getObjectSizePx();
  const cols = Math.ceil(Math.sqrt(count * (spawnXMax - spawnXMin) / (baseSize * 1.2)));
  const colW  = (spawnXMax - spawnXMin) / cols;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const size = getObjectSizePx();
    const x = spawnXMin + colW * col + colW * (0.2 + Math.random() * 0.6);
    const y = topY - baseSize - row * (baseSize * 1.3);
    spawnBox(x, y, size);
  }
});

// スタートボタン
document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('startBtn').disabled = true;
  startSpawning();
});

// 物体サイズボタン
document.querySelectorAll('.obj-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.obj-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentObjectSize = btn.dataset.obj;
  });
});

// リセットボタン
document.getElementById('resetBtn').addEventListener('click', reset);

Render.run(render);
Runner.run(Runner.create(), engine);
