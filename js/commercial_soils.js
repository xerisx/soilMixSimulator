// 市販の用土プリセット定義
// 追加・編集する場合はこのファイルを変更してください

const COMMERCIAL_SOILS = [
  {
    id: 'q_soil',
    name: 'Q-soil',
    description: 'アロイド向けに調整した、通気性が高く根が蒸れにくい配合',
    category: '観葉植物',
    materials: [
      { id: 'coco_chip', weight: 3.5, size: 'M' },
      { id: 'bark_chip', weight: 3, size: 'M' },
      { id: 'hyuga',     weight: 2.5, size: 'L' },
      { id: 'zeolite',   weight: 0.7, size: 'M' },
      { id: 'charcoal',  weight: 0.5, size: 'M' },
    ],
  },
  {
    id: 'neko_chip_m',
    name: 'ねこチップ（M）',
    description: '軽量で乾きやすい、室内向けのシンプル配合',
    category: '観葉植物',
    materials: [
      { id: 'coco_chip', weight: 2, size: 'M' },
      { id: 'hyuga',     weight: 1, size: 'M' },
    ],
  },
  {
    id: 'aroid_mix',
    name: 'アロイド向け用土',
    description: 'かなり乾きやすく、根が蒸れにくい配合',
    category: '観葉植物',
    materials: [
      { id: 'coco_chip', weight: 4, size: 'M' },
      { id: 'pumice',    weight: 2, size: 'M' },
      { id: 'perlite',   weight: 1, size: 'S' },
      { id: 'charcoal',  weight: 1, size: 'S' },
    ],
  },
  {
    id: 'succulent_mix',
    name: '多肉・塊根植物の土',
    description: '非常に乾きやすい、無機質中心の配合',
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
    description: '扱いやすく、乾きすぎにくい定番配合',
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
    description: 'ややしっとり保ちやすい、葉物向けの配合',
    category: '観葉植物',
    materials: [
      { id: 'coco_chip', weight: 2, size: 'M' },
      { id: 'akadama',   weight: 2, size: 'M' },
      { id: 'humus',     weight: 1, size: 'M' },
      { id: 'perlite',   weight: 1, size: 'S' },
    ],
  },
  {
    id: 'staghorn_fern',
    name: 'ビカクシダ・着生植物の土',
    description: '水苔主体の着生向け配合（鉢用に調整）',
    category: '着生植物',
    materials: [
      { id: 'sphagnum',  weight: 4, size: 'L' },
      { id: 'coco_chip', weight: 2, size: 'L' },
      { id: 'charcoal',  weight: 1, size: 'S' },
    ],
  },
];