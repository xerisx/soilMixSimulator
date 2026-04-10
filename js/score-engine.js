/**
 * score-engine.js — 配合スコア計算エンジン v2
 *
 * calcCompositeV2() が analysis.js の calcComposite() から呼ばれる。
 * 依存するグローバル（いずれも事前ロード済み）:
 *   objectTypes      state.js
 *   getAdjustedParams  analysis.js
 */

// ─── 設定定数（係数調整はこのオブジェクトだけ変更する） ────────────────────

const SCORE_ENGINE = {

  /**
   * ベーススコアの Power Mean 指数 (p)
   * p < 0 : ボトルネック寄り（最小値に引き寄せられる）
   * p = 1 : 算術平均
   * p > 1 : 最大値寄り（高スコア資材に引き寄せられる）
   */
  P: {
    drainage:          -0.5,  // 細粒が排水路を塞ぐ → ボトルネック寄り
    aeration:          -0.5,  // 同上
    waterRetention:     2.0,  // スポンジ効果 → 高保水材が全体を引き上げる
    nutrientRetention:  1.5,  // 有機物が少量でも効く → やや最大値寄り
  },

  /** 粒度補正係数（Phase 2 常時補正） */
  PARTICLE: {
    drainageFineSlope:   20,  // fineRatio 1.0 あたりの減算量
    drainageCoarseGain:  12,  // coarseEffect 1.0 あたりの加算量
    aerationFineSlope:   18,
    aerationCoarseGain:  10,
    waterFineGain:        8,  // 細粒ほど保水が上がる
    waterCoarsePenalty:  10,  // 粗粒ほど保水が下がる
    nutrientFineGain:     5,  // 細粒は表面積が大きく保肥に寄与
    coarseEffectCap:     0.45, // coarseRatio の恩恵を飽和させる上限
  },

  /** 急変ペナルティ（Phase 3 閾値超過） */
  FINE_EXCESS: {
    threshold:     0.30,  // fineRatio がこれを超えたら発動
    drainageSlope: 45,    // 超過分 × このスロープ = 追加減算
    aerationSlope: 35,
  },

  /** 粒度ミックス効果（条件付きボーナス） */
  PARTICLE_MIX: {
    coarseMin:    0.25,  // 粗粒がこれ以上
    fineMin:      0.08,  // 細粒がこれ以上
    fineMax:      0.22,  // 細粒がこれ未満（多すぎると逆効果）
    drainageGain: 10,
    aerationGain:  6,
  },

  /** organic_heavy ルール（有機物過多 → 通気低下） */
  ORGANIC_HEAVY: {
    threshold:     0.60,
    aerationSlope: 30,
    waterGain:     10,  // 保水はやや上がる
  },

  /** ルール由来補正の cap（1指標あたりの累積上限） */
  RULE_CAP: 25,
};

// ─── 資材追加データ（materials.js を変更せず engine 側で管理） ─────────────
//
// materials.js に同名フィールドがあれば、そちらが優先される（後方互換）。
//
// strongEffect:
//   指標ごとに「少量でも強く効く」度合い（0〜1）。
//   ratio < 0.3 のときだけ有効で、ratio が小さいほど重みが増す。
//
// thresholdEffects:
//   特定の比率を超えたときに発動する効果。
//   { metric, threshold, slope }
//     metric    : 対象指標
//     threshold : この比率を超えたら発動（0〜1）
//     slope     : 超過分 × slope = 加減算。正=ブースト、負=ペナルティ

