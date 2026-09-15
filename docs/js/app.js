(() => {
  const CONFIG = window.SIGNAGE_CONFIG;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const TEST_MODE = params.get('test') === '1';
  const DIRECT_DEMO = params.get('demo') === '1';

  const states = {
    0: {
      level: 0, label: '通常', sub: '発表なし', title: '現在、発表警報・注意報はありません',
      message: '気象状況や自治体からの避難情報に注意してください。',
      icon: '✓', cls: 'normal', sample: '現在の気象庁データに警報・注意報はありません。'
    },
    2: {
      level: 2, label: '注意報', sub: 'レベル2', title: '注意報 発表中',
      warning: '雷注意報', message: '雷に注意してください。今後の気象情報と自治体からの避難情報を確認してください。',
      icon: '!', cls: 'advisory'
    },
    3: {
      level: 3, label: '警報', sub: 'レベル3', title: '警報 発表中',
      warning: '大雨警報', message: '強い雨が続く見込みです。周囲の状況に注意し、必要に応じて安全を確保してください。',
      icon: '!', cls: 'warning'
    },
    4: {
      level: 4, label: '危険警報', sub: 'レベル4', title: '危険警報 発表中',
      warning: '大雨・洪水 危険警報', message: '重大な災害が発生するおそれがあります。自治体の避難情報を確認し、安全確保を最優先してください。',
      icon: '!', cls: 'danger'
    },
    5: {
      level: 5, label: '特別警報', sub: 'レベル5', title: '特別警報 発表中',
      warning: '大雨 特別警報', message: '数十年に一度の大雨となるおそれがあります。命を守る行動を最優先し、自治体の指示に従ってください。',
      icon: '!', cls: 'emergency'
    }
  };

  let currentLevel = 0;
  let latest = null;
  let timer = null;
  let clockTimer = null;

  function esc(v) {
    return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return esc(iso);
    return new Intl.DateTimeFormat('ja-JP', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}).format(d);
  }

  function nowText() {
    return new Intl.DateTimeFormat('ja-JP', {year:'numeric', month:'2-digit', day:'2-digit', weekday:'short', hour:'2-digit', minute:'2-digit', second:'2-digit'}).format(new Date());
  }

  function levelForAlert(alert) {
    const n = Number(alert?.level);
    if ([0,2,3,4,5].includes(n)) return n;
    return 0;
  }

  function renderHeader(state) {
    return `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">＋</div>
          <div>
            <div class="brand-title">船橋市 防災情報</div>
            <div class="brand-area">千葉県船橋市</div>
          </div>
        </div>
        <div class="header-right">
          <div id="clock" class="clock">${nowText()}</div>
          <div class="connection ${latest?.ok ? 'ok' : latest?.ok === false ? 'ng' : ''}">${latest?.ok ? '● 最新情報取得済み' : latest?.ok === false ? '● 取得エラー' : ''}</div>
        </div>
      </header>`;
  }

  function renderNormal(state) {
    return `
      <section class="main-message normal-panel">
        <div class="main-icon">${state.icon}</div>
        <div class="main-title">${state.title}</div>
        <div class="main-description">${state.message}</div>
      </section>`;
  }

  function renderAlert(state) {
    return `
      <section class="main-message alert-panel">
        <div class="state-banner"><span class="state-icon">${state.icon}</span><span>${state.title}</span></div>
        <div class="warning-name">${state.warning}</div>
        <div class="main-description">${state.message}</div>
      </section>`;
  }

  function renderMeta(state, data) {
    const updated = data?.updatedAt || data?.checkedAt || new Date().toISOString();
    return `
      <section class="meta-card">
        <div class="meta-row"><span class="meta-label">発表日時</span><strong>${formatDate(updated)}</strong></div>
        <div class="meta-row source-row"><span class="meta-label">情報提供</span><span>気象庁 警報・注意報データ</span></div>
        <div class="meta-row source-row"><span class="meta-label">対象地域</span><span>千葉県船橋市</span></div>
      </section>`;
  }

  function renderFooter() {
    return `<footer class="footer"><span>船橋市 防災情報</span><span>安全確保を最優先してください</span></footer>`;
  }

  function renderTestControls() {
    if (!TEST_MODE) return '';
    return `
      <aside class="test-panel">
        <div class="test-title">表示テスト</div>
        <div class="test-note">5パターンをタップして確認できます。<br>本番URLではこの操作パネルは表示されません。</div>
        <div class="test-buttons">
          ${Object.values(states).map(s => `<button class="test-btn ${s.cls} ${currentLevel === s.level ? 'active' : ''}" data-level="${s.level}">${s.level === 0 ? '① 通常（発表なし）' : `②〜⑤ ${s.label}（${s.sub}）`}</button>`).join('')}
        </div>
        <div class="test-links">
          <a href="?test=1">テスト画面を再表示</a>
          <a href="?">本番API表示に戻る</a>
        </div>
      </aside>`;
  }

  function render(state, data = null) {
    document.body.className = state.cls;
    const content = state.level === 0 ? renderNormal(state) : renderAlert(state);
    app.innerHTML = `
      <div class="screen-shell">
        ${renderHeader(state)}
        <div class="screen-content">
          ${content}
          ${renderMeta(state, data)}
        </div>
        ${renderFooter()}
      </div>
      ${renderTestControls()}`;

    document.querySelectorAll('.test-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentLevel = Number(btn.dataset.level);
        render(states[currentLevel], {ok:true, checkedAt:new Date().toISOString(), updatedAt:new Date().toISOString()});
      });
    });
  }

  function renderError(message) {
    const errorState = {...states[0], cls:'error', title:'防災情報を取得できません', message:'通信状態を確認してください。最後に取得した情報を表示できない場合があります。'};
    latest = {ok:false};
    document.body.className = 'error';
    app.innerHTML = `
      <div class="screen-shell">
        ${renderHeader(errorState)}
        <div class="screen-content">
          <section class="main-message error-panel">
            <div class="main-icon">!</div>
            <div class="main-title">防災情報を取得できません</div>
            <div class="main-description">${esc(message || 'APIとの通信に失敗しました。')}</div>
            <div class="retry-note">自動的に再取得します</div>
          </section>
          <section class="meta-card"><div class="meta-row"><span class="meta-label">対象地域</span><strong>千葉県船橋市</strong></div></section>
        </div>
        ${renderFooter()}
      </div>`;
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/status?ts=${Date.now()}`, {cache:'no-store'});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      latest = data;
      const alerts = Array.isArray(data.alerts) ? data.alerts : [];
      const active = alerts.filter(a => Number(a.level) > 0);
      const alert = active.sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
      currentLevel = alert ? levelForAlert(alert) : 0;
      const state = states[currentLevel] || states[0];
      const merged = alert ? {...alert, checkedAt:data.checkedAt} : {updatedAt:data.checkedAt, checkedAt:data.checkedAt};
      render(state, merged);
    } catch (e) {
      renderError(e.message);
    }
  }

  function startClock() {
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      const el = document.getElementById('clock');
      if (el) el.textContent = nowText();
    }, 1000);
  }

  function init() {
    startClock();
    if (TEST_MODE) {
      const initial = Number(params.get('level'));
      currentLevel = [0,2,3,4,5].includes(initial) ? initial : 0;
      render(states[currentLevel], {ok:true, checkedAt:new Date().toISOString(), updatedAt:new Date().toISOString()});
      return;
    }
    if (DIRECT_DEMO) {
      currentLevel = [0,2,3,4,5].includes(Number(params.get('level'))) ? Number(params.get('level')) : 3;
      render(states[currentLevel], {ok:true, checkedAt:new Date().toISOString(), updatedAt:new Date().toISOString()});
      return;
    }
    fetchStatus();
    clearInterval(timer);
    timer = setInterval(fetchStatus, CONFIG.REFRESH_MS || 30000);
  }

  init();
})();
