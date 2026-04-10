// ── 共有画像生成 ── Spotify Wrapped スタイル
// 750×1583px (9:19) の共有カードを Canvas 2D API で描画する。

// ── 定数 ──
const SHR = {
  W: 750, H: 1583,  // 9:19

  // 植物写真のパス（なければグラデーションプレースホルダー）
  // PHOTO_PATH: 'assets/plant.jpg',
  PHOTO_PATH: 'https://images.unsplash.com/photo-1728809658006-9152dc1410eb?q=80&w=2487&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',

  // 上部セクション
  TOP_H:         632,  // 上部全体の高さ (60 + 512 + 60)
  STRIP_L:       148,  // 左ストリップ幅（用土タイプ回転テキスト）
  PHOTO_H_IMG:   512,  // 写真の高さ = 写真幅 512 → 正方形
  STRIPE_UNIT:    33,  // 市松模様のセルサイズ（90px = 3セル）

  // 用土タイプ（スコアから判定）
  SOIL_TYPES: {
    AIRY:     { color: '#4FB3E8', bestFor: 'DRY CONDITIONS'    },
    WET:      { color: '#2ECBA1', bestFor: 'MOISTURE LOVING'   },
    RICH:     { color: '#9B7EE8', bestFor: 'HEAVY FEEDING'     },
    BALANCED: { color: '#3DD68C', bestFor: 'GENERAL PURPOSE'   },
  },

  // 指標
  METRICS: ['drainage', 'waterRetention', 'aeration', 'nutrientRetention'],
  METRIC_LABELS: {
    drainage:          '排水性',
    waterRetention:    '保水性',
    aeration:          '通気性',
    nutrientRetention: '保肥力',
  },
  METRIC_COLORS: {
    drainage:          '#4FB3E8',
    waterRetention:    '#2ECBA1',
    aeration:          '#94A3B8',
    nutrientRetention: '#F5A623',
  },

  BG:      '#222222',
  TEXT:    '#FFFFFF',
  MUTED:   '#555555',
  MUTED2:  '#888888',
  DIVIDER: '#2A2A2A',
  SLATE:   '#64748B',
};

// ── テキスト省略（maxWidth を超える場合は「…」付きで切る）──
function shrEllipsis(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

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

// ── 画像ロード（Promise）──
function shrLoadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = src;
  });
}

// ── object-fit:cover 相当で描画 ──
function shrDrawImageCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width  - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// ── B&W市松模様を描画（写真の背後に敷く）── 縦長セル
function shrCheckerboard(ctx, x, y, w, h, unit) {
  const rowH = unit * 7;  // 縦:横 = 8:1 の縦長セル
  const cols = Math.ceil(w / unit) + 1;
  const rows = Math.ceil(h / rowH) + 1;
  for (let r = 0; r < rows; r++) {
    const cy = y + r * rowH;
    if (cy >= y + h) break;
    const cellH = Math.min(rowH, y + h - cy);
    for (let c = 0; c < cols; c++) {
      const cx = x + c * unit;
      if (cx >= x + w) break;
      ctx.fillStyle = (r + c) % 2 === 0 ? SHR.BG : '#FFFFFF';
      ctx.fillRect(cx, cy, Math.min(unit, x + w - cx), cellH);
    }
  }
}

// ── 用土タイプ判定 ──
function shrGetSoilType(comp) {
  if (!comp) return 'BALANCED';
  const { drainage, waterRetention, aeration, nutrientRetention } = comp;
  if (drainage >= 68 && aeration >= 62) return 'AIRY';
  if (waterRetention >= 65)             return 'WET';
  if (nutrientRetention >= 62)          return 'RICH';
  return 'BALANCED';
}

// ── テキスト描画状態を一括設定 ──
function shrSetTextState(ctx, { style, font, baseline, align } = {}) {
  if (style    !== undefined) ctx.fillStyle    = style;
  if (font     !== undefined) ctx.font         = font;
  if (baseline !== undefined) ctx.textBaseline = baseline;
  if (align    !== undefined) ctx.textAlign    = align;
}

// ── フォントサイズを maxWidth に収まるまで縮小 ──
function shrFitFontSize(ctx, text, maxWidth, startSize, fontFn, step = 2) {
  let size = startSize;
  ctx.font = fontFn(size);
  while (ctx.measureText(text).width > maxWidth && size > 10) {
    size -= step;
    ctx.font = fontFn(size);
  }
  return size;
}