const MATERIAL_EXTRA = {
  // ゼオライト: 少量でも保肥力と保水性に強く効く
  zeolite: {
    strongEffect: {
      nutrientRetention: 0.8,
      waterRetention:    0.25,
    },
  },
  // パーライト: 少量でも排水性・通気性に強く効く
  perlite: {
    strongEffect: {
      drainage: 0.5,
      aeration: 0.6,
    },
  },
  // バーミキュライト: 少量でも保水・保肥に効く
  vermiculite: {
    strongEffect: {
      waterRetention:    0.6,
      nutrientRetention: 0.5,
    },
  },
  // ピートモス: 20%超で保水ブースト、40%超で通気低下（蒸れ）
  peatmoss: {
    thresholdEffects: [
      { metric: 'waterRetention', threshold: 0.20, slope:  25 },
      { metric: 'aeration',       threshold: 0.40, slope: -40 },
    ],
  },
  // 腐葉土: 20%超で保肥ブースト、50%超で通気低下
  humus: {
    thresholdEffects: [
      { metric: 'nutrientRetention', threshold: 0.20, slope:  28 },
      { metric: 'aeration',          threshold: 0.50, slope: -30 },
    ],
  },
  // 発酵バークチップ: 50%超で通気低下（有機物過多）
  bark_chip: {
    thresholdEffects: [
      { metric: 'aeration', threshold: 0.50, slope: -20 },
    ],
  },
};

/** materials.js 側のフィールドを優先しつつ MATERIAL_EXTRA にフォールバック */
function getStrongEffect(material) {
  return material.strongEffect ?? MATERIAL_EXTRA[material.id]?.strongEffect ?? {};
}
function getThresholdEffects(material) {
  return material.thresholdEffects ?? MATERIAL_EXTRA[material.id]?.thresholdEffects ?? [];
}

// ─── ユーティリティ ────────────────────────────────────────────────────────

const clampScore = v => Math.max(0, Math.min(100, v));

/**
 * 加重 Power Mean
 * M_p(x, w) = ( Σ w_i * x_i^p )^(1/p)
 *
 * @param {Array<{value:number, weight:number}>} items
 * @param {number} p
 */
function weightedPowerMean(items, p) {
  const eps    = 0.5; // ゼロ除算・log(0) 保護
  const totalW = items.reduce((s, i) => s + i.weight, 0);
  if (totalW === 0) return 0;

  const norm = items.map(i => ({
    v: Math.max(i.value, eps),
    w: i.weight / totalW,
  }));

  if (Math.abs(p) < 1e-9) {
    // p → 0 の極限 = 幾何平均
    return Math.exp(norm.reduce((s, i) => s + i.w * Math.log(i.v), 0));
  }

  const powered = norm.reduce((s, i) => s + i.w * Math.pow(i.v, p), 0);
  // powered は v >= eps > 0 が保証されているため常に正。Math.max は不要。
  return Math.pow(powered, 1 / p);
}

// ─── Step 1: ベーススコア（指標別 Power Mean + 少量補正） ───────────────────

/**
 * strongEffect による局所的な重み倍率。
 * ratio < 0.3 のときだけ有効で、ratio が小さいほど強い。
 * ratio >= 0.3 では 1.0（通常の重み）。
 *
 * @param {object} material
 * @param {string} metric
 * @param {number} ratio  この資材の混合比率（0〜1）
 */
function getLocalBoost(material, metric, ratio) {
  const effect = getStrongEffect(material)[metric];
  if (!effect || ratio >= 0.3) return 1.0;
  return 1.0 + effect * (1 - ratio / 0.3);
}

/**
 * 指標別 Power Mean でベーススコアを算出。
 * getAdjustedParams() （analysis.js）でサイズ補正済みの値を使う。
 *
 * @param {object[]} active   weight > 0 の objectType 配列
 * @param {number}   total    全 weight の合計
 */
function calcBaseScores(active, total) {
  const P = SCORE_ENGINE.P;

  /**
   * 指定指標の (value, weight) ペアを組み立てる。
   * weight に getLocalBoost() を乗せることで、
   * strongEffect のある資材が比率より多くの影響力を持つ。
   */
  function makeItems(metric) {
    return active.map(t => {
      const value = getAdjustedParams(t)[metric] ?? 0; // サイズ補正済み
      const ratio = t.weight / total;
      return { value, weight: ratio * getLocalBoost(t, metric, ratio) };
    });
  }

  return {
    drainage:          weightedPowerMean(makeItems('drainage'),          P.drainage),
    aeration:          weightedPowerMean(makeItems('aeration'),          P.aeration),
    waterRetention:    weightedPowerMean(makeItems('waterRetention'),    P.waterRetention),
    nutrientRetention: weightedPowerMean(makeItems('nutrientRetention'), P.nutrientRetention),
  };
}

