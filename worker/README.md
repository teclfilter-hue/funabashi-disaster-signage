# 船橋市 防災サイネージ - 避難情報HTML技術検証追加版

既存本番を壊さないことを優先し、気象情報の `/api/status` は変更せず、千葉県防災ポータルの公開HTMLを使った避難情報取得を追加しています。

## 今回の改修内容

1. 千葉県防災ポータルから船橋市の避難情報詳細ページを検出
2. HTML本文から「高齢者等避難」「避難指示」「緊急安全確保」を抽出
3. 発令／解除、対象地域、発令・更新日時を取得
4. 複数対象地域がある場合は全件＋代表3地域を保持
5. 新規 `GET /api/evacuation` を追加
6. 既存 `GET /api/status` と `GET /api/chiba-disaster` の互換性を維持
7. サイネージでは自治体の避難情報を気象警報より優先表示
8. `?test=1&evacuation=3/4/5` のテスト表示を追加
9. 正式APIが確認できた場合に取得部分だけ差し替えられる構成

## データ元

今回の取得方式は**千葉県防災ポータルの公開HTMLを利用した技術検証**です。

千葉県の公式説明では、市町村から県の防災情報システムへ報告された避難情報・避難所開設情報が千葉県防災ポータルで公開されるとされています。

第三者向けの正式なJSON/API仕様が確認できた場合は、Workerの取得処理だけを切り替える方針です。

## デプロイ

Cloudflare Workers Builds の既存設定をそのまま利用できます。

- Root directory: `/worker`
- Build command: なし
- Deploy command: `npx wrangler deploy`
- Production branch: `main`

## テストURL

GitHub PagesのURLに以下を付けます。

```text
?test=1&evacuation=3   # 警戒レベル3 高齢者等避難
?test=1&evacuation=4   # 警戒レベル4 避難指示
?test=1&evacuation=5   # 警戒レベル5 緊急安全確保
```

既存の気象テスト `?test=1&level=2/3/4/5` は変更していません。
