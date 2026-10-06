# Funabashi Disaster Signage Worker

## 今回の改修方針

既存本番を壊さないことを優先し、気象情報の `/api/status` は変更せず、船橋市の避難情報取得を追加しています。

### 既存

- `GET /api/status` — 気象庁 警報・注意報
- `GET /api/chiba-disaster` — 千葉県防災ポータルから避難情報＋避難所情報
- `GET /api/health` — ヘルスチェック

### 新規

- `GET /api/evacuation` — 避難情報だけを返す専用エンドポイント

`/api/chiba-disaster` の既存レスポンスは維持しています。新規 `/api/evacuation` は同じ取得処理から避難情報部分だけを返すため、既存画面との互換性を保ちます。

## 避難情報データ元

今回の技術検証では、千葉県防災ポータルサイトの公開HTMLを取得します。

千葉県公式説明では、防災情報システムによって市町村から報告された避難情報・避難所開設情報が千葉県防災ポータルで公開されるとされています。

### 取得フロー

```text
千葉県防災ポータル
        ↓
船橋市の「避難情報」詳細ページを検出
        ↓
HTML本文から発令イベントを抽出
        ↓
最新イベントを地域ごとに確定
        ↓
/api/evacuation
```

## 判定

- 警戒レベル3 → `高齢者等避難`
- 警戒レベル4 → `避難指示`
- 警戒レベル5 → `緊急安全確保`
- 発令なし → `active:false`
- 取得エラー → `ok:false`, `dataStatus:"error"`

「取得エラー」と「発令なし」を同一扱いにしないようにしています。

## 複数地域

同一ページに複数の対象地域がある場合、地域ごとに最新イベントを確定します。

`evacuation` には以下を返します。

- `totalAreas`
- `areas`
- `representativeAreas`（最大3地域）
- `level`
- `title`
- `updatedAt`
- `sourceUrl`

## キャッシュ

避難情報取得にはWorker内メモリキャッシュとCloudflareのHTTPキャッシュを使用します。千葉県ポータル自体が自動更新型のため、過剰アクセスを避けながら定期的に再取得します。

## 正式APIへの切替余地

現在は公開HTMLを利用した技術検証です。千葉県側から第三者利用可能な正式JSON/API/XML/フィードが確認できた場合は、取得部分だけを差し替えます。

サイネージ側は `/api/evacuation` のJSON仕様を利用するため、将来のデータ取得方式変更の影響を受けにくい構成です。

## テストURL

GitHub PagesのトップURLに以下を付けます。

```text
?test=1&evacuation=3
?test=1&evacuation=4
?test=1&evacuation=5
```

既存の気象テスト `?test=1&level=2/3/4/5` はそのまま使用できます。
