// ── 比較機能 ──

function switchRpTab(tabId) {
  document.querySelectorAll('.rp-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.rpTab === tabId);
  });
  document.querySelectorAll('.rp-tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `rp-tab-${tabId}`);
  });
}

function saveCompareBase() {
  const comp = calcComposite();
  if (!comp) return;
  const total = objectTypes.reduce((s, t) => s + t.weight, 0);
  compareBaseSnapshot = {
    metrics: {
      drainage:          comp.drainage,
      waterRetention:    comp.waterRetention,
      aeration:          comp.aeration,
      nutrientRetention: comp.nutrientRetention,
    },
    materials: objectTypes
      .filter(t => t.weight > 0)
      .map(t => ({
        id:   t.id,
        name: t.name,
        pct:  Math.round(t.weight / total * 100),
      })),
  };
  updateComparePanel();
  switchRpTab('compare');
}

function clearCompareBase() {
  compareBaseSnapshot = null;
  updateComparePanel();
  switchRpTab('analysis');
}

function calcMatDiffs() {
  if (!compareBaseSnapshot) return [];
  const total = objectTypes.reduce((s, t) => s + t.weight, 0);
  const allIds = new Set([
    ...compareBaseSnapshot.materials.map(m => m.id),
    ...objectTypes.filter(t => t.weight > 0).map(t => t.id),
  ]);
  const diffs = [];
  for (const id of allIds) {
    const snapMat  = compareBaseSnapshot.materials.find(m => m.id === id);
    const currType = objectTypes.find(t => t.id === id);
    const aPct = snapMat ? snapMat.pct : 0;
    const bPct = (currType && total > 0) ? Math.round(currType.weight / total * 100) : 0;
    const diff = bPct - aPct;
    if (diff !== 0) {
      diffs.push({ name: currType?.name ?? snapMat?.name, diff, absDiff: Math.abs(diff) });
    }
  }
  diffs.sort((a, b) => b.absDiff - a.absDiff);
  return diffs.slice(0, 3);
}

