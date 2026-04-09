#!/usr/bin/env node
/**
 * calibrate.js — パラメータキャリブレーションスクリプト
 *
 * 使い方: node calibrate.js
 *
 * score-engine.js / analysis.js のロジックを Node.js 互換で再実装し、
 * 定番配合の期待値と出力を比較する。
 */

// ─── 定数（score-engine.js と同値） ──────────────────────────────────────────

const SE = {
  P: { drainage:-0.5, aeration:-0.5, waterRetention:2.0, nutrientRetention:1.5 },
  PARTICLE: {
    drainageFineSlope:20, drainageCoarseGain:12,
    aerationFineSlope:18, aerationCoarseGain:10,
    waterFineGain:8,      waterCoarsePenalty:10,
    nutrientFineGain:5,   coarseEffectCap:0.45,
  },
  FINE_EXCESS:   { threshold:0.30, drainageSlope:45, aerationSlope:35 },
  PARTICLE_MIX:  { coarseMin:0.25, fineMin:0.08, fineMax:0.22, drainageGain:10, aerationGain:6 },
  ORGANIC_HEAVY: { threshold:0.60, aerationSlope:30, waterGain:10 },
  RULE_CAP: 25,
};

const BASE_SIZE_EFFECT = {
  S: { drainage:-12, waterRetention:12,  aeration:-10, nutrientRetention:8  },
  M: { drainage:  0, waterRetention:0,   aeration:  0, nutrientRetention:0  },
  L: { drainage: 12, waterRetention:-12, aeration: 10, nutrientRetention:-8 },
};

// ─── 資材定義（materials.js から抜粋） ───────────────────────────────────────

const MAT = {
  coco_chip:   { id:'coco_chip',   name:'ココチップ',    params:{drainage:75,waterRetention:45,aeration:85,nutrientRetention:35,organic:true }, sizeSensitivity:0.5,  hasSize:true,  sizes:{S:{min:3,max:5},  M:{min:5,max:10}, L:{min:10,max:20}} },
  hyuga:       { id:'hyuga',       name:'日向土',        params:{drainage:88,waterRetention:25,aeration:82,nutrientRetention:15,organic:false}, sizeSensitivity:1.0,  hasSize:true,  sizes:{S:{min:3,max:6},  M:{min:6,max:12}, L:{min:12,max:20}} },
  akadama:     { id:'akadama',     name:'赤玉土',        params:{drainage:60,waterRetention:65,aeration:55,nutrientRetention:45,organic:false}, sizeSensitivity:1.0,  hasSize:true,  sizes:{S:{min:3,max:6},  M:{min:6,max:12}, L:{min:12,max:18}} },
  pumice:      { id:'pumice',      name:'軽石',          params:{drainage:90,waterRetention:30,aeration:88,nutrientRetention:20,organic:false}, sizeSensitivity:0.85, hasSize:true,  sizes:{S:{min:3,max:6},  M:{min:6,max:12}, L:{min:12,max:20}} },
  zeolite:     { id:'zeolite',     name:'ゼオライト',    params:{drainage:55,waterRetention:55,aeration:45,nutrientRetention:90,organic:false}, sizeSensitivity:0.5,  hasSize:true,  sizes:{S:{min:1,max:3},  M:{min:3,max:5},  L:{min:5,max:10}}  },
  perlite:     { id:'perlite',     name:'パーライト',    params:{drainage:88,waterRetention:30,aeration:92,nutrientRetention:10,organic:false}, sizeSensitivity:0.45, hasSize:true,  sizes:{S:{min:1,max:3},  M:{min:3,max:7},  L:{min:7,max:15}}  },
  vermiculite: { id:'vermiculite', name:'バーミキュライト',params:{drainage:35,waterRetention:85,aeration:45,nutrientRetention:85,organic:false},sizeSensitivity:0.4, hasSize:true,  sizes:{S:{min:1,max:2},  M:{min:2,max:4},  L:{min:4,max:8}}   },
  bark_chip:   { id:'bark_chip',   name:'バークチップ',  params:{drainage:75,waterRetention:50,aeration:80,nutrientRetention:40,organic:true }, sizeSensitivity:0.6,  hasSize:true,  sizes:{S:{min:2,max:6},  M:{min:6,max:15}, L:{min:15,max:30}} },
  charcoal:    { id:'charcoal',    name:'炭',            params:{drainage:80,waterRetention:30,aeration:82,nutrientRetention:55,organic:false}, sizeSensitivity:0.7,  hasSize:true,  sizes:{S:{min:2,max:5},  M:{min:5,max:12}, L:{min:12,max:25}} },
  kanuma:      { id:'kanuma',      name:'鹿沼土',        params:{drainage:72,waterRetention:50,aeration:68,nutrientRetention:35,organic:false}, sizeSensitivity:0.8,  hasSize:true,  sizes:{S:{min:3,max:6},  M:{min:6,max:12}, L:{min:12,max:20}} },
  peatmoss:    { id:'peatmoss',    name:'ピートモス',    params:{drainage:20,waterRetention:95,aeration:35,nutrientRetention:70,organic:true }, sizeSensitivity:0.2,  hasSize:false, sizes:{S:{min:1,max:2},  M:{min:2,max:6},  L:{min:6,max:15}}  },
  humus:       { id:'humus',       name:'腐葉土',        params:{drainage:45,waterRetention:75,aeration:55,nutrientRetention:65,organic:true }, sizeSensitivity:0.3,  hasSize:false, sizes:{S:{min:1,max:5},  M:{min:5,max:15}, L:{min:15,max:30}} },
  sphagnum:    { id:'sphagnum',    name:'水苔',          params:{drainage:50,waterRetention:95,aeration:65,nutrientRetention:55,organic:true }, sizeSensitivity:0.2,  hasSize:false, sizes:{S:{min:5,max:20}, M:{min:20,max:50},L:{min:50,max:150}} },
};

