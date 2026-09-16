# Funabashi Disaster Signage Worker

## 今回の改修

既存のWorkerを拡張し、以下を実装しています。

### 1. 避難情報の複数地域対応

千葉県防災ポータルの避難情報詳細ページに複数の対象地域が掲載されている場合、全発令地域を解析します。

`/api/chiba-disaster` の `evacuation` に以下を追加しています。

- `totalAreas` : 現在発令中の対象地域数
- `areas` : 現在発令中の全対象地域
- `representativeAreas` : サイネージ表示用の代表3地域

例:

```json
{
  "active": true,
  "level": 4,
  "status": "発令",
  "title": "避難指示",
  "totalAreas": 5,
  "representativeAreas": [
    { "name": "○○地区", "type": "避難指示", "level": 4, "updatedAt": "2026/09/16 10:00" },
    { "name": "△△町", "type": "避難指示", "level": 4, "updatedAt": "2026/09/16 09:55" },
    { "name": "□□地区", "type": "高齢者等避難", "level": 3, "updatedAt": "2026/09/16 09:50" }
  ]
}
```

画面側では `representativeAreas` の2～3件だけを表示し、`sourceUrl` をQRのリンク先として利用できます。

### 2. 避難所の代表表示対応

`/api/chiba-disaster` の `shelters` に `representativeShelters` を追加しています。開設中施設のうち最大3施設を返します。

- `count` : 開設中施設数
- `shelters` : 開設中の全施設
- `representativeShelters` : サイネージ表示用の代表3施設

### 3. 気象情報の警戒レベル判定を新体系に合わせて修正

`/api/status` は既存どおり気象庁データを取得しますが、警戒レベルの判定を以下に整理しています。

- 特別警報 → レベル5
- 危険警報 → レベル4
- 警報 → レベル3
- 注意報 → レベル2

気象庁から取得した情報名をそのまま優先するため、固定の「大雨警報」「雷注意報」画面を作る方式ではありません。

## 外部費用について

今回の改修では、新しい有料API、外部データサービス、サーバー等は追加していません。
既存の以下の情報源を引き続き利用します。

- 気象庁 警報・注意報データ
- 千葉県防災ポータルサイト

## API

- `GET /api/status`
- `GET /api/chiba-disaster`
- `GET /api/health`

既存のエンドポイント名は変更していません。
