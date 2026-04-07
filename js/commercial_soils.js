// 市販の用土プリセット定義
// 追加・編集する場合はこのファイルを変更してください

const COMMERCIAL_SOILS = [
  {
    id: 'neko_chip_m',
    name: 'ねこチップ（M）',
    description: '通気性・排水性重視',
    category: '観葉植物',
    materials: [
      { id: 'coco_chip',  weight: 2, size: 'M' },
      { id: 'hyuga', weight: 1, size: 'M' },
    ],
  },
  {
    id: 'aroid_mix',
    name: 'アロイド向け用土',
    description: '通気性・排水性重視',
    category: '観葉植物',
    materials: [
      { id: 'coco_chip',  weight: 4, size: 'M' },
      { id: 'pumice',   weight: 2, size: 'M' },
      { id: 'perlite',  weight: 1, size: 'S' },
      { id: 'charcoal', weight: 1, size: 'S' },
    ],
  },
  {
    id: 'succulent_mix',
    name: '多肉・塊根植物の土',
    description: '排水性特化',
    category: '多肉・塊根',
    materials: [
      { id: 'hyuga',   weight: 3, size: 'L' },
      { id: 'pumice',  weight: 2, size: 'L' },
      { id: 'akadama', weight: 1, size: 'M' },
    ],
  },
  {
    id: 'general_houseplant',
    name: '観葉植物の土（一般向け）',
    description: 'バランス型',
    category: '観葉植物',
    materials: [
      { id: 'akadama',     weight: 3, size: 'M' },
      { id: 'humus',       weight: 2, size: 'M' },
      { id: 'hyuga',       weight: 1, size: 'M' },
      { id: 'vermiculite', weight: 1, size: 'S' },
    ],
  },
  {
    id: 'tropical_foliage',
    name: '熱帯植物の土',
    description: 'やや保水寄り',
    category: '観葉植物',
    materials: [
      { id: 'coco_chip',     weight: 2, size: 'M' },
      { id: 'akadama',     weight: 2, size: 'M' },
      { id: 'humus',       weight: 1, size: 'M' },
      { id: 'perlite',     weight: 1, size: 'S' },
    ],
  },
  {
    id: 'bulb_mix',
    name: '球根植物の土',
    description: 'やや排水寄り',
    category: '球根',
    materials: [
      { id: 'akadama', weight: 3, size: 'M' },
      { id: 'hyuga',   weight: 2, size: 'M' },
      { id: 'humus',   weight: 1, size: 'S' },
    ],
  },
  {
    id: 'staghorn_fern',
    name: 'ビカクシダ・着生植物の土',
    description: '保水性・通気性重視',
    category: '着生植物',
    materials: [
      { id: 'sphagnum', weight: 4, size: 'L' },
      { id: 'coco_chip',  weight: 2, size: 'L' },
      { id: 'charcoal', weight: 1, size: 'S' },
    ],
  },
  {
    id: 'orchid_mix',
    name: '洋ランの土',
    description: '高通気・着生ラン向け',
    category: '洋ラン',
    materials: [
      { id: 'coco_chip',  weight: 3, size: 'M' },
      { id: 'pumice',   weight: 2, size: 'M' },
      { id: 'sphagnum', weight: 1, size: 'M' },
    ],
  },
  {
    id: 'alpine_mix',
    name: '山野草・ツツジの土',
    description: '酸性・水はけよし',
    category: '山野草',
    materials: [
      { id: 'kanuma', weight: 4, size: 'M' },
      { id: 'akadama', weight: 2, size: 'M' },
      { id: 'humus',   weight: 1, size: 'S' },
    ],
  },
  {
    id: 'blueberry_mix',
    name: 'ブルーベリーの土',
    description: '高保水・酸性',
    category: '果樹',
    materials: [
      { id: 'peatmoss',    weight: 4, size: 'M' },
      { id: 'kanuma',      weight: 2, size: 'M' },
      { id: 'vermiculite', weight: 1, size: 'S' },
    ],
  },
  {
    id: 'cutting_mix',
    name: '挿し木・育苗の土',
    description: '無菌・軽量',
    category: '育苗',
    materials: [
      { id: 'perlite',     weight: 3, size: 'M' },
      { id: 'vermiculite', weight: 2, size: 'M' },
      { id: 'peatmoss',    weight: 1, size: 'M' },
    ],
  },
];