// ─── 粒度集計 ───────────────────────────────────────────────────────────────

/**
 * fineRatio / mediumRatio / coarseRatio を集計。
 * hasSize === false の資材は 'M' として扱う。
 */
function getParticleSizeRatios(active, total) {
  let fine = 0, medium = 0, coarse = 0;
  for (const t of active) {
    const r    = t.weight / total;
    const size = (t.hasSize === false) ? 'M' : (t.size ?? 'M');
    if      (size === 'S') fine   += r;
    else if (size === 'L') coarse += r;
    else                   medium += r;
  }
  return { fineRatio: fine, mediumRatio: medium, coarseRatio: coarse };
}

// ─── Step 2: 粒度補正（常時・緩やかな傾き） ─────────────────────────────────

/**
 * fineRatio / coarseRatio によって各指標を補正する。
 * coarseEffect は 0.45 で飽和（粗粒が多いほど良い、の過剰な伸びを抑える）。
 */
function applyParticleSizeCorrections(scores, ps) {
  const C           = SCORE_ENGINE.PARTICLE;
  const coarseEffect = Math.min(ps.coarseRatio, C.coarseEffectCap);

  return {
    drainage:
      clampScore(scores.drainage
        - ps.fineRatio   * C.drainageFineSlope
        + coarseEffect   * C.drainageCoarseGain),

    aeration:
      clampScore(scores.aeration
        - ps.fineRatio   * C.aerationFineSlope
        + coarseEffect   * C.aerationCoarseGain),

    waterRetention:
      clampScore(scores.waterRetention
        + ps.fineRatio   * C.waterFineGain
        - ps.coarseRatio * C.waterCoarsePenalty),

    nutrientRetention:
      clampScore(scores.nutrientRetention
        + ps.fineRatio   * C.nutrientFineGain),
  };
}

// ─── Step 3: 閾値効果 ──────────────────────────────────────────────────────

/**
 * 各資材の thresholdEffects を適用。
 * ratio が threshold を超えた分に slope を乗じて加減算する。
 */
function applyThresholdEffects(scores, active, total) {
  const result = { ...scores };

  for (const t of active) {
    const effects = getThresholdEffects(t);
    if (!effects.length) continue;

    const ratio = t.weight / total;
    for (const eff of effects) {
      if (ratio <= eff.threshold) continue;
      // 超過率を 0〜1 に正規化してから slope を掛ける
      const excess = (ratio - eff.threshold) / Math.max(1 - eff.threshold, 0.01);
      if (result[eff.metric] !== undefined) {
        result[eff.metric] = clampScore(result[eff.metric] + eff.slope * excess);
      }
    }
  }

  return result;
}

// ─── Step 4: 相互作用補正 ──────────────────────────────────────────────────

function getOrganicRatio(active, total) {
  return active
    .filter(t => t.params?.organic)
    .reduce((s, t) => s + t.weight / total, 0);
}

/**
 * ルールベースの相互作用補正。
 * RULE_CAP で1指標あたりのルール由来補正を累積管理し、暴走を防ぐ。
 */
function applyInteractionEffects(scores, active, total, ps) {
  const C      = SCORE_ENGINE;
  const result = { ...scores };

  // ルール由来補正の累積（絶対値ベース）
  const accum = { drainage: 0, aeration: 0, waterRetention: 0, nutrientRetention: 0 };

  function addEffect(metric, delta) {
    if (result[metric] === undefined) return;
    const room   = C.RULE_CAP - accum[metric];
    if (room <= 0) return;
    const capped = Math.sign(delta) * Math.min(Math.abs(delta), room);
    result[metric] = clampScore(result[metric] + capped);
    accum[metric] += Math.abs(capped);
  }

  // ① 急変ペナルティ: fineRatio > 30% で排水・通気が急落
  const fineExcess = Math.max(0, ps.fineRatio - C.FINE_EXCESS.threshold);
  if (fineExcess > 0) {
    addEffect('drainage', -fineExcess * C.FINE_EXCESS.drainageSlope);
    addEffect('aeration', -fineExcess * C.FINE_EXCESS.aerationSlope);
  }

  // ② organic_heavy: 有機物 60% 超 → 通気低下・保水増加
  const organicRatio  = getOrganicRatio(active, total);
  const organicExcess = Math.max(0, organicRatio - C.ORGANIC_HEAVY.threshold);
  if (organicExcess > 0) {
    addEffect('aeration',       -organicExcess * C.ORGANIC_HEAVY.aerationSlope);
    addEffect('waterRetention',  organicExcess * C.ORGANIC_HEAVY.waterGain);
  }

  // ③ particle_mix_effect: 粗粒十分 + 細粒が適量のときのみボーナス
  //   （細粒が多すぎると逆に排水悪化するため、上限あり）
  const PM = C.PARTICLE_MIX;
  if (
    ps.coarseRatio > PM.coarseMin &&
    ps.fineRatio >= PM.fineMin &&
    ps.fineRatio <  PM.fineMax
  ) {
    const intensity = Math.min(ps.coarseRatio, 0.40);
    addEffect('drainage', intensity * PM.drainageGain);
    addEffect('aeration', intensity * PM.aerationGain);
  }

  return result;
}

