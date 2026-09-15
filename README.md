# 船橋市 防災情報デジタルサイネージ

GitHub Pages + Cloudflare Workers + 気象庁の公開防災データで構築する、無料構成のデジタルサイネージです。

## 対象地域

- 千葉県船橋市
- 気象庁の市町村等コード: `1220400`
- 気象庁の都道府県コード: `120000`

## 現在、自動取得する情報

- 船橋市の気象警報・注意報
- 特別警報
- 危険警報等、気象庁の現行警報体系で取得できる情報
- 警報・注意報の解除状態も反映

気象庁の現在の警報JSON（令和8年体系）を使用します。
Atom/XMLの「直近の発表」だけに依存すると、継続中の警報がフィードの掲載期間を過ぎて見えなくなる可能性があるため、現在状態の確認には警報JSONを使っています。

## 自動更新

サイネージ側は30秒ごとにAPIを確認します。

## 重要：避難指示について

船橋市の「高齢者等避難」「避難指示」「緊急安全確保」等は、気象庁の警報JSONではなく船橋市など自治体側が発令する情報です。

船橋市は避難情報をLアラート、防災行政無線、ふなばし情報メール、市ホームページ等で発信しています。
本パッケージでは、誤った自動スクレイピングを避けるため、自治体情報は「未接続」としています。

本番で避難指示を自動表示する場合は、船橋市またはLアラート等の正式なデータ提供経路を追加してください。

## フォルダ構成

```text
docs/
  index.html
  css/style.css
  js/config.js
  js/app.js

worker/
  index.js
  wrangler.jsonc
```

## 1. GitHub Pages側

`docs/js/config.js` の `API_BASE_URL` をCloudflare WorkerのURLに変更します。

例:

```js
API_BASE_URL: "https://funabashi-disaster-api.example.workers.dev"
```

GitHub Pagesは `/docs` を公開元に設定できます。

GitHub:
Settings → Pages → Build and deployment → Source: Deploy from a branch
→ Branch: main → Folder: /docs → Save

公開URL例:

```text
https://YOUR_GITHUB_ID.github.io/disaster-signage/
```

## 2. Cloudflare Workers側

Node.jsをインストールしたPCで `worker` フォルダを作業ディレクトリにして実行します。

```bash
npx wrangler@latest login
npx wrangler@latest deploy
```

初回はCloudflareへのログイン許可が求められます。

公開URLは通常、

```text
https://funabashi-disaster-api.<your-subdomain>.workers.dev
```

のようになります。

そのURLを `docs/js/config.js` に設定してGitHubへpushします。

## 3. ローカルテスト

GitHub Pages公開前にWorkerを確認する場合:

```bash
cd worker
npx wrangler@latest dev
```

API:

```text
http://localhost:8787/api/status
```

## 4. デモ表示

GitHub Pagesの画面で以下を開くと、緊急表示の見た目を確認できます。

```text
https://YOUR_GITHUB_ID.github.io/disaster-signage/?demo=1
```

## 5. 本番運用上の注意

この画面は防災情報の補助表示を目的とします。気象庁の公開データにはメンテナンス等による配信停止・遅延の可能性があります。

そのため、画面には「最終確認時刻」と「情報取得状態」を表示し、取得失敗時に「情報なし」と誤表示しないフェイルセーフ仕様にしています。

気象庁:
https://xml.kishou.go.jp/

船橋市防災ポータル:
https://www.city.funabashi.lg.jp/bousai/

船橋市緊急情報:
https://www.city.funabashi.lg.jp/bousai/emergency/
