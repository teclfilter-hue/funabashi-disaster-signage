# Worker 本番安全改修版

既存の `/api/status` と `/api/health` を維持したまま、次の新しいエンドポイントを追加しています。

`GET /api/chiba-disaster`

この追加APIは千葉県防災ポータルから船橋市の最新詳細ページを取得し、

- 避難情報（高齢者等避難／避難指示／緊急安全確保）
- 避難所開設情報

を返します。

重要:
- 既存 `/api/status` のロジックは変更していません。
- 新機能の取得失敗で既存の気象警報APIが停止しない設計です。
- まず `/api/chiba-disaster` を単独で確認してから、サイネージ表示を統合してください。
- 千葉県ポータルのHTML構造が変わった場合は、この追加解析部分を修正します。

デプロイ後:
https://funabashi-disaster-signage.teclfilter.workers.dev/api/chiba-disaster

Cloudflare Workers Free plan の現行制限では1リクエストあたり外部subrequestは50、日次Workerリクエストは100,000です。このAPIは通常1回の取得でポータル＋詳細2ページの最大3外部取得なので、サイネージの30秒ポーリングでもsubrequest上限内です。
