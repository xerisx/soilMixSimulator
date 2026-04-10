// ── Matter.js セットアップ ──
const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

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

// ── 鉢寸法計算 ──
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
  const wt = window.innerWidth < DESKTOP_BREAKPOINT ? 6 : WALL_T;

  const wallL = makeTrapezoidWall([
    { x: cx - topInnerW / 2 - wt, y: topY },
    { x: cx - topInnerW / 2,      y: topY },
    { x: cx - botInnerW / 2,      y: bottomY },
    { x: cx - botInnerW / 2 - wt, y: bottomY },
  ]);
  const wallR = makeTrapezoidWall([
    { x: cx + topInnerW / 2,      y: topY },
    { x: cx + topInnerW / 2 + wt, y: topY },
    { x: cx + botInnerW / 2 + wt, y: bottomY },
    { x: cx + botInnerW / 2,      y: bottomY },
  ]);
  const bottom = Bodies.rectangle(
    cx, bottomY + wt / 2,
    botInnerW + wt * 2, wt,
    { isStatic: true, render: { fillStyle: '#B45309' } }
  );

  currentCupDims = { topInnerW, botInnerW, cupHeight, topY, bottomY, cx, wt };
  cupBodies = [wallL, wallR, bottom];
  Composite.add(engine.world, cupBodies);
  positionCenterActions();
  adjustMobilePanelHeight();
  relocateRightPanel();
}

function clearDynamicBodies() {
  // isParticle でフィルタ: 段階的固定化により isStatic 化された粒子も除去する
  Composite.allBodies(engine.world)
    .filter(b => b.isParticle)
    .forEach(b => Composite.remove(engine.world, b));
}

function getObjectSizePx(type) {
  const { topInnerW } = getCupDimensions();
  const pxPerMm = topInnerW / POT_DIAMETERS[currentSize] / 10;
  const { min, max } = type.sizes[type.size];
  return (min + Math.random() * (max - min)) * pxPerMm;
}

function pickObjectType() {
  const effWeight = t => {
    const range = t.sizes?.[t.size ?? 'M'];
    const vol = range ? Math.pow((range.min + range.max) / 2, 2) : Math.pow(5, 2);
    return t.weight / vol;
  };
  const total = objectTypes.reduce((s, t) => s + effWeight(t), 0);
  if (total === 0) return null;
  let r = Math.random() * total;
  for (const t of objectTypes) {
    r -= effWeight(t);
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
  // 細粒（Sサイズ）は collision サイズを 1.15 倍にして詰まりすぎを防ぐ。
  // 描画との差は数 px 以下で視覚的にほぼ無視できる。
  const physicsSize = (type.size === 'S') ? size * 1.15 : size;
  let body;
  if (type.shapeVariants?.length) {
    const verts = type.shapeVariants[Math.floor(Math.random() * type.shapeVariants.length)];
    body = spawnPoly(x, y, physicsSize, verts, type.color, type.physics);
  } else if (type.shape === 'circle') {
    body = spawnCircle(x, y, physicsSize, type.color, type.physics);
  } else {
    body = spawnBox(x, y, physicsSize, type.color, type.physics);
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

function fillInstantly() {
  if (!currentCupDims) return;
  const { topInnerW, topY, cx } = currentCupDims;
  const TICK      = 1000 / 60;
  const spawnXMin = cx - topInnerW / 2 + 20;
  const spawnXMax = cx + topInnerW / 2 - 20;

  // レンダリングせずに物理演算を高速進行:
  // 4ステップごとに6粒子を生成しながら落下・堆積させ、
  // 鉢の上端を超えたら溢れと判定して停止する。
  for (let step = 0; step < 700; step++) {
    if (step % 4 === 0) {
      for (let n = 0; n < 6; n++) {
        const x = spawnXMin + Math.random() * (spawnXMax - spawnXMin);
        const body = spawnShape(x, topY - 20 - n * 14);
        if (body) Body.setVelocity(body, { x: 0, y: 22 });
      }
    }

    Engine.update(engine, TICK);

    // 低速（落ち着いた）粒子が鉢上端に達したら溢れと判定
    // 落下中の粒子（高速）は誤検知を防ぐため除外する
    if (step > 30) {
      const overflowed = Composite.allBodies(engine.world).some(b =>
        b.isParticle && !b.isStatic &&
        b.position.y < topY - 8 &&
        Math.hypot(b.velocity.x, b.velocity.y) < 4
      );
      if (overflowed) {
        // 沈静化のための追加ステップ
        for (let s = 0; s < 180; s++) Engine.update(engine, TICK);
        break;
      }
    }
  }

  // 鉢上端より上の粒子を除去、残りを静的化
  Composite.allBodies(engine.world)
    .filter(b => b.isParticle && !b.isStatic)
    .forEach(b => {
      if (b.position.y < topY) Composite.remove(engine.world, b);
      else Body.setStatic(b, true);
    });
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

// ── 空気層ビュー: 鉢内部背景を afterRender で描画 ──
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

// ── 下層粒子の段階的固定化 ──
// 目的: 2D物理の限界で後続粒子に押し潰されやすい下層粒子を順次 isStatic 化し、
//       鉢底付近の過密圧縮を抑える。底側から徐々に固まるため自然な堆積感になる。
//
// 閾値の根拠:
//   FREEZE_VEL_THRESH  0.5px/frame → 事実上停止とみなせる速度
//   FREEZE_ANG_THRESH  0.02rad/frame → ほぼ回転なしとみなせる角速度
//   FREEZE_DELAY_MS    1500ms → 瞬間的な静止を誤検知しないための待機時間
//   FREEZE_ZONE_RATIO  0.35  → 鉢高さの下側 35% を固定対象ゾーンとする
//                              （上層は自由に動けるようにして不自然さを防ぐ）
const FREEZE_VEL_THRESH  = 0.5;
const FREEZE_ANG_THRESH  = 0.02;
const FREEZE_DELAY_MS    = 1200;  // 1.2秒静止で固定（トントン廃止により全粒子が対象）
const FREEZE_ZONE_RATIO  = 1.0;   // 鉢全体を対象（底層だけでなく全粒子を最終固定状態にする）

Events.on(engine, 'afterUpdate', () => {
  if (!currentCupDims) return;
  const { bottomY, cupHeight } = currentCupDims;
  const now = performance.now();
  // 下側 FREEZE_ZONE_RATIO 分を固定対象ゾーンとする
  const freezeZoneTopY = bottomY - cupHeight * FREEZE_ZONE_RATIO;

  Composite.allBodies(engine.world)
    .filter(b => b.isParticle && !b.isStatic)
    .forEach(b => {
      const spd    = Math.hypot(b.velocity.x, b.velocity.y);
      const angSpd = Math.abs(b.angularVelocity);
      const inZone = b.position.y > freezeZoneTopY;

      if (inZone && spd < FREEZE_VEL_THRESH && angSpd < FREEZE_ANG_THRESH) {
        if (!b._stillSince) {
          b._stillSince = now;
        } else if (now - b._stillSince > FREEZE_DELAY_MS) {
          Body.setStatic(b, true);
          // isStatic 化により次回以降このフィルタから外れる
        }
      } else {
        // 動き出したらタイマーリセット
        b._stillSince = null;
      }
    });
});

// rAF はモバイルのスクロール中に throttle されて止まるため setInterval で駆動する
// Render.world / Engine.update の両方を同じループで回すことで scroll 中も継続する
const TICK_MS = 1000 / 60;
setInterval(() => {
  Engine.update(engine, TICK_MS);
  Render.world(render);
}, TICK_MS);
