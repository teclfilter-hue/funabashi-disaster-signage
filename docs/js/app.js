(() => {
  const CONFIG = window.SIGNAGE_CONFIG;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const TEST_MODE = params.get('test') === '1';
  const DIRECT_DEMO = params.get('demo') === '1';
  const PORTAL_URL = 'https://www.bousai.pref.chiba.lg.jp/';

  const LEVEL_META = {
    0:{label:'通常',sub:'発表なし',cls:'normal',icon:'✓'},
    2:{label:'注意報',sub:'レベル2',cls:'advisory',icon:'!'},
    3:{label:'警報',sub:'レベル3',cls:'warning',icon:'!'},
    4:{label:'危険警報',sub:'レベル4',cls:'danger',icon:'!'},
    5:{label:'特別警報',sub:'レベル5',cls:'emergency',icon:'!'}
  };

  let currentLevel = 0;
  let latest = null;
  let chibaLatest = null;
  let timer = null;
  let clockTimer = null;

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
  function highestAlert(data){
    const alerts=Array.isArray(data?.alerts)?data.alerts:[];
    return alerts.filter(a=>Number(a?.level)>0).sort((a,b)=>
      Number(b.level)-Number(a.level) || new Date(b.updatedAt||0)-new Date(a.updatedAt||0)
    )[0] || null;
  }
  function qrUrl(target){
    const data=encodeURIComponent(target||PORTAL_URL);
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${data}`;
  }

  function renderHeader(){
    const ok = latest?.ok;
    return `<header class="topbar"><div class="brand"><div class="brand-mark">＋</div><div><div class="brand-title">船橋市 防災情報</div><div class="brand-area">千葉県船橋市</div></div></div><div class="header-right"><div id="clock" class="clock">${nowText()}</div><div class="connection ${ok?'ok':ok===false?'ng':''}">${ok?'● 最新情報取得済み':ok===false?'● 気象情報取得エラー':''}</div></div></header>`;
  }

  function renderNormal(){
    return `<section class="main-message normal-panel"><div class="main-icon">✓</div><div class="main-title">現在、発表されている防災気象情報はありません</div><div class="main-description">気象状況や船橋市からの避難情報に注意してください。</div></section>`;
  }

  function renderWeatherPrimary(alert){
    const level=levelForAlert(alert);
    const meta=LEVEL_META[level]||LEVEL_META[0];
    const title=alert?.type||alert?.title||meta.label;
    const message=alert?.message||`${title}が発表されています。最新の気象情報と自治体からの避難情報を確認してください。`;
    return `<section class="main-message alert-panel weather-primary ${meta.cls}">
      <div class="state-banner"><span class="state-icon">${meta.icon}</span><span>${esc(meta.label)}・${esc(meta.sub)}</span></div>
      <div class="warning-name">${esc(title)}</div>
      <div class="main-description">${esc(message)}</div>
      ${alert?.updatedAt?`<div class="weather-updated">発表・更新：${formatDate(alert.updatedAt)}</div>`:''}
    </section>`;
  }

  function renderQrCard(target,label){
    return `<div class="qr-block"><img class="qr-image" src="${qrUrl(target)}" alt="詳細情報のQRコード"><div class="qr-label">${esc(label)}は<br><strong>QRコードからご確認ください</strong></div></div>`;
  }

  function evacuationAction(level,title){
    if(level===5)return '緊急安全確保';
    if(level===4)return '避難指示';
    if(level===3)return '高齢者等避難';
    return title||'避難情報';
  }

  function representativeAreas(e){
    if(Array.isArray(e?.representativeAreas) && e.representativeAreas.length){
      return e.representativeAreas.slice(0,3).map(x=>typeof x==='string'?x:(x?.name||x?.area||'')).filter(Boolean);
    }
    if(Array.isArray(e?.areas) && e.areas.length){
      return e.areas.slice(0,3).map(x=>x?.name||x?.area||'').filter(Boolean);
    }
    return [];
  }

  function renderEvacuationPrimary(e){
    const level=Number(e?.level||0);
    const areas=representativeAreas(e);
    const target=e?.sourceUrl||PORTAL_URL;
    const count=Number(e?.totalAreas||e?.areas?.length||0);
    const areaHtml=areas.length ? areas.map(x=>`<li>${esc(x)}</li>`).join('') : '<li>船橋市内で避難情報が発令されています</li>';
    const more=count>areas.length;
    return `<section class="disaster-primary evacuation-primary level-${level}">
      <div class="disaster-copy">
        <div class="disaster-kicker">避難情報</div>
        <div class="disaster-level">警戒レベル${level}</div>
        <div class="disaster-action">${esc(evacuationAction(level,e?.title))}</div>
        <div class="target-title">主な対象地域</div>
        <ul class="target-list">${areaHtml}</ul>
        ${more?`<div class="more-note">その他 ${count-areas.length}地域の詳細があります</div>`:''}
        ${e?.updatedAt?`<div class="disaster-updated">発令・更新：${formatDate(e.updatedAt)}</div>`:''}
      </div>
      ${renderQrCard(target,'対象地域・避難情報の詳細')}
    </section>`;
  }

  function representativeShelters(s){
    if(Array.isArray(s?.representativeShelters) && s.representativeShelters.length){
      return s.representativeShelters.slice(0,3);
    }
    return Array.isArray(s?.shelters)?s.shelters.slice(0,3):[];
  }

  function renderShelterPrimary(s){
    const list=representativeShelters(s);
    const count=Number(s?.count||s?.shelters?.length||0);
    const names=list.map(x=>typeof x==='string'?x:(x?.name||x?.facilityName||'')).filter(Boolean);
    return `<section class="disaster-primary shelter-primary">
      <div class="disaster-copy">
        <div class="disaster-kicker">避難所情報</div>
        <div class="disaster-action">避難所 開設中</div>
        <div class="shelter-count">船橋市内 <strong>${count}</strong> 施設</div>
        <div class="target-title">主な開設避難所</div>
        <ul class="target-list">${(names.length?names:['開設避難所があります']).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        ${count>names.length?`<div class="more-note">その他 ${count-names.length}施設の詳細があります</div>`:''}
      </div>
      ${renderQrCard(s?.sourceUrl||PORTAL_URL,'開設場所・避難所情報の詳細')}
    </section>`;
  }

  function renderSupplementaryWeather(alert){
    if(!alert)return '';
    const level=levelForAlert(alert);
    const meta=LEVEL_META[level]||LEVEL_META[2];
    return `<section class="supp-card weather-supp ${meta.cls}"><div class="supp-label">気象情報</div><div class="supp-title">${esc(alert.type||alert.title||meta.label)}</div><div class="supp-level">${esc(meta.sub)}</div></section>`;
  }

  function renderSupplementaryShelter(s){
    if(!s?.active)return '';
    const count=Number(s.count||s.shelters?.length||0);
    return `<section class="supp-card shelter-supp"><div class="supp-label">避難所</div><div class="supp-title">開設中 <strong>${count}</strong>施設</div><div class="supp-note">所在地・全施設はQRへ</div></section>`;
  }

  function renderSupplementary(weatherAlert,shelters){
    const cards=[renderSupplementaryWeather(weatherAlert),renderSupplementaryShelter(shelters)].filter(Boolean);
    return cards.length?`<div class="supp-grid">${cards.join('')}</div>`:'';
  }

  function renderMunicipalStatus(){
    if(!chibaLatest || chibaLatest.ok===false)return '';
    const e=chibaLatest.evacuation||{};
    const s=chibaLatest.shelters||{};
    if(e.active)return renderEvacuationPrimary(e);
    if(s.active)return renderShelterPrimary(s);
    return '';
  }

  function renderFooter(data){
    return `<footer class="footer"><span>情報元：気象庁・千葉県防災ポータル</span><span>対象：船橋市　最終取得：${data?.checkedAt?formatDate(data.checkedAt):'—'}</span></footer>`;
  }

  function renderTestControls(){
    if(!TEST_MODE)return '';
    const buttons=[
      ['normal','通常'],['weather2','注意報'],['weather3','警報'],['evac','避難指示'],['shelter','避難所'],['both','避難＋避難所']
    ];
    return `<aside class="test-panel"><div class="test-title">表示テスト</div><div class="test-note">実装仕様に合わせ、複数情報が同時に発生する状態も確認できます。</div><div class="test-buttons test-buttons-6">${buttons.map(([id,label])=>`<button class="test-btn" data-demo="${id}">${label}</button>`).join('')}</div><div class="test-links"><a href="?test=1">テスト画面を再表示</a><a href="?">本番API表示に戻る</a></div></aside>`;
  }

  function render(stateAlert=null,data=null){
    const weatherAlert=stateAlert || highestAlert(latest);
    currentLevel=weatherAlert?levelForAlert(weatherAlert):0;
    const municipal=renderMunicipalStatus();
    const evacuationActive=!!chibaLatest?.evacuation?.active;
    const shelterActive=!!chibaLatest?.shelters?.active;
    let primary;
    if(evacuationActive){
      primary=municipal;
    }else if(shelterActive){
      primary=municipal;
    }else if(weatherAlert){
      primary=renderWeatherPrimary(weatherAlert);
    }else{
      primary=renderNormal();
    }
    const supplementary = evacuationActive
      ? renderSupplementary(weatherAlert,chibaLatest?.shelters)
      : shelterActive
        ? renderSupplementary(weatherAlert,null)
        : '';
    const notice = (evacuationActive && shelterActive)
      ? `<div class="priority-note">避難情報を最優先で表示しています。避難所の開設状況と気象情報を補足表示しています。</div>`
      : '';
    const body = `${primary}${supplementary}${notice}`;
    const cls=weatherAlert?((LEVEL_META[currentLevel]||LEVEL_META[0]).cls):(evacuationActive?'danger':shelterActive?'warning':'normal');
    document.body.className=cls;
    app.innerHTML=`<div class="screen-shell">${renderHeader()}<main class="screen-content">${body}</main>${renderFooter(data||latest)}</div>${renderTestControls()}`;
    bindTestControls();
  }

  function renderError(message){
    latest={ok:false};
    document.body.className='error';
    app.innerHTML=`<div class="screen-shell">${renderHeader()}<main class="screen-content"><section class="main-message error-panel"><div class="main-icon">!</div><div class="main-title">防災情報を取得できません</div><div class="main-description">${esc(message||'APIとの通信に失敗しました。')}</div><div class="retry-note">自動的に再取得します</div></section></main>${renderFooter()}</div>`;
  }

  function demoData(type){
    const base={ok:true,checkedAt:new Date().toISOString(),alerts:[]};
    if(type==='weather2')base.alerts=[{type:'雷注意報',title:'船橋市の雷注意報',level:2,message:'雷注意報が発表されています。今後の気象情報を確認してください。',updatedAt:new Date().toISOString()}];
    if(type==='weather3')base.alerts=[{type:'大雨警報',title:'船橋市の大雨警報',level:3,message:'大雨警報が発表されています。周囲の状況に注意してください。',updatedAt:new Date().toISOString()}];
    return base;
  }

  function demoChiba(type){
    const d={ok:true,evacuation:{active:false,level:0,title:'避難情報',message:'現在、船橋市から発表されている避難情報はありません。',sourceUrl:PORTAL_URL,representativeAreas:[],areas:[],totalAreas:0},shelters:{active:false,count:0,shelters:[],representativeShelters:[],sourceUrl:PORTAL_URL}};
    if(type==='evac'||type==='both'){
      d.evacuation={active:true,level:4,title:'避難指示',message:'海神、湊町、日の出：避難指示 警戒レベル4が発令されています。',updatedAt:new Date().toISOString(),sourceUrl:PORTAL_URL,totalAreas:5,representativeAreas:[{name:'海神'},{name:'湊町'},{name:'日の出'}],areas:[{name:'海神'},{name:'湊町'},{name:'日の出'},{name:'本町'},{name:'宮本'}]};
    }
    if(type==='shelter'||type==='both'){
      d.shelters={active:true,count:8,shelters:[{name:'船橋小学校'},{name:'宮本小学校'},{name:'海神小学校'},{name:'本町公民館'}],representativeShelters:[{name:'船橋小学校'},{name:'宮本小学校'},{name:'海神小学校'}],sourceUrl:PORTAL_URL};
    }
    return d;
  }

  function bindTestControls(){
    document.querySelectorAll('.test-btn').forEach(btn=>btn.addEventListener('click',()=>{
      const type=btn.dataset.demo;
      latest=demoData(type);
      chibaLatest=demoChiba(type);
      render(highestAlert(latest),latest);
    }));
  }

  async function fetchStatus(){
    try{
      const res=await fetch(`${CONFIG.API_BASE_URL}/api/status?ts=${Date.now()}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      latest=await res.json();
      render(highestAlert(latest),latest);
    }catch(e){
      latest={ok:false};
      if(chibaLatest)render(null,{checkedAt:chibaLatest.checkedAt});
      else renderError(e.message);
    }
  }

  async function fetchChibaDisaster(){
    try{
      const res=await fetch(`${CONFIG.API_BASE_URL}/api/chiba-disaster?ts=${Date.now()}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      chibaLatest=await res.json();
      render(highestAlert(latest),{...(latest||{}),checkedAt:chibaLatest.checkedAt||latest?.checkedAt});
    }catch(e){
      chibaLatest={ok:false,error:e.message};
      if(latest)render(highestAlert(latest),latest);
    }
  }

  function startClock(){
    clearInterval(clockTimer);
    clockTimer=setInterval(()=>{const el=document.getElementById('clock');if(el)el.textContent=nowText();},1000);
  }

  function init(){
    startClock();
    if(TEST_MODE||DIRECT_DEMO){
      const demo=params.get('demoType')||'evac';
      latest=demoData(demo);
      chibaLatest=demo==='weather2'||demo==='weather3'?demoChiba('none'):demoChiba(demo);
      render(highestAlert(latest),latest);
      return;
    }
    fetchStatus();
    fetchChibaDisaster();
    clearInterval(timer);
    timer=setInterval(()=>{fetchStatus();fetchChibaDisaster();},CONFIG.REFRESH_MS||30000);
  }
  init();
})();
