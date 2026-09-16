(() => {
  const CONFIG = window.SIGNAGE_CONFIG;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const TEST_MODE = params.get('test') === '1';
  const DIRECT_DEMO = params.get('demo') === '1';

  const states = {
    0:{level:0,label:'通常',sub:'発表なし',title:'現在、発表警報・注意報はありません',message:'気象状況や自治体からの避難情報に注意してください。',icon:'✓',cls:'normal'},
    2:{level:2,label:'注意報',sub:'レベル2',title:'注意報 発表中',warning:'雷注意報',message:'雷に注意してください。今後の気象情報と自治体からの避難情報を確認してください。',icon:'!',cls:'advisory'},
    3:{level:3,label:'警報',sub:'レベル3',title:'警報 発表中',warning:'大雨警報',message:'強い雨が続く見込みです。周囲の状況に注意し、必要に応じて安全を確保してください。',icon:'!',cls:'warning'},
    4:{level:4,label:'危険警報',sub:'レベル4',title:'危険警報 発表中',warning:'大雨・洪水 危険警報',message:'重大な災害が発生するおそれがあります。自治体の避難情報を確認し、安全確保を最優先してください。',icon:'!',cls:'danger'},
    5:{level:5,label:'特別警報',sub:'レベル5',title:'特別警報 発表中',warning:'大雨 特別警報',message:'数十年に一度の大雨となるおそれがあります。命を守る行動を最優先し、自治体の指示に従ってください。',icon:'!',cls:'emergency'}
  };

  let currentLevel = 0, latest = null, chibaLatest = null, timer = null, clockTimer = null;

  function esc(v){
    return String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function formatDate(iso){
    if(!iso)return '—';
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return esc(iso);
    return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
  }
  function nowText(){
    return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
  }
  function levelForAlert(a){
    const n=Number(a?.level);
    return [0,2,3,4,5].includes(n)?n:0;
  }

  function renderHeader(){
    return `<header class="topbar"><div class="brand"><div class="brand-mark">＋</div><div><div class="brand-title">船橋市 防災情報</div><div class="brand-area">千葉県船橋市</div></div></div><div class="header-right"><div id="clock" class="clock">${nowText()}</div><div class="connection ${latest?.ok?'ok':latest?.ok===false?'ng':''}">${latest?.ok?'● 最新情報取得済み':latest?.ok===false?'● 気象情報取得エラー':''}</div></div></header>`;
  }
  function renderNormal(s){
    return `<section class="main-message normal-panel"><div class="main-icon">${s.icon}</div><div class="main-title">${s.title}</div><div class="main-description">${s.message}</div></section>`;
  }
  function renderAlert(s){
    return `<section class="main-message alert-panel"><div class="state-banner"><span class="state-icon">${s.icon}</span><span>${s.title}</span></div><div class="warning-name">${s.warning}</div><div class="main-description">${s.message}</div></section>`;
  }

  function renderEvacuation(e){
    const active=!!e?.active, level=Number(e?.level||0);
    const label=level?`警戒レベル${level}`:'発令なし';
    return `<section class="info-card evacuation-card ${active?'is-active level-'+level:'is-clear'}">
      <div class="info-card-header"><span class="info-card-title">避難情報</span><span class="info-card-badge">${esc(label)}</span></div>
      <div class="info-card-body">
        <div class="info-main-title">${esc(e?.title||'避難情報')}</div>
        <div class="info-message">${esc(e?.message||(active?'避難情報が発表されています。':'現在、船橋市から発表されている避難情報はありません。'))}</div>
        ${e?.updatedAt?`<div class="info-updated">発令・更新日時：${formatDate(e.updatedAt)}</div>`:''}
        <div class="info-source">情報提供：千葉県防災ポータルサイト</div>
      </div>
    </section>`;
  }

  function renderShelters(s){
    const active=!!s?.active, list=Array.isArray(s?.shelters)?s.shelters:[];
    const rows=list.slice(0,8).map(x=>`<div class="shelter-row"><div class="shelter-name">${esc(x.name||x.facilityName||'避難所')}</div>${x.updatedAt?`<div class="shelter-time">${formatDate(x.updatedAt)}</div>`:''}</div>`).join('');
    return `<section class="info-card shelter-card ${active?'is-active':'is-clear'}">
      <div class="info-card-header"><span class="info-card-title">避難所開設情報</span><span class="info-card-badge">${active?`${list.length}か所開設中`:'開設なし'}</span></div>
      <div class="info-card-body">${active&&rows?`<div class="shelter-list">${rows}</div>${list.length>8?`<div class="shelter-more">ほか ${list.length-8}か所</div>`:''}`:`<div class="info-main-title">現在、開設中の避難所はありません</div><div class="info-message">${esc(s?.message||'避難所の開設情報はありません。')}</div>`}<div class="info-source">情報提供：千葉県防災ポータルサイト</div></div>
    </section>`;
  }

  function renderChibaInfo(){
    if(!chibaLatest || chibaLatest.ok===false){
      return `<section class="info-card info-unavailable"><div class="info-card-header"><span class="info-card-title">自治体防災情報</span><span class="info-card-badge">取得できません</span></div><div class="info-card-body"><div class="info-message">避難情報・避難所情報を現在取得できません。最新の自治体発表を確認してください。</div></div></section>`;
    }
    return `<div class="municipal-section">${renderEvacuation(chibaLatest.evacuation)}${renderShelters(chibaLatest.shelters)}</div>`;
  }

  function renderMeta(data){
    return `<section class="meta-card">
      <div class="meta-row"><span class="meta-label">気象情報</span><span>気象庁 警報・注意報データ</span></div>
      <div class="meta-row"><span class="meta-label">自治体情報</span><span>千葉県防災ポータルサイト</span></div>
      <div class="meta-row"><span class="meta-label">対象地域</span><span>千葉県船橋市</span></div>
      ${data?.checkedAt?`<div class="meta-row source-row"><span class="meta-label">最終取得</span><span>${formatDate(data.checkedAt)}</span></div>`:''}
    </section>`;
  }

  function renderFooter(){return `<footer class="footer"><span>船橋市 防災情報</span><span>安全確保を最優先してください</span></footer>`;}

  function renderTestControls(){
    if(!TEST_MODE)return '';
    return `<aside class="test-panel"><div class="test-title">表示テスト</div><div class="test-note">5パターンをタップして確認できます。<br>本番URLではこの操作パネルは表示されません。</div><div class="test-buttons">${Object.values(states).map(s=>`<button class="test-btn ${s.cls} ${currentLevel===s.level?'active':''}" data-level="${s.level}">${s.level===0?'① 通常（発表なし）':`②〜⑤ ${s.label}（${s.sub}）`}</button>`).join('')}</div><div class="test-links"><a href="?test=1">テスト画面を再表示</a><a href="?">本番API表示に戻る</a></div></aside>`;
  }

  function render(state,data=null){
    document.body.className=state.cls;
    app.innerHTML=`<div class="screen-shell">${renderHeader()}<div class="screen-content">${state.level===0?renderNormal(state):renderAlert(state)}${renderChibaInfo()}${renderMeta(data)}</div>${renderFooter()}</div>${renderTestControls()}`;
    document.querySelectorAll('.test-btn').forEach(btn=>btn.addEventListener('click',()=>{
      currentLevel=Number(btn.dataset.level);
      render(states[currentLevel],{ok:true,checkedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    }));
  }

  function renderError(message){
    latest={ok:false};
    document.body.className='error';
    app.innerHTML=`<div class="screen-shell">${renderHeader()}<div class="screen-content"><section class="main-message error-panel"><div class="main-icon">!</div><div class="main-title">防災情報を取得できません</div><div class="main-description">${esc(message||'APIとの通信に失敗しました。')}</div><div class="retry-note">自動的に再取得します</div></section>${renderChibaInfo()}<section class="meta-card"><div class="meta-row"><span class="meta-label">対象地域</span><strong>千葉県船橋市</strong></div></section></div>${renderFooter()}</div>`;
  }

  async function fetchStatus(){
    try{
      const res=await fetch(`${CONFIG.API_BASE_URL}/api/status?ts=${Date.now()}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json(); latest=data;
      const alerts=Array.isArray(data.alerts)?data.alerts:[];
      const active=alerts.filter(a=>Number(a.level)>0);
      const alert=active.sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0))[0];
      currentLevel=alert?levelForAlert(alert):0;
      render(states[currentLevel]||states[0],alert?{...alert,checkedAt:data.checkedAt}:{updatedAt:data.checkedAt,checkedAt:data.checkedAt});
    }catch(e){renderError(e.message);}
  }

  async function fetchChibaDisaster(){
    try{
      const res=await fetch(`${CONFIG.API_BASE_URL}/api/chiba-disaster?ts=${Date.now()}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      chibaLatest=await res.json();
      if(latest){
        const state=states[currentLevel]||states[0];
        const active=(latest.alerts||[]).find(a=>Number(a.level)>0);
        render(state,active?{...active,checkedAt:latest.checkedAt}:{updatedAt:latest.checkedAt,checkedAt:latest.checkedAt});
      }
    }catch(e){
      chibaLatest={ok:false,error:e.message};
      if(latest)render(states[currentLevel]||states[0],{updatedAt:latest.checkedAt,checkedAt:latest.checkedAt});
    }
  }

  function startClock(){
    clearInterval(clockTimer);
    clockTimer=setInterval(()=>{const el=document.getElementById('clock');if(el)el.textContent=nowText();},1000);
  }

  function demoChiba(){
    return {ok:true,evacuation:{active:false,level:0,title:'避難情報',message:'現在、船橋市から発表されている避難情報はありません。'},shelters:{active:false,count:0,shelters:[],message:'現在、船橋市で開設中の避難所はありません。'}};
  }

  function init(){
    startClock();
    if(TEST_MODE){
      const n=Number(params.get('level')); currentLevel=[0,2,3,4,5].includes(n)?n:0;
      chibaLatest=demoChiba();
      render(states[currentLevel],{ok:true,checkedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      return;
    }
    if(DIRECT_DEMO){
      const n=Number(params.get('level')); currentLevel=[0,2,3,4,5].includes(n)?n:3;
      chibaLatest=demoChiba();
      render(states[currentLevel],{ok:true,checkedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      return;
    }
    fetchStatus(); fetchChibaDisaster();
    clearInterval(timer);
    timer=setInterval(()=>{fetchStatus();fetchChibaDisaster();},CONFIG.REFRESH_MS||30000);
  }
  init();
})();
