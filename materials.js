// 資材定義ファイル
// 資材を追加・編集する場合はこのファイルを変更してください

const MATERIALS = [
  {
    id: 'berabon',
    name: 'ベラボン',
    tooltip: 'ヤシ殻由来の軽い素材です。通気性が高く、根が伸びやすい環境を作ります。',
    shape: 'square',
    color: '#92400E',
    sizes: {
      S: { min: 5,  max: 8  }, // mm
      M: { min: 8,  max: 15 },
      L: { min: 15, max: 25 },
    },
    physics: {
      friction:    0.7,
      frictionAir: 0.08,
      density:     0.0008,
      restitution: 0,
    },
    params: {
      drainage:       70,
      waterRetention: 60,
      aeration:       80,
      organic:        true,
    },
    advanced: {
      porosity:        85, // 空隙率
      coarseRatio:     55, // 粗粒比率（細粒 = 100 - coarseRatio）
      compressibility: 40, // 圧縮率
      infiltration:    70, // 浸透速度
    },
  },
  {
    id: 'hyuga',
    name: '日向土',
    tooltip: '硬くて崩れにくい石です。排水性が高く、用土の骨格を保ちます。',
    shape: 'circle',
    color: '#A8A29E',
    sizes: {
      S: { min: 2,  max: 5  }, // mm
      M: { min: 5,  max: 10 },
      L: { min: 10, max: 18 },
    },
    physics: {
      friction:    0.5,
      frictionAir: 0.05,
      density:     0.002,
      restitution: 0,
    },
    params: {
      drainage:       85,
      waterRetention: 30,
      aeration:       85,
      organic:        false,
    },
    advanced: {
      porosity:        55, // 空隙率
      coarseRatio:     75, // 粗粒比率
      compressibility: 15, // 圧縮率
      infiltration:    85, // 浸透速度
    },
  },
];
