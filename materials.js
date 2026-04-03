// 資材定義ファイル
// 資材を追加・編集する場合はこのファイルを変更してください

// shapeVariants: 頂点配列のリスト（各頂点は {x, y}）
// 座標は [-0.5, 0.5] に正規化。生成時に粒子サイズで拡大。
// 頂点は CCW 順・凸多角形。

const MATERIALS = [
  {
    id: 'berabon',
    name: 'ベラボン',
    tooltip: 'ヤシ殻由来の軽い素材です。通気性が高く、根が伸びやすい環境を作ります。',
    color: '#92400E',
    // 平たいチップ形状（幅広・薄め）
    shapeVariants: [
      [{x:-0.46,y:-0.22},{x:0.44,y:-0.24},{x:0.46,y:0.20},{x:-0.40,y:0.24}],
      [{x:-0.44,y:-0.20},{x:0.12,y:-0.26},{x:0.46,y:-0.10},{x:0.42,y:0.22},{x:-0.20,y:0.28},{x:-0.46,y:0.16}],
    ],
    sizes: {
      S: { min: 5,  max: 8  },
      M: { min: 8,  max: 15 },
      L: { min: 15, max: 25 },
    },
    physics: {
      friction:    0.72,
      frictionAir: 0.08,
      density:     0.0007,
      restitution: 0,
    },
    params: {
      drainage:         75,
      waterRetention:   45,
      aeration:         85,
      organic:          true,
      nutrientRetention: 35,
    },
    advanced: {
      porosity:        88,
      coarseRatio:     70,
      compressibility: 35,
      infiltration:    78,
    },
  },
  {
    id: 'hyuga',
    name: '日向土',
    tooltip: '硬くて崩れにくい石です。排水性が高く、用土の骨格を保ちます。',
    color: '#A8A29E',
    // 不規則な凸多角形（石粒）
    shapeVariants: [
      [{x:-0.15,y:-0.45},{x:0.32,y:-0.40},{x:0.45,y:0.12},{x:0.18,y:0.44},{x:-0.42,y:0.33}],
      [{x:0.12,y:-0.44},{x:0.42,y:-0.16},{x:0.44,y:0.24},{x:0.05,y:0.45},{x:-0.38,y:0.35},{x:-0.44,y:-0.10}],
    ],
    sizes: {
      S: { min: 2,  max: 5  },
      M: { min: 5,  max: 10 },
      L: { min: 10, max: 18 },
    },
    physics: {
      friction:    0.52,
      frictionAir: 0.05,
      density:     0.0022,
      restitution: 0,
    },
    params: {
      drainage:         88,
      waterRetention:   25,
      aeration:         82,
      organic:          false,
      nutrientRetention: 15,
    },
    advanced: {
      porosity:        62,
      coarseRatio:     78,
      compressibility: 10,
      infiltration:    88,
    },
  },
  {
    id: 'akadama',
    name: '赤玉土',
    tooltip: '関東ローム層由来の粒状土です。保水性と排水性のバランスが良く、多くの植物に使われます。',
    color: '#C2410C',
    // やや丸みのある不規則多角形
    shapeVariants: [
      [{x:-0.08,y:-0.44},{x:0.38,y:-0.33},{x:0.44,y:0.18},{x:-0.05,y:0.45},{x:-0.44,y:0.18}],
      [{x:-0.30,y:-0.38},{x:0.25,y:-0.44},{x:0.46,y:0.08},{x:0.28,y:0.42},{x:-0.40,y:0.35}],
    ],
    sizes: {
      S: { min: 2,  max: 5  },
      M: { min: 5,  max: 10 },
      L: { min: 10, max: 15 },
    },
    physics: {
      friction:    0.62,
      frictionAir: 0.06,
      density:     0.0019,
      restitution: 0,
    },
    params: {
      drainage:         60,
      waterRetention:   65,
      aeration:         55,
      organic:          false,
      nutrientRetention: 45,
    },
    advanced: {
      porosity:        58,
      coarseRatio:     55,
      compressibility: 65,
      infiltration:    58,
    },
  },
  {
    id: 'pumice',
    name: '軽石',
    tooltip: '火山由来の多孔質な石です。非常に軽く、通気性・排水性が抜群です。',
    color: '#E5E5E5',
    // 角張った多角形（軽石の荒い輪郭）
    shapeVariants: [
      [{x:0.08,y:-0.46},{x:0.38,y:-0.28},{x:0.46,y:0.16},{x:0.12,y:0.44},{x:-0.36,y:0.38},{x:-0.46,y:-0.08}],
      [{x:-0.22,y:-0.42},{x:0.30,y:-0.38},{x:0.46,y:0.16},{x:0.10,y:0.46},{x:-0.44,y:0.28}],
    ],
    sizes: {
      S: { min: 2,  max: 5  },
      M: { min: 5,  max: 10 },
      L: { min: 10, max: 18 },
    },
    physics: {
      friction:    0.50,
      frictionAir: 0.04,
      density:     0.0009,
      restitution: 0,
    },
    params: {
      drainage:         90,
      waterRetention:   30,
      aeration:         88,
      organic:          false,
      nutrientRetention: 20,
    },
    advanced: {
      porosity:        82,
      coarseRatio:     82,
      compressibility: 8,
      infiltration:    92,
    },
  },
  {
    id: 'zeolite',
    name: 'ゼオライト',
    tooltip: 'ミネラルを多く含む多孔質な鉱物です。根腐れ防止や保水調整に使われます。',
    color: '#FDE68A',
    // やや角張った不規則四〜五角形（結晶感）
    shapeVariants: [
      [{x:-0.38,y:-0.32},{x:0.32,y:-0.44},{x:0.44,y:0.28},{x:-0.22,y:0.44}],
      [{x:-0.30,y:-0.40},{x:0.20,y:-0.44},{x:0.44,y:0.10},{x:0.28,y:0.42},{x:-0.35,y:0.38}],
    ],
    sizes: {
      S: { min: 1,  max: 3  },
      M: { min: 3,  max: 6  },
      L: { min: 6,  max: 10 },
    },
    physics: {
      friction:    0.68,
      frictionAir: 0.07,
      density:     0.0021,
      restitution: 0,
    },
    params: {
      drainage:         55,
      waterRetention:   55,
      aeration:         45,
      organic:          false,
      nutrientRetention: 90,
    },
    advanced: {
      porosity:        52,
      coarseRatio:     35,
      compressibility: 15,
      infiltration:    50,
    },
  },
  {
    id: 'perlite',
    name: 'パーライト',
    tooltip: '膨張させた火山ガラスの粒です。非常に軽く、通気性の向上に役立ちます。',
    color: '#F8FAFC',
    // 軽石に近いが少し丸め
    shapeVariants: [
      [{x:0.15,y:-0.44},{x:0.42,y:-0.18},{x:0.44,y:0.22},{x:0.08,y:0.45},{x:-0.38,y:0.36},{x:-0.45,y:-0.08}],
      [{x:-0.12,y:-0.44},{x:0.35,y:-0.35},{x:0.45,y:0.15},{x:0.05,y:0.45},{x:-0.44,y:0.22}],
    ],
    sizes: {
      S: { min: 1,  max: 3  },
      M: { min: 3,  max: 6  },
      L: { min: 6,  max: 10 },
    },
    physics: {
      friction:    0.38,
      frictionAir: 0.05,
      density:     0.00045,
      restitution: 0,
    },
    params: {
      drainage:         88,
      waterRetention:   30,
      aeration:         92,
      organic:          false,
      nutrientRetention: 10,
    },
    advanced: {
      porosity:        90,
      coarseRatio:     75,
      compressibility: 10,
      infiltration:    90,
    },
  },
  {
    id: 'vermiculite',
    name: 'バーミキュライト',
    tooltip: '加熱膨張させた鉱物です。保水性と保肥性が高く、種まきや育苗によく使われます。',
    color: '#CA8A04',
    // 雲母状の平たい不規則四〜五角形
    shapeVariants: [
      [{x:-0.44,y:-0.18},{x:0.42,y:-0.22},{x:0.46,y:0.16},{x:-0.38,y:0.20}],
      [{x:-0.40,y:-0.20},{x:0.18,y:-0.24},{x:0.46,y:-0.06},{x:0.42,y:0.18},{x:-0.22,y:0.24}],
    ],
    sizes: {
      S: { min: 1,  max: 3  },
      M: { min: 3,  max: 6  },
      L: { min: 6,  max: 12 },
    },
    physics: {
      friction:    0.60,
      frictionAir: 0.07,
      density:     0.00055,
      restitution: 0,
    },
    params: {
      drainage:         35,
      waterRetention:   85,
      aeration:         45,
      organic:          false,
      nutrientRetention: 85,
    },
    advanced: {
      porosity:        78,
      coarseRatio:     25,
      compressibility: 55,
      infiltration:    38,
    },
  },
  {
    id: 'bark',
    name: '発酵バーク',
    tooltip: '樹皮を発酵・堆肥化した有機素材です。通気性と保水性を兼ね備え、土をふかふかにします。',
    color: '#78350F',
    // 細長い短冊・樹皮片
    shapeVariants: [
      [{x:-0.48,y:-0.16},{x:0.44,y:-0.20},{x:0.48,y:0.14},{x:-0.40,y:0.18}],
      [{x:-0.46,y:-0.14},{x:0.20,y:-0.20},{x:0.48,y:-0.08},{x:0.44,y:0.16},{x:-0.18,y:0.22},{x:-0.48,y:0.12}],
    ],
    sizes: {
      S: { min: 5,  max: 10 },
      M: { min: 10, max: 20 },
      L: { min: 20, max: 35 },
    },
    physics: {
      friction:    0.78,
      frictionAir: 0.09,
      density:     0.00065,
      restitution: 0,
    },
    params: {
      drainage:         75,
      waterRetention:   50,
      aeration:         80,
      organic:          true,
      nutrientRetention: 40,
    },
    advanced: {
      porosity:        78,
      coarseRatio:     72,
      compressibility: 35,
      infiltration:    72,
    },
  },
  {
    id: 'charcoal',
    name: '炭',
    tooltip: '木炭や竹炭を砕いたものです。通気性を高め、雑菌の抑制にも効果があります。',
    color: '#292524',
    // 角張った不規則断片（炭の割れ口）
    shapeVariants: [
      [{x:-0.18,y:-0.44},{x:0.28,y:-0.40},{x:0.44,y:0.14},{x:0.20,y:0.44},{x:-0.44,y:0.28}],
      [{x:-0.30,y:-0.38},{x:0.28,y:-0.44},{x:0.44,y:0.20},{x:-0.20,y:0.42}],
    ],
    sizes: {
      S: { min: 3,  max: 6  },
      M: { min: 6,  max: 12 },
      L: { min: 12, max: 20 },
    },
    physics: {
      friction:    0.58,
      frictionAir: 0.05,
      density:     0.00075,
      restitution: 0,
    },
    params: {
      drainage:         80,
      waterRetention:   30,
      aeration:         82,
      organic:          false,
      nutrientRetention: 55,
    },
    advanced: {
      porosity:        78,
      coarseRatio:     78,
      compressibility: 12,
      infiltration:    78,
    },
  },
  {
    id: 'kanuma',
    name: '鹿沼土',
    tooltip: '栃木県鹿沼産の酸性火山土です。通気性と適度な保水性を持ち、ツツジや山野草に多く使われます。',
    color: '#D4A040',
    // 赤玉土と同系だが少し角張り気味
    shapeVariants: [
      [{x:-0.30,y:-0.38},{x:0.25,y:-0.44},{x:0.46,y:0.08},{x:0.28,y:0.42},{x:-0.40,y:0.35}],
      [{x:-0.08,y:-0.44},{x:0.38,y:-0.33},{x:0.44,y:0.18},{x:-0.05,y:0.45},{x:-0.44,y:0.18}],
    ],
    sizes: {
      S: { min: 2,  max: 5  },
      M: { min: 5,  max: 10 },
      L: { min: 10, max: 15 },
    },
    physics: {
      friction:    0.58,
      frictionAir: 0.06,
      density:     0.0015,
      restitution: 0,
    },
    params: {
      drainage:         72,
      waterRetention:   50,
      aeration:         68,
      organic:          false,
      nutrientRetention: 35,
    },
    advanced: {
      porosity:        65,
      coarseRatio:     68,
      compressibility: 58,
      infiltration:    72,
    },
  },
  {
    id: 'peatmoss',
    name: 'ピートモス',
    tooltip: '湿地の植物が堆積した有機素材です。酸性で保水性が非常に高く、ブルーベリーや挿し木の土台に使われます。',
    color: '#292524',
    // 柔らかくつぶれた不規則片
    shapeVariants: [
      [{x:-0.20,y:-0.44},{x:0.26,y:-0.40},{x:0.44,y:0.08},{x:0.22,y:0.44},{x:-0.38,y:0.36}],
      [{x:-0.38,y:-0.30},{x:0.18,y:-0.44},{x:0.44,y:0.10},{x:-0.10,y:0.44},{x:-0.44,y:0.24}],
    ],
    sizes: {
      S: { min: 1,  max: 3  },
      M: { min: 3,  max: 8  },
      L: { min: 8,  max: 15 },
    },
    physics: {
      friction:    0.82,
      frictionAir: 0.10,
      density:     0.00045,
      restitution: 0,
    },
    params: {
      drainage:         20,
      waterRetention:   95,
      aeration:         35,
      organic:          true,
      nutrientRetention: 70,
    },
    advanced: {
      porosity:        80,
      coarseRatio:     15,
      compressibility: 75,
      infiltration:    25,
    },
  },
  {
    id: 'humus',
    name: '腐葉土',
    tooltip: '落ち葉が分解した有機素材です。土をふかふかにして保水性と通気性を高める、培養土の基本素材です。',
    color: '#3B2F1E',
    // 平たい葉片・不規則な薄片
    shapeVariants: [
      [{x:-0.46,y:-0.20},{x:0.24,y:-0.28},{x:0.46,y:-0.06},{x:0.40,y:0.24},{x:-0.30,y:0.32},{x:-0.48,y:0.12}],
      [{x:-0.42,y:-0.24},{x:0.32,y:-0.28},{x:0.46,y:0.08},{x:0.24,y:0.30},{x:-0.24,y:0.32},{x:-0.46,y:0.10}],
    ],
    sizes: {
      S: { min: 3,  max: 8  },
      M: { min: 8,  max: 15 },
      L: { min: 15, max: 25 },
    },
    physics: {
      friction:    0.78,
      frictionAir: 0.09,
      density:     0.00075,
      restitution: 0,
    },
    params: {
      drainage:         45,
      waterRetention:   75,
      aeration:         55,
      organic:          true,
      nutrientRetention: 65,
    },
    advanced: {
      porosity:        68,
      coarseRatio:     35,
      compressibility: 65,
      infiltration:    45,
    },
  },
  {
    id: 'sphagnum',
    name: '水苔',
    tooltip: '湿地に生育するコケを乾燥させたものです。保水力が非常に高く、洋ランや着生植物によく使われます。',
    color: '#C7B99A',
    // 細長い繊維・ストランド形状
    shapeVariants: [
      [{x:-0.48,y:-0.12},{x:0.46,y:-0.14},{x:0.48,y:0.10},{x:-0.44,y:0.13}],
      [{x:-0.48,y:-0.10},{x:0.14,y:-0.14},{x:0.48,y:-0.05},{x:0.46,y:0.12},{x:-0.16,y:0.14},{x:-0.48,y:0.08}],
    ],
    sizes: {
      S: { min: 5,  max: 10 },
      M: { min: 10, max: 20 },
      L: { min: 20, max: 40 },
    },
    physics: {
      friction:    0.85,
      frictionAir: 0.12,
      density:     0.0003,
      restitution: 0,
    },
    params: {
      drainage:         50,
      waterRetention:   95,
      aeration:         80,
      organic:          true,
      nutrientRetention: 55,
    },
    advanced: {
      porosity:        92,
      coarseRatio:     45,
      compressibility: 55,
      infiltration:    45,
    },
  },
];
