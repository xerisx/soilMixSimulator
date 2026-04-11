// ── MATERIALS インデックスマップ ──
const MATERIAL_INDEX = Object.fromEntries(MATERIALS.map((m, i) => [m.id, i]));

// sizeCode: none=0, S=1, M=2, L=3
const SIZE_TO_CODE = { none: 0, S: 1, M: 2, L: 3 };
const CODE_TO_SIZE = ['none', 'S', 'M', 'L'];

// ── ビットライター ──
function BitWriter() {
  const bytes = [];
  let cur = 0, bits = 0;
  return {
    write(val, n) {
      for (let i = n - 1; i >= 0; i--) {
        cur = (cur << 1) | ((val >> i) & 1);
        if (++bits === 8) { bytes.push(cur); cur = 0; bits = 0; }
      }
    },
    flush() {
      if (bits > 0) { bytes.push(cur << (8 - bits)); }
      return bytes;
    },
  };
}

// ── ビットリーダー ──
function BitReader(bytes) {
  let bytePos = 0, bitPos = 0;
  return {
    read(n) {
      let val = 0;
      for (let i = 0; i < n; i++) {
        if (bytePos >= bytes.length) return -1;
        val = (val << 1) | ((bytes[bytePos] >> (7 - bitPos)) & 1);
        if (++bitPos === 8) { bytePos++; bitPos = 0; }
      }
      return val;
    },
  };
}

// ── Base64URL ──
function bytesToBase64URL(bytes) {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64URLToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - padded.length % 4) % 4;
  const bin = atob(padded + '='.repeat(pad));
  return Array.from(bin, c => c.charCodeAt(0));
}

// ── エンコード ──
// header: version(2) + potSize(3) + materialCount(4) = 9bit
// material: materialId(5) + size(2) + weight(7) = 14bit
function encodeShareState() {
  const mats = objectTypes
    .filter(t => t.weight > 0)
    .slice(0, 15)
    .map(t => ({
      idx:     MATERIAL_INDEX[t.id] ?? 0,
      size:    t.hasSize === false ? 0 : (SIZE_TO_CODE[t.size] ?? 2),
      weight:  Math.min(127, Math.max(0, Math.round(t.weight * 10))),
    }));

  const w = BitWriter();
  w.write(1, 2);                   // version
  w.write(Number(currentSize), 3); // potSize 1-5
  w.write(mats.length, 4);         // materialCount
  mats.forEach(m => {
    w.write(m.idx,    5);
    w.write(m.size,   2);
    w.write(m.weight, 7);
  });
  return bytesToBase64URL(w.flush());
}

// ── デコード・復元 ──
function decodeShareState(encoded) {
  try {
    const bytes = base64URLToBytes(encoded);
    if (!bytes.length) return false;

    const r = BitReader(bytes);
    const version = r.read(2);
    if (version !== 1) return false;

    const potSize = r.read(3);
    if (potSize < 1 || potSize > 5) return false;
    const count = r.read(4);
    if (count < 0 || count > 15) return false;

    const entries = [];
    for (let i = 0; i < count; i++) {
      const idx    = r.read(5);
      const size   = r.read(2);
      const weight = r.read(7);
      if (idx < 0 || idx >= MATERIALS.length) return false;
      entries.push({ idx, size, weight });
    }

    // 状態適用
    currentSize = String(potSize);
    document.querySelectorAll('.size-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.size === currentSize);
    });
    updatePotHint();

    objectTypes.forEach(t => { t.weight = 0; });
    entries.forEach(({ idx, size, weight }) => {
      objectTypes[idx].weight = weight / 10;
      if (objectTypes[idx].hasSize !== false) {
        objectTypes[idx].size = CODE_TO_SIZE[size] ?? 'M';
      }
    });

    selectedCommercialSoil = null;
    activePreset = null;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));

    reset();
    renderObjList();
    updateGraphs();
    updateBaseLabel();
    return true;
  } catch (e) {
    return false;
  }
}

// ── 共有URL生成 ──
function buildShareURL() {
  return location.origin + location.pathname + '#' + encodeShareState();
}

// ── トースト ──
function showToast(msg) {
  let toast = document.getElementById('share-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'share-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 2000);
}

