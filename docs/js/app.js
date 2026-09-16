(() => {
  const CONFIG = window.SIGNAGE_CONFIG;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const TEST_MODE = params.get('test') === '1';
  const DIRECT_DEMO = params.get('demo') === '1';
  const PORTAL_URL = 'https://www.bousai.pref.chiba.lg.jp/';

  const states = {
    0:{level:0,label:'通常',sub:'発表なし',title:'現在、発表警報・注意報はありません',message:'気象状況や自治体からの避難情報に注意してください。',icon:'✓',cls:'normal'},
    2:{level:2,label:'注意報',sub:'レベル2',title:'注意報 発表中',warning:'雷注意報',message:'今後の気象情報と自治体からの避難情報を確認してください。',icon:'!',cls:'advisory'},
    3:{level:3,label:'警報',sub:'レベル3',title:'警報 発表中',warning:'大雨警報',message:'周囲の状況に注意し、必要に応じて安全を確保してください。',icon:'!',cls:'warning'},
    4:{level:4,label:'危険警報',sub:'レベル4',title:'危険警報 発表中',warning:'大雨・洪水 危険警報',message:'自治体の避難情報を確認し、安全確保を最優先してください。',icon:'!',cls:'danger'},
    5:{level:5,label:'特別警報',sub:'レベル5',title:'特別警報 発表中',warning:'大雨 特別警報',message:'命を守る行動を最優先し、自治体の指示に従ってください。',icon:'!',cls:'emergency'}
  };

  let currentLevel=0, latest=null, chibaLatest=null, timer=null, clockTimer=null;

  function esc(v){return String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function formatDate(iso){
    if(!iso)return '—'; const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return esc(iso);
    return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
  }
  function nowText(){
    return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
  }
  function levelForAlert(a){const n=Number(a?.level);return [0,2,3,4,5].includes(n)?n:0;}

  function qrUrl(target){
    const data=encodeURIComponent(target||PORTAL_URL);
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${data}`;
  }

  function representativeAreas(e){
    const raw=String(e?.message||'').replace(/\s+/g,' ').trim();
    let s=raw;
    const m=s.match(/(?:市内対象地域|対象地域|対象地区|対象区域)\s*[:：]\s*(.*?)(?:\s*(?:発令|解除)\s*\(|$)/);
    if(m) s=m[1];
    s=s.replace(/発令[（(][^)]*[）)]/g,'').replace(/解除[（(][^)]*[）)]/g,'').trim();
    if(!s || /現在、船橋市から発表されている避難情報はありません/.test(s)) return [];
    if(/市内全域/.test(s)) return ['船橋市内全域'];
    const parts=s.split(/[、,，\/／;；\n]+/).map(x=>x.replace(/^[・\-\s]+/,'').trim()).filter(Boolean);
    return [...new Set(parts)].slice(0,3);
  }

  function renderHeader(){
    return `<header class="topbar"><div class="brand"><div class="brand-mark">＋</div><div><div class="brand-title">船橋市 防災情報</div><div class="brand-area">千葉県船橋市</div></div></div><div class="header-right"><div id="clock" class="clock">${nowText()}</div><div class="connection ${latest?.ok?'ok':latest?.ok===false?'ng':''}">${latest?.ok?'● 最新情報取得済み':latest?.ok===false?'● 気象情報取得エラー':''}</div></div></header>`;
  }

  function renderNormal(s){
    return `<section class="main-message normal-panel"><div class="main-icon">${s.icon}</div><div class="main-title">${s.title}</div><div class="main-description">${s.message}</div></section>`;
  }

  function renderAlert(s){
    return `<section class="main-message alert-panel"><div class="state-banner"><span class="state-icon">${s.icon}</span><span>${s.title}</span></div><div class="warning-name">${esc(s.warning)}</div><div class="main-description">${esc(s.message)}</div></section>`;
  }

  function renderQrCard(target, label){
    return `<div class="qr-block"><img class="qr-image" src="${qrUrl(target)}" alt="詳細情報のQRコード"><div class="qr-label">詳しい${label}は<br><strong>QRコードからご確認ください</strong></div></div>`;
  }

  function renderEvacuationPrimary(e){
    const level=Number(e?.level||0);
    const levelLabel=level?`警戒レベル${level}`:'避難情報';
    const action=level===5?'緊急安全確保':level===4?'避難指示':level===3?'高齢者等避難':(e?.title||'避難情報');
    const areas=representativeAreas(e);
    const areaHtml=areas.length
      ? areas.map(x=>`<li>${esc(x)}</li>`).join('')
      : `<li>船橋市内で避難情報が発令されています</li>`;
    const extra=String(e?.message||'').includes('市内全域') || areas.length>=3;
    const target=e?.sourceUrl||PORTAL_URL;
    return `<section class="disaster-primary evacuation-primary level-${level}">
      <div class="disaster-copy">
        <div class="disaster-kicker">避難情報</div>
        <div class="disaster-level">${esc(levelLabel)}</div>
        <div class="disaster-action">${esc(action)}</div>
        <div class="target-title">主な対象地域</div>
        <ul class="target-list">${areaHtml}</ul>
        ${extra?'<div class="more-note">その他の対象地域・詳細があります</div>':''}
        ${e?.updatedAt?`<div class="disaster-updated">発令・更新：${formatDate(e.updatedAt)}</div>`:''}
      </div>
      ${renderQrCard(target,'対象地域・避難情報の詳細')}
    </section>`;
  }

  function renderShelterPrimary(s){
    const list=Array.isArray(s?.shelters)?s.shelters:[];
    const names=list.slice(0,3).map(x=>x.name||x.facilityName||'避難所').filter(Boolean);
    return `<section class="disaster-primary shelter-primary">
      <div class="disaster-copy">
        <div class="disaster-kicker">避難所情報</div>
        <div class="disaster-action">避難所 開設中</div>
        <div class="shelter-count">船橋市内 <strong>${Number(s?.count||list.length)}</strong> 施設</div>
        <div class="target-title">主な開設避難所</div>
        <ul class="target-list">${(names.length?names:['開設避難所があります']).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        ${list.length>3?`<div class="more-note">その他 ${list.length-3}施設の詳細があります</div>`:''}
      </div>
      ${renderQrCard(s?.sourceUrl||PORTAL_URL,'開設場所・避難所情報の詳細')}
    </section>`;
  }

  function renderChibaPrimary(){
    if(!chibaLatest || chibaLatest.ok===false) return '';
    const e=chibaLatest.evacuation, s=chibaLatest.shelters;
    if(e?.active) return renderEvacuationPrimary(e);
    if(s?.active) return renderShelterPrimary(s);
    return '';
  }

  function renderFooter(data){
    const municipal=chibaLatest?.ok!==false;
    return `<footer class="footer"><span>情報元：気象庁・千葉県防災ポータル</span><span>対象：船橋市　最終取得：${data?.checkedAt?formatDate(data.checkedAt):'—'}</span></footer>`;
  }

  function renderTestControls(){
    if(!TEST_MODE)return '';
    return `<aside class="test-panel"><div class="test-title">表示テスト</div><div class="test-note">通常・警報・避難情報・避難所開設の表示を確認できます。</div><div class="test-buttons">${Object.values(states).map(s=>`<button class="test-btn ${s.cls} ${currentLevel===s.level?'active':''}" data-level="${s.level}">${s.level===0?'通常':s.label}</button>`).join('')}</div><div class="test-links"><a href="?test=1">テスト画面を再表示</a><a href="?">本番API表示に戻る</a></div></aside>`;
  }

  function render(state,data=null){
    document.body.className=state.cls;
    const municipal=renderChibaPrimary();
    const main=municipal|| (state.level===0?renderNormal(state):renderAlert(state));
    app.innerHTML=`<div class="screen-shell">${renderHeader()}<main class="screen-content">${main}</main>${renderFooter(data)}</div>${renderTestControls()}`;
    document.querySelectorAll('.test-btn').forEach(btn=>btn.addEventListener('click',()=>{
      currentLevel=Number(btn.dataset.level);
      const demo=demoChiba();
      if(currentLevel===3){
        demo.evacuation={active:true,level:4,title:'避難指示',message:'市内対象地域：海神、湊町、日の出 発令( 2026/09/16 10:00 )',updatedAt:new Date().toISOString(),sourceUrl:PORTAL_URL};
      } else if(currentLevel===2){
        demo.shelters={active:true,count:7,shelters:[{name:'船橋小学校'},{name:'宮本小学校'},{name:'海神小学校'},{name:'その他の避難所'}],sourceUrl:PORTAL_URL};
      }
      chibaLatest=demo;
      render(states[currentLevel],{ok:true,checkedAt:new Date().toISOString()});
    }));
  }

  function renderError(message){
    latest={ok:false};
    document.body.className='error';
    app.innerHTML=`<div class="screen-shell">${renderHeader()}<main class="screen-content"><section class="main-message error-panel"><div class="main-icon">!</div><div class="main-title">防災情報を取得できません</div><div class="main-description">${esc(message||'APIとの通信に失敗しました。')}</div><div class="retry-note">自動的に再取得します</div></section></main>${renderFooter()}</div>`;
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
      render(states[currentLevel]||states[0],{...data,updatedAt:alert?.updatedAt||data.checkedAt});
    }catch(e){renderError(e.message);}
  }

  async function fetchChibaDisaster(){
    try{
      const res=await fetch(`${CONFIG.API_BASE_URL}/api/chiba-disaster?ts=${Date.now()}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      chibaLatest=await res.json();
      if(latest) render(states[currentLevel]||states[0],{...latest,checkedAt:latest.checkedAt||latest.checkedAt});
    }catch(e){
      chibaLatest={ok:false,error:e.message};
      if(latest) render(states[currentLevel]||states[0],{...latest,checkedAt:latest.checkedAt});
    }
  }

  function startClock(){
    clearInterval(clockTimer);
    clockTimer=setInterval(()=>{const el=document.getElementById('clock');if(el)el.textContent=nowText();},1000);
  }

  function demoChiba(){
    return {ok:true,evacuation:{active:false,level:0,title:'避難情報',message:'現在、船橋市から発表されている避難情報はありません.'},shelters:{active:false,count:0,shelters:[],message:'現在、船橋市で開設中の避難所はありません。'}};
  }

  function init(){
    startClock();
    if(TEST_MODE||DIRECT_DEMO){
      currentLevel=[0,2,3,4,5].includes(Number(params.get('level')))?Number(params.get('level')):3;
      chibaLatest=demoChiba();
      if(currentLevel===3) chibaLatest.evacuation={active:true,level:4,title:'避難指示',message:'市内対象地域：海神、湊町、日の出 発令( 2026/09/16 10:00 )',updatedAt:new Date().toISOString(),sourceUrl:PORTAL_URL};
      if(currentLevel===2) chibaLatest.shelters={active:true,count:7,shelters:[{name:'船橋小学校'},{name:'宮本小学校'},{name:'海神小学校'},{name:'その他の避難所'}],sourceUrl:PORTAL_URL};
      render(states[currentLevel],{ok:true,checkedAt:new Date().toISOString()});
      return;
    }
    fetchStatus(); fetchChibaDisaster();
    clearInterval(timer);
    timer=setInterval(()=>{fetchStatus();fetchChibaDisaster();},CONFIG.REFRESH_MS||30000);
  }
  init();
})();