const MATERIAL_EXTRA = {
  zeolite:     { strongEffect:{ nutrientRetention:0.8, waterRetention:0.25 } },
  perlite:     { strongEffect:{ drainage:0.5, aeration:0.6 } },
  vermiculite: { strongEffect:{ waterRetention:0.6, nutrientRetention:0.5 } },
  peatmoss:    { thresholdEffects:[{metric:'waterRetention',threshold:0.20,slope:25},{metric:'aeration',threshold:0.40,slope:-40}] },
  humus:       { thresholdEffects:[{metric:'nutrientRetention',threshold:0.20,slope:28},{metric:'aeration',threshold:0.50,slope:-30}] },
  bark_chip:   { thresholdEffects:[{metric:'aeration',threshold:0.50,slope:-20}] },
};

// ─── スコアエンジン ───────────────────────────────────────────────────────────

const clamp = v => Math.max(0, Math.min(100, v));

function getAdjustedParams(t) {
  const p = t.params;
  if (t.hasSize === false) return { ...p };
  const eff  = BASE_SIZE_EFFECT[t.size] ?? BASE_SIZE_EFFECT.M;
  const sens = t.sizeSensitivity ?? 0.5;
  return {
    drainage:          clamp(p.drainage          + eff.drainage          * sens),
    waterRetention:    clamp(p.waterRetention    + eff.waterRetention    * sens),
    aeration:          clamp(p.aeration          + eff.aeration          * sens),
    nutrientRetention: clamp(p.nutrientRetention + eff.nutrientRetention * sens),
    organic:           p.organic,
  };
}

function getStrongEffect(t)     { return t.strongEffect     ?? MATERIAL_EXTRA[t.id]?.strongEffect     ?? {}; }
function getThresholdEffects(t) { return t.thresholdEffects ?? MATERIAL_EXTRA[t.id]?.thresholdEffects ?? []; }

function getLocalBoost(t, metric, ratio) {
  const eff = getStrongEffect(t)[metric];
  if (!eff || ratio >= 0.3) return 1.0;
  return 1.0 + eff * (1 - ratio / 0.3);
}

