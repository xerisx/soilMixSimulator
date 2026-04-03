// 資材定義ファイル
// 資材を追加・編集する場合はこのファイルを変更してください

const MATERIALS = [
  {
    id: 'berabon',
    name: 'ベラボン',
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
  },
  {
    id: 'hyuga',
    name: '日向土',
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
  },
];
