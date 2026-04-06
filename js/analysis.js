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

// ── グラフ計算 ──
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
