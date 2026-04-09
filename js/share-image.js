// ── 共有画像生成 ──
// Matter.js canvasから鉢をクロップし、純粋なCanvas 2D APIで
// 750×938pxの共有カードを描画してダウンロードする。

// ── 定数 ──
const SHR = {
  W: 750, H: 938,
  PAD: 40,
  HEADER_H:     54,
  FOOTER_H:     36,
  METRIC_ROW_H: 40,
  MAT_ROW_H:    42,
  POT_MAX_H:   400,  // 鉢画像の最大高さ（拡大を許容）
  POT_BAND_V:   14,  // 鉢帯の上下余白

  // メトリクス色（analysis.css と揃える）
  COLORS: {
    drainage:          '#0284C7',
    waterRetention:    '#16A34A',
    aeration:          '#64748B',
    nutrientRetention: '#D97706',
  },
  LABELS: {
    drainage:          '排水性',
    waterRetention:    '保水性',
    aeration:          '通気性',
    nutrientRetention: '保肥力',
  },

  BG:       '#F8FAFC',
  POT_BAND: '#EEF2F7',
  DARK:     '#1E293B',
  SLATE:    '#64748B',
  MID:      '#94A3B8',
  TRACK:    '#E2E8F0',
  TEXT:     '#1E293B',
  SUBTEXT:  '#475569',
  DIVIDER:  '#E2E8F0',
};

// ── 角丸矩形パス ──
function shrRoundRect(ctx, x, y, w, h, r) {
  const clr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + clr, y);
  ctx.lineTo(x + w - clr, y);
  ctx.arcTo(x + w, y,     x + w, y + clr,     clr);
  ctx.lineTo(x + w, y + h - clr);
  ctx.arcTo(x + w, y + h, x + w - clr, y + h, clr);
  ctx.lineTo(x + clr, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - clr, clr);
  ctx.lineTo(x,     y + clr);
  ctx.arcTo(x,     y,     x + clr, y,          clr);
  ctx.closePath();
}

// ── 水平区切り線 ──
function shrDivider(ctx, y) {
  ctx.fillStyle = SHR.DIVIDER;
  ctx.fillRect(SHR.PAD, y, SHR.W - SHR.PAD * 2, 1);
}

