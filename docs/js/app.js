(() => {
  const CONFIG = window.SIGNAGE_CONFIG;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const TEST_MODE = params.get('test') === '1';
  const DIRECT_DEMO = params.get('demo') === '1';

  const states = {
    0:{level:0,label:'通常',sub:'発表なし',title:'現在、発表警報・注意報はありません',message:'気象状況や自治体からの避難情報に注意してください。',icon:'✓',cls:'normal'},
    2:{level:2,label:'注意報',sub:'レベル2',title:'注意報 発表中',message:'最新の気象情報と自治体からの避難情報を確認してください。',icon:'!',cls:'advisory'},
    3:{level:3,label:'警報',sub:'レベル3',title:'警報 発表中',message:'周囲の状況に注意し、必要に応じて安全を確保してください。',icon:'!',cls:'warning'},
    4:{level:4,label:'危険警報',sub:'レベル4',title:'危険警報 発表中',message:'重大な災害が発生するおそれがあります。自治体の避難情報を確認し、安全確保を最優先してください。',icon:'!',cls:'danger'},
    5:{level:5,label:'特別警報',sub:'レベル5',title:'特別警報 発表中',message:'命を守る行動を最優先し、自治体の指示に従ってください。',icon:'!',cls:'emergency'}
  };

  let currentLevel=0, latest=null, chibaLatest=null, timer=null, clockTimer=null;

  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
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
    return [2,3,4,5].includes(n)?n:0;
  }

  /*
   * JMA総括項目を実警報として扱わないための判定。
   * 例:
   *   type: 防災情報
   *   title: 船橋市の防災情報
   *   status: 発表警報・注意報はなし
   * は、level=3/4 が入っていても除外する。
   */
  function isRealWeatherAlert(a){
    if(!a || levelForAlert(a)===0) return false;

    const type=String(a.type||'').trim();
    const title=String(a.title||'').trim();
    const status=String(a.status||'').trim();
    const message=String(a.message||'').trim();

    // 総括・ダミー・「発表なし」は常に除外
    if(type==='防災情報') return false;
    if(title==='防災情報' || title.includes('の防災情報')) return false;
    if(status.includes('発表警報・注意報はなし')) return false;
    if(/発表\s*なし|発表されていません|該当なし|なし$/.test(status)) return false;

    // 具体的な気象警報・注意報の名称を持つものだけを対象にする。
    // 新制度の名称と一般的な警報・注意報名の双方に対応。
    const weatherName=/大雨|洪水|氾濫|土砂災害|高潮|暴風|暴風雪|大雪|波浪|強風|雷|乾燥|濃霧|霜|なだれ|低温|着雪|着氷|融雪|津波|火山/i;
    if(!weatherName.test(title) && !weatherName.test(type)) return false;

    // levelだけを持つ汎用メッセージも念のため除外
    if((title==='船橋市' || title==='千葉県船橋市') && !weatherName.test(message)) return false;

    return true;
  }

  function getWeatherAlerts(data){
    return (Array.isArray(data?.alerts)?data.alerts:[])
      .filter(isRealWeatherAlert)
      .sort((a,b)=>{
        const ld=Number(b.level||0)-Number(a.level||0);
        if(ld!==0)return ld;
        return new Date(b.updatedAt||0)-new Date(a.updatedAt||0);
      });
  }

  function weatherDisplay(alert){
    if(!alert)return null;
    const level=levelForAlert(alert);
    let warning=String(alert.title||alert.type||'').replace(/^千葉県船橋市の/,'').replace(/^船橋市の/,'').trim();
    if(!warning) warning='気象警報・注意報';
    const label={2:'注意報',3:'警報',4:'危険警報',5:'特別警報'}[level]||'';
    return {
      level,label,warning,title:warning,
      message:alert.message||`${warning}が発表されています。今後の気象情報と自治体からの避難情報を確認してください。`,
      updatedAt:alert.updatedAt||alert.updateAt||null,
      status:alert.status||'',type:alert.type||''
    };
  }

  function weatherNames(alerts){
    return alerts.slice(0,4).map(a=>String(a.title||a.type||'')
      .replace(/^千葉県船橋市の/,'').replace(/^船橋市の/,'').trim()).filter(Boolean);
  }

  function renderHeader(){
    return `<header class="topbar"><div class="brand"><div class="brand-mark">＋</div><div><div class="brand-title">船橋市 防災情報</div><div class="brand-area">千葉県船橋市</div></div></div><div class="header-right"><div id="clock" class="clock">${nowText()}</div><div class="connection ${latest?.ok?'ok':latest?.ok===false?'ng':''}">${latest?.ok?'● 最新情報取得済み':latest?.ok===false?'● 気象情報取得エラー':''}</div></div></header>`;
  }
  function renderNormal(s){
    return `<section class="main-message normal-panel"><div class="main-icon">${s.icon}</div><div class="main-title">${s.title}</div><div class="main-description">${s.message}</div></section>`;
  }
  function renderAlert(s){
    const w=s.weather||{};
    const names=Array.isArray(s.weatherNames)?s.weatherNames:[];
    const total=Math.max(names.length, Number(s.weatherCount||0));
    return `<section class="main-message alert-panel">
      <div class="state-banner"><span class="state-icon">${s.icon}</span><span>${esc(w.label||s.label)} 発表中</span></div>
      <div class="weather-primary">
        <div class="warning-name">${esc(w.warning||'気象警報・注意報')}</div>
        <div class="level-caption">レベル${w.level||s.level}　${esc(w.label||s.label)}</div>
        <div class="main-description">${esc(w.message||s.message)}</div>
      </div>
      ${names.length>1?`<div class="weather-list"><div class="weather-list-title">発表中の気象情報</div>${names.map((n,i)=>`<div class="weather-list-row"><span>${i===0?'●':'○'}</span><strong>${esc(n)}</strong></div>`).join('')}${total>names.length?`<div class="weather-list-more">ほか${total-names.length}件の気象情報があります</div>`:''}</div>`:''}
      ${w.updatedAt?`<div class="info-updated">発表・更新日時：${formatDate(w.updatedAt)}</div>`:''}
    </section>`;
  }

  function renderEvacuation(e){
    const active=!!e?.active, level=Number(e?.level||0);
    const label=level?`警戒レベル${level}`:'発令なし';
    if(!active){
      return `<section class="info-card compact-status is-clear"><div class="compact-row"><div class="compact-title">避難情報</div><div class="compact-value">現在、発令されていません</div></div></section>`;
    }
    const areas=Array.isArray(e?.representativeAreas)?e.representativeAreas:[];
    return `<section class="info-card evacuation-card is-active level-${level}"><div class="info-card-header"><span class="info-card-title">避難情報</span><span class="info-card-badge">${esc(label)}</span></div><div class="info-card-body"><div class="info-main-title">${esc(e?.title||'避難情報')}</div><div class="info-message">${esc(e?.message||'避難情報が発表されています。')}</div>${areas.length?`<div class="representative-label">主な対象地域</div><div class="representative-list">${areas.slice(0,3).map(x=>`<span>${esc(typeof x==='string'?x:(x.name||x.areaName||''))}</span>`).join('')}</div>`:''}${e?.updatedAt?`<div class="info-updated">発令・更新日時：${formatDate(e.updatedAt)}</div>`:''}<div class="info-source">情報提供：千葉県防災ポータルサイト</div></div></section>`;
  }

  function renderEvacuationMain(e){
    const level=Number(e?.level||0);
    const cls=level>=5?'emergency':level===4?'danger':'warning';
    const areas=Array.isArray(e?.representativeAreas)?e.representativeAreas:[];
    return `<section class="main-message evacuation-main-panel ${cls}">
      <div class="evacuation-main-banner"><span class="state-icon">!</span><span>警戒レベル${level} ${esc(e?.title||'避難情報')}</span></div>
      <div class="warning-name">${esc(e?.title||'避難情報')}</div>
      <div class="level-caption">${esc(e?.message||'避難情報が発表されています。')}</div>
      ${areas.length?`<div class="evacuation-targets"><div class="weather-list-title">主な対象地域</div>${areas.slice(0,3).map(x=>`<div class="weather-list-row"><span>●</span><strong>${esc(typeof x==='string'?x:(x.name||x.areaName||''))}</strong></div>`).join('')}</div>`:''}
      ${e?.updatedAt?`<div class="info-updated">発令・更新日時：${formatDate(e.updatedAt)}</div>`:''}
      <div class="info-source">情報提供：千葉県防災ポータルサイト</div>
    </section>`;
  }

  function renderShelters(s){
    const active=!!s?.active, list=Array.isArray(s?.shelters)?s.shelters:[];
    const rows=list.slice(0,3).map(x=>`<div class="shelter-row"><div class="shelter-name">${esc(x.name||x.facilityName||'避難所')}</div></div>`).join('');
    if(!active){
      return `<section class="info-card compact-status is-clear"><div class="compact-row"><div class="compact-title">避難所</div><div class="compact-value">現在、開設されていません</div></div></section>`;
    }
    const qrUrl=s?.sourceUrl||'https://www.bousai.pref.chiba.lg.jp/';
    return `<section class="info-card shelter-card is-active">
      <div class="info-card-header"><span class="info-card-title">避難所</span><span class="info-card-badge">${Number(s?.count??list.length)}か所開設中</span></div>
      <div class="info-card-body shelter-body">
        <div class="shelter-main">
          ${rows?`<div class="representative-label">主な開設避難所（代表3か所）</div><div class="shelter-list">${rows}</div>`:''}
          ${Number(s?.count??list.length)>3?`<div class="shelter-more">ほか${Number(s.count)-3}か所の開設情報があります</div>`:''}
        </div>
        <a class="shelter-qr" href="${esc(qrUrl)}" target="_blank" rel="noopener" aria-label="最新の避難所情報をQRコードで確認">
          <img src="images/qr_shelter.png" alt="避難所情報QRコード">
          <span>最新の避難所情報・所在地</span><small>スマートフォンで確認</small>
        </a>
      </div>
      <div class="info-source">情報提供：千葉県防災ポータルサイト</div>
    </section>`;
  }

  function renderChibaInfo(){
    if(!chibaLatest || chibaLatest.ok===false)return '';
    return `<div class="municipal-section">${renderEvacuation(chibaLatest.evacuation)}${renderShelters(chibaLatest.shelters)}</div>`;
  }

  // 近隣鉄道の公式運行情報へのQR誘導（運行情報そのものは各社公式ページで確認）
  const railwayLinks = [
    {name:'JR東日本', short:'JR東日本', url:'https://traininfo.jreast.co.jp/train_info/', qr:'images/qr_jreast.png'},
    {name:'京成電鉄', short:'京成電鉄', url:'https://www.keisei.co.jp/', qr:'images/qr_keisei.png'},
    {name:'東武鉄道', short:'東武鉄道', url:'https://www.tobu.co.jp/railway/', qr:'images/qr_tobu.png'},
    {name:'東京メトロ', short:'東京メトロ', url:'https://www.tokyometro.jp/index.html', qr:'images/qr_tokyometro.png'}
  ];

  function renderRailway(){
    return `<section class="railway-section">
      <div class="railway-header">
        <div class="railway-title">鉄道運行情報</div>
        <div class="railway-note">各社公式ページで最新の運行状況を確認</div>
      </div>
      <div class="railway-grid">
        ${railwayLinks.map(r=>`<a class="railway-card" href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="${esc(r.name)}の公式運行情報を確認">
          <div class="railway-card-name">${esc(r.short)}</div>
          <img src="${esc(r.qr)}" alt="${esc(r.name)} 公式運行情報QRコード">
          <div class="railway-card-caption">公式運行情報を確認</div>
        </a>`).join('')}
      </div>
    </section>`;
  }

  function renderMeta(data){
    return `<section class="meta-card"><div class="meta-row"><span class="meta-label">気象情報</span><span>気象庁 警報・注意報データ</span></div><div class="meta-row"><span class="meta-label">自治体情報</span><span>千葉県防災ポータルサイト</span></div><div class="meta-row"><span class="meta-label">対象地域</span><span>千葉県船橋市</span></div>${data?.checkedAt?`<div class="meta-row source-row"><span class="meta-label">最終取得</span><span>${formatDate(data.checkedAt)}</span></div>`:''}</section>`;
  }

  function render(state,data=null){
    const evac=chibaLatest?.evacuation;
    const evacuationActive=!!evac?.active && Number(evac?.level||0)>=3;
    const viewState=(data && data.level)?{...state,weather:data,weatherNames:Array.isArray(data.weatherNames)?data.weatherNames:[]}:state;
    document.body.className=evacuationActive ? (Number(evac.level)>=5?'emergency':Number(evac.level)===4?'danger':'warning') : viewState.cls;

    // 複数情報が同時発令された場合も、気象・避難・避難所を同一画面に収める。
    // 避難情報は最上位表示、気象情報はその直下に配置する。
    const mainHtml=evacuationActive
      ? `${renderEvacuationMain(evac)}${viewState.level===0?renderNormal({...viewState,title:'気象情報',message:'現在、発表警報・注意報はありません。'}):renderAlert(viewState)}`
      : (viewState.level===0?renderNormal(viewState):renderAlert(viewState));

    app.innerHTML=`<div class="screen-shell">${renderHeader()}<div class="screen-content">${mainHtml}${renderChibaInfo()}${renderRailway()}${renderMeta(data)}</div></div>`;
    requestAnimationFrame(fitLayout);
  }

  function fitLayout(){
    const content=document.querySelector('.screen-content');
    if(!content)return;

    const classes=['fit-compact-1','fit-compact-2','fit-compact-3','fit-critical'];
    content.classList.remove(...classes);

    // 画面高さに対して内容が収まるまで、段階的に圧縮する。
    for(const cls of classes){
      if(content.scrollHeight <= content.clientHeight + 2) break;
      content.classList.add(cls);
    }

    // 最終段階でも余裕がない場合は、補助的な「発令なし」カードだけを省略する。
    if(content.scrollHeight > content.clientHeight + 2){
      content.classList.add('fit-critical');
      content.classList.add('fit-hide-clear');
    }
  }

  function renderError(message){
    latest={ok:false}; document.body.className='error';
    app.innerHTML=`<div class="screen-shell">${renderHeader()}<div class="screen-content"><section class="main-message error-panel"><div class="main-icon">!</div><div class="main-title">防災情報を取得できません</div><div class="main-description">${esc(message||'APIとの通信に失敗しました。')}</div><div class="retry-note">自動的に再取得します</div></section>${renderChibaInfo()}<section class="meta-card"><div class="meta-row"><span class="meta-label">対象地域</span><strong>千葉県船橋市</strong></div></section></div></div>`;
    requestAnimationFrame(fitLayout);
  }

  function applyWeather(data){
    latest=data;
    const alerts=getWeatherAlerts(data);
    const weather=weatherDisplay(alerts[0]||null);
    currentLevel=weather?.level||0;
    render(states[currentLevel]||states[0],weather?{...weather,weatherNames:weatherNames(alerts),weatherCount:alerts.length,checkedAt:data.checkedAt}:{checkedAt:data.checkedAt});
  }

  async function fetchStatus(){
    try{
      const res=await fetch(`${CONFIG.API_BASE_URL}/api/status?ts=${Date.now()}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();
      applyWeather(data);
    }catch(e){renderError(e.message);}
  }

  async function fetchChibaDisaster(){
    try{
      // 既存の /api/chiba-disaster は避難所連携を含むため維持。
      // 避難情報専用 /api/evacuation もWorker側に追加済みだが、画面では
      // 既存レスポンスを利用して余計な通信を増やさない。
      const res=await fetch(`${CONFIG.API_BASE_URL}/api/chiba-disaster?ts=${Date.now()}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      chibaLatest=await res.json();
      if(latest)applyWeather(latest);
    }catch(e){
      chibaLatest={ok:false,error:e.message};
      if(latest)applyWeather(latest);
    }
  }

  function startClock(){
    clearInterval(clockTimer);
    clockTimer=setInterval(()=>{const el=document.getElementById('clock');if(el)el.textContent=nowText();},1000);
  }

  function demoChiba(){
    const shelterDemo=params.get('shelter')==='1';
    const evac=Number(params.get('evacuation')||0);
    const evacuationMap={
      3:{active:true,level:3,title:'高齢者等避難',message:'警戒レベル3　高齢者等避難が発令されています。危険な場所にいる高齢者等は避難を開始してください。',updatedAt:new Date().toISOString(),representativeAreas:[{name:'船橋市内 対象地域'}]},
      4:{active:true,level:4,title:'避難指示',message:'警戒レベル4　避難指示が発令されています。危険な場所から全員避難してください。',updatedAt:new Date().toISOString(),representativeAreas:[{name:'船橋市内 対象地域'}]},
      5:{active:true,level:5,title:'緊急安全確保',message:'警戒レベル5　緊急安全確保が発令されています。命を守るための最善の行動をとってください。',updatedAt:new Date().toISOString(),representativeAreas:[{name:'船橋市内 対象地域'}]}
    };
    const evacuation=evacuationMap[evac]||{active:false,level:0,title:'避難情報',message:'現在、船橋市から発表されている避難情報はありません。'};
    return {ok:true,evacuation,shelters:shelterDemo?{active:true,count:5,shelters:[{name:'船橋市立船橋小学校'},{name:'船橋市立海神小学校'},{name:'船橋市立湊中学校'},{name:'船橋市立宮本小学校'},{name:'船橋市立西海神小学校'}],sourceUrl:'https://www.bousai.pref.chiba.lg.jp/'}:{active:false,count:0,shelters:[],message:'現在、船橋市で開設中の避難所はありません.'}};
  }

  function demoWeather(level){
    const n=Number(level);
    if(![2,3,4,5].includes(n))return null;
    const defaults={2:['雷注意報'],3:['大雨警報','雷注意報'],4:['大雨警報','洪水警報'],5:['大雨特別警報']};
    const names=(params.get('weather')||'').split(',').map(x=>x.trim()).filter(Boolean);
    const list=names.length?names:defaults[n];
    const label={2:'注意報',3:'警報',4:'危険警報',5:'特別警報'}[n];
    return {level:n,label,warning:list[0],title:list[0],message:`${list[0]}が発表されています。今後の気象情報と自治体からの避難情報を確認してください。`,updatedAt:new Date().toISOString(),weatherNames:list,weatherCount:list.length};
  }

  window.addEventListener('resize',()=>requestAnimationFrame(fitLayout));
  window.addEventListener('orientationchange',()=>setTimeout(fitLayout,150));

  function init(){
    startClock();
    if(TEST_MODE||DIRECT_DEMO){
      chibaLatest=demoChiba();
      const n=Number(params.get('level'));
      currentLevel=[0,2,3,4,5].includes(n)?n:0;
      const demoWeatherData=demoWeather(currentLevel);
      render(states[currentLevel],demoWeatherData?{...demoWeatherData,checkedAt:new Date().toISOString()}:{ok:true,checkedAt:new Date().toISOString()});
      return;
    }
    fetchStatus(); fetchChibaDisaster();
    clearInterval(timer);
    timer=setInterval(()=>{fetchStatus();fetchChibaDisaster();},CONFIG.REFRESH_MS||30000);
  }
  init();
})();