function updateComparePanel() {
  const panel = document.getElementById('rp-tab-compare');
  if (!panel) return;

  if (!compareBaseSnapshot) {
    panel.innerHTML = `
      <div class="cmp-empty">
        <p class="cmp-empty-title">比較元がまだありません</p>
        <p class="cmp-empty-sub">分析タブで現在の配合を比較元に保存すると、比較できます</p>
        <button class="save-compare-btn" id="cmp-empty-save-btn">この配合を比較元にする</button>
      </div>`;
    document.getElementById('cmp-empty-save-btn')?.addEventListener('click', saveCompareBase);
    return;
  }

  const comp = calcComposite();
  const B = comp ?? { drainage: 0, waterRetention: 0, aeration: 0, nutrientRetention: 0 };
  const A = compareBaseSnapshot.metrics;

  const METRICS = [
    { key: 'drainage',          label: '排水性', icon: '↓' },
    { key: 'waterRetention',    label: '保水性', icon: '●' },
    { key: 'aeration',          label: '通気性', icon: '〜' },
    { key: 'nutrientRetention', label: '保肥力', icon: '✦' },
  ];
  const THRESHOLD = 2;

  const metricsHtml = METRICS.map(m => {
    const a = A[m.key];
    const b = B[m.key];
    const diff = b - a;

    let diffStr, diffClass;
    if (diff > 0)      { diffStr = `+${diff} ↑`; diffClass = 'cmp-diff-pos'; }
    else if (diff < 0) { diffStr = `${diff} ↓`;  diffClass = 'cmp-diff-neg'; }
    else               { diffStr = '差なし';        diffClass = 'cmp-diff-zero'; }

    let verdictStr, verdictClass;
    if (diff > THRESHOLD)       { verdictStr = 'Bの方が高い'; verdictClass = 'cmp-verdict-b'; }
    else if (diff < -THRESHOLD) { verdictStr = 'Aの方が高い'; verdictClass = 'cmp-verdict-a'; }
    else                        { verdictStr = 'ほぼ同等';    verdictClass = 'cmp-verdict-eq'; }

    return `
      <div class="cmp-metric-row">
        <div class="cmp-metric-header">
          <span class="cmp-metric-label">${m.icon} ${m.label}</span>
          <div class="cmp-metric-header-right">
            <span class="cmp-diff-val ${diffClass}">${diffStr}</span>
            <span class="cmp-verdict ${verdictClass}">${verdictStr}</span>
          </div>
        </div>
        <div class="cmp-metric-vals">
          <div class="cmp-val-row cmp-row-a">
            <span class="cmp-val-lbl cmp-lbl-a">A</span>
            <div class="cmp-bar-track"><div class="cmp-bar-fill cmp-bar-a" style="width:${a}%"></div></div>
            <span class="cmp-val-num">${a}%</span>
          </div>
          <div class="cmp-val-row cmp-row-b">
            <span class="cmp-val-lbl cmp-lbl-b">B</span>
            <div class="cmp-bar-track"><div class="cmp-bar-fill cmp-bar-b" style="width:${b}%"></div></div>
            <span class="cmp-val-num">${b}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  // 変化の主因
  const top3 = calcMatDiffs();
  const matDiffHtml = top3.length > 0 ? `
    <div class="cmp-block cmp-matdiff-block">
      <p class="cmp-section-title">変化の主因</p>
      ${top3.map((m, i) => {
        const cls = m.diff > 0 ? 'cmp-diff-pos' : 'cmp-diff-neg';
        const str = m.diff > 0 ? `+${m.diff}% ↑` : `${m.diff}% ↓`;
        const nameHtml = i === 0
          ? `<span class="cmp-cause-prefix">主因：</span><span class="cmp-matdiff-name">${m.name}</span>`
          : `<span class="cmp-matdiff-name">${m.name}</span>`;
        return `<div class="cmp-matdiff-row${i === 0 ? ' cmp-matdiff-top' : ''}">
          <div class="cmp-matdiff-name-wrap">${nameHtml}</div>
          <span class="cmp-diff-val ${cls}">${str}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  // まとめ（方向性 + 上昇/低下）
  const dirLine   = getDirectionLine(A, B);
  const upLabels   = METRICS.filter(m => B[m.key] - A[m.key] >  THRESHOLD).map(m => m.label);
  const downLabels = METRICS.filter(m => B[m.key] - A[m.key] < -THRESHOLD).map(m => m.label);
  const detailLines = [];
  if (upLabels.length   > 0) detailLines.push(`<span class="cmp-sum-pos">${upLabels.join('・')}</span>が上昇`);
  if (downLabels.length > 0) detailLines.push(`<span class="cmp-sum-neg">${downLabels.join('・')}</span>がやや低下`);
  if (!dirLine && detailLines.length === 0) detailLines.push('大きな変化はありません');

  const dirItemHtml    = dirLine ? `<li class="cmp-summary-item cmp-summary-direction">→ ${dirLine}</li>` : '';
  const detailItemsHtml = detailLines.map(l => `<li class="cmp-summary-item">${l}</li>`).join('');
  const summaryHtml = `
    <div class="cmp-block cmp-summary-block">
      <p class="cmp-section-title">変化のまとめ</p>
      <ul class="cmp-summary-list">
        ${dirItemHtml}
        ${detailItemsHtml}
      </ul>
    </div>`;

  panel.innerHTML = `
    <div class="cmp-header">
      <div class="cmp-header-labels">
        <span class="cmp-lbl-badge cmp-lbl-a">A 基準配合</span>
        <span class="cmp-lbl-badge cmp-lbl-b">B 現在の配合</span>
      </div>
      <div class="cmp-header-actions">
        <button class="cmp-action-btn" id="cmp-update-btn">基準を更新</button>
        <button class="cmp-action-btn cmp-action-clear" id="cmp-clear-btn">比較終了</button>
      </div>
    </div>
    <div class="cmp-block cmp-metrics-block">
      <p class="cmp-section-title">総合特性の比較</p>
      ${metricsHtml}
    </div>
    ${matDiffHtml}
    ${summaryHtml}`;

  document.getElementById('cmp-update-btn')?.addEventListener('click', saveCompareBase);
  document.getElementById('cmp-clear-btn')?.addEventListener('click', clearCompareBase);
}

function getDirectionLine(A, B) {
  const candidates = [
    { diff: B.drainage - A.drainage,
      posLine: 'やや排水寄りの配合に変化',       negLine: 'やや保水寄りの配合に変化' },
    { diff: B.waterRetention - A.waterRetention,
      posLine: 'やや保水寄りの配合に変化',       negLine: 'やや排水寄りの配合に変化' },
    { diff: B.aeration - A.aeration,
      posLine: '通気性が高まった配合に変化',     negLine: '通気性がやや下がった配合に変化' },
    { diff: B.nutrientRetention - A.nutrientRetention,
      posLine: '保肥力が向上した配合に変化',     negLine: '保肥力がやや低下した配合に変化' },
  ];
  const sig = candidates
    .filter(c => Math.abs(c.diff) >= 5)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  if (!sig.length) return null;
  return sig[0].diff > 0 ? sig[0].posLine : sig[0].negLine;
}
