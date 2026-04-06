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

// ── 空気層ビュー ──
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
