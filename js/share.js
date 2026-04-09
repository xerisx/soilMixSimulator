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

// ── モーダル表示 ──
function showShareModal() {
  const url = buildShareURL();
  const modal = document.getElementById('share-modal');
  const input = document.getElementById('share-url-input');
  if (!modal || !input) return;

  input.value = url;
  modal.hidden = false;
  input.select();

  const encodedURL = encodeURIComponent(url);
  const tweetText  = encodeURIComponent('用土配合を共有します');
  document.getElementById('share-x-btn').href =
    `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodedURL}`;
  document.getElementById('share-line-btn').href =
    `https://social-plugins.line.me/lineit/share?url=${encodedURL}`;
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