// ── 上部セクション描画（市松模様 + 用土タイプ回転テキスト + 植物写真）──
function shrDrawTopSection(ctx, soilTypeName, accentColor, photoImg, {
  W, TOP_H, STRIP_L, PHOTO_TOP, PHOTO_W, PHOTO_H_IMG, STRIPE_UNIT,
}) {
  // 市松模様（写真の背後・左ストリップより右のみ）
  shrCheckerboard(ctx, STRIP_L + 3, 0, W - STRIP_L - 3, TOP_H, STRIPE_UNIT);

  // 用土タイプ回転テキスト（写真より先に描画して写真の下に潜り込む）
  const OVERLAP = 122;
  const stripCx = STRIP_L - OVERLAP + (STRIP_L / 2);
  const stripCy = PHOTO_TOP + PHOTO_H_IMG / 2;

  let fontSize = 140;
  ctx.font = `italic 900 ${fontSize}px "Archivo Black","Hiragino Sans",sans-serif`;
  const tw = ctx.measureText(soilTypeName).width;
  if (tw > PHOTO_H_IMG - 20) fontSize = Math.floor(fontSize * (PHOTO_H_IMG - 20) / tw);

  ctx.save();
  ctx.translate(stripCx, stripCy);
  ctx.rotate(-Math.PI / 2);
  ctx.font         = `italic 900 ${fontSize}px "Archivo Black","Hiragino Sans",sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle  = '#FFFFFF';
  ctx.lineWidth    = fontSize * 0.05;
  ctx.lineJoin     = 'round';
  ctx.strokeText(soilTypeName, 0, 0);
  ctx.fillStyle    = accentColor;
  ctx.fillText(soilTypeName, 0, 0);
  ctx.restore();

  // 植物写真（テキストの上に重ねて描画）
  if (photoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(STRIP_L, PHOTO_TOP, PHOTO_W, PHOTO_H_IMG);
    ctx.clip();
    shrDrawImageCover(ctx, photoImg, STRIP_L, PHOTO_TOP, PHOTO_W, PHOTO_H_IMG);
    ctx.restore();
  } else {
    const pg = ctx.createLinearGradient(STRIP_L, PHOTO_TOP, STRIP_L + PHOTO_W, PHOTO_TOP + PHOTO_H_IMG);
    pg.addColorStop(0, '#1B3A2D');
    pg.addColorStop(1, '#0D2318');
    ctx.fillStyle    = pg;
    ctx.fillRect(STRIP_L, PHOTO_TOP, PHOTO_W, PHOTO_H_IMG);
    ctx.fillStyle    = 'rgba(255,255,255,0.1)';
    ctx.font         = `12px "Hiragino Sans","Yu Gothic",sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHR.PHOTO_PATH に写真のパスを設定', STRIP_L + PHOTO_W / 2, PHOTO_TOP + PHOTO_H_IMG / 2);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // 白ボーダー（角丸3px）
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth   = 3;
  shrRoundRect(ctx, STRIP_L, PHOTO_TOP, PHOTO_W, PHOTO_H_IMG, 3);
  ctx.stroke();
}

// ── リスト1行描画（左列: 資材）──
function shrDrawMaterialRow(ctx, mat, rank, totalKg, midY, { PAD, COL_W, RANK_W, RANK_FONT, NAME_FONT, SUB_FONT }) {
  const pct     = totalKg > 0 ? Math.round(mat.weight / totalKg * 100) : 0;
  const szLb    = mat.hasSize === false ? '' : (mat.size ? `  ${mat.size}` : '');
  const nameMaxW = COL_W - RANK_W - 8 - 44;

  shrSetTextState(ctx, { style: SHR.MUTED, font: RANK_FONT, baseline: 'middle', align: 'left' });
  ctx.fillText(String(rank), PAD, midY);

  shrSetTextState(ctx, { style: SHR.TEXT, font: NAME_FONT });
  ctx.fillText(shrEllipsis(ctx, mat.name + szLb, nameMaxW), PAD + RANK_W + 8, midY);

  shrSetTextState(ctx, { style: SHR.MUTED2, font: SUB_FONT, align: 'right' });
  ctx.fillText(`${pct}%`, PAD + COL_W, midY);
  ctx.textAlign = 'left';
}

// ── リスト1行描画（右列: 指標スコア）──
function shrDrawMetricRow(ctx, key, value, rank, midY, { COL2_X, COL_W, RANK_W, RANK_FONT, NAME_FONT, SUB_FONT }) {
  const color   = SHR.METRIC_COLORS[key];
  const label   = SHR.METRIC_LABELS[key];
  const barMaxW = COL_W - RANK_W - 8 - 44;

  shrSetTextState(ctx, { style: SHR.MUTED, font: RANK_FONT, baseline: 'middle', align: 'left' });
  ctx.fillText(String(rank), COL2_X, midY);

  shrSetTextState(ctx, { style: color, font: NAME_FONT });
  ctx.fillText(label, COL2_X + RANK_W + 8, midY);

  // アンダーバーグラフ
  const barX = COL2_X + RANK_W + 8;
  const barY = midY + 20;
  ctx.fillStyle = SHR.DIVIDER;
  ctx.fillRect(barX, barY, barMaxW, 3);
  ctx.fillStyle = color;
  ctx.fillRect(barX, barY, Math.round(barMaxW * value / 100), 3);

  shrSetTextState(ctx, { style: SHR.MUTED2, font: SUB_FONT, align: 'right' });
  ctx.fillText(`${value}%`, COL2_X + COL_W, midY);
  ctx.textAlign = 'left';
}

