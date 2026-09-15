(() => {
  const cfg = window.SIGNAGE_CONFIG || {};
  const API = (cfg.API_BASE_URL || "").replace(/\/$/, "");
  const demo = new URLSearchParams(location.search).get("demo") === "1";

  const app = document.getElementById("app");
  const normalView = document.getElementById("normalView");
  const alertView = document.getElementById("alertView");
  const errorView = document.getElementById("errorView");
  const status = document.getElementById("status");
  const clock = document.getElementById("clock");
  const alertTitle = document.getElementById("alertTitle");
  const alertMessage = document.getElementById("alertMessage");
  const severityBadge = document.getElementById("severityBadge");
  const alertList = document.getElementById("alertList");
  const demoBadge = document.getElementById("demoBadge");

  function setView(type) {
    app.className = "state-" + type;
    normalView.classList.toggle("hidden", type !== "normal");
    alertView.classList.toggle("hidden", !["warning","danger","critical"].includes(type));
    errorView.classList.toggle("hidden", type !== "error");
  }

  function severity(level) {
    if (level >= 5) return ["critical", "緊急情報"];
    if (level >= 4) return ["danger", "警報"];
    if (level >= 2) return ["warning", "注意情報"];
    return ["warning", "防災情報"];
  }

  function fmt(value) {
    const d = new Date(value);
    if (!value || Number.isNaN(d.getTime())) return "--";
    return d.toLocaleString("ja-JP", {
      year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit"
    });
  }

  function render(data) {
    if (!data || data.ok !== true) {
      setView("error");
      status.textContent = "情報取得状態：エラー";
      return;
    }

    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    status.textContent = `最終確認：${fmt(data.checkedAt)} ／ 情報源：${data.source || "気象庁"}`;

    if (!alerts.length) {
      setView("normal");
      return;
    }

    const [viewType, label] = severity(alerts[0].level || 1);
    setView(viewType);

    severityBadge.textContent = label;
    alertTitle.textContent = alerts[0].title || alerts[0].type || "防災情報";
    alertMessage.textContent = alerts[0].message || "最新の防災情報をご確認ください。";

    alertList.innerHTML = "";
    for (const a of alerts.slice(0, 8)) {
      const el = document.createElement("div");
      el.className = "alert-item";
      el.textContent = `${a.type || "情報"}（${a.areaName || "船橋市"}）`;
      alertList.appendChild(el);
    }
  }

  function demoData() {
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      source: "デモ表示",
      alerts: [{
        type: "大雨危険警報",
        title: "船橋市に大雨に関する危険情報",
        message: "これは画面確認用のデモ表示です。実際の防災情報ではありません。",
        level: 4,
        areaName: "船橋市"
      }]
    };
  }

  async function update() {
    if (demo) {
      demoBadge.classList.remove("hidden");
      render(demoData());
      return;
    }

    if (!API || API.includes("YOUR-WORKER")) {
      setView("error");
      status.textContent = "API URL未設定：docs/js/config.js を設定してください";
      return;
    }

    try {
      const res = await fetch(`${API}/api/status?t=${Date.now()}`, {
        cache: "no-store",
        headers: {"Accept":"application/json"}
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(await res.json());
    } catch (e) {
      console.error(e);
      setView("error");
      status.textContent = "情報取得失敗：再試行中";
    }
  }

  function tick() {
    clock.textContent = new Date().toLocaleString("ja-JP", {
      month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit"
    });
  }

  update();
  tick();
  setInterval(tick, 1000);
  setInterval(update, Number(cfg.REFRESH_MS || 30000));
})();
