# 船橋市 防災サイネージ - Worker 改修版

今回の改修はWorker側の既存処理を拡張したものです。

## 改修内容

1. 複数の避難対象地域を取得し、全件と代表3地域をAPIで返す
2. 複数の避難所を取得し、全件と代表3施設をAPIで返す
3. 気象庁の新しい警戒レベル体系に合わせて警報レベルを判定する
4. 新規API契約や外部有料サービスは追加しない

## デプロイ

Cloudflare Workers Builds の既存設定をそのまま利用できます。

- Root directory: `/worker`
- Build command: なし
- Deploy command: `npx wrangler deploy`
- Production branch: `main`

このZIPの `worker/` を現在のGitHubリポジトリの `worker/` に置き換えてコミット・プッシュしてください。