// ── リストセクション描画（ヘッダー + 資材・指標の2列リスト）── 次の curY を返す
function shrDrawListSection(ctx, top5, totalKg, sortedMetrics, comp, startY, { PAD, COL_W, COL2_X }) {
  const ITEM_H    = 70;
  const RANK_W    = 34;
  const RANK_FONT = `700 34px "Hiragino Sans","Yu Gothic",sans-serif`;
  const NAME_FONT = `700 32px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;
  const SUB_FONT  = `400 15px "Hiragino Sans","Yu Gothic",sans-serif`;
  const rowConfig = { PAD, COL2_X, COL_W, RANK_W, RANK_FONT, NAME_FONT, SUB_FONT };

  let curY = startY;

  // セクションヘッダー
  shrSetTextState(ctx, { style: SHR.MUTED2, font: `500 17px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`, baseline: 'middle', align: 'left' });
  ctx.fillText('TOP MATERIALS', PAD, curY + 8);
  ctx.fillText('COMPOSITION', COL2_X, curY + 8);
  curY += 24;

  const maxRows = Math.max(top5.length, sortedMetrics.length);
  for (let i = 0; i < maxRows; i++) {
    const midY = curY + i * ITEM_H + ITEM_H / 2;

    if (i < top5.length) {
      shrDrawMaterialRow(ctx, top5[i], i + 1, totalKg, midY, rowConfig);
    }
    if (i < sortedMetrics.length) {
      const key   = sortedMetrics[i];
      const value = comp ? Math.round(comp[key] ?? 0) : 0;
      shrDrawMetricRow(ctx, key, value, i + 1, midY, rowConfig);
    }
  }

  return curY + maxRows * ITEM_H;
}

// ── 統計セクション描画（STRENGTH + BEST FOR）──
function shrDrawStatsSection(ctx, soilScore, bestFor, startY, { PAD, W }) {
  const curY = startY;

  // STRENGTH
  shrSetTextState(ctx, { style: SHR.MUTED2, font: `500 17px "Hiragino Sans","Yu Gothic",sans-serif`, baseline: 'alphabetic', align: 'left' });
  ctx.fillText('STRENGTH', PAD, curY + 18);

  shrSetTextState(ctx, { style: SHR.TEXT, font: `900 90px "Hiragino Sans","Yu Gothic",sans-serif` });
  ctx.fillText(`${Math.round(soilScore)}%`, PAD, curY + 118);

  // 区切り線
  const divY = curY + 118 + 32;
  ctx.fillStyle = SHR.DIVIDER;
  ctx.fillRect(PAD, divY, W - PAD * 2, 1);

  // BEST FOR
  const bestForLabelY = divY + 32;
  shrSetTextState(ctx, { style: SHR.MUTED2, font: `500 17px "Hiragino Sans","Yu Gothic",sans-serif`, align: 'left' });
  ctx.fillText('BEST FOR', PAD, bestForLabelY);

  ctx.fillStyle = SHR.TEXT;
  const bestForSize = shrFitFontSize(
    ctx, bestFor, W - PAD * 2, 76,
    s => `900 ${s}px "Hiragino Sans","Yu Gothic",sans-serif`
  );
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(bestFor, PAD, bestForLabelY + bestForSize + 10);

  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ── フッター描画 ──
function shrDrawFooter(ctx, { W, H, PAD }) {
  const footerY = H - 52;

  shrSetTextState(ctx, { style: SHR.TEXT, font: `900 22px "Hiragino Sans","Yu Gothic",sans-serif`, baseline: 'middle', align: 'left' });
  ctx.fillText('Qsoil', PAD, footerY + 26);

  shrSetTextState(ctx, { style: SHR.MUTED2, font: `500 15px "Hiragino Sans","Yu Gothic",sans-serif`, align: 'right' });
  ctx.fillText('QSOIL.JP / 用土配合シミュレータ', W - PAD, footerY + 26);

  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ── コアレンダリング: 750×1583px の canvas を返す ──
async function buildShareCanvas() {
  const usedMats = objectTypes.filter(t => t.weight > 0);
  if (!usedMats.length) throw new Error('no-mats');

  // Archivo Black をロード（未ロードの場合に備えて待機）
  await document.fonts.load('900 140px "Archivo Black"');

  const comp = calcComposite();
  const { W, H, TOP_H, STRIP_L, PHOTO_H_IMG, STRIPE_UNIT } = SHR;

  const soilTypeName = shrGetSoilType(comp);
  const soilTypeDef  = SHR.SOIL_TYPES[soilTypeName];
  const accentColor  = soilTypeDef.color;
  const bestFor      = soilTypeDef.bestFor;

  const PHOTO_RIGHT_STRIP = 60;
  const PHOTO_W   = W - STRIP_L - PHOTO_RIGHT_STRIP;
  const PHOTO_TOP = 60;

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const PAD    = 32;
  const COL_W  = (W - PAD * 2 - 16) / 2;  // 335px (COL_GAP=16)
  const COL2_X = PAD + COL_W + 16;

  // 背景
  ctx.fillStyle = SHR.BG;
  ctx.fillRect(0, 0, W, H);

  // 上部セクション（市松 + 用土タイプ + 写真）
  let photoImg = null;
  try { photoImg = await shrLoadImage(SHR.PHOTO_PATH); } catch (_) {}
  shrDrawTopSection(ctx, soilTypeName, accentColor, photoImg, {
    W, TOP_H, STRIP_L, PHOTO_TOP, PHOTO_W, PHOTO_H_IMG, STRIPE_UNIT,
  });

  // 資材・指標リスト
  const sorted  = [...usedMats].sort((a, b) => b.weight - a.weight);
  const totalKg = sorted.reduce((s, t) => s + t.weight, 0);
  const top5    = sorted.slice(0, 5);
  const sortedMetrics = [...SHR.METRICS].sort((a, b) =>
    (comp ? (comp[b] ?? 0) : 0) - (comp ? (comp[a] ?? 0) : 0)
  );

  let curY = shrDrawListSection(ctx, top5, totalKg, sortedMetrics, comp, TOP_H + 34, { PAD, COL_W, COL2_X });
  curY += 32;

  // 区切り線
  ctx.fillStyle = SHR.DIVIDER;
  ctx.fillRect(PAD, curY, W - PAD * 2, 1);
  curY += 32;

  // 統計（STRENGTH + BEST FOR）
  const soilScore = comp ? Math.max(
    comp.drainage ?? 0, comp.waterRetention ?? 0,
    comp.aeration ?? 0, comp.nutrientRetention ?? 0
  ) : 0;
  shrDrawStatsSection(ctx, soilScore, bestFor, curY, { PAD, W });

  // フッター
  shrDrawFooter(ctx, { W, H, PAD });

  return canvas;
}

// ── 画像ダウンロード ──
async function generateShareImage() {
  const btn = document.getElementById('share-img-btn');
  const origLabel = btn ? btn.textContent.trim() : '';
  if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }

  try {
    const canvas = await buildShareCanvas();
    canvas.toBlob(blob => {
      if (!blob) { showToast('画像の生成に失敗しました'); return; }
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = 'qsoil-mix.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('画像を保存しました');
    }, 'image/png');
  } catch (e) {
    if (e.message === 'no-mats') showToast('配合を設定してから画像を作成してください');
    else { console.error('[share-image] error:', e); showToast('画像の生成に失敗しました'); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origLabel; }
  }
}

// ── プレビューオーバーレイ制御 ──
function openSharePreview() {
  const overlay = document.getElementById('share-preview-overlay');
  if (!overlay) return;
  overlay.style.display = 'block';
  previewShareImage();
}

function closeSharePreview() {
  const overlay = document.getElementById('share-preview-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function previewShareImage() {
  const btn  = document.getElementById('share-preview-refresh');
  const wrap = document.getElementById('share-preview-canvas-wrap');
  if (!wrap) return;

  if (btn) { btn.disabled = true; btn.textContent = '描画中…'; }
  wrap.innerHTML = '<p class="shr-prev-msg">生成中...</p>';

  try {
    const canvas = await buildShareCanvas();
    const img = new Image();
    img.src = canvas.toDataURL('image/png');
    img.style.cssText = 'display:block;width:100%;height:auto;';
    wrap.innerHTML = '';
    wrap.appendChild(img);
  } catch (e) {
    const msg = e.message === 'no-mats'
      ? '配合を設定してからプレビューしてください'
      : 'プレビューの生成に失敗しました';
    wrap.innerHTML = `<p class="shr-prev-msg">${msg}</p>`;
    if (e.message !== 'no-mats') console.error('[share-image preview] error:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '再描画'; }
  }
}
