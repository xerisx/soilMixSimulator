// ── 鉢容量計算（L） ──
// POT_DIAMETERS の直径と CUP_RATIO の形状比から截頭円錐体積を算出
function calcPotVolumeL() {
  const diam = POT_DIAMETERS[currentSize]; // cm
  const R1 = diam / 2;
  const R2 = R1 * (CUP_RATIO.botW / CUP_RATIO.topW);
  const h  = diam * CUP_RATIO.hToW;
  const volCm3 = Math.PI * h / 3 * (R1 * R1 + R1 * R2 + R2 * R2);
  return volCm3 / 1000; // cm³ → L
}

// ── 資材カードの %・L 表示を一括更新（PC用） ──
function updateAllRatioDisplays() {
  const active = objectTypes.filter(t => t.weight > 0);
  const total  = active.reduce((s, t) => s + t.weight, 0);
  const potL   = calcPotVolumeL();

  document.querySelectorAll('.ratio-val-block[data-idx]').forEach(el => {
    const idx = Number(el.dataset.idx);
    const t   = objectTypes[idx];
    const pct = total > 0 ? t.weight / total * 100 : 0;
    const r   = Math.round(pct * 10) / 10;
    const pctStr = r % 1 === 0 ? `${Math.round(r)}%` : `${r.toFixed(1)}%`;
    const volL   = (potL * pct / 100).toFixed(2);
    const isZero = t.weight === 0;

    const pctEl = el.querySelector('.ratio-pct-big');
    const subEl = el.querySelector('.ratio-sub');
    if (pctEl) {
      pctEl.textContent = total > 0 ? pctStr : '0%';
      pctEl.classList.toggle('ratio-val-zero', isZero);
    }
    if (subEl) {
      subEl.textContent = `体積比 ${t.weight.toFixed(1)} ｜ ${volL}L`;
      subEl.classList.toggle('ratio-val-zero', isZero);
    }
  });
}

// ── サイズ補正 ──
// M を基準(0)とし、S は保水寄り・L は排水/通気寄りに補正
const BASE_SIZE_EFFECT = {
  S: { drainage: -12, waterRetention:  12, aeration: -10, nutrientRetention:  8 },
  M: { drainage:   0, waterRetention:   0, aeration:   0, nutrientRetention:  0 },
  L: { drainage:  12, waterRetention: -12, aeration:  10, nutrientRetention: -8 },
};

// 資材のサイズ補正後のパラメータを返す（0〜100にクランプ）
function getAdjustedParams(type) {
  const p     = type.params;
  const clamp = v => Math.min(100, Math.max(0, Math.round(v)));
  if (type.hasSize === false) {
    return {
      drainage:          clamp(p.drainage),
      waterRetention:    clamp(p.waterRetention),
      aeration:          clamp(p.aeration),
      nutrientRetention: clamp(p.nutrientRetention),
      organic:           p.organic,
    };
  }
  const effect = BASE_SIZE_EFFECT[type.size] ?? BASE_SIZE_EFFECT.M;
  const sens   = type.sizeSensitivity ?? 0.5;
  return {
    drainage:          clamp(p.drainage          + effect.drainage          * sens),
    waterRetention:    clamp(p.waterRetention    + effect.waterRetention    * sens),
    aeration:          clamp(p.aeration          + effect.aeration          * sens),
    nutrientRetention: clamp(p.nutrientRetention + effect.nutrientRetention * sens),
    organic:           p.organic,
  };
}

// ── 資材タグ（サイズ補正後の params から自動生成） ──
function getMaterialTags(type) {
  const p = getAdjustedParams(type);
  const tags = [p.organic ? '有機' : '無機'];
  if (p.drainage          >= 70) tags.push('排水');
  if (p.aeration          >= 78) tags.push('通気');
  if (p.waterRetention    >= 70) tags.push('保水');
  if (p.nutrientRetention >= 65) tags.push('保肥');
  if (tags.length === 1) tags.push('バランス');
  return tags.slice(0, 3);
}

// ── グラフ計算 ──
// 実装は score-engine.js の calcCompositeV2() に委譲。
// 戻り値の形 { drainage, waterRetention, aeration, nutrientRetention, organic } は変わらない。
function calcComposite() {
  return calcCompositeV2();
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
    return `<span class="mix-chip"><span class="mix-chip-dot" style="background:${t.color}"></span>${escapeHTML(t.name)}&nbsp;${pct}%</span>`;
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
      .sort((a, b) => (getAdjustedParams(b)[p.key] ?? 0) - (getAdjustedParams(a)[p.key] ?? 0))
      .slice(0, 2)
      .filter(t => (getAdjustedParams(t)[p.key] ?? 0) >= 60);
    if (tops.length === 0) return null;
    const names = tops
      .map(t => `<span class="inf-mat"><span class="inf-mat-dot" style="background:${t.color}"></span>${escapeHTML(t.name)}</span>`)
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
  updateAllRatioDisplays();
  updateComparePanel();

  // 共有ボタンの活性制御
  const hasAny = objectTypes.some(t => t.weight > 0);
  ['mms-share-btn', 'pc-share-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !hasAny;
  });
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

  const potL   = calcPotVolumeL();
  const listEl = document.getElementById('mix-ratio-list');
  if (listEl) {
    listEl.innerHTML = sorted.map(t => {
      const pct  = Math.round(t.weight / total * 100);
      const volL = (potL * pct / 100).toFixed(2);
      return `<div class="mratio-item">
        <span class="mratio-dot" style="background:${t.color}"></span>
        <span class="mratio-name">${escapeHTML(t.name)}</span>
        <span class="mratio-pct">${pct}%<span class="mratio-vol">（${volL}L）</span></span>
      </div>`;
    }).join('');
  }

  const potInfoEl = document.getElementById('pot-volume-info');
  if (potInfoEl) {
    potInfoEl.textContent =
      `鉢サイズ：${currentSize}号（直径${POT_DIAMETERS[currentSize]}cm）　推定容量：約${potL.toFixed(2)}L`;
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

// ── ベースラベル（選択中の市販用土） ──
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