// ── 共有画像の状態 ──
const shareImageState = {
  selectedThemeId: null,
  previewBlob:     null,
  isGenerating:    false,
  pendingUpdate:   false,
  canNativeShare:  false,
};

// ── Web Share API（ファイル共有）対応チェック ──
// モバイル（iOS / Android）のみ有効にする
function checkNativeShareCapability() {
  try {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const f = new File([''], 'x.png', { type: 'image/png' });
    shareImageState.canNativeShare =
      isMobile &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [f] });
  } catch (_) {
    shareImageState.canNativeShare = false;
  }
}

// ── テーマサムネカルーセルを描画 ──
function renderShareThumbCarousel() {
  const el = document.getElementById('share-theme-carousel');
  if (!el) return;
  el.innerHTML = COLOR_PATTERNS.map(p => `
    <button
      class="share-theme-thumb${p.name === shareImageState.selectedThemeId ? ' selected' : ''}"
      data-theme="${p.name}"
      style="--thumb-bg:${p.BG};--thumb-alt:${p.CHECKER_ALT};--thumb-text:${p.TEXT}"
      onclick="selectShareTheme('${p.name}')"
    ></button>
  `).join('');
  // 選択中サムネを中央に寄せる
  const selected = el.querySelector('.selected');
  if (selected) selected.scrollIntoView({ inline: 'center', behavior: 'smooth' });
}

// ── テーマ選択 ──
function selectShareTheme(themeId) {
  shareImageState.selectedThemeId = themeId;
  document.querySelectorAll('.share-theme-thumb').forEach(el => {
    el.classList.toggle('selected', el.dataset.theme === themeId);
  });
  const selected = document.querySelector('.share-theme-thumb.selected');
  if (selected) selected.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
  updateSharePreview();
}

// ── 前後テーマに移動（矢印ボタン・スワイプ共通）──
function navigateShareTheme(dir) {
  const names = COLOR_PATTERNS.map(p => p.name);
  const idx = names.indexOf(shareImageState.selectedThemeId);
  const next = names[(idx + dir + names.length) % names.length];
  selectShareTheme(next);
}

// ── シャッフル（現在と異なるランダムテーマを選ぶ）──
function shuffleShareTheme() {
  const others = COLOR_PATTERNS.map(p => p.name).filter(n => n !== shareImageState.selectedThemeId);
  selectShareTheme(others[Math.floor(Math.random() * others.length)]);
}

// ── プレビュー更新 ──
// 生成中に別テーマが選ばれた場合、完了後に再実行して最新の選択を反映する
async function updateSharePreview() {
  if (shareImageState.isGenerating) {
    shareImageState.pendingUpdate = true;
    return;
  }
  shareImageState.isGenerating = true;
  shareImageState.pendingUpdate = false;

  const inner = document.getElementById('share-preview-inner');
  if (inner) inner.innerHTML = '<p class="share-preview-msg">生成中...</p>';

  try {
    const blob = await generateShareBlob(shareImageState.selectedThemeId);
    shareImageState.previewBlob = blob;

    if (inner) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
      inner.innerHTML = '';
      inner.appendChild(img);
    }
  } catch (e) {
    const msg = e.message === 'no-mats'
      ? '配合を設定してからプレビューしてください'
      : '生成に失敗しました';
    if (inner) inner.innerHTML = `<p class="share-preview-msg">${msg}</p>`;
  } finally {
    shareImageState.isGenerating = false;
    if (shareImageState.pendingUpdate) updateSharePreview();
  }
}

// ── アクションボタンを描画（対応状況に応じて切り替え）──
function renderShareActions() {
  const el = document.getElementById('share-actions');
  if (!el) return;

  const isIOS = /iPhone|iPad/i.test(navigator.userAgent);
  if (shareImageState.canNativeShare) {
    el.innerHTML = `
      <button class="share-action-btn share-action-primary" onclick="doWebShare()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        SNSで共有
      </button>
      <p class="share-action-note">X・LINE など共有するアプリを選択できます</p>
      <button class="share-action-save-link" onclick="doSaveImage()">${isIOS ? '写真に保存' : '画像を保存'}</button>
      ${isIOS ? '<p class="share-action-note">共有メニューが開きます</p>' : ''}
    `;
  } else {
    el.innerHTML = `
      <button class="share-action-btn share-action-primary" onclick="doSaveImage()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        画像を保存
      </button>
    `;
  }
}

