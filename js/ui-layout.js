// ── レイアウト・レスポンシブ制御 ──

function positionCenterActions() {
  if (window.innerWidth < 768) return;
  const el = document.getElementById('center-actions');
  if (!el || !currentCupDims) return;
  // 鉢の外底辺(bottomY + WALL_T)の直下 14px に top 端を合わせる
  el.style.top    = (currentCupDims.bottomY + (currentCupDims.wt ?? WALL_T) + 14) + 'px';
  el.style.bottom = 'auto';
}

function adjustMobilePanelHeight() {
  if (window.innerWidth >= DESKTOP_BREAKPOINT) return;
  const spacer = document.getElementById('canvas-spacer');
  if (!spacer || !currentCupDims) return;
  const potBottomY = currentCupDims.bottomY + (currentCupDims.wt ?? WALL_T);
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