// ── セクションラベル ──
function shrSectionLabel(ctx, text, y) {
  ctx.fillStyle    = SHR.MID;
  ctx.font         = `500 11px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'left';
  ctx.fillText(text, SHR.PAD, y + 6);
}

// ── 鉢エリアをcanvasからクロップ ──
function capturePotRegion() {
  const src = document.getElementById('canvas');
  if (!src || !currentCupDims) return null;

  const { topInnerW, cupHeight, topY, cx, wt } = currentCupDims;
  const pad = 10;
  const x = Math.max(0, Math.round(cx - topInnerW / 2 - wt - pad));
  const y = Math.max(0, Math.round(topY - pad));
  const w = Math.round(topInnerW + wt * 2 + pad * 2);
  const h = Math.round(cupHeight + wt + pad * 2);

  const clampW = Math.min(w, src.width  - x);
  const clampH = Math.min(h, src.height - y);
  if (clampW <= 0 || clampH <= 0) return null;

  const tmp = document.createElement('canvas');
  tmp.width  = clampW;
  tmp.height = clampH;
  const ctx = tmp.getContext('2d');
  ctx.fillStyle = SHR.POT_BAND;
  ctx.fillRect(0, 0, clampW, clampH);
  ctx.drawImage(src, x, y, clampW, clampH, 0, 0, clampW, clampH);
  return tmp;
}

// ── 画像生成メイン ──
async function generateShareImage() {
  const btn = document.getElementById('share-img-btn');
  const origLabel = btn ? btn.textContent.trim() : '';

  if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }

  try {
    const usedMats = objectTypes.filter(t => t.weight > 0);
    if (usedMats.length === 0) {
      showToast('配合を設定してから画像を作成してください');
      return;
    }

    const comp    = calcComposite();
    const metrics = ['drainage', 'waterRetention', 'aeration', 'nutrientRetention'];
    const potSrc  = capturePotRegion();

    const { W, H, PAD, HEADER_H, FOOTER_H, POT_MAX_H, POT_BAND_V } = SHR;

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ══ 背景 ══
    ctx.fillStyle = SHR.BG;
    ctx.fillRect(0, 0, W, H);

    // ══ ヘッダー（54px）══
    ctx.fillStyle = SHR.DARK;
    ctx.fillRect(0, 0, W, HEADER_H);
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = `bold 19px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';
    ctx.fillText('用土配合シミュレーション結果', PAD, HEADER_H / 2 + 1);
    ctx.fillStyle = SHR.MID;
    ctx.font      = `600 13px "Hiragino Sans","Yu Gothic",sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('QSOIL', W - PAD, HEADER_H / 2 + 1);
    ctx.textAlign = 'left';

    let curY = HEADER_H + 8;

    // ══ 鉢プレビュー（full-width帯）══
    if (potSrc) {
      const availW = W - PAD * 2;
      const scale  = Math.min(POT_MAX_H / potSrc.height, availW / potSrc.width, 2.0);
      const dw = Math.round(potSrc.width  * scale);
      const dh = Math.round(potSrc.height * scale);
      const bandH  = dh + POT_BAND_V * 2;
      const dx     = (W - dw) / 2;

      ctx.fillStyle = SHR.POT_BAND;
      ctx.fillRect(0, curY, W, bandH);

      ctx.drawImage(potSrc, dx, curY + POT_BAND_V, dw, dh);
      curY += bandH + 4;
    }

    // ══ 配合スコア ══
    shrDivider(ctx, curY);
    curY += 12;
    shrSectionLabel(ctx, '配合スコア', curY);
    curY += 20;

    const BAR_LABEL_W = 72;
    const BAR_PCT_W   = 52;
    const BAR_X = PAD + BAR_LABEL_W + 8;
    const BAR_W = W - BAR_X - PAD - BAR_PCT_W;
    const BAR_H = 13;

    metrics.forEach(key => {
      const value  = comp ? Math.round(comp[key] ?? 0) : 0;
      const color  = SHR.COLORS[key];
      const label  = SHR.LABELS[key];
      const rowMid = curY + SHR.METRIC_ROW_H / 2;

      // ラベル（指標色）
      ctx.fillStyle    = color;
      ctx.font         = `bold 15px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'left';
      ctx.fillText(label, PAD, rowMid);

      // バー背景
      ctx.fillStyle = SHR.TRACK;
      shrRoundRect(ctx, BAR_X, rowMid - BAR_H / 2, BAR_W, BAR_H, BAR_H / 2);
      ctx.fill();

      // バー本体
      const fillW = Math.max(0, Math.round(BAR_W * value / 100));
      if (fillW > 0) {
        ctx.fillStyle = color;
        shrRoundRect(ctx, BAR_X, rowMid - BAR_H / 2, fillW, BAR_H, BAR_H / 2);
        ctx.fill();
      }

      // 数値
      ctx.fillStyle    = SHR.TEXT;
      ctx.font         = `bold 16px "Hiragino Sans","Yu Gothic",sans-serif`;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${value}%`, W - PAD, rowMid);
      ctx.textAlign = 'left';

      curY += SHR.METRIC_ROW_H;
    });

    curY += 10;

    // ══ 配合内容 ══
    shrDivider(ctx, curY);
    curY += 12;
    shrSectionLabel(ctx, '配合内容', curY);
    curY += 20;

    const sorted  = [...usedMats].sort((a, b) => b.weight - a.weight);
    const totalKg = sorted.reduce((s, t) => s + t.weight, 0);
    const GAP     = 16;
    const COL_W   = (W - PAD * 2 - GAP) / 2;
    const MAX_MATS = 8;

    sorted.slice(0, MAX_MATS).forEach((mat, i) => {
      const col      = i % 2;
      const row      = Math.floor(i / 2);
      const mx       = PAD + col * (COL_W + GAP);
      const my       = curY + row * SHR.MAT_ROW_H;
      const pct      = totalKg > 0 ? Math.round(mat.weight / totalKg * 100) : 0;
      const szLb     = mat.hasSize === false ? '' : ` (${mat.size})`;
      const matColor = mat.color || SHR.SLATE;
      const LINE1Y   = my + 14;
      const LINE2Y   = my + 30;

      // カラードット
      ctx.fillStyle = matColor;
      ctx.beginPath();
      ctx.arc(mx + 7, my + SHR.MAT_ROW_H / 2, 7, 0, Math.PI * 2);
      ctx.fill();

      // 資材名
      ctx.fillStyle    = SHR.TEXT;
      ctx.font         = `bold 15px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign    = 'left';
      ctx.fillText(mat.name, mx + 22, LINE1Y);

      // サイズ
      if (szLb) {
        const nameW = ctx.measureText(mat.name).width;
        ctx.fillStyle = SHR.SLATE;
        ctx.font      = `12px "Hiragino Sans","Yu Gothic",sans-serif`;
        ctx.fillText(szLb, mx + 22 + nameW, LINE1Y);
      }

      // 重量
      ctx.fillStyle = SHR.SLATE;
      ctx.font      = `12px "Hiragino Sans","Yu Gothic",sans-serif`;
      ctx.fillText(`${mat.weight.toFixed(1)}kg`, mx + 22, LINE2Y);

      // 配合比（資材色・右揃え）
      ctx.fillStyle    = matColor;
      ctx.font         = `bold 16px "Hiragino Sans","Yu Gothic",sans-serif`;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pct}%`, mx + COL_W, my + SHR.MAT_ROW_H / 2 + 1);
      ctx.textAlign = 'left';
    });

    // ══ フッター ══
    const footerY = H - FOOTER_H;
    ctx.fillStyle = SHR.DIVIDER;
    ctx.fillRect(0, footerY, W, 1);
    ctx.fillStyle    = SHR.SLATE;
    ctx.font         = `12px "Hiragino Sans","Yu Gothic",sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'center';
    ctx.fillText('qsoil.app  —  用土配合シミュレータ', W / 2, footerY + FOOTER_H / 2);
    ctx.textAlign = 'left';

    // ══ ダウンロード ══
    canvas.toBlob(blob => {
      if (!blob) { showToast('画像の生成に失敗しました'); return; }
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = 'qsoil-mix.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('画像を保存しました');
    }, 'image/png');

  } catch (e) {
    console.error('[share-image] error:', e);
    showToast('画像の生成に失敗しました');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origLabel; }
  }
}