// ─── 鉢サイズ補正 ──────────────────────────────────────────────────────────
//
// 同じ用土・同じ粒径でも、鉢が小さいほど土の深さが浅く排水しやすい。
// 鉢が大きいほど底部に定常水位（perched water table）が生じやすく保水しやすい。
// currentSize は state.js で管理（1=3cm〜10=30cm）。
// 前半（1〜5号）ほど変化が大きく、後半（6〜10号）は逓減する対数的カーブ。
// waterRetention をやや強め、aeration は控えめの非対称設計。
//
const POT_SIZE_EFFECT = {
  1:  { drainage:  +8, waterRetention:  -9, aeration: +4 },
  2:  { drainage:  +4, waterRetention:  -5, aeration: +2 },
  3:  { drainage:   0, waterRetention:   0, aeration:  0 }, // 基準（直径9cm）
  4:  { drainage:  -3, waterRetention:  +3, aeration: -1 },
  5:  { drainage:  -5, waterRetention:  +6, aeration: -2 },
  6:  { drainage:  -7, waterRetention:  +8, aeration: -3 },
  7:  { drainage:  -8, waterRetention:  +9, aeration: -4 },
  8:  { drainage:  -9, waterRetention: +10, aeration: -4 },
  9:  { drainage: -10, waterRetention: +11, aeration: -5 },
  10: { drainage: -11, waterRetention: +12, aeration: -5 },
};

function applyPotSizeCorrection(scores) {
  const effect = POT_SIZE_EFFECT[currentSize] ?? POT_SIZE_EFFECT[3];
  return {
    drainage:          clampScore(scores.drainage          + effect.drainage),
    waterRetention:    clampScore(scores.waterRetention    + effect.waterRetention),
    aeration:          clampScore(scores.aeration          + effect.aeration),
    nutrientRetention: scores.nutrientRetention,
  };
}

// ─── メイン ───────────────────────────────────────────────────────────────

/**
 * 配合スコアを計算して返す。
 * analysis.js の calcComposite() から呼ばれる。
 *
 * @returns {{ drainage, waterRetention, aeration, nutrientRetention, organic } | null}
 */
function calcCompositeV2() {
  const active = objectTypes.filter(t => t.weight > 0);
  const total  = active.reduce((s, t) => s + t.weight, 0);
  if (total === 0) return null;

  const organicWeight = active.reduce(
    (s, t) => s + (t.params?.organic ? t.weight : 0), 0
  );

  const ps = getParticleSizeRatios(active, total);

  let scores = calcBaseScores(active, total);               // Step 1
  scores = applyParticleSizeCorrections(scores, ps);        // Step 2
  scores = applyThresholdEffects(scores, active, total);    // Step 3
  scores = applyInteractionEffects(scores, active, total, ps); // Step 4
  scores = applyPotSizeCorrection(scores);                  // Step 5

  return {
    drainage:          Math.round(scores.drainage),
    waterRetention:    Math.round(scores.waterRetention),
    aeration:          Math.round(scores.aeration),
    nutrientRetention: Math.round(scores.nutrientRetention),
    organic:           Math.round(organicWeight / total * 100),
  };
}
