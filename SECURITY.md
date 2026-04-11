# セキュリティ対策メモ

このドキュメントは実施済みの対策と、今後の強化方針をまとめたものです。

---

## 実施済み対策

### Matter.js CDN に SRI を追加（`index.html`）
CDN が改ざんされた場合にブラウザが即時ブロックする。
`integrity` + `crossorigin="anonymous"` を付与。

### 最小 CSP を meta タグで設置（`index.html`, `materials_guide.html`）
```
object-src 'none'   → Flash / プラグイン実行を遮断
base-uri 'self'     → <base> タグ挿入による相対URL乗っ取りを防止
form-action 'self'  → フォームの外部送信を遮断
```
`frame-ancestors` は meta タグ非対応のため未設定（HTTP ヘッダ専用）。

### innerHTML 展開箇所に escapeHTML を適用
`materials.js` に `escapeHTML()` を定義し、以下の箇所に適用済み：
- `analysis.js`（3箇所）：`t.name`
- `ui-controls.js`（5箇所）：`soil.name / category / description`, `type.name / tooltip`
- `materials_guide.js`（4箇所）：`mat.name / tooltip / detail`, `summary`

### デバッグページを削除
`debug-share-image.html` を本番リポジトリから除去。

---

## CSP 強化ロードマップ

`script-src` から `unsafe-inline` を外すには以下が必要。

### フェーズ2：inline script / onclick の除去

**inline `<script>` ブロック（2件）**
- `index.html:22–27` と `materials_guide.html:14–19` の gtag 初期化を `js/gtag-init.js` として外部化

**`onclick=` 属性（7件）**
- `index.html` の `closeShareModal / shuffleShareTheme / copyShareURL / toggleTheme` (4種)
- `materials_guide.html` の `toggleTheme`
- すべて `addEventListener` に移行

完了後に設定できる CSP：
```
script-src 'self'
  https://www.googletagmanager.com
  https://cdnjs.cloudflare.com
```

### フェーズ3：HTML inline style の除去（任意）

`index.html` の `style="vertical-align:-2px"` × 2件、`style="color:..."` × 2件を CSS クラス化。

JS テンプレートリテラル内の動的 `style=`（`width:${pct}%` 等）は計算値のため除去困難。
`style-src 'unsafe-inline'` を維持するか、nonce/hash アプローチを選択。

---

## 対応しない項目と理由

| 項目 | 理由 |
|------|------|
| gtag.js への SRI | Google は配信内容を動的に変更するため、ハッシュ固定が不可能 |
| Google Fonts への SRI | CSS が可変のため維持困難。影響範囲はフォント表示のみ |
| frame-ancestors | GitHub Pages は HTTP ヘッダを設定できないため現状対応不可 |