function weightedPowerMean(items, p) {
  const eps    = 0.5;
  const totalW = items.reduce((s, i) => s + i.weight, 0);
  if (totalW === 0) return 0;
  const norm = items.map(i => ({ v: Math.max(i.value, eps), w: i.weight / totalW }));
  if (Math.abs(p) < 1e-9)
    return Math.exp(norm.reduce((s, i) => s + i.w * Math.log(i.v), 0));
  return Math.pow(norm.reduce((s, i) => s + i.w * Math.pow(i.v, p), 0), 1 / p);
}

function calcScores(active) {
  const total = active.reduce((s, t) => s + t.weight, 0);
  if (total === 0) return null;

  // Step 1: ベーススコア
  const makeItems = metric => active.map(t => {
    const value = getAdjustedParams(t)[metric] ?? 0;
    const ratio = t.weight / total;
    return { value, weight: ratio * getLocalBoost(t, metric, ratio) };
  });
  let s = {
    drainage:          weightedPowerMean(makeItems('drainage'),          SE.P.drainage),
    aeration:          weightedPowerMean(makeItems('aeration'),          SE.P.aeration),
    waterRetention:    weightedPowerMean(makeItems('waterRetention'),    SE.P.waterRetention),
    nutrientRetention: weightedPowerMean(makeItems('nutrientRetention'), SE.P.nutrientRetention),
  };
  const step1 = { ...s };

  // Step 2: 粒度補正
  let fine = 0, coarse = 0;
  for (const t of active) {
    const r    = t.weight / total;
    const size = t.hasSize === false ? 'M' : (t.size ?? 'M');
    if      (size === 'S') fine   += r;
    else if (size === 'L') coarse += r;
  }
  const C  = SE.PARTICLE;
  const ce = Math.min(coarse, C.coarseEffectCap);
  s = {
    drainage:          clamp(s.drainage          - fine * C.drainageFineSlope   + ce    * C.drainageCoarseGain),
    aeration:          clamp(s.aeration          - fine * C.aerationFineSlope   + ce    * C.aerationCoarseGain),
    waterRetention:    clamp(s.waterRetention    + fine * C.waterFineGain       - coarse* C.waterCoarsePenalty),
    nutrientRetention: clamp(s.nutrientRetention + fine * C.nutrientFineGain),
  };
  const step2 = { ...s };

  // Step 3: 閾値効果
  for (const t of active) {
    const ratio   = t.weight / total;
    const effects = getThresholdEffects(t);
    for (const eff of effects) {
      if (ratio <= eff.threshold) continue;
      const excess = (ratio - eff.threshold) / Math.max(1 - eff.threshold, 0.01);
      if (s[eff.metric] !== undefined)
        s[eff.metric] = clamp(s[eff.metric] + eff.slope * excess);
    }
  }
  const step3 = { ...s };

  // Step 4: 相互作用
  const accum = { drainage:0, aeration:0, waterRetention:0, nutrientRetention:0 };
  const addEff = (metric, delta) => {
    const room   = SE.RULE_CAP - accum[metric];
    if (room <= 0) return;
    const capped = Math.sign(delta) * Math.min(Math.abs(delta), room);
    s[metric] = clamp(s[metric] + capped);
    accum[metric] += Math.abs(capped);
  };

  const fineExcess = Math.max(0, fine - SE.FINE_EXCESS.threshold);
  if (fineExcess > 0) {
    addEff('drainage', -fineExcess * SE.FINE_EXCESS.drainageSlope);
    addEff('aeration', -fineExcess * SE.FINE_EXCESS.aerationSlope);
  }
  const organicRatio = active.filter(t => t.params.organic).reduce((s, t) => s + t.weight / total, 0);
  const orgExcess    = Math.max(0, organicRatio - SE.ORGANIC_HEAVY.threshold);
  if (orgExcess > 0) {
    addEff('aeration',       -orgExcess * SE.ORGANIC_HEAVY.aerationSlope);
    addEff('waterRetention',  orgExcess * SE.ORGANIC_HEAVY.waterGain);
  }
  const PM = SE.PARTICLE_MIX;
  if (coarse > PM.coarseMin && fine >= PM.fineMin && fine < PM.fineMax) {
    const intensity = Math.min(coarse, 0.40);
    addEff('drainage', intensity * PM.drainageGain);
    addEff('aeration', intensity * PM.aerationGain);
  }
  const step4 = { ...s };

  // Step 5: 鉢サイズ補正なし（基準サイズ3で固定）

  const final = {
    drainage:          Math.round(s.drainage),
    waterRetention:    Math.round(s.waterRetention),
    aeration:          Math.round(s.aeration),
    nutrientRetention: Math.round(s.nutrientRetention),
    organic:           Math.round(organicRatio * 100),
  };

  return { step1, step2, step3, step4, final, fineRatio:fine, coarseRatio:coarse };
}

