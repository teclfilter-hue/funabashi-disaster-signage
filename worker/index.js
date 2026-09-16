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

    if (url.pathname === "/api/chiba-disaster") {
      const data = await getChibaDisaster();
      return json(data, data.ok ? 200 : 502);
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


// ============================================================
// 船橋市「避難情報＋避難所情報」追加機能
// 既存 /api/status は変更せず、新しい /api/chiba-disaster として提供。
// ============================================================

const CHIBA_PORTAL_URL = "https://www.bousai.pref.chiba.lg.jp/";

let chibaMemoryCache = null;
let chibaMemoryCacheAt = 0;
const CHIBA_CACHE_SECONDS = 60;

async function getChibaDisaster() {
  const now = Date.now();
  if (chibaMemoryCache && now - chibaMemoryCacheAt < CHIBA_CACHE_SECONDS * 1000) {
    return chibaMemoryCache;
  }

  const checkedAt = new Date().toISOString();

  try {
    // ① 千葉県防災ポータルから、船橋市の最新「避難情報」「避難所情報」
    //    詳細ページのURLを探す。
    const portalHtml = await fetchChibaHtml(CHIBA_PORTAL_URL);
    const links = findFunabashiDetailLinks(portalHtml);

    const [evacuationHtml, shelterHtml] = await Promise.all([
      links.evacuation ? fetchChibaHtml(links.evacuation) : Promise.resolve(""),
      links.shelter ? fetchChibaHtml(links.shelter) : Promise.resolve("")
    ]);

    const evacuation = parseEvacuationPage(evacuationHtml, links.evacuation);
    const shelters = parseShelterPage(shelterHtml, links.shelter);

    const result = {
      ok: true,
      areaName: `${CONFIG.prefectureName}${CONFIG.cityName}`,
      areaCode: CONFIG.cityCode,
      checkedAt,
      source: "千葉県防災ポータルサイト",
      sourceUrl: CHIBA_PORTAL_URL,
      evacuation,
      shelters
    };

    chibaMemoryCache = result;
    chibaMemoryCacheAt = now;
    return result;
  } catch (error) {
    // この追加機能の失敗で既存 /api/status を壊さない。
    return {
      ok: false,
      areaName: `${CONFIG.prefectureName}${CONFIG.cityName}`,
      areaCode: CONFIG.cityCode,
      checkedAt,
      source: "千葉県防災ポータルサイト",
      sourceUrl: CHIBA_PORTAL_URL,
      evacuation: {
        active: false,
        level: 0,
        status: "取得エラー",
        title: "避難情報",
        areaName: CONFIG.cityName,
        message: "避難情報を取得できませんでした。",
        updatedAt: null,
        sourceUrl: null
      },
      shelters: {
        active: false,
        count: 0,
        shelters: [],
        message: "避難所情報を取得できませんでした。",
        sourceUrl: null
      },
      error: String(error?.message || error)
    };
  }
}

async function fetchChibaHtml(url) {
  if (!url) return "";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Funabashi-Disaster-Signage/1.0",
      "Accept": "text/html,application/xhtml+xml"
    },
    cf: {
      cacheTtl: 60,
      cacheEverything: true
    }
  });

  if (!res.ok) {
    throw new Error(`Chiba portal HTTP ${res.status}`);
  }
  return await res.text();
}

// FUNABASHI_WORKER_FIX_20260916
function findFunabashiDetailLinks(html) {
  const found = {
    evacuation: null,
    shelter: null
  };

  // PUB_VF_Detail_Hinan のリンクだけを文字列処理で抽出する。
  // 正規表現で HTML 全体を解析せず、エスケープ由来のビルドエラーを避ける。
  const source = String(html || "");
  const marker = "PUB_VF_Detail_Hinan";
  let cursor = 0;

  while (cursor < source.length) {
    const markerPos = source.indexOf(marker, cursor);
    if (markerPos < 0) break;

    const anchorStart = source.lastIndexOf("<a", markerPos);
    const anchorEnd = source.indexOf(">", markerPos);
    if (anchorStart < 0 || anchorEnd < 0) break;

    const closeStart = source.indexOf("</a>", anchorEnd + 1);
    if (closeStart < 0) break;

    const openingTag = source.slice(anchorStart, anchorEnd + 1);
    const labelHtml = source.slice(anchorEnd + 1, closeStart);
    const context = source.slice(
      Math.max(0, anchorStart - 500),
      Math.min(source.length, closeStart + 500)
    );

    const hrefMatch = openingTag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch) {
      const href = toAbsoluteChibaUrl(decodeHtml(hrefMatch[1]));
      const label = normalizeHtmlText(labelHtml);
      const combined = `${label} ${normalizeHtmlText(context)}`;

      if (href && combined.includes(CONFIG.cityName)) {
        if (!found.evacuation && /避難情報/.test(combined)) {
          found.evacuation = href;
        }

        if (!found.shelter && /避難所情報/.test(combined)) {
          found.shelter = href;
        }
      }
    }

    cursor = closeStart + 4;
  }

  return found;
}