// ── Web Share API で画像付き共有 ──
// ── SNS共有テキスト生成 ──
function buildShareText() {
  const FEATURE_LABEL = {
    SUCCULENT: '水はけ重視',
    EPIPHYTE:  '通気性重視',
    TROPICAL:  '保水性重視',
    FERTILE:   '保肥力重視',
    BALANCED:  'バランス重視',
  };

  const comp      = calcComposite();
  const soilType  = shrGetSoilType(comp);
  const feature   = FEATURE_LABEL[soilType] ?? 'バランス重視';

  // 上位3資材と比率
  const used     = objectTypes.filter(t => t.weight > 0).sort((a, b) => b.weight - a.weight);
  const totalKg  = used.reduce((s, t) => s + t.weight, 0);
  const top3     = used.slice(0, 3);
  const matsLine = top3.map(t => `${t.name}${Math.round(t.weight / totalKg * 100)}%`).join(' + ')
    + (used.length > 3 ? ' ほか' : '');

  const url = buildShareURL();
  return `${feature}の配合を作ってみました。\n${matsLine}\nみんなはどんな配合にしてる？\n\n${url}\n#qsoil`;
}

async function doWebShare() {
  if (!shareImageState.previewBlob) { showToast('画像を生成中です'); return; }
  const file = new File([shareImageState.previewBlob], 'qsoil-mix.png', { type: 'image/png' });
  try {
    await navigator.share({ files: [file], text: buildShareText() });
  } catch (e) {
    if (e.name !== 'AbortError') showToast('共有に失敗しました');
  }
}

// ── 画像を保存 ──
async function doSaveImage() {
  if (!shareImageState.previewBlob) { showToast('画像を生成中です'); return; }
  const file = new File([shareImageState.previewBlob], 'qsoil-mix.png', { type: 'image/png' });
  // iOS: <a download> は Files アプリにしか保存できないため share sheet 経由で写真アプリへ
  const isIOS = /iPhone|iPad/i.test(navigator.userAgent);
  if (isIOS && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e.name !== 'AbortError') showToast('保存に失敗しました');
    }
    return;
  }
  const url = URL.createObjectURL(shareImageState.previewBlob);
  const a = document.createElement('a');
  a.href = url; a.download = 'qsoil-mix.png';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('画像を保存しました');
}

// ── プレビュースワイプ（テーマ切り替え）──
function initSharePreviewSwipe() {
  const wrap = document.getElementById('share-preview-wrap');
  if (!wrap || wrap._swipeInited) return;
  wrap._swipeInited = true;

  let startX = 0;
  wrap.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  }, { passive: true });
  wrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 40) return;
    navigateShareTheme(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// ── モーダル表示 ──
function showShareModal() {
  const modal = document.getElementById('share-modal');
  const input = document.getElementById('share-url-input');
  if (!modal) return;

  if (input) input.value = buildShareURL();
  modal.hidden = false;

  checkNativeShareCapability();

  // ランダムテーマ選択
  const randomIdx = Math.floor(Math.random() * COLOR_PATTERNS.length);
  shareImageState.selectedThemeId = COLOR_PATTERNS[randomIdx].name;

  renderShareThumbCarousel();
  renderShareActions();
  updateSharePreview();
  initSharePreviewSwipe();
}

function closeShareModal() {
  const modal = document.getElementById('share-modal');
  if (modal) modal.hidden = true;
}

// ── コピー ──
function copyShareURL() {
  const input = document.getElementById('share-url-input');
  const btn   = document.getElementById('share-copy-btn');
  if (!input) return;

  const done = () => {
    if (btn) {
      btn.classList.add('copied');
      clearTimeout(btn._copyTimer);
      btn._copyTimer = setTimeout(() => btn.classList.remove('copied'), 1500);
    }
  };

  navigator.clipboard.writeText(input.value).then(done).catch(() => {
    input.select();
    document.execCommand('copy');
    done();
  });
}

// ── 初期ロード時の復元 ──
function initShareRestore() {
  if (location.hash && location.hash.length > 1) {
    decodeShareState(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
  }
}
