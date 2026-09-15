const CONFIG = {
  prefectureCode: "120000",
  cityCode: "1220400",
  cityName: "船橋市",
  prefectureName: "千葉県",
  cacheSeconds: 30
};

const JMA_WARNING_URL =
  `https://www.jma.go.jp/bosai/warning/data/r8/${CONFIG.prefectureCode}.json`;

let memoryCache = null;
let memoryCacheAt = 0;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    if (url.pathname === "/api/status") {
      const data = await getStatus();
      return json(data);
    }

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "funabashi-disaster-api",
        area: CONFIG.cityName,
        checkedAt: new Date().toISOString()
      });
    }

    return new Response("Not Found", {status:404});
  }
};

async function getStatus() {
  const now = Date.now();

  if (memoryCache && now - memoryCacheAt < CONFIG.cacheSeconds * 1000) {
    return memoryCache;
  }

  try {
    const res = await fetch(JMA_WARNING_URL, {
      headers: {
        "User-Agent": "Funabashi-Disaster-Signage/1.0"
      },
      cf: {
        cacheTtl: 30,
        cacheEverything: true
      }
    });

    if (!res.ok) {
      throw new Error(`JMA HTTP ${res.status}`);
    }

    const raw = await res.json();
    const alerts = extractWarnings(raw);

    const result = {
      ok: true,
      areaName: `${CONFIG.prefectureName}${CONFIG.cityName}`,
      areaCode: CONFIG.cityCode,
      checkedAt: new Date().toISOString(),
      reportDatetime: findReportDatetime(raw),
      source: "気象庁 警報・注意報データ",
      sourceUrl: "https://www.jma.go.jp/bosai/warning/",
      alerts
    };

    memoryCache = result;
    memoryCacheAt = now;
    return result;
  } catch (error) {
    return {
      ok: false,
      areaName: `${CONFIG.prefectureName}${CONFIG.cityName}`,
      checkedAt: new Date().toISOString(),
      error: String(error),
      source: "気象庁 警報・注意報データ"
    };
  }
}

function extractWarnings(raw) {
  const reports = Array.isArray(raw) ? raw : [raw];
  const result = [];

  for (const report of reports) {
    const warning = report?.warning;
    if (!warning) continue;

    // 新体系: class20Items に市町村ごとの現在の種類が入る。
    const items = Array.isArray(warning.class20Items)
      ? warning.class20Items
      : [];

    for (const item of items) {
      if (String(item.areaCode) !== CONFIG.cityCode) continue;

      const kinds = Array.isArray(item.kinds) ? item.kinds : [];

      for (const kind of kinds) {
        const status = String(kind.status || "");
        if (/解除/.test(status)) continue;

        const name = String(
          kind.name ||
          kind.kindName ||
          kind.kind ||
          warningNameFromCode(kind.code) ||
          "防災情報"
        );

        const level = calcLevel(name, kind);

        result.push({
          type: name,
          title: `${CONFIG.cityName}の${name}`,
          message: messageFor(name, level),
          level,
          areaName: CONFIG.cityName,
          updatedAt: report.reportDatetime || report.controlDatetime || null,
          status
        });
      }
    }

    // 旧構造にも対応しておく。
    const oldAreaTypes = report?.timeSeries?.[0]?.areaTypes;
    if (Array.isArray(oldAreaTypes)) {
      for (const areaType of oldAreaTypes) {
        for (const area of areaType?.areas || []) {
          if (String(area.code) !== CONFIG.cityCode) continue;
          for (const w of area.warnings || []) {
            if (/解除/.test(String(w.status || ""))) continue;
            const name = warningNameFromCode(w.code) || "防災情報";
            result.push({
              type: name,
              title: `${CONFIG.cityName}の${name}`,
              message: messageFor(name, calcLevel(name, w)),
              level: calcLevel(name, w),
              areaName: CONFIG.cityName,
              updatedAt: report.reportDatetime || null,
              status: w.status || ""
            });
          }
        }
      }
    }
  }

  return dedupe(result).sort(
    (a,b) => b.level - a.level || String(b.updatedAt).localeCompare(String(a.updatedAt))
  );
}

function calcLevel(name, kind) {
  const s = `${name} ${JSON.stringify(kind)}`;

  if (/特別警報/.test(s)) return 5;
  if (/危険警報/.test(s)) return 4;
  if (/警報/.test(s)) return 4;
  if (/注意報/.test(s)) return 2;
  return 1;
}

function messageFor(name, level) {
  if (level >= 5) return `${name}が発表されています。命を守るため、直ちに安全を確保してください。`;
  if (level >= 4) return `${name}が発表されています。気象庁・自治体の最新情報を確認し、安全確保を優先してください。`;
  return `${name}が発表されています。今後の気象情報と自治体からの避難情報を確認してください。`;
}

function warningNameFromCode(code) {
  const table = {
    "02":"暴風雪特別警報",
    "03":"暴風警報",
    "04":"暴風雪警報",
    "05":"大雨特別警報",
    "06":"大雨警報",
    "07":"大雪警報",
    "08":"大雪特別警報",
    "09":"洪水警報",
    "10":"高潮特別警報",
    "11":"高潮警報",
    "12":"波浪特別警報",
    "13":"波浪警報",
    "14":"雷注意報",
    "15":"強風注意報",
    "16":"大雨注意報",
    "17":"洪水注意報",
    "18":"大雪注意報",
    "19":"風雪注意報",
    "20":"濃霧注意報",
    "21":"乾燥注意報",
    "22":"なだれ注意報",
    "23":"低温注意報",
    "24":"霜注意報",
    "25":"着雪注意報",
    "26":"高潮注意報",
    "27":"波浪注意報"
  };
  return table[String(code)] || "";
}

function findReportDatetime(raw) {
  const reports = Array.isArray(raw) ? raw : [raw];
  return reports.map(x => x?.reportDatetime).find(Boolean) || null;
}

function dedupe(items) {
  const m = new Map();
  for (const x of items) {
    const k = `${x.type}|${x.areaName}|${x.status}`;
    if (!m.has(k)) m.set(k, x);
  }
  return [...m.values()];
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=UTF-8"
    }
  });
}
