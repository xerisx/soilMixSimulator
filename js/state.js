// ── 定数 ──
const WALL_T = 10;
const POT_DIAMETERS = { 1: 3, 2: 6, 3: 9, 4: 12, 5: 15 }; // cm
const ADD_COUNTS = { 1: 10, 2: 32, 3: 55, 4: 77, 5: 100 };

// ── プリセット配合（resource ID → weight） ──
const PRESETS = {
  balance:  { akadama: 3, hyuga: 2, pumice: 1.5, coco_chip: 1 },
  drainage: { hyuga: 3, pumice: 3, perlite: 2, coco_chip: 1 },
  water:    { akadama: 3, vermiculite: 2, peatmoss: 2, coco_chip: 1 },
  nutrient: { zeolite: 3, vermiculite: 2, akadama: 2, humus: 1 },
};

// ── S/M/L サイズ意味テキスト ──
const SIZE_HINTS = { S: '保水寄り・密な充填', M: 'バランス', L: '排水・通気寄り' };
const CUP_RATIO = { topW: 0.50, botW: 0.33, hToW: 1.1 };
const DESKTOP_BREAKPOINT = 768;

// ── アプリ状態 ──
let currentSize = '3';
// MATERIALS（materials.js）からシミュレーション用の状態を初期化
let objectTypes = MATERIALS
  .filter(m => m.id !== 'sphagnum')
  .map(m => ({
    ...m,
    size:   'M',
    weight: 0,
  }));
let cupBodies = [];
let spawnInterval = null;
let currentCupDims = null;
let selectedCommercialSoil = null;
let compareBaseSnapshot = null; // 比較元スナップショット
let favorites = [];             // favorites.js で loadFavorites() により上書き
let activePreset = null;
let isAirView = false;
let lastFillRate = -1;
