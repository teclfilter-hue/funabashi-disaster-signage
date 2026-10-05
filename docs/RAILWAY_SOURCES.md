# 船橋市 防災サイネージ｜鉄道公式運行情報QR

本更新では、鉄道会社の運行情報を自動取得・転載せず、各社の公式運行情報ページへQRコードで誘導します。既存のCloudflare Workerは変更しません。

## 4路線

| 路線 | 公式運行情報URL | QRファイル |
|---|---|---|
| JR総武線 | https://traininfo.jreast.co.jp/train_info/kanto.aspx | `images/qr_jr_sobu.png` |
| 京成本線 | https://www.keisei.co.jp/ | `images/qr_keisei.png` |
| 東武アーバンパークライン | https://www.tobu.co.jp/service_status/ | `images/qr_tobu.png` |
| 東京メトロ東西線 | https://www.tokyometro.jp/unkou/history/touzai.html | `images/qr_tokyo_metro_tozai.png` |

### JRについて
船橋駅周辺で利用する総武快速線・中央・総武各駅停車の両方を確認できるよう、JR東日本の関東エリア運行情報ページへ誘導しています。

### 表示上の注意
サイネージには「公式運行情報を確認」と表示し、サイネージ側で「平常運行」「遅延」「運転見合わせ」等の状態を転載・判定しません。最新状況はQRから各社公式ページで確認してください。