// ─── テスト配合の定義 ─────────────────────────────────────────────────────────
//
// 各エントリ:
//   name    : 配合名
//   mix     : [{ id, size, weight }]  size は省略時 M
//   expected: 期待スコアの範囲 { drainage:[min,max], waterRetention:[min,max], ... }
//

const TEST_MIXES = [
  {
    name: '① 多肉・塊根系（乾かし気味）',
    mix: [
      { id:'hyuga',   size:'M', weight:5 },
      { id:'akadama', size:'M', weight:3 },
      { id:'zeolite', size:'M', weight:2 },
    ],
    expected: {
      drainage:          [70, 82],
      waterRetention:    [30, 52],
      aeration:          [62, 76],
      nutrientRetention: [32, 50],
    },
  },
  {
    name: '② アロイド系（通気・適度保水）',
    mix: [
      { id:'coco_chip', size:'M', weight:5 },
      { id:'akadama',   size:'M', weight:3 },
      { id:'perlite',   size:'M', weight:2 },
    ],
    expected: {
      drainage:          [62, 76],
      waterRetention:    [32, 52],
      aeration:          [68, 84],
      nutrientRetention: [22, 38],
    },
  },
  {
    name: '③ 草花・培養土風（バランス型）',
    mix: [
      { id:'akadama', size:'M', weight:5 },
      { id:'humus',            weight:4 },  // hasSize:false
      { id:'perlite', size:'M', weight:1 },
    ],
    expected: {
      drainage:          [48, 65],
      waterRetention:    [55, 72],
      aeration:          [46, 62],
      nutrientRetention: [58, 74],
    },
  },
  {
    name: '④ ラン・着生系（水苔ベース）',
    mix: [
      { id:'sphagnum',         weight:8 },  // hasSize:false
      { id:'perlite', size:'M', weight:2 },
    ],
    expected: {
      drainage:          [40, 58],
      waterRetention:    [72, 90],
      aeration:          [55, 74],
      nutrientRetention: [35, 52],
    },
  },
  {
    name: '⑤ ピートモスベース（アシッド系）',
    mix: [
      { id:'peatmoss',         weight:6 },  // hasSize:false
      { id:'perlite', size:'M', weight:3 },
      { id:'zeolite', size:'M', weight:1 },
    ],
    expected: {
      drainage:          [25, 45],
      waterRetention:    [72, 92],
      aeration:          [28, 48],
      nutrientRetention: [60, 78],
    },
  },
  {
    name: '⑥ 鹿沼土ベース（ブルーベリー系）',
    mix: [
      { id:'kanuma',   size:'M', weight:7 },
      { id:'peatmoss',          weight:3 },  // hasSize:false
    ],
    expected: {
      drainage:          [45, 62],
      waterRetention:    [52, 70],
      aeration:          [44, 60],
      nutrientRetention: [42, 58],
    },
  },
  {
    name: '⑦ 無機質フル排水系（多肉・サボテン極乾）',
    mix: [
      { id:'pumice',  size:'M', weight:5 },
      { id:'hyuga',   size:'M', weight:3 },
      { id:'perlite', size:'M', weight:2 },
    ],
    expected: {
      drainage:          [80, 95],
      waterRetention:    [12, 32],
      aeration:          [75, 90],
      nutrientRetention: [8,  22],
    },
  },
  {
    name: '⑧ 有機物過多テスト（腐葉土7割）',
    mix: [
      { id:'humus',   weight:7 },  // hasSize:false → organic_heavy 発動を期待
      { id:'akadama', size:'M', weight:3 },
    ],
    expected: {
      drainage:          [35, 55],
      waterRetention:    [65, 82],
      aeration:          [30, 50],  // organic_heavy ペナルティで低下を期待
      nutrientRetention: [60, 78],
    },
  },
];