function parseEvacuationPage(html, sourceUrl) {
  const text = normalizeHtmlText(html);

  const result = {
    active: false,
    level: 0,
    status: "なし",
    title: "避難情報",
    areaName: CONFIG.cityName,
    message: "現在、船橋市から発表されている避難情報はありません。",
    updatedAt: null,
    sourceUrl: sourceUrl || null
  };

  if (!text) return result;

  // 千葉県ポータルの詳細ページでは、
  // 「市内全域：緊急安全確保 警戒レベル５ 発令」
  // 「市内対象地域：高齢者等避難 警戒レベル３ 発令」
  // のような記載が確認できる。
  const eventRegex =
    /(市内全域|市内対象地域|[^\s：:]{1,60})\s*[：:]\s*(緊急安全確保|避難指示|高齢者等避難)\s+警戒レベル\s*([３４５]|[345])\s*(発令|解除)\s*\(\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})\s*\)/g;

  const events = [];
  let m;
  while ((m = eventRegex.exec(text))) {
    const area = m[1].trim();
    const type = m[2];
    const levelRaw = m[3];
    const status = m[4];
    const updatedAt = m[5];
    const level = Number(levelRaw.replace("３", "3").replace("４", "4").replace("５", "5"));

    events.push({ area, type, level, status, updatedAt });
  }

  if (!events.length) {
    // 日付表記や空白差に耐える簡易検索
    const simple =
      text.match(/(緊急安全確保|避難指示|高齢者等避難)[^。]{0,100}(発令|解除)/);
    if (!simple) return result;

    const type = simple[1];
    const status = simple[2];
    if (status === "解除") {
      result.status = "解除";
      result.message = "現在、船橋市から発表されている避難情報はありません。";
      return result;
    }
  }

  // 同一ページ内で複数地域がある場合、解除より発令を優先し、
  // 発令が複数なら最大レベル・最新時刻を採用。
  events.sort((a, b) => {
    const activeDiff = Number(b.status === "発令") - Number(a.status === "発令");
    if (activeDiff) return activeDiff;
    return b.level - a.level || String(b.updatedAt).localeCompare(String(a.updatedAt));
  });

  const current = events[0];

  if (current.status === "解除") {
    result.status = "解除";
    result.updatedAt = current.updatedAt;
    result.message = "現在、船橋市から発表されている避難情報はありません。";
    return result;
  }

  result.active = true;
  result.level = current.level;
  result.status = "発令";
  result.title = current.type;
  result.updatedAt = current.updatedAt;
  result.message =
    `${current.area}：${current.type} 警戒レベル${current.level}が発令されています。`;

  return result;
}

function parseShelterPage(html, sourceUrl) {
  const text = normalizeHtmlText(html);

  const result = {
    active: false,
    count: 0,
    shelters: [],
    message: "現在、船橋市で開設中の避難所はありません。",
    sourceUrl: sourceUrl || null
  };

  if (!text) return result;

  // 実際の千葉県ポータルで確認できる形式:
  // 「船橋小学校：避難所 開設( 2026/08/13 19:00 )」
  // 「船橋小学校：避難所 閉鎖( 2026/08/14 08:46 )」
  const re =
    /([^：:]{1,50})\s*[：:]\s*避難所\s+(開設|閉鎖)\s*\(\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})\s*\)/g;

  const events = [];
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].trim();
    const status = m[2];
    const updatedAt = m[3];

    if (!name || /船橋市|避難所情報|以下のとおり/.test(name)) continue;

    events.push({ name, status, updatedAt });
  }

  // 施設ごとに最新イベントを残す。
  const latestByName = new Map();
  for (const event of events) {
    const old = latestByName.get(event.name);
    if (!old || String(event.updatedAt).localeCompare(String(old.updatedAt)) > 0) {
      latestByName.set(event.name, event);
    }
  }

  const active = [...latestByName.values()]
    .filter(x => x.status === "開設")
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ja"));

  result.active = active.length > 0;
  result.count = active.length;
  result.shelters = active;

  if (active.length) {
    result.message = `現在、${active.length}か所の避難所が開設されています。`;
  }

  return result;
}

function normalizeHtmlText(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function toAbsoluteChibaUrl(href) {
  try {
    return new URL(href, CHIBA_PORTAL_URL).href;
  } catch {
    return null;
  }
}
