# Cloudflare Worker

## Deploy

```bash
npx wrangler@latest login
npx wrangler@latest deploy
```

公開後に表示される `workers.dev` URLを、GitHub Pages側の `docs/js/config.js` に設定します。

## API

```text
GET /api/status
GET /api/health
```

## 対象

千葉県船橋市（1220400）

## データ

気象庁の現行警報・注意報JSONを利用します。
URL:
https://www.jma.go.jp/bosai/warning/data/r8/120000.json

このWorkerは現在の市町村単位の警報・注意報を抽出し、サイネージ向けの共通JSONに変換します。
