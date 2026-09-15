const CONFIG = {
  prefectureCode: "120000",
  cityCode: "1220400",
  cityName: "船橋市",
  prefectureName: "千葉県",

  // 気象庁・千葉県の警報・注意報データ
  jmaWarningUrl:
    "https://www.jma.go.jp/bosai/warning/data/r8/120000.json",

  cacheTtlSeconds: 30,
};

let memoryCache = {
  timestamp: 0,
  data: null,
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        service: "funabashi-disaster-api",
        area: CONFIG.cityName,
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/status") {
      try {
        const data = await getStatus();

        return jsonResponse(data, {
          "Cache-Control": "no-store",
        });
      } catch (error) {
        console.error(error);

        return jsonResponse(
          {
            ok: false,
            areaName: `${CONFIG.prefectureName}${CONFIG.cityName}`,
            areaCode: CONFIG.cityCode,
            checkedAt: new Date().toISOString(),
            error: "気象庁の防災情報を取得できませんでした。",
            message:
              "一時的に防災情報を取得できない状態です。気象庁・自治体の最新情報も確認してください。",
          },
          {
            status: 502,
            "Cache-Control": "no-store",
          }
        );
      }
    }

    return jsonResponse(
      {
        ok: false,
        error: "Not Found",
      },
      {
        status: 404,
      }
    );
  },
};

