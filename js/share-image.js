// ── 共有画像生成 ── Spotify Wrapped スタイル
// 750×1583px (9:19) の共有カードを Canvas 2D API で描画する。

// ── 定数 ──
const SHR = {
  W: 750, H: 1583,  // 9:19

  // 植物写真のパス（なければグラデーションプレースホルダー）
  // PHOTO_PATH: 'assets/plant.jpg',
  PHOTO_PATH: 'https://images.unsplash.com/photo-1728809658006-9152dc1410eb?q=80&w=2487&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',

  // 上部セクション
  TOP_H:         692,  // 上部全体の高さ (90 + 512 + 90)
  STRIP_L:       148,  // 左ストリップ幅（用土タイプ回転テキスト）
  PHOTO_H_IMG:   512,  // 写真の高さ = 写真幅 512 → 正方形
  STRIPE_UNIT:    30,  // 市松模様のセルサイズ（90px = 3セル）

  // 用土タイプ（スコアから判定）
  SOIL_TYPES: {
    AIRY:     { color: '#60A5FA', bestFor: 'CACTI & SUCCULENTS' },
    WET:      { color: '#34D399', bestFor: 'FERNS & TROPICALS'  },
    RICH:     { color: '#A78BFA', bestFor: 'AROIDS'             },
    BALANCED: { color: '#4ADE80', bestFor: 'ALL PLANTS'         },
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
    drainage:          '#60A5FA',
    waterRetention:    '#34D399',
    aeration:          '#94A3B8',
    nutrientRetention: '#FBBF24',
  },

  BG:      '#222222',
  TEXT:    '#FFFFFF',
  MUTED:   '#555555',
  MUTED2:  '#888888',
  DIVIDER: '#2A2A2A',
  SLATE:   '#64748B',
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

// ── 画像ロード（Promise）──
function shrLoadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // ← これ追加
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

// ── B&W市松模様を描画（写真の背後に敷く）──
function shrCheckerboard(ctx, x, y, w, h, unit) {
  const cols = Math.ceil(w / unit);
  const rows = Math.ceil(h / unit);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#FFFFFF' : '#111111';
      const cx = x + c * unit;
      const cy = y + r * unit;
      ctx.fillRect(cx, cy, Math.min(unit, x + w - cx), Math.min(unit, y + h - cy));
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

// ── コアレンダリング: 750×1583px の canvas を返す ──
async function buildShareCanvas() {
  const usedMats = objectTypes.filter(t => t.weight > 0);
  if (!usedMats.length) throw new Error('no-mats');

  const comp = calcComposite();
  const { W, H, TOP_H, STRIP_L, PHOTO_H_IMG, STRIPE_UNIT } = SHR;

  // 用土タイプ
  const soilTypeName = shrGetSoilType(comp);
  const soilTypeDef  = SHR.SOIL_TYPES[soilTypeName];
  const accentColor  = soilTypeDef.color;
  const bestFor      = soilTypeDef.bestFor;

  // 写真幅（左ストリップ + 右市松を除く）
  const PHOTO_RIGHT_STRIP = 90;   // 市松3セル分 (30×3)
  const PHOTO_W   = W - STRIP_L - PHOTO_RIGHT_STRIP;  // 512px
  const PHOTO_TOP = 90;  // メインビジュアル上部マージン（市松3セル分）

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ══ 背景 ══
  ctx.fillStyle = SHR.BG;
  ctx.fillRect(0, 0, W, H);

  // ══ 市松模様（写真の背後・左ストリップより右のみ）══
  shrCheckerboard(ctx, STRIP_L, 0, W - STRIP_L, TOP_H, STRIPE_UNIT);

  // ══ 上部: 植物写真 ══
  let photoImg = null;
  try { photoImg = await shrLoadImage(SHR.PHOTO_PATH); } catch (_) {}

  if (photoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(STRIP_L, PHOTO_TOP, PHOTO_W, PHOTO_H_IMG);
    ctx.clip();
    shrDrawImageCover(ctx, photoImg, STRIP_L, PHOTO_TOP, PHOTO_W, PHOTO_H_IMG);
    ctx.restore();
  } else {
    // プレースホルダー
    const pg = ctx.createLinearGradient(STRIP_L, PHOTO_TOP, STRIP_L + PHOTO_W, PHOTO_TOP + PHOTO_H_IMG);
    pg.addColorStop(0, '#1B3A2D');
    pg.addColorStop(1, '#0D2318');
    ctx.fillStyle = pg;
    ctx.fillRect(STRIP_L, PHOTO_TOP, PHOTO_W, PHOTO_H_IMG);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.font      = `12px "Hiragino Sans","Yu Gothic",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SHR.PHOTO_PATH に写真のパスを設定', STRIP_L + PHOTO_W / 2, PHOTO_TOP + PHOTO_H_IMG / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── 左ストリップ: 用土タイプ（回転テキスト）──
  {
    const stripCx = STRIP_L / 2;
    const stripCy = PHOTO_TOP + PHOTO_H_IMG / 2;

    // フォントサイズ: テキスト長に合わせて自動調整
    const maxH = PHOTO_H_IMG - 40;  // 上下20pxマージン
    let fontSize = 120;
    ctx.font = `900 ${fontSize}px "Hiragino Sans","Yu Gothic",sans-serif`;
    const tw = ctx.measureText(soilTypeName).width;
    if (tw > maxH) fontSize = Math.floor(fontSize * maxH / tw);

    ctx.save();
    ctx.translate(stripCx, stripCy);
    ctx.rotate(-Math.PI / 2);

    ctx.font         = `900 ${fontSize}px "Hiragino Sans","Yu Gothic",sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // 白縁取り
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth   = fontSize * 0.06;
    ctx.lineJoin    = 'round';
    ctx.strokeText(soilTypeName, 0, 0);

    // 塗り
    ctx.fillStyle = accentColor;
    ctx.fillText(soilTypeName, 0, 0);
    ctx.restore();
  }

  // ══ 下部コンテンツ ══
  const PAD     = 32;
  const COL_GAP = 16;
  const COL_W   = (W - PAD * 2 - COL_GAP) / 2;  // 335px
  const COL2_X  = PAD + COL_W + COL_GAP;

  let curY = TOP_H + 34;

  // ── セクションヘッダー ──
  ctx.fillStyle    = SHR.MUTED2;
  ctx.font         = `500 14px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'left';
  ctx.fillText('トップ資材', PAD, curY + 8);
  ctx.fillText('配合スコア', COL2_X, curY + 8);
  curY += 34;

  // ── リスト ──
  const sorted  = [...usedMats].sort((a, b) => b.weight - a.weight);
  const totalKg = sorted.reduce((s, t) => s + t.weight, 0);
  const top5    = sorted.slice(0, 5);

  // 指標を値順でソート
  const sortedMetrics = [...SHR.METRICS].sort((a, b) => {
    return (comp ? (comp[b] ?? 0) : 0) - (comp ? (comp[a] ?? 0) : 0);
  });

  const ITEM_H    = 70;
  const RANK_W    = 34;
  const RANK_FONT = `700 34px "Hiragino Sans","Yu Gothic",sans-serif`;
  const NAME_FONT = `700 32px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;
  const SUB_FONT  = `400 15px "Hiragino Sans","Yu Gothic",sans-serif`;

  const maxRows = Math.max(top5.length, sortedMetrics.length);

  for (let i = 0; i < maxRows; i++) {
    const rowY   = curY + i * ITEM_H;
    const midY   = rowY + ITEM_H / 2;

    // 左列: 資材
    if (i < top5.length) {
      const mat  = top5[i];
      const pct  = totalKg > 0 ? Math.round(mat.weight / totalKg * 100) : 0;
      const szLb = mat.hasSize === false ? '' : (mat.size ? `  ${mat.size}` : '');

      ctx.fillStyle    = SHR.MUTED;
      ctx.font         = RANK_FONT;
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'left';
      ctx.fillText(String(i + 1), PAD, midY);

      ctx.fillStyle = SHR.TEXT;
      ctx.font      = NAME_FONT;
      ctx.fillText(mat.name + szLb, PAD + RANK_W + 8, midY);

      ctx.fillStyle = SHR.MUTED2;
      ctx.font      = SUB_FONT;
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, PAD + COL_W, midY);
      ctx.textAlign = 'left';
    }

    // 右列: 指標スコア
    if (i < sortedMetrics.length) {
      const key   = sortedMetrics[i];
      const value = comp ? Math.round(comp[key] ?? 0) : 0;
      const color = SHR.METRIC_COLORS[key];
      const label = SHR.METRIC_LABELS[key];

      ctx.fillStyle    = SHR.MUTED;
      ctx.font         = RANK_FONT;
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'left';
      ctx.fillText(String(i + 1), COL2_X, midY);

      ctx.fillStyle = color;
      ctx.font      = NAME_FONT;
      ctx.fillText(label, COL2_X + RANK_W + 8, midY);

      // アンダーバーグラフ
      const barX   = COL2_X + RANK_W + 8;
      const barY   = midY + 20;
      const barH   = 3;
      const barMaxW = COL_W - RANK_W - 8 - 44;  // % 値の手前まで
      ctx.fillStyle = SHR.DIVIDER;
      ctx.fillRect(barX, barY, barMaxW, barH);
      ctx.fillStyle = color;
      ctx.fillRect(barX, barY, Math.round(barMaxW * value / 100), barH);

      ctx.fillStyle = SHR.MUTED2;
      ctx.font      = SUB_FONT;
      ctx.textAlign = 'right';
      ctx.fillText(`${value}%`, COL2_X + COL_W, midY);
      ctx.textAlign = 'left';
    }
  }

  curY += maxRows * ITEM_H + 32;

  // ── 区切り線 ──
  ctx.fillStyle = SHR.DIVIDER;
  ctx.fillRect(PAD, curY, W - PAD * 2, 1);
  curY += 32;

  // ── 大スタット: SOIL SCORE ＋ BEST FOR ──
  const soilScore = comp ? Math.max(
    comp.drainage ?? 0, comp.waterRetention ?? 0,
    comp.aeration ?? 0, comp.nutrientRetention ?? 0
  ) : 0;

  // SOIL SCORE (左)
  ctx.fillStyle    = SHR.MUTED2;
  ctx.font         = `500 14px "Hiragino Sans","Yu Gothic",sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign    = 'left';
  ctx.fillText('SOIL SCORE', PAD, curY + 18);

  ctx.fillStyle    = SHR.TEXT;
  ctx.font         = `900 90px "Hiragino Sans","Yu Gothic",sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${Math.round(soilScore)}%`, PAD, curY + 118);

  // BEST FOR (右)
  ctx.fillStyle    = SHR.MUTED2;
  ctx.font         = `500 14px "Hiragino Sans","Yu Gothic",sans-serif`;
  ctx.textAlign    = 'left';
  ctx.fillText('BEST FOR', COL2_X, curY + 18);

  ctx.fillStyle    = accentColor;
  ctx.font         = `900 76px "Hiragino Sans","Yu Gothic",sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(bestFor, COL2_X, curY + 118);

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // ── フッター ──
  const footerY = H - 52;
  ctx.fillStyle    = SHR.TEXT;
  ctx.font         = `900 28px "Hiragino Sans","Yu Gothic",sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'left';
  ctx.fillText('Q Soil', PAD, footerY + 26);

  ctx.fillStyle = SHR.MUTED2;
  ctx.font      = `500 20px "Hiragino Sans","Yu Gothic",sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('QSOIL.JP / 用土配合シミュレータ', W - PAD, footerY + 26);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

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