// ─── 実行 ────────────────────────────────────────────────────────────────────

const METRICS = ['drainage', 'waterRetention', 'aeration', 'nutrientRetention'];
const LABELS  = { drainage:'排水性', waterRetention:'保水性', aeration:'通気性', nutrientRetention:'保肥力' };

function inRange(v, [lo, hi]) { return v >= lo && v <= hi; }

console.log('='.repeat(70));
console.log('  用土配合シミュレータ — キャリブレーション結果');
console.log('='.repeat(70));

let totalChecks = 0, passChecks = 0;

for (const tc of TEST_MIXES) {
  // objectType 形式に変換
  const active = tc.mix.map(({ id, size, weight }) => {
    const mat = MAT[id];
    if (!mat) throw new Error(`Unknown material: ${id}`);
    return { ...mat, size: mat.hasSize === false ? undefined : (size ?? 'M'), weight };
  });

  const result = calcScores(active);

  console.log(`\n${tc.name}`);

  // 配合内訳
  const total = active.reduce((s, t) => s + t.weight, 0);
  const mixStr = active.map(t => {
    const pct  = Math.round(t.weight / total * 100);
    const size = t.hasSize === false ? '' : `(${t.size})`;
    return `${t.name}${size} ${pct}%`;
  }).join(' : ');
  console.log(`  配合: ${mixStr}`);
  console.log(`  粒度 fine=${(result.fineRatio*100).toFixed(0)}% coarse=${(result.coarseRatio*100).toFixed(0)}%`);

  // ステップ別中間値（簡易）
  console.log(`  Step1(base)  D:${result.step1.drainage.toFixed(1)}  W:${result.step1.waterRetention.toFixed(1)}  A:${result.step1.aeration.toFixed(1)}  N:${result.step1.nutrientRetention.toFixed(1)}`);
  console.log(`  Step2(粒度)  D:${result.step2.drainage.toFixed(1)}  W:${result.step2.waterRetention.toFixed(1)}  A:${result.step2.aeration.toFixed(1)}  N:${result.step2.nutrientRetention.toFixed(1)}`);
  console.log(`  Step3(閾値)  D:${result.step3.drainage.toFixed(1)}  W:${result.step3.waterRetention.toFixed(1)}  A:${result.step3.aeration.toFixed(1)}  N:${result.step3.nutrientRetention.toFixed(1)}`);
  console.log(`  Step4(相互)  D:${result.step4.drainage.toFixed(1)}  W:${result.step4.waterRetention.toFixed(1)}  A:${result.step4.aeration.toFixed(1)}  N:${result.step4.nutrientRetention.toFixed(1)}`);

  // 期待値との比較
  console.log(`  ${'指標'.padEnd(6)} ${'出力'.padStart(4)} ${'期待範囲'.padEnd(10)} 判定`);
  for (const m of METRICS) {
    const out    = result.final[m];
    const [lo,hi]= tc.expected[m];
    const ok     = inRange(out, [lo, hi]);
    totalChecks++;
    if (ok) passChecks++;
    const mark   = ok ? '✓' : '✗ ← 要確認';
    console.log(`  ${LABELS[m].padEnd(6)} ${String(out).padStart(4)}   [${lo}–${hi}]   ${mark}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log(`  結果: ${passChecks}/${totalChecks} 項目が期待範囲内`);
console.log('='.repeat(70));
