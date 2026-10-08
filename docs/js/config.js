window.SIGNAGE_CONFIG = {
  API_BASE_URL: "https://funabashi-disaster-signage.teclfilter.workers.dev",
  AREA_NAME: "千葉県船橋市",
  AREA_CODE: "1220400",
  REFRESH_MS: 30000,

  // 将来拡張用：季節・異常気象の優先度を一元管理。
  // heatstroke は将来の連携枠であり、現時点ではデータ取得を行わない。
  CONTENT_POLICY: {
    seasonMode: "auto",
    priorities: {
      emergency: 100,
      evacuation: 95,
      weatherBulletin: 90,
      weather: 80,
      heatstroke: 85,
      shelter: 70,
      railway: 60
    },
    maxWeatherAlerts: 4,
    maxWeatherBulletins: 1,
    railwayFixedZone: true
  }
};