async function getStatus() {
  const now = Date.now();

  // 30秒間はメモリキャッシュを使用
  if (
    memoryCache.data &&
    now - memoryCache.timestamp <
      CONFIG.cacheTtlSeconds * 1000
  ) {
    return memoryCache.data;
  }

  const response = await fetch(CONFIG.jmaWarningUrl, {
    headers: {
      "User-Agent": "Funabashi-Disaster-Signage/1.0",
      Accept: "application/json",
    },
    cf: {
      cacheTtl: 30,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(
      `JMA request failed: ${response.status}`
    );
  }

  const jmaData = await response.json();

  const alerts = extractCityAlerts(jmaData);

  /*
   * 実際の警報・注意報がある場合だけ alerts に入れる。
   *
   * 「発表警報・注意報はなし」の場合に
   * level: 4 のダミー情報を作らない。
   */
  if (alerts.length === 0) {
    alerts.push({
      type: "防災情報",
      title: `${CONFIG.cityName}の防災情報`,
      message:
        "現在、気象庁による発表警報・注意報はありません。気象状況や自治体からの避難情報に注意してください。",
      level: 0,
      areaName: CONFIG.cityName,
      updatedAt: new Date().toISOString(),
      status: "発表警報・注意報はなし",
    });
  }

  /*
   * alertsの中で一番新しい日時を
   * reportDatetimeとして使用する。
   */
  const reportDatetime = getLatestUpdatedAt(alerts);

  const result = {
    ok: true,
    areaName: `${CONFIG.prefectureName}${CONFIG.cityName}`,
    areaCode: CONFIG.cityCode,
    checkedAt: new Date().toISOString(),
    reportDatetime,
    source: "気象庁 警報・注意報データ",
    sourceUrl: "https://www.jma.go.jp/bosai/warning/",
    alerts,
  };

  memoryCache = {
    timestamp: now,
    data: result,
  };

  return result;
}

/**
 * JMAの現在の警報・注意報JSONから
 * 船橋市に該当する情報を抽出する。
 */
function extractCityAlerts(data) {
  const results = [];

  /*
   * 2026年5月29日以降の新形式
   */
  if (Array.isArray(data?.warning?.class20Items)) {
    for (const item of data.warning.class20Items) {
      const area = item?.class20;

      if (!area) continue;

      const areaCode = String(
        area.code ?? area.class20Code ?? ""
      );

      if (areaCode !== CONFIG.cityCode) {
        continue;
      }

      const warningItems = Array.isArray(
        item.warningItems
      )
        ? item.warningItems
        : [];

      for (const warning of warningItems) {
        const status =
          warning.status ||
          warning.condition ||
          "継続";

        // 「解除」は現在発表中ではないので除外
        if (
          String(status).includes("解除")
        ) {
          continue;
        }

        const name =
          warning.name ||
          warning.warningName ||
          warning.title ||
          warningNameFromCode(warning.code);

        if (!name) continue;

        const level = getAlertLevel(name);

        results.push({
          type: name,
          title: `${CONFIG.cityName}の${name}`,
          message: createMessage(name, level),
          level,
          areaName: CONFIG.cityName,
          updatedAt:
            warning.updatedAt ||
            warning.reportDatetime ||
            warning.datetime ||
            new Date().toISOString(),
          status,
        });
      }
    }
  }

  /*
   * 旧形式への簡易フォールバック
   */
  if (
    results.length === 0 &&
    Array.isArray(data?.class20Items)
  ) {
    for (const item of data.class20Items) {
      const area = item?.class20;

      if (!area) continue;

      const areaCode = String(
        area.code ?? area.class20Code ?? ""
      );

      if (areaCode !== CONFIG.cityCode) {
        continue;
      }

      const warningItems = Array.isArray(
        item.warningItems
      )
        ? item.warningItems
        : [];

      for (const warning of warningItems) {
        const status =
          warning.status ||
          warning.condition ||
          "継続";

        if (
          String(status).includes("解除")
        ) {
          continue;
        }

        const name =
          warning.name ||
          warning.warningName ||
          warning.title ||
          warningNameFromCode(warning.code);

        if (!name) continue;

        const level = getAlertLevel(name);

        results.push({
          type: name,
          title: `${CONFIG.cityName}の${name}`,
          message: createMessage(name, level),
          level,
          areaName: CONFIG.cityName,
          updatedAt:
            warning.updatedAt ||
            warning.reportDatetime ||
            warning.datetime ||
            new Date().toISOString(),
          status,
        });
      }
    }
  }

  /*
   * 新しい順に並べる
   */
  results.sort((a, b) => {
    return (
      new Date(b.updatedAt) -
      new Date(a.updatedAt)
    );
  });

  return results;
}

/**
 * 警報レベルを判定
 *
 * 5 = 特別警報
 * 4 = 危険警報・警報
 * 2 = 注意報
 * 0 = 情報なし
 */
function getAlertLevel(name) {
  const text = String(name);

  if (
    text.includes("特別警報")
  ) {
    return 5;
  }

  if (
    text.includes("危険警報") ||
    text.includes("警報")
  ) {
    return 4;
  }

  if (
    text.includes("注意報")
  ) {
    return 2;
  }

  return 0;
}

/**
 * サイネージ表示用メッセージ
 */
function createMessage(name, level) {
  if (level === 5) {
    return `${name}が発表されています。重大な災害が発生するおそれがあります。自治体の避難情報を確認し、安全確保を最優先してください。`;
  }

  if (level === 4) {
    return `${name}が発表されています。自治体からの避難情報を確認し、安全確保を優先してください。`;
  }

  if (level === 2) {
    return `${name}が発表されています。今後の気象情報と自治体からの避難情報を確認してください。`;
  }

  return `${name}が発表されています。最新の防災情報を確認してください。`;
}

/**
 * alertsの中から最新の更新日時を取得
 */
function getLatestUpdatedAt(alerts) {
  const dates = alerts
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !isNaN(date.getTime()));

  if (dates.length === 0) {
    return new Date().toISOString();
  }

  dates.sort((a, b) => b - a);

  return dates[0].toISOString();
}

/**
 * 警報コードのフォールバック
 */
function warningNameFromCode(code) {
  const map = {
    "01": "大雨警報",
    "02": "洪水警報",
    "03": "暴風警報",
    "04": "暴風雪警報",
    "05": "大雪警報",
    "06": "波浪警報",
    "07": "高潮警報",

    "10": "大雨注意報",
    "11": "洪水注意報",
    "12": "強風注意報",
    "13": "風雪注意報",
    "14": "大雪注意報",
    "15": "波浪注意報",
    "16": "高潮注意報",
    "17": "雷注意報",
    "18": "濃霧注意報",
    "19": "乾燥注意報",
    "20": "なだれ注意報",
    "21": "低温注意報",
    "22": "霜注意報",
    "23": "着雪注意報",
  };

  return map[String(code)] || "";
}

/**
 * JSONレスポンス
 */
function jsonResponse(data, extraHeaders = {}) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: extraHeaders.status || 200,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type",
        ...extraHeaders,
      },
    }
  );
}

/**
 * CORS
 */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type",
  };
}
