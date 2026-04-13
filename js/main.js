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
  if (!el) return;
  const isMobile = window.innerWidth < 768;
  const prefix = isMobile ? '' : `直径 ${POT_DIAMETERS[currentSize]}cm　`;
  el.textContent = prefix + `（6号鉢〜10号鉢は調整中）`;
}

document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSize = btn.dataset.size;
    updatePotHint();
    reset();
    setPouredState(false);
    updateGraphs();
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

// 初期状態: バランスプリセットを適用 → URLハッシュがあれば上書き復元
applyPreset('balance');
initShareRestore();

// ── 投入状態の切り替え ──
function setPouredState(poured) {
  document.getElementById('center-actions')?.classList.toggle('has-poured', poured);
  const startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.textContent = poured ? '再投入' : '投入して開始';
}

// ── 充填実行（サイズに応じてアニメーション / 即時計算を切り替え） ──
function runFill() {
  if (Number(currentSize) <= 5) {
    startSpawning();
  } else {
    const el = document.getElementById('loading-state');
    el.removeAttribute('hidden');
    setParticleControlsDisabled(true);
    setTimeout(() => {
      fillInstantly();
      el.setAttribute('hidden', '');
      setParticleControlsDisabled(false);
    }, 30);
  }
}

// ── スタートボタン ──
document.getElementById('startBtn').addEventListener('click', () => {
  if (isAllZero()) { showEmptyState(); return; }
  document.getElementById('canvas-guide')?.setAttribute('hidden', '');
  reset();
  runFill();
  setPouredState(true);
});

// ── 空気層ビュー ──
document.getElementById('airBtn').addEventListener('click', () => {
  isAirView = !isAirView;
  const btn = document.getElementById('airBtn');
  btn.classList.toggle('active', isAirView);
  btn.textContent = isAirView ? '通常表示に戻る' : '空気層を見る';

  const bodies = Composite.allBodies(engine.world);
  if (isAirView) {
    bodies.forEach(b => {
      // isParticle でフィルタ: 段階的固定化で isStatic 化された粒子も対象に含める
      if (!b.isParticle) return;
      b._origFill = b.render.fillStyle;
      b._origStroke = b.render.strokeStyle;
      b.render.fillStyle = '#FFFFFF';
      b.render.strokeStyle = '#CBD5E1';
    });
  } else {
    bodies.forEach(b => {
      if (!b.isParticle) return;
      if (b._origFill !== undefined) b.render.fillStyle = b._origFill;
      if (b._origStroke !== undefined) b.render.strokeStyle = b._origStroke;
    });
  }
});

// ── トントンボタン ──
// let tontonRunning = false;
// document.getElementById('tontonBtn').addEventListener('click', () => {
//   if (tontonRunning) return;
//   tontonRunning = true;

//   const isMobile = window.innerWidth < DESKTOP_BREAKPOINT;
//   const TAPS     = 2;                  // 叩く回数
//   const JOLT_PX  = isMobile ? 1 : 2;  // 瞬間移動量(px)
//   const SNAP_MS  = 30;                 // 元に戻るまでの時間(ms)
//   const INTERVAL = 100;                // 次の叩きまでの間隔(ms)
//   const VEL      = isMobile ? 3 : 5;  // 粒子への横速度
//   let tapsDone = 0;

//   // アニメーション開始前の正位置を固定で記録する
//   const homePos = cupBodies.map(b => ({ x: b.position.x, y: b.position.y }));

//   function doTap() {
//     if (cupBodies.length === 0) { tontonRunning = false; return; }
//     const dir = tapsDone % 2 === 0 ? 1 : -1;

//     cupBodies.forEach((b, i) => {
//       Body.setPosition(b, { x: homePos[i].x + dir * JOLT_PX, y: homePos[i].y });
//     });

//     Composite.allBodies(engine.world)
//       .filter(b => b.isParticle)
//       .forEach(b => {
//         Body.setVelocity(b, {
//           x: dir * VEL + (Math.random() - 0.5) * 1,
//           y: b.velocity.y,
//         });
//       });

//     setTimeout(() => {
//       cupBodies.forEach((b, i) => Body.setPosition(b, homePos[i]));
//       tapsDone++;
//       if (tapsDone < TAPS) {
//         setTimeout(doTap, INTERVAL);
//       } else {
//         tontonRunning = false;
//       }
//     }, SNAP_MS);
//   }

//   doTap();
// });

// ── 再投入ボタン（モバイルのみ表示） ──
document.getElementById('reinvestBtn').addEventListener('click', () => {
  if (isAllZero()) { showEmptyState(); return; }
  if (isAirView) {
    isAirView = false;
    document.getElementById('airBtn').classList.remove('active');
  }
  reset();
  runFill();
  setPouredState(true);
});

// ── 配合をリセットボタン（モバイル: mms-header / PC: pc-current-mix-header） ──
document.getElementById('clearBtn')?.addEventListener('click', clearAllWeights);
document.getElementById('pc-clear-btn')?.addEventListener('click', clearAllWeights);

// ── 共有ボタン ──
document.getElementById('mms-share-btn')?.addEventListener('click', showShareModal);
document.getElementById('pc-share-btn')?.addEventListener('click', showShareModal);

// モーダル背景クリックで閉じる
document.getElementById('share-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('share-modal')) closeShareModal();
});

// ── 右パネル 分析/比較タブ ──
document.querySelectorAll('.rp-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchRpTab(btn.dataset.rpTab));
});
document.getElementById('save-compare-btn')?.addEventListener('click', saveCompareBase);
document.getElementById('mms-compare-btn')?.addEventListener('click', saveCompareBase);
document.getElementById('pc-compare-btn')?.addEventListener('click', saveCompareBase);
updateComparePanel();
