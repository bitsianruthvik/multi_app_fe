(function(){
'use strict';
/* ============ utilities ============ */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clone=o=>JSON.parse(JSON.stringify(o||{}));
const localISO=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const todayISO=()=>localISO(new Date());
const nowISO=()=>new Date().toISOString();
const addDays=(iso,n)=>{const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return localISO(d)};
const daysSince=iso=>iso?Math.round((Date.parse(todayISO()+'T00:00:00')-Date.parse(String(iso).slice(0,10)+'T00:00:00'))/864e5):null;
const fmtDate=iso=>{if(!iso)return '';const d=new Date(String(iso).slice(0,10)+'T00:00:00');if(isNaN(d))return esc(iso);return d.toLocaleDateString('en-IN',String(iso).startsWith('1900-')?{day:'numeric',month:'short'}:{day:'numeric',month:'short',year:'numeric'})};
const fmtDM=iso=>{if(!iso)return '';const d=new Date(String(iso).slice(0,10)+'T00:00:00');if(isNaN(d))return '';return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})};
const num=v=>{if(v==null||v==='')return 0;const s=String(v).replace(/[₹,\s]/g,'').toLowerCase();let m=1,t=s;
  if(/(cr|crore)$/.test(t)){m=1e7;t=t.replace(/(crores?|cr)$/,'')}else if(/(l|lakh|lakhs|lac|lacs)$/.test(t)){m=1e5;t=t.replace(/(lakhs?|lacs?|l)$/,'')}else if(/k$/.test(t)){m=1e3;t=t.slice(0,-1)}
  const n=parseFloat(t);return isNaN(n)?0:Math.round(n*m)};
const inr=n=>{n=Number(n)||0;const a=Math.abs(n);
  if(a>=1e5){const l=n/1e5;return '₹'+l.toLocaleString('en-IN',{maximumFractionDigits:a>=1e7?0:2})+' L'}
  return '₹'+n.toLocaleString('en-IN')};
const inrFull=n=>'₹'+(Number(n)||0).toLocaleString('en-IN');
const normPhone=s=>{let d=String(s||'').replace(/\D/g,'');if(d.length>10&&d.startsWith('91'))d=d.slice(2);if(d.length===11&&d.startsWith('0'))d=d.slice(1);return d};
const normEmail=s=>String(s||'').trim().toLowerCase();
const normName=s=>String(s||'').toLowerCase().replace(/\b(mr|mrs|ms|dr|shri|sri|smt|late)\b\.?/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const initials=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
const firstName=n=>String(n||'').trim().split(/\s+/)[0]||'';
const uniq=a=>Array.from(new Set(a.filter(x=>x!=null&&x!=='')));
const splitList=s=>uniq(String(s||'').split(/[,;|\n]/).map(x=>x.trim()));
const plural=(n,w,p)=>n+' '+(n===1?w:(p||w+'s'));
const debounce=(f,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ============ platform bridge (cf_crm) ============ */
// This page runs inside the platform page /:company/cf_crm (an iframe on the same
// origin). That page hands over the API host, the company and the sign-in token
// as window.__CF_CRM_ENV__ and does sign-out. Opened on its own, it goes there.
const ENV=(()=>{try{if(window.parent!==window&&window.parent.__CF_CRM_ENV__)return window.parent.__CF_CRM_ENV__}catch(e){}return null})();
if(!ENV){if(window.top===window)location.replace('/');else document.addEventListener('DOMContentLoaded',()=>{const v=document.getElementById('view');if(v)v.innerHTML='<div class="empty"><b>Could not open the app.</b> Reload the page.</div>'});throw new Error('cf_crm runs inside the platform page')}
const API_BASE=String(ENV.apiHost||'').replace(/\/+$/,'')+'/api/'+encodeURIComponent(ENV.company)+'/cf_crm';
// the app's own paths (/api/sync, /api/auth?a=me …) on this app's routes
const AUTH_ROUTES={me:'/me',password:'/password','totp-start':'/two-step/start','totp-enable':'/two-step/enable','totp-disable':'/two-step/disable','totp-verify':'/two-step/verify','end-sessions':'/sessions/end'};
function apiUrl(path){let p=String(path).replace(/^\/api\//,'/');const m=p.match(/^\/auth\?a=([a-z-]+)/);if(m&&AUTH_ROUTES[m[1]])p=AUTH_ROUTES[m[1]];return API_BASE+p}
// the server hands back a fresh token after a password change or a two-step code
function setToken(t){if(!t)return;try{ENV.setToken(t)}catch(e){}}
const authHeaders=()=>{let t='';try{t=ENV.getToken()||''}catch(e){}return t?{authorization:'Bearer '+t}:{}};
let authLostOnce=false;
// the sign-in ended: erase this device's copy of the network, then sign in again
function authLost(){if(authLostOnce)return;authLostOnce=true;const go=()=>{try{ENV.onAuthLost()}catch(e){}};let done=false;const once=()=>{if(!done){done=true;go()}};IDB.clear().then(once,once);setTimeout(once,1500)}

/* ============ icons ============ */
const I={
 group:'<rect x="3" y="9" width="7" height="12" rx="1"/><rect x="14" y="4" width="7" height="17" rx="1"/><path d="M6 13h1M6 17h1M17 8h1M17 12h1M17 16h1"/>',
 bell:'<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
 chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
 today:'<path d="M4 7h16M7 3v4m10-4v4M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M9 14l2 2 4-4"/>',
 people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.3 3.6 5.5"/>',
 companies:'<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M2 21h20M8 8h3M8 12h3M8 16h3"/>',
 pipeline:'<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
 network:'<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5l-5.5 5.5M12 11.5l5.5 5.5"/>',
 lists:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
 campaigns:'<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1Z"/><path d="M16 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
 dashboard:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
 health:'<path d="M12 21s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 6c-2.2 4.6-9.2 9-9.2 9Z"/><path d="M7 12h3l1.5-2.5L13.5 15l1.5-3H18"/>',
 import:'<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
 more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
 phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
 wa:'<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
 back:'<path d="M15 18l-6-6 6-6"/>',
 close:'<path d="M6 6l12 12M18 6 6 18"/>',
 star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
 link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 log:'<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6M9 18h3"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
 trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
 download:'<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
 merge:'<path d="M6 3v6a6 6 0 0 0 6 6h6M18 15l-3-3m3 3-3 3M6 21v-4"/>'
};
const ic=(n,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]||''}</svg>`;

/* ============ pickers: searchable dropdowns ============ */
const normOpts=opts=>opts.map(o=>typeof o==='object'?{v:String(o.v),l:String(o.l)}:{v:String(o),l:String(o)});
const azOpts=opts=>normOpts(opts).sort((a,b)=>a.l.localeCompare(b.l,'en',{sensitivity:'base'}));
// a type-to-search dropdown; the hidden input carries the name, id and data-* attributes
function combo({name='',id='',opts=[],val='',blank='Choose…',attrs='',label='',allowBlank=true}){
  const list=normOpts(opts);const cur=list.find(o=>o.v===String(val==null?'':val));
  return `<div class="combo"><input type="hidden" ${name?`name="${esc(name)}"`:''} ${id?`id="${esc(id)}"`:''} value="${esc(cur?cur.v:'')}" ${attrs}><input class="combo-in" type="text" value="${esc(cur?cur.l:'')}" placeholder="${esc(blank)}" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-expanded="false" aria-label="${esc(label||blank)}" data-blank="${allowBlank?'1':''}" data-opts="${esc(JSON.stringify(list))}"><span class="combo-caret" aria-hidden="true"></span><div class="combo-list" role="listbox" hidden></div></div>`;
}
const BIG=8;
function comboOpen(inp,q){
  const box=inp.parentElement.querySelector('.combo-list');let list=[];try{list=JSON.parse(inp.dataset.opts||'[]')}catch(e){}
  const s=String(q||'').trim().toLowerCase();
  let shown=s?list.filter(o=>o.l.toLowerCase().includes(s)).sort((a,b)=>(b.l.toLowerCase().startsWith(s))-(a.l.toLowerCase().startsWith(s))):list;
  const cur=inp.parentElement.querySelector('input[type=hidden]').value;
  const blankRow=inp.dataset.blank&&!s?`<div class="combo-o blank ${cur===''?'on':''}" data-v="" role="option">${esc(inp.placeholder)}</div>`:'';
  box.innerHTML=blankRow+(shown.length?shown.slice(0,300).map(o=>`<div class="combo-o ${o.v===cur?'on':''}" data-v="${esc(o.v)}" data-l="${esc(o.l)}" role="option">${esc(o.l)}</div>`).join(''):'<div class="combo-none">No match</div>');
  box.hidden=false;inp.setAttribute('aria-expanded','true');
  placeCombo(inp,box);
  const act=box.querySelector('.combo-o.on')||box.querySelector('.combo-o:not(.blank)')||box.querySelector('.combo-o');if(act){act.classList.add('act');if(!s)act.scrollIntoView({block:'nearest'})}
}
// the list floats above everything so scrolling containers and dialogs never clip it
function placeCombo(inp,box){
  const r=inp.getBoundingClientRect();const vv=window.visualViewport;const vh=vv?vv.height+vv.offsetTop:window.innerHeight;const vw=window.innerWidth;
  const below=vh-r.bottom-10,above=r.top-10;const up=below<180&&above>below;
  const w=Math.min(vw-16,Math.max(r.width,240));const left=Math.max(8,Math.min(r.left,vw-w-8));
  Object.assign(box.style,{position:'fixed',left:left+'px',width:w+'px',right:'auto',maxHeight:Math.max(140,Math.min(300,up?above:below))+'px',top:up?'auto':(r.bottom+4)+'px',bottom:up?(window.innerHeight-r.top+4)+'px':'auto'});
}
window.addEventListener('scroll',e=>{if(e.target&&e.target.closest&&e.target.closest('.combo-list'))return;document.querySelectorAll('.combo-list:not([hidden])').forEach(b=>{const i=b.parentElement.querySelector('.combo-in');placeCombo(i,b)})},true);
window.addEventListener('resize',()=>{document.querySelectorAll('.combo-list:not([hidden])').forEach(b=>placeCombo(b.parentElement.querySelector('.combo-in'),b))});
function comboClose(inp,restore){
  const wrap=inp.parentElement;const box=wrap.querySelector('.combo-list');box.hidden=true;inp.setAttribute('aria-expanded','false');
  if(restore){const h=wrap.querySelector('input[type=hidden]');let list=[];try{list=JSON.parse(inp.dataset.opts||'[]')}catch(e){}const cur=list.find(o=>o.v===h.value);
    if(!inp.value.trim()&&inp.dataset.blank&&h.value){comboPick(inp,'','');return}
    inp.value=cur?cur.l:''}
}
function comboPick(inp,v,l){
  const h=inp.parentElement.querySelector('input[type=hidden]');inp.value=v?l:'';comboClose(inp,false);
  if(h.value!==v){h.value=v;h.dispatchEvent(new Event('change',{bubbles:true}))}
}
document.addEventListener('focusin',e=>{const i=e.target;if(i.classList&&i.classList.contains('combo-in')){comboOpen(i,'');try{i.select()}catch(x){}}});
document.addEventListener('focusout',e=>{const i=e.target;if(i.classList&&i.classList.contains('combo-in'))setTimeout(()=>{if(document.activeElement!==i)comboClose(i,true)},120)});
document.addEventListener('input',e=>{const i=e.target;if(i.classList&&i.classList.contains('combo-in')){e.stopPropagation();comboOpen(i,i.value)}},true);
document.addEventListener('mousedown',e=>{const o=e.target.closest('.combo-o');if(!o)return;e.preventDefault();const inp=o.closest('.combo').querySelector('.combo-in');comboPick(inp,o.dataset.v,o.dataset.l||'')});
document.addEventListener('click',e=>{const c=e.target.closest('.combo-caret');if(c){const i=c.parentElement.querySelector('.combo-in');i.focus()}});
document.addEventListener('keydown',e=>{const i=e.target;if(!(i.classList&&i.classList.contains('combo-in')))return;const box=i.parentElement.querySelector('.combo-list');
  if(box.hidden&&(e.key==='ArrowDown'||e.key==='Enter')){comboOpen(i,'');e.preventDefault();return}
  const os=[...box.querySelectorAll('.combo-o')];let k=os.findIndex(o=>o.classList.contains('act'));
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(k>=0)os[k].classList.remove('act');k=e.key==='ArrowDown'?Math.min(os.length-1,k+1):Math.max(0,k-1);if(os[k]){os[k].classList.add('act');os[k].scrollIntoView({block:'nearest'})}}
  else if(e.key==='Enter'){e.preventDefault();const o=os[k]||os[0];if(o)comboPick(i,o.dataset.v,o.dataset.l||'')}
  else if(e.key==='Escape'){e.stopPropagation();comboClose(i,true)}
  else if(e.key==='Tab'){const o=os[k];if(o&&i.value.trim()&&!box.hidden)comboPick(i,o.dataset.v,o.dataset.l||'')}
},true);

/* ============ list editors: one box per option ============ */
function leRow(name,v,ph,extra){return `<div class="le-row"><span class="grip" title="Drag to reorder" aria-hidden="true">⠿</span><span class="le-n"></span><input name="${esc(name)}" value="${esc(v||'')}" placeholder="${esc(ph||'')}" aria-label="${esc(ph||'Option')}">${extra?extra(v):''}<button type="button" class="iconbtn" data-a="leUp" aria-label="Move up">↑</button><button type="button" class="iconbtn" data-a="leDown" aria-label="Move down">↓</button><button type="button" class="iconbtn" data-a="leDel" aria-label="Remove">${ic('close')}</button></div>`}
function listEd(name,items,o={}){
  const rows=(items&&items.length?items:['']).map(v=>leRow(name,v,o.ph,o.orig?(x=>`<input type="hidden" name="${esc(name)}Orig" value="${esc(x||'')}">`):null)).join('');
  return `<div class="le" data-name="${esc(name)}" data-ph="${esc(o.ph||'')}">${rows}<div class="le-actions"><button type="button" class="btn sm" data-a="leAdd">${ic('plus')}Add</button>${o.sort===false?'':'<button type="button" class="btn sm ghost" data-a="leSort">Sort A–Z</button>'}<span class="small muted">${o.hint||'One option per box.'}</span></div></div>`;
}
function indEd(inds){
  const row=i=>`<div class="le-row ind"><span class="grip" title="Drag to reorder" aria-hidden="true">⠿</span><span class="le-n"></span><input name="indName" value="${esc(i.name||'')}" placeholder="Industry" aria-label="Industry"><input name="indSubs" value="${esc((i.subs||[]).join(', '))}" placeholder="Sub-industries, separated by commas" aria-label="Sub-industries"><button type="button" class="iconbtn" data-a="leUp" aria-label="Move up">↑</button><button type="button" class="iconbtn" data-a="leDown" aria-label="Move down">↓</button><button type="button" class="iconbtn" data-a="leDel" aria-label="Remove">${ic('close')}</button></div>`;
  return `<div class="le" data-ind="1">${(inds.length?inds:[{name:''}]).map(row).join('')}<div class="le-actions"><button type="button" class="btn sm" data-a="leAdd">${ic('plus')}Add industry</button><button type="button" class="btn sm ghost" data-a="leSort">Sort A–Z</button><span class="small muted">Sub-industries are separated by commas.</span></div></div>`;
}
const leVals=(fd,name)=>uniq(fd.getAll(name).map(v=>String(v).trim()).filter(Boolean));

/* ============ reference data ============ */
const DEFAULT_CONFIG={
  owners:['Owner 1','Owner 2','Owner 3'],
  industries:[
    {name:'Pharma & Life Sciences',subs:['API / Bulk drugs','Formulations','CRO / CDMO','Medical devices','Distribution']},
    {name:'IT & ITES',subs:['Software services','Product','BPO / KPO','Hardware']},
    {name:'Real Estate & Construction',subs:['Developer','Contractor','Building materials','Interiors']},
    {name:'Infrastructure & Engineering',subs:['EPC','Power','Roads']},
    {name:'Manufacturing',subs:['Engineering','Plastics & Packaging','Chemicals','Food processing','Steel & Metals']},
    {name:'Textiles & Apparel',subs:[]},
    {name:'Jewellery & Bullion',subs:[]},
    {name:'Trading & Distribution',subs:['FMCG distribution','Wholesale','Import / Export']},
    {name:'Hospitality & Restaurants',subs:['Hotels','Restaurants','Events']},
    {name:'Healthcare & Hospitals',subs:['Hospitals','Diagnostics','Clinics','Doctors']},
    {name:'Education',subs:['Schools','Colleges','Coaching']},
    {name:'Agriculture & Agri-business',subs:['Seeds','Poultry','Rice mills','Cold storage']},
    {name:'Automobile & Dealerships',subs:[]},
    {name:'Retail',subs:[]},
    {name:'Logistics & Transport',subs:[]},
    {name:'Financial Services',subs:['Banking','NBFC','Insurance','Stock broking']},
    {name:'Media & Entertainment',subs:['Film','Advertising']},
    {name:'Professional Services',subs:['Chartered Accountants','Legal','Consulting','Architects']},
    {name:'Government / PSU',subs:[]},
    {name:'Salaried / Professional',subs:[]},
    {name:'Other',subs:[]}
  ],
  regions:['Jubilee Hills','Banjara Hills','Film Nagar','Madhapur','HITEC City','Gachibowli','Kondapur','Kokapet','Financial District','Manikonda','Narsingi','Kukatpally','Miyapur','Ameerpet','Begumpet','Somajiguda','Punjagutta','Khairatabad','Himayatnagar','Abids','Koti','Secunderabad','Sainikpuri','Bowenpally','Malkajgiri','Uppal','Dilsukhnagar','LB Nagar','Shamshabad','Old City','Other Hyderabad','Other Telangana','Andhra Pradesh','Other India','NRI / Overseas'],
  sources:['Family network','Existing customer referral','Walk-in','Phone contacts import','Chit subscriber master','Real estate list','Campaign','Event','Website','Other'],
  senders:{whatsapp:['Official WhatsApp Business number'],email:[]},
  crossSellThreshold:1000000,
  projects:[],
  branches:[]
};
const GRADES=['Platinum','Gold','Silver'];
const PERM_LIST=[['all','Sees every record','Otherwise only people and leads assigned to their owner name'],['write','Adds and edits records',''],['delete','Deletes people, companies, groups and blacklist entries',''],['export','Exports data to Excel',''],['campaigns','Sees and builds campaigns',''],['send','Marks campaigns as sent',''],['settings','Manages setup, team and roles','Full owner powers in Setup']];
const BUILTIN_ROLES={
  admin:{label:'Owner / Admin',perms:{all:true,write:true,delete:true,export:true,campaigns:true,send:true,settings:true}},
  manager:{label:'Manager',perms:{all:false,write:true,delete:false,export:false,campaigns:true,send:false,settings:false}},
  entry:{label:'Data entry',perms:{all:true,write:true,delete:false,export:false,campaigns:false,send:false,settings:false}},
  readonly:{label:'Read-only',perms:{all:true,write:false,delete:false,export:false,campaigns:true,send:false,settings:false}}
};
function roleList(){
  const cfg=(S&&S.config&&S.config.roles)||[];
  const out=Object.entries(BUILTIN_ROLES).map(([id,r])=>{const c=cfg.find(x=>x.id===id);return {id,label:(c&&c.name)||r.label,perms:id==='admin'?Object.assign({},r.perms):Object.assign({},r.perms,(c&&c.perms)||{}),builtin:true}});
  cfg.filter(c=>c&&!BUILTIN_ROLES[c.id]).forEach(c=>out.push({id:c.id,label:c.name,perms:Object.assign({all:true,write:false,delete:false,export:false,campaigns:false,send:false,settings:false},c.perms||{}),builtin:false,desc:c.desc||''}));
  return out;
}
const roleOf=id=>roleList().find(r=>r.id===id)||roleList().find(r=>r.id==='readonly');
const clientRole=r=>({id:r.id,label:r.label,write:!!r.perms.write,del:!!r.perms.delete,exp:!!r.perms.export,camp:!!r.perms.campaigns,send:!!r.perms.send,dash:true,all:!!r.perms.all,settings:!!r.perms.settings});
const ROLES=new Proxy({},{get:(t,k)=>typeof k==='string'?clientRole(roleOf(k)):undefined});
const roleOpts=()=>roleList().map(r=>({v:r.id,l:r.label}));
const RE_STAGES=['Enquiry','Site visit','Booked','Registered'];
/* ---- my businesses, lead stages and custom fields (all editable in Setup) ---- */
const DEFAULT_BUSINESSES=[{id:'chit',name:'Chit Fund'},{id:'re',name:'Real Estate'}];
const mkStages=(list)=>list.map(([name,kind])=>({id:slug(name),name,kind:kind||'open'}));
const DEFAULT_STAGES={
  chit:mkStages([['New'],['Contacted'],['Meeting'],['Documentation'],['Enrolled','won'],['Lost','lost']]),
  re:mkStages([['Enquiry'],['Site visit'],['Negotiation'],['Booked'],['Registered','won'],['Lost','lost']]),
  _default:mkStages([['New'],['Contacted'],['Meeting'],['Proposal'],['Negotiation'],['Won','won'],['Lost','lost']])
};
const FIELD_TYPES={text:'Text',textarea:'Long text',number:'Number',dropdown:'Dropdown',multi:'Multi-select',date:'Date',checkbox:'Yes / No',phone:'Phone',email:'Email',url:'Link'};
const BL_KINDS={phone:'Phone number',gst:'GST number',company:'Company',person:'Person',email:'Email'};
function slug(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||newId()}
const businesses=()=>(S.config.businesses&&S.config.businesses.length)?S.config.businesses:DEFAULT_BUSINESSES;
const bizName=id=>(businesses().find(b=>b.id===id)||{}).name||'';
const stagesFor=bid=>(S.config.stages&&S.config.stages[bid]&&S.config.stages[bid].length)?S.config.stages[bid]:(DEFAULT_STAGES[bid]||DEFAULT_STAGES._default);
const leadBiz=l=>l.business||l.line||businesses()[0].id;
function stageOf(l){const st=stagesFor(leadBiz(l));const v=String(l.stage||'').toLowerCase();return st.find(s=>s.id===l.stage)||st.find(s=>s.name.toLowerCase()===v)||st.find(s=>s.id===slug(v))||st[0]}
const stageIdx=l=>stagesFor(leadBiz(l)).indexOf(stageOf(l));
const isWon=l=>stageOf(l).kind==='won';
const isLost=l=>stageOf(l).kind==='lost';
const openLead=l=>!isWon(l)&&!isLost(l);
const customFields=ent=>((S.config.customFields||{})[ent]||[]);
const leadTitle=l=>{const x=l.personId&&P(l.personId);const c=l.companyId&&D.companies.get(l.companyId);return x?x.p.name:(c?c.name:'Untitled lead')};
const groupName=id=>(D.groups.get(id)||{}).name||'';
const normGST=s=>String(s||'').toUpperCase().replace(/[^0-9A-Z]/g,'');
const CHIT_STATUS=['Active','Completed','Closed'];
const INT_TYPES=['Call','WhatsApp','Meeting','Visit','Email'];
const ROLES_AT_CO=['Owner','Partner','Director','CFO','Employee','Other'];
const TURNOVER=['< ₹5 Cr','₹5–25 Cr','₹25–100 Cr','₹100–500 Cr','> ₹500 Cr'];
const EMPLOYEES=['< 20','20–100','100–500','500–2,000','> 2,000'];
const coRoles=()=>(S.config.coRoles&&S.config.coRoles.length)?S.config.coRoles:ROLES_AT_CO;
const turnovers=()=>(S.config.turnover&&S.config.turnover.length)?S.config.turnover:TURNOVER;
const empBands=()=>(S.config.employees&&S.config.employees.length)?S.config.employees:EMPLOYEES;
const regionsAZ=()=>S.config.regions.slice().sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
const industryNames=()=>S.config.industries.map(i=>i.name).sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
const subIndustries=()=>uniq(S.config.industries.flatMap(i=>i.subs||[])).sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
const RESULT_STATUS=['sent','delivered','read','replied','clicked','opted out','lead'];

/* ============ state ============ */
const TYPES=['people','companies','chits','re','leads','interactions','campaigns','lists','groups','blacklist','comments','docs'];
const D={};TYPES.forEach(k=>D[k]=new Map());
const S={
  config:clone(DEFAULT_CONFIG),users:null,auditRows:null,
  me:{id:null,email:'',name:'',owner:'',role:'readonly',totpEnabled:false},
  route:{v:'home'},routeStack:[],
  ui:{pq:'',pf:{},sel:new Set(),plimit:100,pipeLine:'chit',pipeOwner:'',cq:'',todayAll:false},
  ready:false,authed:false,loading:false,loadedCount:0,cursor:null,offline:false
};
const X={p:new Map(),co:new Map(),g:new Map(),dups:[],bl:null,comments:new Map()};

/* per-device conveniences */
const LSP='crm:'+ENV.company+':';
const LS={get(k,d){try{const v=localStorage.getItem(LSP+k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(LSP+k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(LSP+k)}catch(e){}}};
let favs=new Set(LS.get('favs',[])),recents=LS.get('recents',[]);
const toggleFav=id=>{favs.has(id)?favs.delete(id):favs.add(id);LS.set('favs',[...favs])};
const pushRecent=id=>{recents=[id,...recents.filter(x=>x!==id)].slice(0,12);LS.set('recents',recents)};

/* local copy of the data, so the app opens instantly and works offline */
const IDB={db:null,
  open(){return new Promise((res,rej)=>{const r=indexedDB.open('cf-crm-'+ENV.company,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})},
  async tx(mode,fn){try{const db=this.db||(this.db=await this.open());return await new Promise((res,rej)=>{const t=db.transaction('kv',mode);const st=t.objectStore('kv');const r=fn(st);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)})}catch(e){console.warn('local copy',e);return null}},
  get(k){return this.tx('readonly',s=>s.get(k))},set(k,v){return this.tx('readwrite',s=>s.put(v,k))},clear(){return this.tx('readwrite',s=>s.clear())}
};
// Owners decide in Setup → General whether a device may keep a copy of the network
// for offline use (default: nobody). Where it may not, any copy is erased.
const deviceCopyAllowed=()=>{const p=(S.config&&S.config.deviceCopy)||'off';return p==='all'||(p==='owners'&&!!R().settings)};
const saveSnapshot=debounce(()=>{if(!S.authed||!S.cursor)return;if(!deviceCopyAllowed()){IDB.clear();return}const data={};TYPES.forEach(t=>data[t]=[...D[t].values()]);IDB.set('snap',{v:3,me:S.me,cursor:S.cursor,config:S.config,brand:S.brand,customer:S.customer,data,at:nowISO()})},2500);

/* ============ permissions ============ */
const R=()=>{const r=clientRole(roleOf(S.me.role));if(S.me.role==='admin')return r;const p=S.me.perms||{};if(typeof p.export==='boolean')r.exp=p.export;if(typeof p.campaigns==='boolean')r.camp=p.campaigns;if(typeof p.send==='boolean')r.send=p.send;return r};
const canWrite=()=>R().write;
function visible(p){
  if(!p)return false;
  if(p.private&&p.ownerInCharge&&p.ownerInCharge!==S.me.owner)return false;
  if(!R().all&&(p.ownerInCharge||'')!==S.me.owner)return false;
  return true;
}

/* ============ server ============ */
async function api(path,{method='GET',body}={}){
  let r;
  try{r=await fetch(apiUrl(path),{method,headers:Object.assign(body?{'content-type':'application/json'}:{},authHeaders()),body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store'})}
  catch(e){const err=new Error('You are offline.');err.code='offline';throw err}
  let j={};try{j=await r.json()}catch(e){}
  // the platform's sign-in has ended (or the token is not valid): sign in again there
  if(r.status===401||(r.status===403&&/token/i.test(j.message||''))){S.authed=false;authLost();const err=new Error('Your session ended. Please sign in again.');err.status=401;throw err}
  // a two-step code or a new password is needed before anything else (e.g. an owner reset it): start over at those steps
  if(r.status===403&&(j.code==='TWO_STEP'||j.code==='PASSWORD_CHANGE')&&S.authed&&!apiUrl(path).endsWith('/me')){S.authed=false;setTimeout(()=>location.reload(),50);const err=new Error(j.error||'Please sign in again.');err.status=401;err.code='gate';throw err}
  if(!r.ok){const err=new Error(j.error||j.message||('Request failed ('+r.status+')'));err.status=r.status;throw err}
  return j;
}
function setOffline(b){
  S.offline=b;const el=$('#banner');if(!el)return;
  if(b){el.hidden=false;el.textContent=`You're offline. Changes are kept on this device${Q.size?` (${Q.size} waiting)`:''} and will sync when the connection is back.`}
  else if(el.dataset.kind!=='load'){el.hidden=true}
}

/* write queue: every change is applied on screen at once, kept on this device, and sent in batches */
const Q=new Map();
(LS.get('queue',[])||[]).forEach(o=>Q.set(o.t+'/'+o.i,o));
const saveQ=()=>LS.set('queue',[...Q.values()]);
let flushing=null,flushTimer=null;
const flushWaiters=[];
// a second edit before the first was sent keeps the FIRST edit's base revision
function enqueueOp(op){const k=op.t+'/'+op.i;const prev=Q.get(k);if(prev&&prev.b!==undefined)op.b=prev.b;Q.delete(k);Q.set(k,op);saveQ();clearTimeout(flushTimer);flushTimer=setTimeout(flush,250)}
// the revision an edit is based on: the one the edited copy came from (0 = new)
function baseRev(type,rec){if(typeof rec._rev==='number')return rec._rev;const cur=D[type].get(rec.id);if(!cur)return 0;return typeof cur._rev==='number'?cur._rev:undefined}
const rejectMsg=w=>({conflict:'Someone else changed that record while you were deleting it, so it was kept. Look at it again.',gone:'Someone else deleted that record, so your change could not be saved.',scope:'That person is assigned to another owner, so the change was not saved.',private:'That person is private to another owner.',delete:'Only owners can delete people and companies.',campaigns:'Your role cannot change campaigns.',send:'Only owners can mark a campaign as sent.',mobile:'That mobile number already belongs to another person. Only an admin can give it to someone else.',business:'You do not have access to that business.'}[w]||'A change was not allowed and has been undone.');
function flush(){
  if(flushing)return flushing;
  flushing=(async()=>{
    while(Q.size&&S.authed){
      const all=[...Q.values()];let size=0,n=0;
      for(const o of all){size+=JSON.stringify(o).length;if(n>0&&(size>2.5e6||n>=400))break;n++}
      const batch=all.slice(0,n);const note=(batch.find(o=>o.note)||{}).note||'';
      try{
        const res=await api('/api/records',{method:'POST',body:{ops:batch.map(o=>o.x?{t:o.t,i:o.i,x:1,b:o.b}:{t:o.t,i:o.i,d:o.d,b:o.b}),note,quiet:batch.every(o=>o.quiet)}});
        batch.forEach(o=>{const k=o.t+'/'+o.i;if(Q.get(k)===o)Q.delete(k)});
        // the server's new revision; a newer edit still waiting is now based on it
        (res.revs||[]).forEach(v=>{const k=v.t+'/'+v.i;const w=Q.get(k);if(w)w.b=v.r;const rec=D[v.t]&&D[v.t].get(v.i);if(rec)rec._rev=v.r});
        // saved over someone else's changes: show the merged record, and say so
        (res.merged||[]).forEach(m=>{if(!D[m.t]||Q.has(m.t+'/'+m.i))return;m.d._rev=m.r;D[m.t].set(m.i,m.d);const nm=m.d.name||(m.t==='leads'?leadTitle(m.d):'')||'A record';
          toast(m.clash&&m.clash.length?`${nm} was also changed by someone else. Both sets of changes were kept; for ${m.clash.slice(0,3).join(', ')} your value was used (theirs is in the history).`:`${nm} was also changed by someone else. Both sets of changes were kept.`)});
        if((res.merged||[]).length)scheduleDerive();
        saveQ();if(S.offline)setOffline(false);
        if(res.rejected&&res.rejected.length){const first=res.rejected[0];const op=batch.find(o=>o.t===first.t&&o.i===first.i);const nm=(op&&op.d&&(op.d.name||op.d.title||(first.t==='leads'?leadTitle(op.d):'')))||'';
          toast((res.rejected.length>1?`${res.rejected.length} changes were not saved and have been undone. `:`Not saved${nm?': '+nm:''}. `)+rejectMsg(first.why),9000);setTimeout(()=>pull(true),300)}
      }catch(e){
        if(e.code==='offline'||e.status>=500||e.status===401||e.code==='gate'){setOffline(e.code==='offline'||e.status>=500);setTimeout(flush,15000);return}
        batch.forEach(o=>{const k=o.t+'/'+o.i;if(Q.get(k)===o)Q.delete(k)});saveQ();toast(e.message);setTimeout(()=>pull(true),300);
      }
    }
  })().finally(()=>{flushing=null;saveSnapshot()});
  return flushing;
}
async function put(type,rec,opts={}){
  rec=clone(rec);
  if(!rec.id)rec.id=newId();
  const why=writeProblem(type,rec,false);if(why)refuse(why);
  if(!D[type].has(rec.id)&&!rec.createdAt){rec.createdAt=nowISO();rec.createdBy=S.me.id||''}
  rec.updatedAt=nowISO();rec.updatedBy=S.me.id||'';
  const b=baseRev(type,rec);
  D[type].set(rec.id,rec);scheduleDerive();
  enqueueOp({t:type,i:rec.id,d:rec,b,note:opts.note||'',quiet:opts.audit===false});
  return rec;
}
async function putMany(type,recs,note){
  const bad=[];recs=recs.filter(r=>{const w=writeProblem(type,Object.assign({id:r.id||''},r),false);if(w)bad.push(w);return !w});
  if(bad.length)toast(`${plural(bad.length,'record')} not saved: ${bad[0]}`);
  recs.forEach((rec,n)=>{rec=clone(rec);if(!rec.id)rec.id=newId();if(!D[type].has(rec.id)&&!rec.createdAt){rec.createdAt=nowISO();rec.createdBy=S.me.id||''}rec.updatedAt=nowISO();rec.updatedBy=S.me.id||'';
    const b=baseRev(type,rec);D[type].set(rec.id,rec);enqueueOp({t:type,i:rec.id,d:rec,b,note:note||''})});
  scheduleDerive();clearTimeout(flushTimer);await flush();
}
// The server's rules, checked here first: a change the server would refuse is
// not shown as saved. The server still checks everything (it also knows about
// people this login cannot see); what it refuses is named in the message.
const CHILD_T=new Set(['chits','re','leads','interactions','comments']);
const canBizMe=b=>{const a=S.me.businesses||[];return !a.length||!b||a.includes(b)};
function writeProblem(type,rec,isDel){
  const r=R();if(!r.write)return 'Your account is read-only, so this was not saved.';
  const cur=D[type]&&D[type].get(rec.id);
  if(type==='campaigns'&&!r.camp)return rejectMsg('campaigns');
  if(isDel&&['people','companies','groups','blacklist'].includes(type)&&!r.del)return rejectMsg('delete');
  if(type==='comments'&&cur&&String(cur.byId||'')!==String(S.me.id)&&!r.settings)return 'You can only change your own comments.';
  if(type==='campaigns'&&!isDel&&rec.status==='Sent'&&!(cur&&cur.status==='Sent')&&!r.send)return rejectMsg('send');
  if(!r.all&&type==='people'){if(!S.me.owner)return 'You are not linked to an owner name yet, so you cannot add or change people. Ask an owner to set it in Setup → Owners & team.';if((cur&&(cur.ownerInCharge||'')!==S.me.owner)||(!isDel&&(rec.ownerInCharge||'')!==S.me.owner))return rejectMsg('scope')}
  if(!r.all&&CHILD_T.has(type)){const pid=(!isDel&&rec.personId)||(cur&&cur.personId);const p=pid&&D.people.get(pid);if(p&&(p.ownerInCharge||'')!==S.me.owner)return rejectMsg('scope')}
  if(type==='leads'){const bz=(!isDel&&(rec.business||rec.line))||(cur&&(cur.business||cur.line));const was=cur&&(cur.business||cur.line);if((bz&&!canBizMe(bz))||(was&&!canBizMe(was)))return rejectMsg('business')}
  if((type==='chits'||type==='re')&&!canBizMe(type==='chits'?'chit':'re'))return rejectMsg('business');
  if(type==='people'&&cur&&cur.private&&cur.ownerInCharge&&cur.ownerInCharge!==S.me.owner)return rejectMsg('private');
  if(type==='people'&&!isDel&&!r.settings&&Array.isArray(rec.mobiles)){const had=new Set(((cur&&cur.mobiles)||[]).map(normPhone));
    for(const m of rec.mobiles.map(normPhone).filter(Boolean)){if(had.has(m))continue;for(const x of D.people.values()){if(x.id!==rec.id&&(x.mobiles||[]).map(normPhone).includes(m))return `${m} already belongs to ${x.name||'another person'}. Only an owner can give a number to someone else.`}}}
  return '';
}
const refuse=why=>{toast(why);const e=new Error(why);e.shown=true;throw e};
const delBase=(type,id)=>{const cur=D[type].get(id);return cur&&typeof cur._rev==='number'?cur._rev:undefined};
async function del(type,id,note){const cur=D[type].get(id);const why=writeProblem(type,cur||{id},true);if(why)refuse(why);const b=delBase(type,id);D[type].delete(id);scheduleDerive();enqueueOp({t:type,i:id,x:1,b,note:note||''})}
async function delMany(type,ids,note){const bad=ids.filter(id=>writeProblem(type,D[type].get(id)||{id},true));if(bad.length){toast(`${plural(bad.length,'record')} not deleted: ${writeProblem(type,D[type].get(bad[0])||{id:bad[0]},true)}`);ids=ids.filter(id=>!bad.includes(id))}ids.forEach(id=>{const b=delBase(type,id);D[type].delete(id);enqueueOp({t:type,i:id,x:1,b,note:note||''})});scheduleDerive();clearTimeout(flushTimer);await flush()}
function audit(action,entity,entityId,detail){api('/api/audit',{method:'POST',body:{action,entity,detail}}).catch(()=>{})}
async function saveConfig(patch){
  const before=clone(S.config);Object.assign(S.config,patch);render();
  try{await api('/api/config',{method:'PUT',body:{config:S.config,changed:Object.keys(patch)}});saveSnapshot()}
  catch(e){S.config=before;render();toast(e.code==='offline'?'Settings need a connection to save.':e.message)}
}
function applyMe(u){if(!u)return;S.me=Object.assign({},S.me,u);S.authed=true}

/* pull changes from the server; full=true reloads everything */
let pulling=null;
function pull(full){
  if(pulling)return pulling.then(()=>full?pull(true):null);
  pulling=(async()=>{
    let cur=full?null:S.cursor,first=true;const fresh={};if(full){TYPES.forEach(t=>fresh[t]=new Map());S.loadedCount=0}
    for(;;){
      const qs=new URLSearchParams();if(full)qs.set('full','1');
      if(cur){qs.set('u',cur.u);qs.set('t',cur.t);qs.set('i',cur.i);if(!full&&first)qs.set('overlap','1')}
      const j=await api('/api/sync?'+qs);
      if(j.me){const roleChanged=S.me.role&&S.cursor&&(j.me.role!==S.me.role||j.me.owner!==S.me.owner||String(j.me.businesses||[])!==String(S.me.businesses||[]));applyMe(j.me);if(roleChanged&&!full){pulling=null;return pull(true)}}
      if(j.config)S.config=Object.assign(clone(DEFAULT_CONFIG),j.config);
      if(j.brand)applyBrand(j.brand,j.customer);
      for(const r of j.rows){if(!D[r.t])continue;if(Q.has(r.t+'/'+r.i))continue;const m=full?fresh[r.t]:D[r.t];if(r.x)m.delete(r.i);else{if(r.d&&typeof r.d==='object')r.d._rev=r.r||0;m.set(r.i,r.d)}}
      cur=j.cursor;first=false;
      if(full){S.loadedCount+=j.rows.length;const b=$('#banner');if(j.more){b.hidden=false;b.dataset.kind='load';b.textContent=`Loading your network… ${S.loadedCount.toLocaleString('en-IN')} records so far`}}
      if(!j.more)break;
    }
    if(full){for(const o of Q.values()){if(!fresh[o.t])continue;if(o.x)fresh[o.t].delete(o.i);else fresh[o.t].set(o.i,o.d)}TYPES.forEach(t=>D[t]=fresh[t]);const b=$('#banner');if(b.dataset.kind==='load'){b.hidden=true;b.dataset.kind=''}}
    S.cursor=cur;if(S.offline)setOffline(false);
  })().catch(e=>{if(e.code==='offline')setOffline(true);else if(e.status!==401){console.warn(e);if(full)toast(e.message)}}).finally(()=>{pulling=null;scheduleDerive();saveSnapshot()});
  return pulling;
}

/* ============ derived index ============ */
let deriveTimer=null;
function scheduleDerive(){clearTimeout(deriveTimer);deriveTimer=setTimeout(()=>{derive();render()},60)}
function derive(){
  const P=new Map(),CO=new Map(),G=new Map();
  // blacklist index
  const bl={phone:new Map(),gst:new Map(),email:new Map(),company:new Map(),person:new Map()};
  for(const b of D.blacklist.values()){const k=b.kind==='phone'?normPhone(b.value):b.kind==='gst'?normGST(b.value):b.kind==='email'?normEmail(b.value):b.value;if(bl[b.kind]&&k)bl[b.kind].set(k,b)}
  X.bl=bl;
  const base=()=>({chits:[],re:[],leads:[],ints:[],referred:[],refLeads:[],camps:[],cos:[]});
  for(const p of D.people.values())P.set(p.id,Object.assign(base(),{p}));
  for(const g of D.groups.values())G.set(g.id,{g,cos:[]});
  for(const c of D.companies.values()){
    const black=bl.company.get(c.id)||(c.gst&&bl.gst.get(normGST(c.gst)))||((c.phones||[]).map(normPhone).map(m=>bl.phone.get(m)).find(Boolean))||null;
    const cx={c,people:[],leads:[],biz:new Set(c.businesses||[]),black};CO.set(c.id,cx);
    if(c.groupId&&G.has(c.groupId))G.get(c.groupId).cos.push(cx);
  }
  const comments=new Map();
  for(const m of D.comments.values()){if(!comments.has(m.leadId))comments.set(m.leadId,[]);comments.get(m.leadId).push(m)}
  for(const a of comments.values())a.sort((x,y)=>String(x.at).localeCompare(String(y.at)));
  X.comments=comments;
  for(const c of D.chits.values()){const x=P.get(c.personId);if(x)x.chits.push(c)}
  for(const r of D.re.values()){const x=P.get(r.personId);if(x)x.re.push(r)}
  for(const l of D.leads.values()){
    const x=P.get(l.personId);if(x)x.leads.push(l);
    const rf=l.referrerId&&P.get(l.referrerId);if(rf)rf.refLeads.push(l);
    const cx=l.companyId&&CO.get(l.companyId);if(cx){cx.leads.push(l);cx.biz.add(leadBiz(l))}
  }
  for(const i of D.interactions.values()){const x=P.get(i.personId);if(x)x.ints.push(i)}
  for(const c of D.campaigns.values()){const res=c.results||{};for(const pid in res){const x=P.get(pid);if(x&&res[pid])x.camps.push({c,status:res[pid]})}}
  for(const x of P.values()){
    const p=x.p;
    if(p.introducedBy){const r=P.get(p.introducedBy);if(r)r.referred.push(p)}
    const inds=new Set(),regs=new Set(),cn=[],biz=new Set(p.businesses||[]),grps=new Set();
    (p.companies||[]).forEach(l=>{const cx=CO.get(l.companyId);if(!cx)return;const co=cx.c;x.cos.push({co,role:l.role});cn.push(co.name);if(co.industry)inds.add(co.industry);if(co.region)regs.add(co.region);if(co.groupId)grps.add(co.groupId);(co.businesses||[]).forEach(b=>biz.add(b));cx.people.push({p,role:l.role})});
    x.leads.forEach(l=>biz.add(leadBiz(l)));
    if(x.chits.length)biz.add('chit');if(x.re.length)biz.add('re');
    if(p.industry)inds.add(p.industry);
    if(p.region)regs.add(p.region);
    x.industries=[...inds];x.regions=[...regs];x.coNames=cn;x.biz=biz;x.groups=[...grps];
    const activeCh=x.chits.filter(c=>(c.status||'Active')==='Active');
    x.chitMax=Math.max(0,...x.chits.map(c=>num(c.chitValue)));
    x.chitTotal=x.chits.reduce((a,c)=>a+num(c.chitValue),0);
    x.emi=activeCh.reduce((a,c)=>a+num(c.emi),0);
    const reHeld=x.re.filter(r=>r.stage==='Booked'||r.stage==='Registered');
    x.reTotal=reHeld.reduce((a,r)=>a+num(r.ticketSize),0);
    const hc=x.chits.length>0,hr=reHeld.length>0;
    x.holding=hc&&hr?'Both':hc?'Chit only':hr?'Real estate only':'Prospect';
    x.ints.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    x.lastContacted=[p.lastContacted,x.ints[0]&&x.ints[0].date].filter(Boolean).sort().pop()||'';
    x.mobiles=(p.mobiles||[]).map(normPhone).filter(Boolean);
    x.black=bl.person.get(p.id)||x.mobiles.map(m=>bl.phone.get(m)).find(Boolean)||(p.emails||[]).map(e=>bl.email.get(normEmail(e))).find(Boolean)||null;
    x.coBlack=x.cos.map(c=>CO.get(c.co.id).black).find(Boolean)||null;
    x.search=[p.name,...(p.mobiles||[]),...x.mobiles,...(p.emails||[]),...cn,...x.industries,...x.regions,p.city,...(p.tags||[])].join(' ').toLowerCase();
    x.score=completeness(p,x);
    x.wonValue=x.refLeads.filter(isWon).reduce((a,l)=>a+leadVal(l),0);
  }
  for(const x of P.values()){
    x.refBusiness=x.referred.reduce((a,r)=>{const rx=P.get(r.id);return a+(rx?rx.chitTotal+rx.reTotal:0)},0)+x.wonValue;
  }
  X.p=P;X.co=CO;X.g=G;X.dups=findDups();
}
function completeness(p,x){
  const checks=[!!p.name,(p.mobiles||[]).length>0,(p.emails||[]).length>0,x.cos.length>0,x.industries.length>0,x.regions.length>0,!!p.dob,!!p.ownerInCharge,!!p.grade,!!p.source,!!(p.links&&Object.values(p.links).some(Boolean)),!!(p.consent&&(p.consent.whatsapp||p.consent.email))];
  return Math.round(100*checks.filter(Boolean).length/checks.length);
}
function findDups(){
  const parent=new Map();const find=a=>{while(parent.get(a)!==a){parent.set(a,parent.get(parent.get(a)));a=parent.get(a)}return a};
  const union=(a,b)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent.set(rb,ra)};
  const keys=new Map();const reason=new Map();
  for(const x of X.p.values()){parent.set(x.p.id,x.p.id)}
  const tag=(id,why)=>{if(!reason.has(id))reason.set(id,new Set());reason.get(id).add(why)};
  const add=(k,id,why)=>{if(keys.has(k)){const o=keys.get(k);if(o===id)return;union(o,id);tag(o,why);tag(id,why)}else keys.set(k,id)};
  for(const x of X.p.values()){const p=x.p;if(p.notDup)continue;
    x.mobiles.filter(m=>m.length>=8).forEach(m=>add('m:'+m,p.id,'Same mobile'));
    (p.emails||[]).map(normEmail).filter(Boolean).forEach(e=>add('e:'+e,p.id,'Same email'));
    const nn=normName(p.name);if(nn&&x.coNames.length)x.coNames.forEach(c=>add('nc:'+nn+'|'+normName(c),p.id,'Same name + company'));
  }
  const groups=new Map();
  for(const id of parent.keys()){const r=find(id);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(id)}
  const out=[];for(const [r,ids] of groups){if(ids.length>1){const why=new Set();ids.forEach(i=>{const s=reason.get(i);s&&s.forEach(w=>why.add(w))});out.push({ids,why:[...why]})}}
  return out;
}
const P=id=>X.p.get(id);
const personName=id=>{const x=P(id);return x?x.p.name:''};

/* ============ segment rules ============ */
const BASE_RULE_FIELDS={
  business:{label:'Business',type:'enum',opts:()=>businesses().map(b=>b.name),get:x=>[...x.biz].map(bizName)},
  group:{label:'Group',type:'enum',opts:()=>[...D.groups.values()].map(g=>g.name).sort(),get:x=>x.groups.map(groupName)},
  industry:{label:'Industry',type:'enum',opts:()=>industryNames(),get:x=>x.industries},
  region:{label:'Region / locality',type:'enum',opts:()=>regionsAZ(),get:x=>x.regions},
  holding:{label:'Holding type',type:'enum',opts:()=>['Chit only','Real estate only','Both','Prospect'],get:x=>[x.holding]},
  grade:{label:'Relationship grade',type:'enum',opts:()=>GRADES.concat(['Not graded']),get:x=>[x.p.grade||'Not graded']},
  owner:{label:'Owner in charge',type:'enum',opts:()=>S.config.owners,get:x=>[x.p.ownerInCharge||'']},
  tag:{label:'Tag',type:'enum',opts:()=>allTags(),get:x=>x.p.tags||[]},
  source:{label:'Source',type:'enum',opts:()=>S.config.sources,get:x=>[x.p.source||'']},
  chitValue:{label:'Chit value (highest, ₹)',type:'num',get:x=>x.chitMax},
  emi:{label:'Monthly EMI (active, ₹)',type:'num',get:x=>x.emi},
  reValue:{label:'Real estate held (₹)',type:'num',get:x=>x.reTotal},
  lastContact:{label:'Days since last contact',type:'num',get:x=>x.lastContacted?daysSince(x.lastContacted):99999},
  score:{label:'Completeness %',type:'num',get:x=>x.score},
  waConsent:{label:'WhatsApp opt-in',type:'bool',get:x=>!!(x.p.consent&&x.p.consent.whatsapp)},
  emConsent:{label:'Email opt-in',type:'bool',get:x=>!!(x.p.consent&&x.p.consent.email)},
  hasEmail:{label:'Has email',type:'bool',get:x=>(x.p.emails||[]).length>0},
  blacklisted:{label:'Blacklisted',type:'bool',get:x=>!!(x.black||x.coBlack)},
  city:{label:'City',type:'text',get:x=>x.p.city||''}
};
// custom fields on people and companies become segment rules too
function ruleFields(){
  const out=Object.assign({},BASE_RULE_FIELDS);
  const add=(ent,f,get)=>{const key=ent+':'+f.key;const lab=(ent==='companies'?'Company · ':'')+f.label;
    if(f.type==='dropdown'||f.type==='multi')out[key]={label:lab,type:'enum',opts:()=>f.options||[],get};
    else if(f.type==='number')out[key]={label:lab,type:'num',get:x=>{const v=get(x);return v.length?Math.max(...v.map(num)):0}};
    else if(f.type==='checkbox')out[key]={label:lab,type:'bool',get:x=>get(x).some(Boolean)};
    else out[key]={label:lab,type:'text',get:x=>get(x).join(' ')};};
  customFields('people').forEach(f=>add('people',f,x=>{const v=(x.p.cf||{})[f.key];return v==null||v===''?[]:[].concat(v)}));
  customFields('companies').forEach(f=>add('companies',f,x=>x.cos.flatMap(c=>{const v=(c.co.cf||{})[f.key];return v==null||v===''?[]:[].concat(v)})));
  return out;
}
function allTags(){const s=new Set();for(const p of D.people.values())(p.tags||[]).forEach(t=>s.add(t));return [...s].sort()}
function ruleMatch(x,r){
  const f=ruleFields()[r.field];if(!f)return true;const v=f.get(x);
  if(f.type==='enum'){const has=(v||[]).includes(r.value);return r.op==='is not'?!has:has}
  if(f.type==='bool'){const want=r.value==='yes';return v===want}
  if(f.type==='num'){const n=num(r.value);if(r.op==='>')return v>n;if(r.op==='<')return v<n;if(r.op==='>=')return v>=n;if(r.op==='<=')return v<=n;return v===n}
  if(f.type==='text'){const s=String(v).toLowerCase(),q=String(r.value||'').toLowerCase();return r.op==='is'?s===q:s.includes(q)}
  return true;
}
function evalRules(rules){const out=[];for(const x of X.p.values()){if(!visible(x.p))continue;if((rules||[]).every(r=>ruleMatch(x,r)))out.push(x)}return out}
function ruleText(r){const f=ruleFields()[r.field];if(!f)return '';let v=r.value;if(f.type==='num'&&/value|emi/i.test(f.label))v=inr(num(v));if(f.type==='bool')return f.label+(r.value==='yes'?'':' (no)');return f.label+' '+r.op+' '+v}

/* ============ suppression (consent) ============ */
function suppression(x,channel){
  const p=x.p;
  if(p.dnd)return 'Do-not-disturb';
  if(p.optedOut)return 'Opted out';
  if(x.black||x.coBlack)return 'Blacklisted';
  if(channel==='whatsapp'){if(!(p.mobiles||[]).length)return 'No mobile';if(!(p.consent&&p.consent.whatsapp))return 'No WhatsApp opt-in'}
  if(channel==='email'){if(!(p.emails||[]).length)return 'No email';if(!(p.consent&&p.consent.email))return 'No email opt-in'}
  return '';
}
function renderTemplate(t,x){
  const p=x.p;const co=x.cos[0]&&x.cos[0].co;
  return String(t||'').replace(/\{\{\s*(\w+)\s*\}\}/g,(m,k)=>({first_name:firstName(p.name),name:p.name,company:co?co.name:'',owner:p.ownerInCharge||'',region:x.regions[0]||'',industry:x.industries[0]||''}[k]??m));
}
const waNumber=m=>{const d=normPhone(m);return d.length===10?'91'+d:d};

/* ============ shared render bits ============ */
const NAV=[
  {v:'home',label:'Dashboard',ic:'dashboard'},
  {v:'leads',label:'Leads',ic:'pipeline'},
  {v:'followups',label:'Follow-ups',ic:'today'},
  {v:'people',label:'People',ic:'people'},
  {v:'companies',label:'Companies',ic:'companies'},
  {v:'groups',label:'Groups',ic:'group'},
  {v:'network',label:'Referrals',ic:'network'},
  {v:'lists',label:'Segments',ic:'lists'},
  {v:'campaigns',label:'Campaigns',ic:'campaigns',need:'camp'},
  {v:'health',label:'Data health',ic:'health'},
  {v:'import',label:'Import',ic:'import',need:'write'},
  {v:'setup',label:'Setup',ic:'settings'},
  {v:'audit',label:'Audit log',ic:'log',need:'settings'}
];
const BASE_OF={person:'people',company:'companies',campaign:'campaigns',list:'lists',lead:'leads',group:'groups',today:'home',dashboard:'home',pipeline:'leads',settings:'setup'};
const navAllowed=n=>!n.need||R()[n.need];
/* ============ branding: each customer's colours, logo and name ============ */
S.brand={};S.customer=null;
const BRAND_VARS={bg:'--bg',surface:'--surface',surface2:'--surface-2',ink:'--ink',muted:'--muted',line:'--line',accent:'--accent',accent2:'--accent-2',accentSoft:'--accent-soft',accentInk:'--accent-ink',brandInk:'--brand-ink',gold:'--gold',gold2:'--gold-2',goldSoft:'--gold-soft',goldInk:'--gold-ink'};
const appName=()=>S.brand.appName||(S.customer&&S.customer.name)||'CRM';
const shortName=()=>S.brand.shortName||(S.customer&&S.customer.name)||appName();
const fileStem=()=>slug(shortName())||'crm';
function logoHTML(){return S.brand.logo?`<img class="logo" src="${esc(S.brand.logo)}" alt="">`:`<svg class="logo" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="var(--accent)"/><text x="50" y="63" text-anchor="middle" font-size="38" font-weight="700" fill="var(--accent-ink)" font-family="system-ui,sans-serif">${esc(initials(appName()))}</text></svg>`}
function brandHTML(){const w=S.brand.wordmark||{};const main=(w.a||w.b)?`${esc(w.a||'')}<span>${esc(w.b||'')}</span>`:esc(appName());return `<div class="brand">${logoHTML()}<div><b class="wordmark">${main}</b>${w.sub?`<small>${esc(w.sub)}</small>`:''}</div></div>`}
function applyBrand(b,cust){
  S.brand=b&&typeof b==='object'?b:{};if(cust)S.customer=cust;
  const css=o=>Object.entries(o||{}).filter(([k,v])=>BRAND_VARS[k]&&/^#[0-9a-fA-F]{6}$/.test(v)).map(([k,v])=>BRAND_VARS[k]+':'+v).join(';');
  const L=css(S.brand.colors),Dk=css(S.brand.dark);
  const st=$('#brand-style');if(st)st.textContent=(L?':root{'+L+'}':'')+(Dk?'@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){'+Dk+'}}:root[data-theme="dark"]{'+Dk+'}':'');
  document.title=appName();
  const fav=$('#favicon');if(fav&&S.brand.logo)fav.href=S.brand.logo;
  const mb=$('#mobile-brand');if(mb)mb.innerHTML=logoHTML();
  try{if(ENV.onBrand)ENV.onBrand({appName:appName(),color:(S.brand.colors||{}).accent||''})}catch(e){}
}
function renderNav(){
  const cur=S.route.v,base=BASE_OF[cur]||cur;
  const visCount=[...X.p.values()].filter(x=>visible(x.p)).length;
  const openN=[...D.leads.values()].filter(l=>openLead(l)&&leadVisible(l)).length;
  const dueN=myDue().length;const fuN=[...D.leads.values()].filter(l=>openLead(l)&&leadVisible(l)&&dueMatch(l,'7')).length;const coN=D.companies.size;
  const rail=brandHTML()+
    NAV.filter(navAllowed).map((n,i)=>(n.v==='campaigns'||n.v==='health'?'<div class="sep"></div>':'')+`<button class="nav-btn ${base===n.v?'on':''}" data-a="go" data-v="${n.v}">${ic(n.ic)}<span>${n.label}</span>${n.v==='people'?`<span class="cnt num">${visCount.toLocaleString('en-IN')}</span>`:''}${n.v==='leads'&&openN?`<span class="cnt num">${openN}</span>`:''}${n.v==='followups'?`<span class="cnt num ${dueN?'late-c':''}" title="${dueN?dueN+' due today or overdue · ':''}${fuN} due in the next 7 days">${dueN||fuN}</span>`:''}${n.v==='companies'?`<span class="cnt num">${coN.toLocaleString('en-IN')}</span>`:''}${n.v==='health'&&X.dups.length?`<span class="cnt num">${X.dups.length}</span>`:''}</button>`).join('')+
    `<div class="whoami"><b>${esc(S.me.name||S.me.owner||S.me.email)}</b>${esc(R().label)}${S.me.owner&&S.me.name&&S.me.owner!==S.me.name?' · '+esc(S.me.owner):''}<button class="btn ghost sm" data-a="logout" style="padding:4px 0;margin-top:4px">Sign out</button></div>`;
  $('#rail').innerHTML=rail;
  const tabs=[{v:'home',label:'Dashboard',ic:'dashboard'},{v:'leads',label:'Leads',ic:'pipeline'},{v:'followups',label:'Follow-ups',ic:'today'},{v:'companies',label:'Companies',ic:'companies'},{v:'more',label:'More',ic:'more'}];
  const inTabs=tabs.some(t=>t.v===base);
  $('#tabbar').innerHTML=tabs.map(t=>`<button class="${(t.v===base||(t.v==='more'&&!inTabs))?'on':''}" data-a="${t.v==='more'?'moreMenu':'go'}" data-v="${t.v}">${ic(t.ic)}<span>${t.label}</span></button>`).join('');
  $('#fab').hidden=!canWrite();
  const bs=$('#bizsel');if(bs){bs.innerHTML=`<option value="">All businesses</option>${allowedBiz().map(b=>`<option value="${esc(b.id)}" ${S.ui.biz===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}`;bs.classList.toggle('on',!!S.ui.biz)}
}
const gradeChip=g=>g?`<span class="chip ${esc(g)}">${esc(g)}</span>`:'';
const holdChip=h=>({'Both':'<span class="chip acc">Chit + RE</span>','Chit only':'<span class="chip acc">Chit</span>','Real estate only':'<span class="chip acc">Real estate</span>','Prospect':'<span class="chip">Prospect</span>'}[h]||'');
const blackChip=b=>b?`<span class="chip black" title="${esc(BL_KINDS[b.kind]+(b.reason?': '+b.reason:''))}">Blacklisted</span>`:'';
const bizChips=set=>[...set].map(id=>bizName(id)?`<span class="chip biz">${esc(bizName(id))}</span>`:'').join('');
function personRow(x,o={}){
  const p=x.p;const sub=[x.coNames[0],x.industries[0],x.regions[0]].filter(Boolean).join(' · ')||(p.mobiles||[])[0]||'No details yet';
  return `<div class="li" data-a="openPerson" data-id="${p.id}">
    ${o.check?`<input type="checkbox" data-a="sel" data-id="${p.id}" ${S.ui.sel.has(p.id)?'checked':''} aria-label="Select ${esc(p.name)}">`:''}
    <div class="avatar">${esc(initials(p.name))}</div>
    <div class="main-t"><div class="t">${esc(p.name)}${favs.has(p.id)?' <span class="faint">★</span>':''}${p.tags&&p.tags.includes('Sample')?' <span class="chip warn">Sample</span>':''}</div><div class="s">${esc(sub)}${o.extra?' · '+o.extra:''}</div></div>
    <div class="end">${o.end!=null?o.end:blackChip(x.black||x.coBlack)+gradeChip(p.grade)+holdChip(x.holding)}</div></div>`;
}
function bars(items,o={}){
  if(!items.length)return `<div class="muted small">No data yet.</div>`;
  const max=o.max||Math.max(1,...items.map(i=>i.value));
  return `<div class="bars">${items.map(i=>`<div class="bar ${i.cls||''}" title="${esc(i.label)}: ${esc(i.display!=null?i.display:i.value)}" ${i.act?`data-a="${i.act}" data-v="${esc(i.v||i.label)}" data-f="${esc(i.f||'')}" style="cursor:pointer"`:''}><span class="lab">${esc(i.label)}</span><span class="trk"><i style="width:${i.value>0?`max(2px,${(100*i.value/max).toFixed(1)}%)`:'0'}"></i></span><span class="val">${esc(i.display!=null?i.display:i.value.toLocaleString('en-IN'))}</span></div>`).join('')}</div>`;
}
const countBy=(arr,fn)=>{const m=new Map();arr.forEach(a=>{[].concat(fn(a)).forEach(k=>{if(k==null||k==='')k='Not set';m.set(k,(m.get(k)||0)+1)})});return [...m.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)};
const panel=(title,body,o={})=>`<section class="panel ${o.cls||''}"><div class="hd"><h2>${title}</h2>${o.right||''}</div><div class="bd ${o.flush?'flush':''}">${body}</div></section>`;
const emptyBox=(t,s,act='')=>`<div class="empty"><b>${t}</b>${s}${act?`<div class="row" style="justify-content:center;margin-top:12px">${act}</div>`:''}</div>`;
const visPeople=()=>[...X.p.values()].filter(x=>visible(x.p));
// the business picked in the top bar narrows lists and the dashboard
const inBiz=set=>!S.ui.biz||set.has(S.ui.biz);
function leadVisible(l){const x=l.personId&&P(l.personId);if(l.personId&&(!x||!visible(x.p)))return false;return true}
const bizLeads=()=>[...D.leads.values()].filter(l=>leadVisible(l)&&(!S.ui.biz||leadBiz(l)===S.ui.biz));
/* ---- lead value: the built-in Expected value, or the lead field chosen in Setup (e.g. a dropdown of 10 L, 25 L…) ---- */
function leadValueField(){
  const cfs=customFields('leads');const pick=S.config.leadValueField;
  if(pick==='builtin')return null;
  if(pick){const f=cfs.find(x=>x.key===pick);if(f)return f}
  const ov=bOv('leads','expectedValue');
  if(ov.replacedBy){const f=cfs.find(x=>x.key===ov.replacedBy);if(f)return f}
  if(ov.deleted)return cfs.find(x=>['number','dropdown','text'].includes(x.type)&&/value|amount|₹|\brs\b|budget|ticket/i.test(x.label))||null;
  return null;
}
function leadVal(l){const f=leadValueField();if(f){const v=num((l.cf||{})[f.key]);if(v)return v}return num(l.expectedValue)}
/* ---- custom fields ---- */
function cfInputs(ent,vals){
  vals=vals||{};
  return customFields(ent).map(f=>{const n='cf_'+f.key,v=vals[f.key],id='fm-'+n,req=f.required?' *':'';
    let inner;
    if(f.type==='dropdown')inner=`<select id="${id}" name="${n}"><option value="">—</option>${(f.options||[]).map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
    else if(f.type==='multi')inner=`<div class="checks">${(f.options||[]).map((o,i)=>`<label class="check"><input type="checkbox" name="${n}" value="${esc(o)}" ${[].concat(v||[]).includes(o)?'checked':''}> ${esc(o)}</label>`).join('')}</div>`;
    else if(f.type==='checkbox')inner=`<label class="check"><input type="checkbox" id="${id}" name="${n}" value="yes" ${v?'checked':''}> Yes</label>`;
    else if(f.type==='textarea')inner=`<textarea id="${id}" name="${n}">${esc(v||'')}</textarea>`;
    else inner=`<input id="${id}" name="${n}" value="${esc(v==null?'':v)}" type="${{number:'text',date:'date',email:'email',url:'url',phone:'tel'}[f.type]||'text'}" ${f.type==='number'?'inputmode="decimal"':''} autocomplete="off">`;
    return fld(esc(f.label)+req,inner,{full:f.type==='textarea'||f.type==='multi',hint:f.hint?esc(f.hint):''});
  }).join('');
}
function cfRead(ent,fd,old){
  const out=Object.assign({},old||{});const missing=[];
  customFields(ent).forEach(f=>{const n='cf_'+f.key;let v;
    if(f.type==='multi')v=fd.getAll(n);else if(f.type==='checkbox')v=!!fd.get(n);else if(f.type==='number'){const s=String(fd.get(n)||'').trim();v=s===''?'':num(s)}else v=String(fd.get(n)||'').trim();
    out[f.key]=v;if(f.required&&(v===''||v==null||(Array.isArray(v)&&!v.length)||v===false))missing.push(f.label)});
  return {cf:out,missing};
}
function cfShow(v,f){if(v==null||v===''||(Array.isArray(v)&&!v.length))return '—';if(f.type==='checkbox')return v?'Yes':'No';if(f.type==='date')return fmtDate(v);if(f.type==='multi')return [].concat(v).map(esc).join(', ');if(f.type==='url')return `<a href="${esc(/^https?:/i.test(v)?v:'https://'+v)}" target="_blank" rel="noopener">${esc(v)}</a>`;if(f.type==='number')return esc(Number(v).toLocaleString('en-IN'));return esc(v)}
const cfRows=(ent,vals)=>customFields(ent).map(f=>`<dt>${esc(f.label)}</dt><dd>${cfShow((vals||{})[f.key],f)}</dd>`).join('');
const checks=(name,opts,vals)=>`<div class="checks">${opts.map(o=>{const v=typeof o==='object'?o.v:o,l=typeof o==='object'?o.l:o;return `<label class="check"><input type="checkbox" name="${name}" value="${esc(v)}" ${(vals||[]).includes(v)?'checked':''}> ${esc(l)}</label>`}).join('')||'<span class="small muted">None set up yet</span>'}</div>`;

/* ---- documents ---- */
const DEFAULT_DOC_TYPES={
  companies:[{id:'gst',name:'GST certificate'},{id:'pan',name:'Company PAN'},{id:'incorporation',name:'Incorporation certificate'},{id:'annual-return',name:'Annual return',period:true},{id:'balance-sheet',name:'Balance sheet',period:true},{id:'bank-statement',name:'Bank statement',period:true}],
  people:[{id:'pan',name:'PAN card'},{id:'address-proof',name:'Address proof'},{id:'photo',name:'Photograph'},{id:'kyc-form',name:'KYC form'}]
};
const docTypes=ent=>((S.config.docTypes||{})[ent])||DEFAULT_DOC_TYPES[ent];
const fmtSize=b=>b>=1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
function docsFor(ent,id){return [...D.docs.values()].filter(d=>d.entity===ent&&d.entityId===id).sort((a,b)=>String(b.at).localeCompare(String(a.at)))}
function docsPanel(ent,id){
  const types=docTypes(ent);const docs=docsFor(ent,id);const W=canWrite();
  const known=new Set(types.map(t=>t.id));
  const rows=types.map(t=>{const ds=docs.filter(d=>d.docType===t.id);
    return `<div class="doc-row"><div class="doc-h"><div><b>${esc(t.name)}</b>${t.required&&!ds.length?' <span class="chip warn">Required</span>':''}${ds.length?` <span class="chip good">${ds.length}</span>`:''}</div>${W?`<button class="btn sm" data-a="docUpload" data-ent="${ent}" data-id="${id}" data-type="${esc(t.id)}">${ic('import')}Upload</button>`:''}</div>
      ${ds.map(d=>docLine(d)).join('')}</div>`}).join('');
  const other=docs.filter(d=>!known.has(d.docType));
  const have=types.filter(t=>docs.some(d=>d.docType===t.id)).length;
  return panel('Documents',`<div class="small muted" style="margin-bottom:8px">${have} of ${types.length} document types on file</div>${rows}${other.length?`<div class="doc-row"><div class="doc-h"><b>Other</b></div>${other.map(docLine).join('')}</div>`:''}`,{right:W?`<button class="btn sm" data-a="docUpload" data-ent="${ent}" data-id="${id}" data-type="">${ic('plus')}Upload</button>`:''});
}
function docLine(d){return `<div class="doc"><a href="#" data-a="docOpen" data-id="${esc(d.id)}">${ic('log')}${esc(d.name)}</a><span class="small muted">${[d.period,fmtSize(d.size||0),d.by,fmtDate(d.at)].filter(Boolean).map(esc).join(' · ')}</span>${R().settings||d.byId===S.me.id?`<button class="iconbtn" data-a="docDel" data-id="${esc(d.id)}" title="Delete ${esc(d.name)}">${ic('trash')}</button>`:''}</div>`}

/* ============ views ============ */
const VIEWS={};

/* ---- dashboard (home) ---- */
function periodRange(k,from,to){
  const t=new Date(todayISO()+'T00:00:00');const iso=localISO;const y=t.getFullYear(),m=t.getMonth();
  if(k==='month')return [iso(new Date(y,m,1)),todayISO()];
  if(k==='30')return [addDays(todayISO(),-29),todayISO()];
  if(k==='quarter'){const q=Math.floor(m/3)*3;return [iso(new Date(y,q,1)),todayISO()]}
  if(k==='fy'){const fy=m>=3?y:y-1;return [iso(new Date(fy,3,1)),todayISO()]}
  if(k==='custom')return [from||'0000-01-01',to||'9999-12-31'];
  return ['0000-01-01','9999-12-31'];
}
const PERIODS=[{v:'',l:'All time'},{v:'month',l:'This month'},{v:'30',l:'Last 30 days'},{v:'quarter',l:'This quarter'},{v:'fy',l:'This financial year'},{v:'custom',l:'Custom dates'}];
function leadDims(l){
  const x=l.personId&&P(l.personId);const cx=l.companyId&&X.co.get(l.companyId);
  const inds=new Set(x?x.industries:[]),regs=new Set(x?x.regions:[]),grps=new Set(x?x.groups:[]);
  if(cx){if(cx.c.industry)inds.add(cx.c.industry);if(cx.c.region)regs.add(cx.c.region);if(cx.c.groupId)grps.add(cx.c.groupId)}
  return {inds,regs,grps};
}
function dashFilters(){
  const f=S.ui.df||{};
  const okDims=(inds,regs,grps)=>(!f.industry||inds.has(f.industry))&&(!f.region||regs.has(f.region))&&(!f.group||grps.has(f.group));
  const leads=bizLeads().filter(l=>{if(f.owner&&(l.owner||'')!==f.owner)return false;const d=leadDims(l);return okDims(d.inds,d.regs,d.grps)});
  const ppl=visPeople().filter(x=>inBiz(x.biz)&&(!f.owner||(x.p.ownerInCharge||'')===f.owner)&&okDims(new Set(x.industries),new Set(x.regions),new Set(x.groups)));
  const cos=[...X.co.values()].filter(c=>inBiz(c.biz)&&(!f.owner||(c.c.owners||[]).includes(f.owner))&&okDims(new Set([c.c.industry]),new Set([c.c.region]),new Set([c.c.groupId])));
  const [from,to]=periodRange(f.period,f.from,f.to);
  const inP=d=>{const s=String(d||'').slice(0,10);return s&&s>=from&&s<=to};
  return {f,leads,ppl,cos,inP,from,to};
}
const reachedIdx=l=>Math.max(typeof l.reached==='number'?l.reached:0,isLost(l)?0:stageIdx(l));
// 'now': leads by the stage they are in today. 'ever': leads that ever reached each stage (moving back does not undo it).
function funnelFor(bid,leads,mode='now'){
  const all=stagesFor(bid);const ls=leads.filter(l=>leadBiz(l)===bid);const first=ls.length||1;
  if(mode==='now')return all.map(s=>{const g=ls.filter(l=>stageOf(l)===s);const v=g.reduce((a,l)=>a+leadVal(l),0);return {label:s.name,value:g.length,amount:v,display:g.length+' · '+Math.round(100*g.length/first)+'% · '+inr(v),cls:s.kind==='won'?'won':s.kind==='lost'?'lost':''}});
  return all.filter(s=>s.kind!=='lost').map(s=>{const n=ls.filter(l=>reachedIdx(l)>=all.indexOf(s)).length;return {label:s.name,value:n,display:n+' · '+Math.round(100*n/first)+'%',cls:s.kind==='won'?'won':''}});
}
const filterSel=(id,label,opts,val,key)=>opts.length>BIG?combo({id,opts,val,blank:label,label,attrs:`data-df="${key}"`}):`<select id="${id}" data-df="${key}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>${opts.map(o=>{const v=typeof o==='object'?o.v:o,l=typeof o==='object'?o.l:o;return `<option value="${esc(v)}" ${String(val||'')===String(v)?'selected':''}>${esc(l)}</option>`}).join('')}</select>`;
// a Manager (sees only their own) with no owner name sees an empty app: say why
const noOwnerNote=()=>!R().all&&!S.me.owner?`<div class="note" style="margin:0 0 16px"><b>You are not linked to an owner name yet.</b> People, leads and follow-ups are assigned to owner names, and your role shows only your own, so there is nothing to show you. Ask an owner to set your owner name in Setup → Owners & team.</div>`:'';
VIEWS.home=()=>{
  const all=visPeople();
  if(!all.length&&!D.companies.size&&!D.leads.size)return `<div class="ph"><div><h1>Welcome to ${esc(appName())}</h1><div class="sub">Set up your businesses, lead stages and fields, then bring in your companies and people.</div></div></div>${noOwnerNote()}
    <div class="grid g3">
      ${panel('1 · Setup',`<p class="muted">Add your businesses, lead stages, company and people fields, groups and owners.</p><button class="btn pri" data-a="go" data-v="setup">Open Setup</button>`)}
      ${panel('2 · Bring in your network',`<p class="muted">Import phone contacts, Excel lists, the chit subscriber master or the property list. Duplicates are caught on the way in.</p>${canWrite()?'<button class="btn" data-a="go" data-v="import">Import</button> <button class="btn" data-a="companyForm">Add a company</button>':''}`)}
      ${panel('3 · Or explore with sample data',`<p class="muted">Load clearly marked sample records to try the app, then remove them in one click from Setup.</p>${R().settings?'<button class="btn" data-a="loadSample">Load sample data</button>':'<span class="small muted">An owner can load sample data.</span>'}`)}
    </div>`;
  const {f,leads,ppl,cos,inP}=dashFilters();
  const open=leads.filter(openLead),openVal=open.reduce((a,l)=>a+leadVal(l),0);
  const created=leads.filter(l=>inP(l.createdAt));
  const won=leads.filter(l=>isWon(l)&&inP(l.closedAt||l.updatedAt)),lost=leads.filter(l=>isLost(l)&&inP(l.closedAt||l.updatedAt));
  const wonVal=won.reduce((a,l)=>a+leadVal(l),0);
  const rate=won.length+lost.length?Math.round(100*won.length/(won.length+lost.length)):null;
  const t=todayISO();
  const due=open.filter(l=>l.nextDate&&l.nextDate<=t&&(S.ui.todayAll||!l.owner||l.owner===S.me.owner)).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
  const bizList=S.ui.biz?[businesses().find(b=>b.id===S.ui.biz)].filter(Boolean):allowedBiz();
  // pipeline by stage or business
  const stageBars=S.ui.biz?stagesFor(S.ui.biz).filter(s=>s.kind==='open').map(s=>{const ls=open.filter(l=>stageOf(l)===s);const v=ls.reduce((a,l)=>a+leadVal(l),0);return {label:s.name+' ('+ls.length+')',value:v,display:inr(v)}})
    :bizList.map(b=>{const ls=open.filter(l=>leadBiz(l)===b.id);const v=ls.reduce((a,l)=>a+leadVal(l),0);return {label:b.name+' ('+ls.length+')',value:v,display:inr(v)}});
  const funnel=S.ui.biz?bars(funnelFor(S.ui.biz,created.length?created:leads),{max:Math.max(1,(created.length?created:leads).length)}):
    `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Business</th><th class="r">Open</th><th class="r">Won</th><th class="r">Lost</th><th class="r">Win rate</th></tr></thead><tbody>${bizList.map(b=>{const ls=leads.filter(l=>leadBiz(l)===b.id);const w=ls.filter(isWon).length,lo=ls.filter(isLost).length;return `<tr class="click" data-a="pickBiz" data-v="${esc(b.id)}"><td>${esc(b.name)}</td><td class="r">${ls.filter(openLead).length}</td><td class="r">${w}</td><td class="r">${lo}</td><td class="r">${w+lo?Math.round(100*w/(w+lo))+'%':'—'}</td></tr>`}).join('')}</tbody></table></div><div class="small muted" style="margin-top:8px">Pick a business at the top to see its stage funnel.</div>`;
  const byOwner=S.config.owners.concat(['']).map(o=>{const ls=open.filter(l=>(l.owner||'')===o);return {label:o||'Unassigned',value:ls.length,display:ls.length+' · '+inr(ls.reduce((a,l)=>a+leadVal(l),0))}}).filter(r=>r.value);
  const bySource=countBy(created,l=>l.source||'Not set').slice(0,8);
  const months=[];for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);const k=localISO(d).slice(0,7);months.push({label:d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),value:leads.filter(l=>String(l.createdAt||'').slice(0,7)===k).length})}
  const recent=[...D.comments.values()].filter(m=>{const l=D.leads.get(m.leadId);return l&&leads.includes(l)}).sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,8);
  const blackN=ppl.filter(x=>x.black).length+cos.filter(c=>c.black).length;
  const sel2=(k,label,opts)=>filterSel('df-'+k,label,opts,f[k],k);
  const anyF=Object.values(f).some(Boolean)||S.ui.biz;
  return `<div class="ph"><div><h1>${S.ui.biz?esc(bizName(S.ui.biz)):'Dashboard'}</h1><div class="sub">${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div></div>
    ${canWrite()?`<div class="actions"><button class="btn pri" data-a="leadForm">${ic('plus')}New lead</button></div>`:''}</div>
  <div class="filters dash-filters">
    <select id="df-biz" data-c="biz" aria-label="Business"><option value="">All businesses</option>${allowedBiz().map(b=>`<option value="${esc(b.id)}" ${S.ui.biz===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select>
    ${sel2('owner','All owners',S.config.owners)}
    ${filterSel('df-period','All time',PERIODS.slice(1),f.period,'period')}
    ${f.period==='custom'?`<input type="date" id="df-from" data-df="from" value="${esc(f.from||'')}" aria-label="From"><input type="date" id="df-to" data-df="to" value="${esc(f.to||'')}" aria-label="To">`:''}
    ${sel2('industry','All industries',industryNames())}
    ${sel2('group','All groups',[...D.groups.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(g=>({v:g.id,l:g.name})))}
    ${sel2('region','All regions',regionsAZ())}
    ${anyF?'<button class="btn ghost" data-a="clearDash">Clear filters</button>':''}
  </div>
  ${noOwnerNote()}
  <div class="grid g4" style="margin-bottom:16px">
    <div class="panel stat click" data-a="go" data-v="leads"><div class="k">Open leads</div><div class="v">${open.length}</div><div class="d">${inr(openVal)} in the pipeline</div></div>
    <div class="panel stat"><div class="k">New leads${f.period?'':' (all time)'}</div><div class="v">${created.length}</div><div class="d">${PERIODS.find(p=>p.v===(f.period||'')).l}</div></div>
    <div class="panel stat"><div class="k">Won</div><div class="v">${won.length}</div><div class="d">${inr(wonVal)}${rate!=null?' · '+rate+'% win rate':''}</div></div>
    <div class="panel stat"><div class="k">Follow-ups due</div><div class="v ${due.some(l=>l.nextDate<t)?'late':''}">${due.length}</div><div class="d">${due.filter(l=>l.nextDate<t).length} overdue · ${S.ui.todayAll?'all owners':'mine'}</div></div>
    <div class="panel stat click" data-a="go" data-v="people"><div class="k">People</div><div class="v">${ppl.length.toLocaleString('en-IN')}</div><div class="d">${ppl.filter(x=>x.holding!=='Prospect').length.toLocaleString('en-IN')} customers</div></div>
    <div class="panel stat click" data-a="go" data-v="companies"><div class="k">Companies</div><div class="v">${cos.length.toLocaleString('en-IN')}</div><div class="d">${new Set(cos.map(c=>c.c.groupId).filter(Boolean)).size} groups</div></div>
    ${canBizMe('chit')&&businesses().some(b=>b.id==='chit')?`<div class="panel stat"><div class="k">Chit book</div><div class="v">${inr(ppl.reduce((a,x)=>a+x.chitTotal,0))}</div><div class="d">EMI ${inr(ppl.reduce((a,x)=>a+x.emi,0))}/month</div></div>`
      :canBizMe('re')&&businesses().some(b=>b.id==='re')?`<div class="panel stat"><div class="k">Property held</div><div class="v">${inr(ppl.reduce((a,x)=>a+x.reTotal,0))}</div><div class="d">${ppl.filter(x=>x.reTotal>0).length} owners, booked or registered</div></div>`:''}
    <div class="panel stat click" data-a="setupTab" data-v="blacklist"><div class="k">Blacklisted</div><div class="v">${blackN}</div><div class="d">people and companies</div></div>
  </div>
  <div class="grid g2">
    ${panel(S.ui.biz?'Lead funnel':'Leads by business',funnel,{right:S.ui.biz?'<span class="small muted">leads in each stage now</span>':''})}
    ${panel(S.ui.biz?'Open pipeline by stage':'Open pipeline by business',bars(stageBars))}
    ${panel('Follow-ups due',due.length?`<div class="list">${due.slice(0,8).map(l=>`<div class="li" data-a="openLead" data-id="${l.id}"><div class="main-t"><div class="t">${esc(leadTitle(l))}</div><div class="s">${esc(l.nextAction||'Follow up')} · ${esc(bizName(leadBiz(l)))} · ${esc(stageOf(l).name)}</div></div><div class="end">${l.nextDate<t?`<span class="chip bad">${daysSince(l.nextDate)}d overdue</span>`:'<span class="chip acc">Today</span>'}${l.personId&&P(l.personId)?contactBtns(P(l.personId).p):''}</div></div>`).join('')}</div>`:emptyBox('Nothing due','Next-action dates on leads show up here.'),{flush:!!due.length,right:`<button class="btn sm ghost" data-a="go" data-v="followups">Open follow-ups</button><div class="seg"><label><input type="radio" name="tm" data-c="todayAll" value="0" ${!S.ui.todayAll?'checked':''}><span>Mine</span></label><label><input type="radio" name="tm" data-c="todayAll" value="1" ${S.ui.todayAll?'checked':''}><span>All</span></label></div>`})}
    ${panel('Latest lead comments',recent.length?`<div class="list">${recent.map(m=>{const l=D.leads.get(m.leadId);return `<div class="li" data-a="openLead" data-id="${l.id}"><div class="avatar sm">${esc(initials(m.by))}</div><div class="main-t"><div class="t">${esc(leadTitle(l))} <span class="muted small">· ${esc(m.by||'')}</span></div><div class="s">${esc(m.text)}</div></div><div class="end small muted">${fmtDM(m.at)}</div></div>`}).join('')}</div>`:emptyBox('No comments yet','Comments on leads, with the owner who wrote them, appear here.'),{flush:!!recent.length})}
    ${panel('Open leads by owner',bars(byOwner))}
    ${panel('New leads by source',bars(bySource))}
    ${panel('New leads by month',bars(months))}
    ${panel('Companies by industry',bars(countBy(cos,c=>c.c.industry||'Not set').slice(0,10).map(i=>({...i,act:'dashCo',f:'industry'}))))}
    ${panel('People by business',bars(businesses().map(b=>({label:b.name,value:ppl.filter(x=>x.biz.has(b.id)).length,act:'pickBiz',v:b.id}))))}
    ${panel('Data health',`<dl class="kv"><dt>Possible duplicates</dt><dd class="num">${X.dups.length} groups</dd><dt>Incomplete (&lt; 50%)</dt><dd class="num">${ppl.filter(x=>x.score<50).length}</dd><dt>Not contacted 90+ days</dt><dd class="num">${ppl.filter(x=>!x.lastContacted||daysSince(x.lastContacted)>=90).length}</dd><dt>No opt-in recorded</dt><dd class="num">${ppl.filter(x=>!(x.p.consent&&(x.p.consent.whatsapp||x.p.consent.email))).length}</dd></dl><button class="btn sm" data-a="go" data-v="health" style="margin-top:10px">Open data health</button>`)}
  </div>`;
};
VIEWS.today=VIEWS.home;VIEWS.dashboard=VIEWS.home;
function crossSell(){
  const th=num(S.config.crossSellThreshold);
  const openRE=new Set([...D.leads.values()].filter(l=>leadBiz(l)==='re'&&!isLost(l)).map(l=>l.personId));
  return visPeople().filter(x=>x.chits.length&&x.chitMax>=th&&x.re.length===0&&!openRE.has(x.p.id)).sort((a,b)=>b.chitMax-a.chitMax);
}
function contactBtns(p){
  const m=(p.mobiles||[])[0],e=(p.emails||[])[0];
  return (m?`<a class="iconbtn" href="tel:+${waNumber(m)}" title="Call ${esc(m)}" data-stop="1" data-log="Call" data-id="${p.id}">${ic('phone')}</a><a class="iconbtn" href="https://wa.me/${waNumber(m)}" target="_blank" rel="noopener" title="WhatsApp ${esc(m)}" data-stop="1" data-log="WhatsApp" data-id="${p.id}">${ic('wa')}</a>`:'')+(e?`<a class="iconbtn" href="mailto:${esc(e)}" title="Email ${esc(e)}" data-stop="1">${ic('mail')}</a>`:'');
}

/* ---- people ---- */
function filteredPeople(){
  const f=S.ui.pf,q=S.ui.pq.trim().toLowerCase();
  let list=visPeople();
  if(f.list){const L=D.lists.get(f.list);if(L)list=list.filter(x=>(L.rules||[]).every(r=>ruleMatch(x,r)))}
  if(q){const qd=q.replace(/\D/g,'');const terms=q.split(/\s+/).filter(Boolean);list=list.filter(x=>terms.every(t=>x.search.includes(t))||(qd.length>=4&&x.mobiles.some(m=>m.includes(qd))))}
  if(f.industry)list=list.filter(x=>x.industries.includes(f.industry));
  if(f.region)list=list.filter(x=>x.regions.includes(f.region));
  if(f.holding)list=list.filter(x=>x.holding===f.holding);
  if(f.grade)list=list.filter(x=>(x.p.grade||'Not graded')===f.grade);
  if(f.owner)list=list.filter(x=>(x.p.ownerInCharge||'')===f.owner);
  if(f.tag)list=list.filter(x=>(x.p.tags||[]).includes(f.tag));
  if(f.touched){const d=+f.touched;list=list.filter(x=>!x.lastContacted||daysSince(x.lastContacted)>=d)}
  const s=f.sort||'name';
  const cmp={name:(a,b)=>a.p.name.localeCompare(b.p.name),recent:(a,b)=>String(b.p.createdAt).localeCompare(String(a.p.createdAt)),contact:(a,b)=>String(b.lastContacted).localeCompare(String(a.lastContacted)),chit:(a,b)=>b.chitMax-a.chitMax,score:(a,b)=>a.score-b.score}[s];
  return list.sort(cmp);
}
const sel=(id,label,opts,val,attr='data-pf')=>opts.length>BIG?combo({id,opts,val,blank:label,label,attrs:`${attr}="${id.replace(/^[a-z]+-/,'')}"`}):`<select id="${id}" ${attr}="${id.replace(/^[a-z]+-/,'')}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>${opts.map(o=>{const v=typeof o==='object'?o.v:o,l=typeof o==='object'?o.l:o;return `<option value="${esc(v)}" ${String(val)===String(v)?'selected':''}>${esc(l)}</option>`}).join('')}</select>`;
VIEWS.people=()=>{
  const list=filteredPeople(),f=S.ui.pf;
  const shown=list.slice(0,S.ui.plimit);
  const pinned=[...favs].map(P).filter(x=>x&&visible(x.p));
  const rec=recents.map(P).filter(x=>x&&visible(x.p)&&!favs.has(x.p.id)).slice(0,6);
  const anyF=Object.keys(f).some(k=>k!=='sort'&&f[k])||S.ui.pq;
  const selN=S.ui.sel.size;
  return `<div class="ph"><div><h1>People</h1><div class="sub num">${list.length.toLocaleString('en-IN')} ${anyF?'matching':'in the network'}</div></div>
    <div class="actions">${canWrite()?`<button class="btn pri" data-a="personForm">${ic('plus')}Add person</button>`:''}<button class="btn" data-a="excel" data-k="people">${ic('download')}Excel</button></div></div>
  ${(pinned.length||rec.length)&&!anyF?`<div class="chips" style="margin-bottom:12px">${pinned.map(x=>`<button class="chip acc" data-a="openPerson" data-id="${x.p.id}" style="border:0;cursor:pointer">★ ${esc(x.p.name)}</button>`).join('')}${rec.map(x=>`<button class="chip" data-a="openPerson" data-id="${x.p.id}" style="border:0;cursor:pointer">${esc(x.p.name)}</button>`).join('')}</div>`:''}
  <div class="filters">
    <input id="f-q" type="search" placeholder="Filter by name, number, company…" value="${esc(S.ui.pq)}" data-i="pq" style="flex:1;min-width:200px">
    ${sel('f-list','Any segment',[...D.lists.values()].map(l=>({v:l.id,l:l.name})),f.list)}
    ${sel('f-industry','All industries',industryNames(),f.industry)}
    ${sel('f-region','All regions',regionsAZ(),f.region)}
    ${sel('f-holding','Any holding',['Chit only','Real estate only','Both','Prospect'],f.holding)}
    ${sel('f-grade','Any grade',GRADES.concat('Not graded'),f.grade)}
    ${sel('f-owner','Any owner',S.config.owners,f.owner)}
    ${sel('f-tag','Any tag',allTags(),f.tag)}
    ${sel('f-touched','Any last contact',[{v:90,l:'Not contacted 90+ days'},{v:180,l:'Not contacted 180+ days'}],f.touched)}
    ${sel('f-sort','Sort: name',[{v:'recent',l:'Sort: newest'},{v:'contact',l:'Sort: last contacted'},{v:'chit',l:'Sort: chit value'},{v:'score',l:'Sort: least complete'}],f.sort==='name'?'':f.sort)}
    ${anyF?'<button class="btn ghost" data-a="clearFilters">Clear</button>':''}
  </div>
  ${selN?`<div class="bulkbar"><b class="num">${selN} selected</b>${canWrite()?`<button class="btn sm" data-a="bulkTag">Tag</button><button class="btn sm" data-a="bulkAssign">Assign owner</button><button class="btn sm" data-a="bulkGrade">Set grade</button>`:''}${selN>=2&&canWrite()?'<button class="btn sm" data-a="mergeSel">Merge</button>':''}${R().del?'<button class="btn sm" data-a="bulkDelete">Delete</button>':''}<button class="btn sm" data-a="selAll">Select all ${list.length.toLocaleString('en-IN')}</button><button class="btn sm" data-a="selNone">Clear</button></div>`:''}
  <div class="panel">${shown.length?`<div class="list">${shown.map(x=>personRow(x,{check:true})).join('')}</div>${list.length>shown.length?`<div style="padding:12px;text-align:center"><button class="btn" data-a="moreRows">Show ${Math.min(200,list.length-shown.length)} more</button></div>`:''}`:emptyBox(anyF?'No one matches':'No people yet',anyF?'Try removing a filter.':'Import contacts or add the first person.')}</div>`;
};

/* ---- person 360 ---- */
VIEWS.person=()=>{
  const x=P(S.route.id);
  if(!x||!visible(x.p))return emptyBox('Person not found','They may have been merged, deleted or marked private by another owner.','<button class="btn" data-a="go" data-v="people">Back to people</button>');
  const p=x.p;
  const intro=p.introducedBy&&P(p.introducedBy);
  const chain=[];let cur=intro,guard=0;while(cur&&guard++<6){chain.push(cur);cur=cur.p.introducedBy&&P(cur.p.introducedBy)}
  const missing=[];if(!(p.mobiles||[]).length)missing.push('mobile');if(!(p.emails||[]).length)missing.push('email');if(!x.cos.length)missing.push('company');if(!x.industries.length)missing.push('industry');if(!x.regions.length)missing.push('region');if(!p.dob)missing.push('birthday');if(!p.grade)missing.push('grade');if(!p.ownerInCharge)missing.push('owner');if(!p.source)missing.push('source');if(!(p.consent&&(p.consent.whatsapp||p.consent.email)))missing.push('opt-in');
  const links=Object.entries(p.links||{}).filter(([k,v])=>v);
  const W=canWrite();
  const chitRows=x.chits.map(c=>`<tr class="click" data-a="${W?'chitForm':''}" data-id="${c.id}" data-pid="${p.id}"><td>${esc(c.group||'—')}${c.ticketNo?' / '+esc(c.ticketNo):''}<div class="small muted">${esc(c.branch||'')}</div></td><td class="r">${inr(c.chitValue)}</td><td class="r">${inr(c.emi)}</td><td>${esc(c.tenure?c.tenure+' m':'')}</td><td>${fmtDate(c.endDate)}</td><td><span class="chip ${c.status==='Active'||!c.status?'good':''}">${esc(c.status||'Active')}</span> <span class="chip">${esc(c.prized||'Unprized')}</span></td></tr>`).join('');
  const reRows=x.re.map(r=>`<tr class="click" data-a="${W?'reForm':''}" data-id="${r.id}" data-pid="${p.id}"><td>${esc(r.project||'—')}<div class="small muted">${esc(r.unit||'')}</div></td><td class="r">${inr(r.ticketSize)}</td><td>${fmtDate(r.bookingDate)}</td><td><span class="chip ${r.stage==='Registered'||r.stage==='Booked'?'good':'acc'}">${esc(r.stage||'Enquiry')}</span></td><td>${esc(r.paymentStage||'')}</td></tr>`).join('');
  const leadRows=x.leads.filter(leadVisible).map(leadRow).join('');
  const intRows=x.ints.slice(0,30).map(i=>`<div class="tl"><div class="when">${fmtDate(i.date)}<div>${esc(i.type)}</div></div><div><div>${esc(i.summary||'—')}</div><div class="small muted">${i.by?esc(i.by):''}${i.followUp?` · follow-up ${fmtDate(i.followUp)}${i.followUpDone?' (done)':''}`:''}</div></div></div>`).join('');
  const endRows=x.refLeads.filter(leadVisible).map(leadRow).join('');
  const refRows=x.referred.map(r=>{const rx=P(r.id);return rx&&visible(rx.p)?personRow(rx,{end:holdChip(rx.holding)}):''}).join('');
  const campRows=x.camps.map(c=>`<div class="li" data-a="openCampaign" data-id="${c.c.id}"><div class="main-t"><div class="t">${esc(c.c.name)}</div><div class="s">${c.c.channel==='email'?'Email':'WhatsApp'} · ${fmtDate(c.c.sentAt||c.c.createdAt)}</div></div><div class="end"><span class="chip">${esc(c.status)}</span></div></div>`).join('');
  const cos=x.cos.map(c=>`<div class="li" data-a="openCompany" data-id="${c.co.id}"><div class="avatar co">${esc(initials(c.co.name))}</div><div class="main-t"><div class="t">${esc(c.co.name)}</div><div class="s">${esc([c.role,c.co.industry,c.co.subIndustry,c.co.region].filter(Boolean).join(' · '))}</div></div></div>`).join('');
  return `<div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-a="back">${ic('back')}Back</button></div>
  <div class="p-head">
    <div class="avatar lg">${esc(initials(p.name))}</div>
    <div class="who">
      <h1>${esc(p.name)}</h1>
      <div class="row" style="margin-top:6px">${blackChip(x.black||x.coBlack)}${bizChips(x.biz)}${gradeChip(p.grade)}${holdChip(x.holding)}${p.private?'<span class="chip warn">Private</span>':''}${p.dnd?'<span class="chip bad">Do not disturb</span>':''}${p.optedOut?'<span class="chip bad">Opted out</span>':''}${(p.tags||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>
      <div class="muted" style="margin-top:6px">${esc([x.coNames.join(', '),x.industries.join(', '),x.regions.join(', ')].filter(Boolean).join(' · ')||'Add a company to place this person in the network')}</div>
      <div class="quick">
        ${(p.mobiles||[])[0]?`<a class="btn" href="tel:+${waNumber(p.mobiles[0])}" data-stop="1" data-log="Call" data-id="${p.id}">${ic('phone')}Call</a><a class="btn" href="https://wa.me/${waNumber(p.mobiles[0])}" target="_blank" rel="noopener" data-stop="1" data-log="WhatsApp" data-id="${p.id}">${ic('wa')}WhatsApp</a>`:''}
        ${(p.emails||[])[0]?`<a class="btn" href="mailto:${esc(p.emails[0])}" data-stop="1">${ic('mail')}Email</a>`:''}
        ${W?`<button class="btn pri" data-a="intForm" data-pid="${p.id}">${ic('log')}Log interaction</button><button class="btn" data-a="leadForm" data-pid="${p.id}">${ic('plus')}Lead</button><button class="btn" data-a="personForm" data-id="${p.id}">${ic('edit')}Edit</button>`:''}
        <button class="btn" data-a="refs" data-pid="${p.id}">${ic('network')}Find references</button>
        ${W?(x.black&&x.black.kind==='person'?(R().del?`<button class="btn" data-a="unblack" data-id="${x.black.id}">Remove from blacklist</button>`:''):(!x.black?`<button class="btn danger" data-a="blackForm" data-kind="person" data-v="${p.id}">Blacklist</button>`:'')):''}
        <button class="iconbtn" data-a="fav" data-id="${p.id}" title="${favs.has(p.id)?'Unpin':'Pin to top'}" style="${favs.has(p.id)?'color:var(--brass)':''}">${ic('star')}</button>
      </div>
    </div>
    <div style="min-width:180px"><div class="small muted">Record completeness <b class="num" style="color:var(--ink)">${x.score}%</b></div><div class="meter" style="margin-top:6px"><i style="width:${x.score}%"></i></div>${missing.length?`<div class="small faint" style="margin-top:6px">Missing: ${missing.join(', ')}</div>`:''}</div>
  </div>
  ${x.black||x.coBlack?`<div class="note bad" style="margin-top:14px">${x.black?'Blacklisted':'Works at a blacklisted company'} · ${esc(BL_KINDS[(x.black||x.coBlack).kind])}${(x.black||x.coBlack).reason?': '+esc((x.black||x.coBlack).reason):''}</div>`:''}
  <div class="grid p-grid" style="margin-top:20px">
    <div class="stack">
      ${panel('Details',`<dl class="kv">
        <dt>Businesses</dt><dd>${[...x.biz].map(bizName).filter(Boolean).map(esc).join(', ')||'—'}</dd>
        <dt>Mobile</dt><dd class="num">${(p.mobiles||[]).map(esc).join('<br>')||'—'}</dd>
        <dt>Email</dt><dd>${(p.emails||[]).map(esc).join('<br>')||'—'}</dd>
        <dt>Birthday</dt><dd>${fmtDate(p.dob)||'—'}</dd>
        <dt>Anniversary</dt><dd>${fmtDate(p.anniversary)||'—'}</dd>
        <dt>Address</dt><dd>${esc([p.address,p.city,p.pincode].filter(Boolean).join(', '))||'—'}</dd>
        <dt>Owner in charge</dt><dd>${esc(p.ownerInCharge||'—')}</dd>
        <dt>Source</dt><dd>${esc(p.source||'—')}${p.sourceOwner?' · from '+esc(p.sourceOwner)+"'s contacts":''}</dd>
        <dt>Introduced by</dt><dd>${intro&&visible(intro.p)?`<a href="#" data-a="openPerson" data-id="${intro.p.id}">${esc(intro.p.name)}</a>`:'—'}</dd>
        <dt>Last contacted</dt><dd>${x.lastContacted?fmtDate(x.lastContacted)+' · '+daysSince(x.lastContacted)+' days ago':'Never logged'}</dd>
        <dt>KYC / PAN ref</dt><dd>${esc(p.pan||'—')}</dd>${cfRows('people',p.cf)}
        <dt>Consent</dt><dd>${p.consent&&p.consent.whatsapp?'<span class="chip good">WhatsApp opt-in</span> ':''}${p.consent&&p.consent.email?'<span class="chip good">Email opt-in</span>':''}${!(p.consent&&(p.consent.whatsapp||p.consent.email))?'<span class="chip warn">No opt-in recorded</span>':''}${p.consent&&p.consent.at?`<div class="small faint">recorded ${fmtDate(p.consent.at)}${p.consent.how?' · '+esc(p.consent.how):''}</div>`:''}</dd>
      </dl>${p.notes?`<div class="note" style="margin-top:12px;white-space:pre-wrap">${esc(p.notes)}</div>`:''}`)}
      ${panel('Companies',cos?`<div class="list">${cos}</div>`:emptyBox('No company linked','Edit the person to link one or more companies with a role.'),{flush:true})}
      ${docsPanel('people',p.id)}
      ${links.length?panel('Links',`<div class="row">${links.map(([k,v])=>`<a class="btn sm" href="${esc(/^https?:/i.test(v)?v:'https://'+v)}" target="_blank" rel="noopener">${ic('link')}${esc({linkedin:'LinkedIn',facebook:'Facebook',instagram:'Instagram',x:'X',website:'Website'}[k]||k)}</a>`).join('')}</div>`):''}
      ${panel('Referral chain',`${chain.length?`<div class="small muted" style="margin-bottom:6px">Introduced through</div><div class="row">${chain.reverse().map(c=>`<a href="#" data-a="openPerson" data-id="${c.p.id}">${esc(c.p.name)}</a>`).join(' → ')} → <b>${esc(p.name)}</b></div>`:'<div class="muted small">No introducer recorded.</div>'}
        <div class="small muted" style="margin:12px 0 4px">Introduced ${plural(x.referred.length,'person','people')} · business generated ${inr(x.refBusiness)} · ${x.refLeads.length} leads referred</div>`+(refRows?`</div><div class="bd flush"><div class="list">${refRows}</div>`:''))}
    </div>
    <div class="stack">
      ${!canBizMe('chit')?'':panel('Chit holdings',chitRows?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Group / ticket</th><th class="r">Chit value</th><th class="r">EMI</th><th>Tenure</th><th>Ends</th><th>Status</th></tr></thead><tbody>${chitRows}</tbody></table></div>`:emptyBox('No chits','Chit details recorded here are for relationship context; the chit software stays the system of record.'),{flush:true,right:W?`<button class="btn sm" data-a="chitForm" data-pid="${p.id}">${ic('plus')}Chit</button>`:''})}
      ${!canBizMe('re')?'':panel('Real estate',reRows?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Project / unit</th><th class="r">Ticket</th><th>Booked</th><th>Stage</th><th>Payment</th></tr></thead><tbody>${reRows}</tbody></table></div>`:emptyBox('No property',x.chits.length?'This is a chit customer with no property. Consider a real estate conversation.':'Property enquiries and bookings appear here.'),{flush:true,right:W?`<button class="btn sm" data-a="reForm" data-pid="${p.id}">${ic('plus')}Property</button>`:''})}
      ${x.refLeads.length?panel('Leads they endorsed · '+plural(x.refLeads.length,'lead'),endRows?`<div class="list">${endRows}</div>`:'<div class="muted small">These leads belong to a business you cannot see.</div>',{flush:!!endRows,right:`<span class="small muted">“${esc(bOv('leads','referrer').label||'Referred by')}” on these leads</span>`}):''}
      ${panel('Leads',leadRows?`<div class="list">${leadRows}</div>`:emptyBox('No leads','Add a lead to track an opportunity with any of your businesses.'),{flush:true,right:W?`<button class="btn sm" data-a="leadForm" data-pid="${p.id}">${ic('plus')}Lead</button>`:''})}
      ${panel('Interactions',intRows?`<div class="timeline">${intRows}</div>`:emptyBox('Nothing logged yet','Log calls, meetings and WhatsApp chats so the context is never lost.'),{right:W?`<button class="btn sm" data-a="intForm" data-pid="${p.id}">${ic('plus')}Log</button>`:''})}
      ${R().camp?panel('Campaign history',campRows?`<div class="list">${campRows}</div>`:emptyBox('No campaigns yet','Campaigns sent to this person and their responses are listed here.'),{flush:true}):''}
    </div>
  </div>
  <div class="small faint" style="margin-top:16px">Created ${fmtDate(p.createdAt)} · updated ${fmtDate(p.updatedAt)}</div>`;
};

/* ---- companies ---- */
function filteredCompanies(){
  const q=S.ui.cq.toLowerCase(),f=S.ui.cf||{};
  return [...X.co.values()].filter(c=>{const co=c.c;
    if(!inBiz(c.biz))return false;
    if(q&&!(co.name+' '+(co.industry||'')+' '+(co.region||'')+' '+groupName(co.groupId)+' '+(co.gst||'')).toLowerCase().includes(q))return false;
    if(f.industry&&co.industry!==f.industry)return false;if(f.region&&co.region!==f.region)return false;
    if(f.group&&co.groupId!==f.group)return false;if(f.owner&&!(co.owners||[]).includes(f.owner))return false;
    if(f.black==='yes'&&!c.black)return false;if(f.black==='no'&&c.black)return false;
    for(const cf of customFields('companies')){const k='cf_'+cf.key;if(f[k]){const v=(co.cf||{})[cf.key];if(!([].concat(v==null?[]:v).map(String).includes(f[k])))return false}}
    return true}).sort((a,b)=>a.c.name.localeCompare(b.c.name));
}
function companyRow(c){const co=c.c;return `<div class="li" data-a="openCompany" data-id="${co.id}"><div class="avatar co">${esc(initials(co.name))}</div><div class="main-t"><div class="t">${esc(co.name)}</div><div class="s">${esc([groupName(co.groupId)&&'Group: '+groupName(co.groupId),co.industry,co.region,(co.owners||[]).join(', ')].filter(Boolean).join(' · ')||'No details yet')}</div></div><div class="end">${blackChip(c.black)}${bizChips(c.biz)}<span class="chip num">${plural(c.people.length,'person','people')}</span></div></div>`}
VIEWS.companies=()=>{
  const f=S.ui.cf||{};const list=filteredCompanies();const lim=S.ui.climitCo||200;
  const cfSel=customFields('companies').filter(cf=>cf.type==='dropdown'||cf.type==='multi'||cf.type==='checkbox').map(cf=>sel('cf-cf_'+cf.key,'Any '+cf.label.toLowerCase(),cf.type==='checkbox'?[{v:'true',l:cf.label+': yes'}]:(cf.options||[]),f['cf_'+cf.key],'data-cf')).join('');
  const anyF=Object.values(f).some(Boolean)||S.ui.cq;
  return `<div class="ph"><div><h1>Companies</h1><div class="sub num">${list.length.toLocaleString('en-IN')} ${anyF||S.ui.biz?'matching':'companies'}${S.ui.biz?' in '+esc(bizName(S.ui.biz)):''}</div></div><div class="actions">${canWrite()?`<button class="btn pri" data-a="companyForm">${ic('plus')}Add company</button>`:''}<button class="btn" data-a="excel" data-k="companies">${ic('download')}Excel</button></div></div>
  <div class="filters"><input id="c-q" type="search" placeholder="Search company, GST, industry, group…" value="${esc(S.ui.cq)}" data-i="cq" style="flex:1;min-width:200px">
  ${sel('cf-group','All groups',[...D.groups.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(g=>({v:g.id,l:g.name})),f.group,'data-cf')}
  ${sel('cf-industry','All industries',industryNames(),f.industry,'data-cf')}${sel('cf-region','All regions',regionsAZ(),f.region,'data-cf')}
  ${sel('cf-owner','Any owner',S.config.owners,f.owner,'data-cf')}${sel('cf-black','Blacklist: any',[{v:'yes',l:'Blacklisted only'},{v:'no',l:'Not blacklisted'}],f.black,'data-cf')}${cfSel}
  ${anyF?'<button class="btn ghost" data-a="clearCoFilters">Clear</button>':''}</div>
  <div class="panel">${list.length?`<div class="list">${list.slice(0,lim).map(companyRow).join('')}</div>${list.length>lim?`<div style="padding:12px;text-align:center"><button class="btn" data-a="moreCos">Show more</button></div>`:''}`:emptyBox(anyF?'No companies match':'No companies yet',anyF?'Try removing a filter.':'Add a company, or import contacts with their company names.',canWrite()&&!anyF?'<button class="btn pri" data-a="companyForm">Add a company</button>':'')}</div>`;
};
VIEWS.company=()=>{
  const cx=X.co.get(S.route.id);if(!cx)return emptyBox('Company not found','It may have been deleted.','<button class="btn" data-a="go" data-v="companies">Back</button>');
  const c=cx.c;const W=canWrite();
  const links=Object.entries(c.links||{}).filter(([k,v])=>v);if(c.website)links.unshift(['website',c.website]);
  const g=c.groupId&&X.g.get(c.groupId);
  const ppl=cx.people.filter(o=>visible(o.p)).map(o=>personRow(P(o.p.id),{extra:esc(o.role||''),end:W?`<button class="btn sm ghost" data-a="unlinkPerson" data-pid="${o.p.id}" data-cid="${c.id}">Remove</button>`:''})).join('');
  const leadIds=new Set(cx.leads.map(l=>l.id));cx.people.forEach(o=>{const x=P(o.p.id);x&&x.leads.forEach(l=>leadIds.add(l.id))});
  const leads=[...leadIds].map(id=>D.leads.get(id)).filter(l=>l&&leadVisible(l));
  const siblings=g?g.cos.filter(o=>o.c.id!==c.id):[];
  return `<div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-a="back">${ic('back')}Back</button></div>
  <div class="p-head"><div class="avatar lg co">${esc(initials(c.name))}</div><div class="who">
    <h1>${esc(c.name)}</h1>
    <div class="row" style="margin-top:6px">${blackChip(cx.black)}${g?`<button class="chip grp" data-a="openGroup" data-id="${g.g.id}">Group: ${esc(g.g.name)}</button>`:''}${bizChips(cx.biz)}${(c.owners||[]).map(o=>`<span class="chip">${esc(o)}</span>`).join('')}</div>
    <div class="muted" style="margin-top:6px">${esc([c.industry,c.subIndustry,c.region].filter(Boolean).join(' · ')||'Industry and region not set')}</div>
    ${cx.black?`<div class="note bad" style="margin-top:10px">Blacklisted (${esc(BL_KINDS[cx.black.kind])}${cx.black.kind!=='company'?': '+esc(cx.black.value):''})${cx.black.reason?' · '+esc(cx.black.reason):''}${cx.black.by?' · by '+esc(cx.black.by):''}</div>`:''}
    <div class="quick">${W?`<button class="btn pri" data-a="leadForm" data-cid="${c.id}">${ic('plus')}New lead</button><button class="btn" data-a="linkPerson" data-cid="${c.id}">${ic('people')}Add person</button><button class="btn" data-a="companyForm" data-id="${c.id}">${ic('edit')}Edit</button>`:''}
      <button class="btn" data-a="refs" data-cid="${c.id}">${ic('network')}Find references</button>
      ${W?(cx.black&&cx.black.kind==='company'?(R().del?`<button class="btn" data-a="unblack" data-id="${cx.black.id}">Remove from blacklist</button>`:''):(!cx.black?`<button class="btn danger" data-a="blackForm" data-kind="company" data-v="${c.id}">Blacklist</button>`:'')):''}</div>
  </div></div>
  <div class="grid p-grid" style="margin-top:20px">
    <div class="stack">
      ${panel('Company details',`<dl class="kv"><dt>Group</dt><dd>${g?`<a href="#" data-a="openGroup" data-id="${g.g.id}">${esc(g.g.name)}</a>`:'—'}</dd><dt>Businesses</dt><dd>${[...cx.biz].map(bizName).filter(Boolean).map(esc).join(', ')||'—'}</dd><dt>Owners</dt><dd>${esc((c.owners||[]).join(', ')||'—')}</dd><dt>Phone</dt><dd class="num">${(c.phones||[]).map(esc).join('<br>')||'—'}</dd><dt>Email</dt><dd>${esc(c.email||'—')}</dd><dt>GST</dt><dd class="num">${esc(c.gst||'—')}</dd><dt>Turnover</dt><dd>${esc(c.turnover||'—')}</dd><dt>Employees</dt><dd>${esc(c.employees||'—')}</dd><dt>Address</dt><dd>${esc([c.address,c.city,c.pincode].filter(Boolean).join(', ')||'—')}</dd>${cfRows('companies',c.cf)}</dl>
        ${links.length?`<div class="row" style="margin-top:12px">${links.map(([k,v])=>`<a class="btn sm" href="${esc(/^https?:/i.test(v)?v:'https://'+v)}" target="_blank" rel="noopener">${ic('link')}${esc({linkedin:'LinkedIn',facebook:'Facebook',instagram:'Instagram',x:'X',website:'Website',justdial:'Justdial',indiamart:'IndiaMART',news:'News'}[k]||k)}</a>`).join('')}</div>`:''}${c.notes?`<div class="note" style="margin-top:12px;white-space:pre-wrap">${esc(c.notes)}</div>`:''}`)}
      ${docsPanel('companies',c.id)}
      ${siblings.length?panel('Other companies in '+esc(g.g.name),`<div class="list">${siblings.map(companyRow).join('')}</div>`,{flush:true}):''}
    </div>
    <div class="stack">
      ${panel(`People <span class="muted num">(${cx.people.length})</span>`,ppl?`<div class="list">${ppl}</div>`:emptyBox('No people linked','Add the owners, directors and staff you deal with.'),{flush:!!ppl,right:W?`<button class="btn sm" data-a="linkPerson" data-cid="${c.id}">${ic('plus')}Person</button>`:''})}
      ${panel(`Leads <span class="muted num">(${leads.length})</span>`,leads.length?`<div class="list">${leads.map(leadRow).join('')}</div>`:emptyBox('No leads','Leads for this company or its people appear here.'),{flush:!!leads.length})}
    </div>
  </div>`;
};

/* ---- groups ---- */
VIEWS.groups=()=>{
  const q=(S.ui.gq||'').toLowerCase();
  const gs=[...X.g.values()].filter(g=>!q||g.g.name.toLowerCase().includes(q)).filter(g=>!S.ui.biz||g.cos.some(c=>c.biz.has(S.ui.biz))).sort((a,b)=>a.g.name.localeCompare(b.g.name));
  return `<div class="ph"><div><h1>Groups</h1><div class="sub">Business groups and families, each with one or more companies.</div></div><div class="actions">${canWrite()?`<button class="btn pri" data-a="groupForm">${ic('plus')}Add group</button>`:''}<button class="btn" data-a="excel" data-k="groups">${ic('download')}Excel</button></div></div>
  <div class="filters"><input id="g-q" type="search" placeholder="Search groups…" value="${esc(S.ui.gq||'')}" data-i="gq" style="flex:1;min-width:200px"></div>
  <div class="panel">${gs.length?`<div class="list">${gs.map(g=>{const ppl=new Set();g.cos.forEach(c=>c.people.forEach(o=>ppl.add(o.p.id)));const ol=g.cos.reduce((a,c)=>a+c.leads.filter(openLead).length,0);return `<div class="li" data-a="openGroup" data-id="${g.g.id}"><div class="avatar co">${esc(initials(g.g.name))}</div><div class="main-t"><div class="t">${esc(g.g.name)}</div><div class="s">${esc(g.cos.slice(0,4).map(c=>c.c.name).join(', ')+(g.cos.length>4?'…':''))||'No companies yet'}</div></div><div class="end"><span class="chip num">${plural(g.cos.length,'company','companies')}</span><span class="chip num">${plural(ppl.size,'person','people')}</span>${ol?`<span class="chip acc num">${ol} open leads</span>`:''}</div></div>`}).join('')}</div>`:emptyBox('No groups yet','A group ties together companies owned by the same family or promoter.',canWrite()?'<button class="btn pri" data-a="groupForm">Add a group</button>':'')}</div>`;
};
VIEWS.group=()=>{
  const g=X.g.get(S.route.id);if(!g)return emptyBox('Group not found','','<button class="btn" data-a="go" data-v="groups">Back</button>');
  const ppl=new Map();g.cos.forEach(c=>c.people.forEach(o=>{if(visible(o.p))ppl.set(o.p.id,{x:P(o.p.id),roles:(ppl.get(o.p.id)||{roles:[]}).roles.concat((o.role?o.role+', ':'')+c.c.name)})}));
  const leads=[];g.cos.forEach(c=>c.leads.forEach(l=>leadVisible(l)&&leads.push(l)));
  return `<div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-a="back">${ic('back')}Back</button></div>
  <div class="ph"><div><h1>${esc(g.g.name)}</h1><div class="sub">${plural(g.cos.length,'company','companies')} · ${plural(ppl.size,'person','people')}${g.g.notes?' · '+esc(g.g.notes):''}</div></div>
  <div class="actions">${canWrite()?`<button class="btn pri" data-a="companyForm" data-gid="${g.g.id}">${ic('plus')}Add company</button><button class="btn" data-a="groupForm" data-id="${g.g.id}">${ic('edit')}Edit</button>`:''}</div></div>
  ${customFields('groups').length?`<div style="margin-bottom:16px">${panel('Group details',`<dl class="kv">${cfRows('groups',g.g.cf)}</dl>`)}</div>`:''}
  <div class="grid g2">
    ${panel('Companies',g.cos.length?`<div class="list">${g.cos.map(companyRow).join('')}</div>`:emptyBox('No companies yet','Add companies to this group from here or from the company form.'),{flush:!!g.cos.length})}
    ${panel('People across the group',ppl.size?`<div class="list">${[...ppl.values()].map(o=>personRow(o.x,{extra:esc(o.roles.join(' · '))})).join('')}</div>`:emptyBox('No people yet','People linked to the group\'s companies appear here.'),{flush:!!ppl.size})}
    ${panel('Leads',leads.length?`<div class="list">${leads.map(leadRow).join('')}</div>`:emptyBox('No leads','Leads on any company in the group appear here.'),{flush:!!leads.length})}
  </div>`;
};
/* ---- references ---- */
/* ---- references (criteria set up in Setup → Referrals) ---- */
const REF_BASE={
  group:{l:'Same group',enum:()=>[...D.groups.values()].map(g=>({v:g.id,l:g.name})).sort((a,b)=>a.l.localeCompare(b.l)),p:x=>x.groups,c:c=>[c.groupId],show:v=>groupName(v)},
  industry:{l:'Same industry',enum:()=>industryNames(),p:x=>x.industries,c:c=>[c.industry]},
  subIndustry:{l:'Same sub-industry',enum:()=>subIndustries(),p:x=>x.cos.map(o=>o.co.subIndustry),c:c=>[c.subIndustry]},
  pincode:{l:'Same pincode',p:x=>[x.p.pincode,...x.cos.map(o=>o.co.pincode)],c:c=>[c.pincode]},
  region:{l:'Same region / locality',enum:()=>regionsAZ(),p:x=>x.regions,c:c=>[c.region]},
  city:{l:'Same city',p:x=>[x.p.city,...x.cos.map(o=>o.co.city)],c:c=>[c.city]},
  business:{l:'Deals with the same business of mine',enum:()=>businesses().map(b=>({v:b.id,l:b.name})),p:x=>[...x.biz],c:c=>c.businesses||[],show:v=>bizName(v)}
};
const DEFAULT_REF=[{k:'group',w:4,on:true},{k:'industry',w:3,on:true},{k:'pincode',w:3,on:true},{k:'region',w:2,on:true},{k:'subIndustry',w:2,on:false},{k:'city',w:1,on:false},{k:'business',w:1,on:false}];
const normRefVal=v=>String(v==null?'':v).trim().toLowerCase();
function refDefs(){
  const out=Object.assign({},REF_BASE);
  customFields('people').filter(f=>['dropdown','multi','text','number'].includes(f.type)).forEach(f=>{out['p:'+f.key]={l:'Same '+f.label.toLowerCase(),enum:f.type==='dropdown'||f.type==='multi'?()=>f.options||[]:null,p:x=>[].concat((x.p.cf||{})[f.key]??[]),c:()=>[]}});
  customFields('companies').filter(f=>['dropdown','multi','text','number'].includes(f.type)).forEach(f=>{out['c:'+f.key]={l:'Same company '+f.label.toLowerCase(),enum:f.type==='dropdown'||f.type==='multi'?()=>f.options||[]:null,p:x=>x.cos.flatMap(o=>[].concat((o.co.cf||{})[f.key]??[])),c:c=>[].concat((c.cf||{})[f.key]??[])}});
  return out;
}
function refCriteria(){
  const defs=refDefs();const saved=S.config.refCriteria;
  const list=(saved&&saved.length?saved:DEFAULT_REF).filter(r=>defs[r.k]);
  Object.keys(defs).forEach(k=>{if(!list.some(r=>r.k===k))list.push({k,w:1,on:false})});
  return list;
}
// target: {k: [values]}; scores everyone who shares a value, weighted
function findRefs(target,excludeId){
  const defs=refDefs();const crit=refCriteria().filter(r=>r.on);const anyone=S.config.refScope==='anyone';const out=[];
  const tv={};crit.forEach(r=>{tv[r.k]=new Set((target[r.k]||[]).map(normRefVal).filter(Boolean))});
  for(const x of visPeople()){
    if(x.p.id===excludeId||(!anyone&&x.holding==='Prospect'))continue;
    let sc=0;const why=[];
    for(const r of crit){if(!tv[r.k].size)continue;const vs=defs[r.k].p(x).map(normRefVal).filter(Boolean);if(vs.some(v=>tv[r.k].has(v))){sc+=r.w;why.push(defs[r.k].l.toLowerCase())}}
    if(!sc)continue;
    sc+={Platinum:2,Gold:1.5,Silver:.5}[x.p.grade]||0;sc+=Math.min(2,x.referred.length*.5);
    out.push({x,sc,why});
  }
  return out.sort((a,b)=>b.sc-a.sc);
}
function refTargetPerson(x){const defs=refDefs();const t={};Object.keys(defs).forEach(k=>t[k]=defs[k].p(x));return t}
function refTargetCompany(c){const defs=refDefs();const t={};Object.keys(defs).forEach(k=>t[k]=defs[k].c(c));return t}
function refsSheet(o){
  let target,exclude,title;
  if(o.pid){const x=P(o.pid);target=refTargetPerson(x);exclude=o.pid;title='References for '+x.p.name}
  else{const c=D.companies.get(o.cid);target=refTargetCompany(c);title='References for '+c.name}
  const defs=refDefs();const crit=refCriteria().filter(r=>r.on&&(target[r.k]||[]).some(Boolean));
  const r=findRefs(target,exclude).slice(0,25);
  openSheet({title,body:`<div class="small muted" style="margin-bottom:10px">${S.config.refScope==='anyone'?'People':'Existing customers'} matching on ${crit.map(c=>esc(defs[c.k].l.replace(/^Same /,'').replace(/^Deals with the same /,''))+': <b>'+esc((target[c.k]||[]).filter(Boolean).map(v=>defs[c.k].show?defs[c.k].show(v):v).join(', '))+'</b>').join(' · ')||'nothing yet. Fill in industry, pincode or region first'}. Change the rules in Setup → Referrals.</div>
    ${r.length?`<div class="panel"><div class="list">${r.map(z=>personRow(z.x,{extra:z.why.join(', '),end:gradeChip(z.x.p.grade)+contactBtns(z.x.p)})).join('')}</div></div>`:'<div class="empty">No matching people yet.</div>'}`});
}
function refFinderPanel(){
  const rf=S.ui.rf||{};const defs=refDefs();const crit=refCriteria().filter(r=>r.on);
  const inputs=crit.map(r=>{const d=defs[r.k];return d.enum?sel('rf-'+r.k,d.l.replace(/^Same /,'').replace(/^Deals with the same business of mine/,'Business').replace(/^./,m=>m.toUpperCase()),d.enum(),rf[r.k],'data-rf'):`<input type="search" id="rf-${esc(r.k)}" data-rfi="${esc(r.k)}" value="${esc(rf[r.k]||'')}" placeholder="${esc(d.l.replace(/^Same /,'').replace(/^./,m=>m.toUpperCase()))}" style="max-width:160px">`}).join('');
  const target={};let any=false;crit.forEach(r=>{if(rf[r.k]){target[r.k]=[rf[r.k]];any=true}});
  const refs=any?findRefs(target).slice(0,40):[];
  return panel('Find a reference',`<div class="filters" style="margin:0 0 4px">${inputs}</div><div class="small muted">${S.config.refScope==='anyone'?'People':'Existing customers'} who match, best-graded and most-connected first. Criteria and their weights are set in Setup → Referrals.</div>`+(refs.length?`</div><div class="bd flush"><div class="list">${refs.map(r=>personRow(r.x,{extra:r.why.join(', ')})).join('')}</div>`:(any?'<div class="empty">No one matches yet.</div>':'')));
}
function refListSheet(id,kind){
  const x=P(id);if(!x)return;
  if(kind==='leads'){const ls=x.refLeads.filter(leadVisible);openSheet({title:x.p.name+' · '+(bOv('leads','referrer').label||'Referred by'),body:ls.length?`<div class="list">${ls.map(leadRow).join('')}</div><div class="small muted" style="margin-top:10px">${plural(ls.length,'lead')} · ${inr(ls.reduce((a,l)=>a+leadVal(l),0))}</div>`:'<div class="muted">These leads belong to a business you cannot see.</div>'})}
  else{const ps=x.referred.map(r=>P(r.id)).filter(r=>r&&visible(r.p));openSheet({title:'Introduced by '+x.p.name,body:ps.length?`<div class="list">${ps.map(r=>personRow(r)).join('')}</div>`:'<div class="muted">No one you can see.</div>'})}
}
function refSetupTab(){
  const defs=refDefs();const crit=S.refDraft||(S.refDraft=clone(refCriteria()));
  return panel('Referral rules',`<p class="muted small" style="margin-top:0">When you look for someone who can vouch for a lead, a company or a person, the app scores everyone on the rules you switch on here. A higher weight counts for more. Your own dropdown and text fields on people and companies can be used too.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Use</th><th>Rule</th><th>Weight</th><th></th></tr></thead><tbody>${crit.map((r,i)=>`<tr><td><input type="checkbox" data-c="refOn" data-i="${i}" ${r.on?'checked':''} aria-label="Use ${esc(defs[r.k].l)}"></td><td><b>${esc(defs[r.k].l)}</b>${r.k.includes(':')?' <span class="chip">Your field</span>':''}</td><td><select data-c="refW" data-i="${i}" ${selS} aria-label="Weight">${[1,2,3,4,5].map(w=>`<option ${r.w===w?'selected':''}>${w}</option>`).join('')}</select></td><td class="r nowrap"><button class="iconbtn" data-a="refMove" data-i="${i}" data-v="-1" ${i?'':'disabled'} aria-label="Move up">↑</button><button class="iconbtn" data-a="refMove" data-i="${i}" data-v="1" ${i<crit.length-1?'':'disabled'} aria-label="Move down">↓</button></td></tr>`).join('')}</tbody></table></div>
    <div class="field" style="margin-top:14px"><span>Who can be suggested as a reference</span>${segI('refScope',[{v:'customers',l:'Existing customers only'},{v:'anyone',l:'Anyone in the network'}],S.refScopeDraft||S.config.refScope||'customers','refScope')}</div>
    <div class="row" style="margin-top:12px;justify-content:flex-end">${S.refDirty?'<span class="small muted">Unsaved changes</span><button class="btn sm" data-a="refReset">Undo</button>':''}<button class="btn pri sm" data-a="refSave" ${S.refDirty?'':'disabled'}>Save referral rules</button></div>`);
}

/* ---- leads ---- */
function leadRow(l){
  const st=stageOf(l);const t=todayISO();
  return `<div class="li" data-a="openLead" data-id="${l.id}"><div class="main-t"><div class="t">${esc(leadTitle(l))}</div><div class="s">${esc(bizName(leadBiz(l)))} · ${inr(leadVal(l))}${l.owner?' · '+esc(l.owner):''}${l.nextDate&&openLead(l)?' · next: '+esc(l.nextAction||'follow up')+' '+fmtDM(l.nextDate):''}</div></div><div class="end">${l.nextDate&&openLead(l)&&l.nextDate<t?'<span class="chip bad">Overdue</span>':''}<span class="chip ${st.kind==='won'?'good':st.kind==='lost'?'bad':'acc'}">${esc(st.name)}</span></div></div>`;
}
function filteredLeads(){
  const f=S.ui.lf||{};const q=(f.q||'').toLowerCase();
  return bizLeads().filter(l=>{
    if(f.owner&&(l.owner||'')!==f.owner)return false;if(f.source&&(l.source||'')!==f.source)return false;
    if(f.status==='open'&&!openLead(l))return false;if(f.status==='won'&&!isWon(l))return false;if(f.status==='lost'&&!isLost(l))return false;
    if(f.stage&&(f.stage.startsWith('name:')?stageOf(l).name!==f.stage.slice(5):stageOf(l).id!==f.stage))return false;
    if(f.due&&!(openLead(l)&&dueMatch(l,f.due,f.d1,f.d2)))return false;
    if(q){const c=l.companyId&&D.companies.get(l.companyId);if(!(leadTitle(l)+' '+(c?c.name:'')+' '+(l.notes||'')+' '+(l.source||'')).toLowerCase().includes(q))return false}
    for(const cf of customFields('leads')){const k='cf_'+cf.key;if(f[k]){const v=(l.cf||{})[cf.key];if(!([].concat(v==null?[]:v).map(String).includes(f[k])))return false}}
    return true});
}
VIEWS.leads=()=>{
  const mode=S.ui.lmode||'board';const f=S.ui.lf||{};
  const bid=S.ui.biz||(mode==='board'||mode==='funnel'?allowedBiz()[0].id:'');
  const leads=filteredLeads().filter(l=>!bid||leadBiz(l)===bid);
  const open=leads.filter(openLead);const t=todayISO();
  const stages=bid?stagesFor(bid):[];
  const cfSel=customFields('leads').filter(cf=>cf.type==='dropdown'||cf.type==='multi').map(cf=>`<select data-lf="cf_${esc(cf.key)}" aria-label="${esc(cf.label)}"><option value="">Any ${esc(cf.label.toLowerCase())}</option>${(cf.options||[]).map(o=>`<option ${f['cf_'+cf.key]===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`).join('');
  const lsel=(k,label,opts)=>opts.length>BIG?combo({id:'lf-'+k,opts,val:f[k]||'',blank:label,label,attrs:`data-lf="${k}"`}):`<select data-lf="${k}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>${opts.map(o=>{const v=typeof o==='object'?o.v:o,lab=typeof o==='object'?o.l:o;return `<option value="${esc(v)}" ${String(f[k]||'')===String(v)?'selected':''}>${esc(lab)}</option>`}).join('')}</select>`;
  let body='';
  if(mode==='board'){
    body=leads.length?`<div class="board">${stages.map(st=>{const ls=leads.filter(l=>stageOf(l)===st).sort((a,b)=>String(a.nextDate||'9').localeCompare(String(b.nextDate||'9')));const tot=ls.reduce((a,l)=>a+leadVal(l),0);const i=stages.indexOf(st);const next=stages.slice(i+1).find(s=>s.kind!=='lost');
      return `<div class="col ${st.kind}" data-stage="${esc(st.id)}"><div class="ch"><span>${esc(st.name)} <span class="v num">${ls.length}</span></span><span class="v num">${inr(tot)}</span></div>
      ${ls.slice(0,100).map(l=>{const late=l.nextDate&&openLead(l)&&l.nextDate<t;const cm=(X.comments.get(l.id)||[]).filter(m=>m.kind!=='stage').length;
        return `<div class="card" draggable="${canWrite()}" data-lead="${l.id}" data-a="openLead" data-id="${l.id}"><div class="t">${esc(leadTitle(l))}</div><div class="s">${esc([l.companyId&&l.personId?(D.companies.get(l.companyId)||{}).name:'',l.source].filter(Boolean).join(' · '))}</div><div class="spread"><span class="num">${inr(leadVal(l))}</span>${l.owner?`<span class="chip">${esc(l.owner)}</span>`:''}</div>${l.nextDate&&openLead(l)?`<div class="due ${late?'late':''}">${esc(l.nextAction||'Follow up')} · ${fmtDM(l.nextDate)}</div>`:''}<div class="spread"><span class="small muted">${cm?'💬 '+cm+' · ':''}updated ${agoDays(leadLastUpdate(l))===0?'today':agoDays(leadLastUpdate(l))+'d ago'}</span>${canWrite()&&next&&openLead(l)?`<button class="btn sm" data-a="advance" data-id="${l.id}">→ ${esc(next.name)}</button>`:''}</div></div>`}).join('')}</div>`}).join('')}</div><div class="small faint" style="margin-top:8px">Drag a card to another stage, or open it to change the stage and add comments.</div>`
      :`<div class="panel">${emptyBox('No leads yet for '+esc(bizName(bid)),'Capture a lead in seconds: person or company, business, stage and source.',canWrite()?`<button class="btn pri" data-a="leadForm" data-biz="${esc(bid)}">New lead</button>`:'')}</div>`;
  }else if(mode==='list'){
    const sorted=leads.slice().sort((a,b)=>(openLead(b)-openLead(a))||String(a.nextDate||'9').localeCompare(String(b.nextDate||'9')));
    body=`<div class="panel">${sorted.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Lead</th><th>Business</th><th>Stage</th><th class="r">Value</th><th>Owner</th><th>Follow-up</th><th>Last meeting</th><th>Last update</th><th>Last comment</th></tr></thead><tbody>${sorted.slice(0,500).map(l=>{const st=stageOf(l);const cms=(X.comments.get(l.id)||[]).filter(m=>m.kind!=='stage');const lc=cms[cms.length-1];const late=l.nextDate&&openLead(l)&&l.nextDate<t;
      return `<tr class="click" data-a="openLead" data-id="${l.id}"><td><b>${esc(leadTitle(l))}</b><div class="small muted">${esc(l.source||'')}</div></td><td>${esc(bizName(leadBiz(l)))}</td><td><span class="chip ${st.kind==='won'?'good':st.kind==='lost'?'bad':'acc'}">${esc(st.name)}</span></td><td class="r">${inr(leadVal(l))}</td><td>${esc(l.owner||'—')}</td><td>${openLead(l)?dueText(l.nextDate):'—'}</td><td class="small">${l.lastMeetingAt?esc(fmtDT(l.lastMeetingAt)):'—'}</td><td>${agoChip(leadLastUpdate(l))}</td><td class="small">${lc?`<b>${esc(lc.by||'')}</b>: ${esc(lc.text.slice(0,80))}`:'—'}</td></tr>`}).join('')}<tr class="tot"><td><b>Total · ${sorted.length} lead${sorted.length===1?'':'s'}</b></td><td></td><td></td><td class="r num"><b>${inr(sorted.reduce((a,l)=>a+leadVal(l),0))}</b></td><td colspan="5"></td></tr></tbody></table></div>`:emptyBox('No leads match','Try another filter.')}</div>`;
  }else{
    const fm=S.ui.fmode||'now';const fb=funnelFor(bid,leads,fm);const total=leads.length;
    const lostN=leads.filter(isLost).length;
    const seg=`<div class="seg" role="radiogroup" aria-label="Funnel type">${[['now','Where leads are now'],['ever','Ever reached']].map(([v,l])=>`<label><input type="radio" name="fmode" data-c="fmode" value="${v}" ${fm===v?'checked':''}><span>${l}</span></label>`).join('')}</div>`;
    let side;
    if(fm==='ever'){const st=stagesFor(bid).filter(s=>s.kind!=='lost');
      const steps=st.slice(1).map((s,i)=>{const a=fb[i].value,b=fb[i+1].value;return `<tr><td>${esc(st[i].name)} → ${esc(s.name)}</td><td class="r">${a?Math.round(100*b/a)+'%':'—'}</td></tr>`}).join('');
      side=panel('Stage-to-stage conversion',`<div class="tbl-wrap"><table class="tbl"><tbody>${steps}</tbody></table></div><div class="small muted" style="margin-top:8px">Counts every lead that ever reached a stage, even if it later moved back or was lost.</div>`);}
    else side=panel('By stage',`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Stage</th><th class="r">Leads</th><th class="r">Share</th><th class="r">Total value</th></tr></thead><tbody>${fb.map(r=>`<tr><td>${esc(r.label)}</td><td class="r num">${r.value}</td><td class="r num">${total?Math.round(100*r.value/total):0}%</td><td class="r num">${inr(r.amount)}</td></tr>`).join('')}<tr class="tot"><td><b>Total</b></td><td class="r num"><b>${total}</b></td><td class="r num">100%</td><td class="r num"><b>${inr(fb.reduce((a,r)=>a+r.amount,0))}</b></td></tr></tbody></table></div><div class="small muted" style="margin-top:8px">Each lead is counted once, in the stage it is in today.</div>`);
    const base=fm==='now'?Math.max(1,total):Math.max(1,fb[0]?fb[0].value:1);
    body=`<div style="margin-bottom:12px">${seg}</div><div class="grid g2"><div class="panel"><div class="hd"><h2>Funnel · ${esc(bizName(bid))}</h2><span class="small muted">${total} leads · ${lostN} lost</span></div><div class="bd">${total?`<div class="funnel">${fb.map(r=>`<div class="fstep ${r.cls}" style="--w:${Math.max(8,Math.round(100*r.value/base))}%"><span class="fl">${esc(r.label)}</span><span class="fv num">${r.value} · ${Math.round(100*r.value/base)}%${fm==='now'?' · '+inr(r.amount):''}</span></div>`).join('')}</div>`:'<div class="muted small">No leads yet.</div>'}</div></div>
      ${side}</div>`;
  }
  // totals for whatever the filters show
  const sumV=a=>a.reduce((t,l)=>t+leadVal(l),0);const wonL=leads.filter(isWon),lostL=leads.filter(isLost);
  const totals=`<div class="totals-bar"><span><b class="num">${leads.length}</b> lead${leads.length===1?'':'s'}</span><span>Total value <b class="num">${inr(sumV(leads))}</b></span><span class="muted">Open ${open.length} · <b class="num">${inr(sumV(open))}</b></span><span class="muted">Won ${wonL.length} · <b class="num">${inr(sumV(wonL))}</b></span><span class="muted">Lost ${lostL.length} · <b class="num">${inr(sumV(lostL))}</b></span></div>`;
  body=totals+body;
  const anyF=Object.values(f).some(Boolean);
  return `<div class="ph"><div><h1>Leads</h1><div class="sub num">${open.length} open · ${inr(open.reduce((a,l)=>a+leadVal(l),0))} in the pipeline${bid?' · '+esc(bizName(bid)):''}</div></div>
    <div class="actions"><div class="seg" role="radiogroup" aria-label="View">${[['board','Board'],['list','List'],['funnel','Funnel']].map(([v,l])=>`<label><input type="radio" name="lmode" data-c="lmode" value="${v}" ${mode===v?'checked':''}><span>${l}</span></label>`).join('')}</div>
    <button class="btn" data-a="excel" data-k="leads">${ic('download')}Excel</button>${canWrite()?`<button class="btn pri" data-a="leadForm" data-biz="${esc(bid||'')}">${ic('plus')}New lead</button>`:''}</div></div>
  <div class="filters">
    <div class="seg biz-seg" role="radiogroup" aria-label="Business">${mode==='list'?`<label><input type="radio" name="lbiz" data-c="biz" value="" ${!S.ui.biz?'checked':''}><span>All</span></label>`:''}${allowedBiz().map(b=>`<label><input type="radio" name="lbiz" data-c="biz" value="${esc(b.id)}" ${bid===b.id?'checked':''}><span>${esc(b.name)}</span></label>`).join('')}</div>
    <input type="search" data-lf="q" id="lf-q" placeholder="Search leads…" value="${esc(f.q||'')}" style="flex:1;min-width:160px">
    ${lsel('owner','All owners',S.config.owners)}${lsel('due','Any follow-up',DUE_WINDOWS.filter(o=>o.v!=='all'))}${f.due==='date'||f.due==='range'?`<input type="date" data-lfd="d1" value="${esc(f.d1||'')}" aria-label="From">`:''}${f.due==='range'?`<input type="date" data-lfd="d2" value="${esc(f.d2||'')}" aria-label="To">`:''}${lsel('source','All sources',S.config.sources)}${lsel('status','Open, won and lost',[{v:'open',l:'Open only'},{v:'won',l:'Won only'},{v:'lost',l:'Lost only'}])}${lsel('stage','All stages',uniq((bid?[bid]:allowedBiz().map(b=>b.id)).flatMap(b=>stagesFor(b).map(s=>s.name))).map(n=>({v:'name:'+n,l:n})))}${cfSel}
    ${anyF?'<button class="btn ghost" data-a="clearLeadFilters">Clear</button>':''}
  </div>${body}`;
};
VIEWS.pipeline=VIEWS.leads;
/* ---- follow-ups ---- */
const DUE_WINDOWS=[{v:'overdue',l:'Overdue'},{v:'today',l:'Due today'},{v:'due',l:'Overdue and due today'},{v:'7',l:'Due in the next 7 days'},{v:'10',l:'Due in the next 10 days'},{v:'15',l:'Due in the next 15 days'},{v:'30',l:'Due in the next month'},{v:'date',l:'On a date'},{v:'range',l:'Between two dates'},{v:'none',l:'No follow-up set'},{v:'all',l:'All open leads'}];
function dueMatch(l,w,d1,d2){
  const t=todayISO();const n=l.nextDate||'';
  if(w==='none')return !n;
  if(w==='all'||!w)return true;
  if(!n)return false;
  if(w==='overdue')return n<t;
  if(w==='today')return n===t;
  if(w==='due')return !!n&&n<=t;
  if(w==='date')return !!d1&&n===d1;
  if(w==='range')return (!d1||n>=d1)&&(!d2||n<=d2);
  const days=+w;return days>0&&n<=addDays(t,days);   // includes overdue: anything due by then
}
function leadLastUpdate(l){
  const cms=X.comments.get(l.id)||[];const lc=cms[cms.length-1];
  return [l.updatedAt,l.lastMeetingAt,l.lastActivityAt,lc&&lc.at].filter(Boolean).sort().pop()||l.createdAt||'';
}
const agoDays=iso=>iso?Math.max(0,daysSince(String(iso).slice(0,10))):null;
function agoChip(iso,label){const d=agoDays(iso);if(d==null)return '<span class="chip">never</span>';const cls=d<=3?'good':d<=7?'':d<=14?'warn':'bad';return `<span class="chip ${cls}" title="${esc(label||'')} ${esc(fmtDate(iso))}">${d===0?'today':d===1?'1 day ago':d+' days ago'}</span>`}
const fmtDT=iso=>{if(!iso)return '';const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
function dueText(n){if(!n)return '<span class="muted">Not set</span>';const d=-daysSince(n);return d<0?`<span class="late">${fmtDM(n)} · ${-d} day${d===-1?'':'s'} overdue</span>`:d===0?`<b>Today</b>`:d===1?'Tomorrow':`${fmtDM(n)} · in ${d} days`}
function fuBucket(l){const t=todayISO(),n=l.nextDate;if(!n)return 'none';if(n<t)return 'overdue';if(n===t)return 'today';if(n===addDays(t,1))return 'tomorrow';if(n<=addDays(t,7))return 'week';return 'later'}
const FU_BUCKETS=[['overdue','Overdue'],['today','Today'],['tomorrow','Tomorrow'],['week','Later this week'],['later','Later'],['none','No follow-up set']];
function followupLeads(){
  if(!S.ui.fu){const mine=S.me.owner&&[...D.leads.values()].some(l=>openLead(l)&&l.owner===S.me.owner);S.ui.fu={w:'7',owner:mine?S.me.owner:''}}
  const f=S.ui.fu;if(f.owner&&!S.config.owners.includes(f.owner)&&![...D.leads.values()].some(l=>l.owner===f.owner))f.owner='';
  return bizLeads().filter(l=>openLead(l)&&(!f.owner||(l.owner||'')===f.owner)&&(!f.stage||stageOf(l).id===f.stage)&&dueMatch(l,f.w,f.d1,f.d2)&&(!f.q||(leadTitle(l)+' '+((D.companies.get(l.companyId)||{}).name||'')+' '+(l.nextAction||'')).toLowerCase().includes(f.q.toLowerCase())))
    .sort((a,b)=>String(a.nextDate||'9999').localeCompare(String(b.nextDate||'9999')));
}
function fuRow(l){
  const x=l.personId&&P(l.personId);const co=l.companyId&&D.companies.get(l.companyId);const st=stageOf(l);
  return `<tr class="click" data-a="openLead" data-id="${l.id}"><td><b>${esc(leadTitle(l))}</b><div class="small muted">${esc([co&&x?co.name:'',bizName(leadBiz(l))].filter(Boolean).join(' · '))}</div></td>
    <td><span class="chip acc">${esc(st.name)}</span></td>
    <td>${dueText(l.nextDate)}${l.nextAction?`<div class="small muted">${esc(l.nextAction)}</div>`:''}</td>
    <td class="small">${l.lastMeetingAt?esc(fmtDT(l.lastMeetingAt))+'<br>'+agoChip(l.lastMeetingAt,'Last meeting'):'<span class="muted">No meeting logged</span>'}</td>
    <td>${agoChip(leadLastUpdate(l),'Last update')}</td><td>${esc(l.owner||'—')}</td>
    <td class="r nowrap" data-stop-row="1">${x?contactBtns(x.p):''}${canWrite()?`<button class="btn sm" data-a="logMeet" data-id="${l.id}">Log</button><button class="btn sm ghost" data-a="resched" data-id="${l.id}">Reschedule</button>`:''}</td></tr>`;
}
VIEWS.followups=()=>{
  const list=followupLeads();const f=S.ui.fu;const allOwners=uniq([...S.config.owners,...[...D.leads.values()].filter(openLead).map(l=>l.owner).filter(Boolean)]);const all=bizLeads().filter(l=>openLead(l)&&(!f.owner||(l.owner||'')===f.owner));const t=todayISO();
  const cnt=w=>all.filter(l=>dueMatch(l,w)).length;
  const groups=FU_BUCKETS.map(([k,lab])=>[lab,list.filter(l=>fuBucket(l)===k)]).filter(g=>g[1].length);
  const ownerSel=`<select data-c="fuOwner" aria-label="Owner"><option value="">All owners</option>${allOwners.map(o=>`<option ${f.owner===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  return `<div class="ph"><div><h1>Follow-ups</h1><div class="sub">${f.owner?esc(f.owner)+"'s":'Everyone’s'} open leads by follow-up date${S.ui.biz?' · '+esc(bizName(S.ui.biz)):''}</div></div>
    <div class="actions">${R().exp?`<button class="btn" data-a="exportFollowups">${ic('download')}Download Excel</button>`:''}</div></div>
  <div class="grid g4" style="margin-bottom:14px">
    <button class="panel stat click ${f.w==='overdue'?'sel':''}" data-a="fuWin" data-v="overdue"><div class="k">Overdue</div><div class="v ${cnt('overdue')?'late':''}">${cnt('overdue')}</div><div class="d">past their follow-up date</div></button>
    <button class="panel stat click ${f.w==='today'?'sel':''}" data-a="fuWin" data-v="today"><div class="k">Today</div><div class="v">${cnt('today')}</div><div class="d">${fmtDate(t)}</div></button>
    <button class="panel stat click ${f.w==='7'?'sel':''}" data-a="fuWin" data-v="7"><div class="k">Next 7 days</div><div class="v">${cnt('7')}</div><div class="d">including overdue</div></button>
    <button class="panel stat click ${f.w==='none'?'sel':''}" data-a="fuWin" data-v="none"><div class="k">No follow-up set</div><div class="v ${cnt('none')?'late':''}">${cnt('none')}</div><div class="d">open leads with no date</div></button>
  </div>
  <div class="filters">
    <select data-c="fuWin" aria-label="Follow-up due">${DUE_WINDOWS.map(o=>`<option value="${o.v}" ${f.w===o.v?'selected':''}>${o.l}</option>`).join('')}</select>
    ${f.w==='date'?`<input type="date" data-fud="d1" value="${esc(f.d1||'')}" aria-label="Date">`:''}${f.w==='range'?`<input type="date" data-fud="d1" value="${esc(f.d1||'')}" aria-label="From"><input type="date" data-fud="d2" value="${esc(f.d2||'')}" aria-label="To">`:''}
    ${ownerSel}
    <select data-c="biz" aria-label="Business"><option value="">All businesses</option>${allowedBiz().map(b=>`<option value="${esc(b.id)}" ${S.ui.biz===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select>
    ${S.ui.biz?`<select data-c="fuStage" aria-label="Stage"><option value="">All stages</option>${stagesFor(S.ui.biz).filter(s=>s.kind==='open').map(s=>`<option value="${esc(s.id)}" ${f.stage===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select>`:''}
    <input type="search" id="fu-q" data-i="fuq" value="${esc(f.q||'')}" placeholder="Search…" style="flex:1;min-width:150px">
  </div>
  ${groups.length?groups.map(([lab,ls])=>`<section class="panel fu-group"><div class="hd"><h2>${esc(lab)} <span class="muted num">(${ls.length})</span></h2></div><div class="bd flush"><div class="tbl-wrap"><table class="tbl fu-tbl"><thead><tr><th>Lead</th><th>Stage</th><th>Follow-up</th><th>Last meeting</th><th>Last update</th><th>Owner</th><th></th></tr></thead><tbody>${ls.map(fuRow).join('')}</tbody></table></div></div></section>`).join(''):`<div class="panel">${emptyBox('Nothing here','No open leads match this follow-up window. Try a longer window or all owners.')}</div>`}`;
};
function logMeetSheet(id){
  const l=D.leads.get(id);if(!l)return;const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  openSheet({title:'Log a meeting or call · '+leadTitle(l),form:'logMeet',body:`<input type="hidden" name="id" value="${esc(id)}"><div class="form">
    ${fld('What happened',segI('type',['Meeting','Call','Visit','WhatsApp','Email'],'Meeting'),{full:true})}
    ${fld('When',`<input type="datetime-local" id="fm-when" name="when" value="${now.toISOString().slice(0,16)}" required>`)}
    ${fld('Move to stage',selI('stage',stagesFor(leadBiz(l)).map(s=>({v:s.id,l:s.name})),stageOf(l).id,null))}
    ${fld('Notes from the meeting',`<textarea id="fm-summary" name="summary" placeholder="What was discussed, what was agreed"></textarea>`,{full:true})}
    <div class="full row" style="gap:6px"><span class="small muted">Next follow-up:</span>${[['Tomorrow',1],['3 days',3],['1 week',7],['2 weeks',14],['1 month',30]].map(([lab,n])=>`<button type="button" class="btn sm" data-a="fuQuick" data-n="${n}">${lab}</button>`).join('')}</div>
    ${fld('Next follow-up date',inp('nextDate',addDays(todayISO(),7),{type:'date'}))}
    ${fld('Next follow-up: what to do',inp('nextAction','',{ph:'e.g. Send the agreement'}))}
  </div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>'});
}
function reschedSheet(id){
  const l=D.leads.get(id);if(!l)return;
  openSheet({title:'Reschedule follow-up · '+leadTitle(l),form:'resched',body:`<input type="hidden" name="id" value="${esc(id)}"><div class="form">
    <div class="full row" style="gap:6px">${[['Tomorrow',1],['3 days',3],['1 week',7],['2 weeks',14],['1 month',30]].map(([lab,n])=>`<button type="button" class="btn sm" data-a="fuQuick" data-n="${n}">${lab}</button>`).join('')}</div>
    ${fld('New follow-up date',inp('nextDate',l.nextDate&&l.nextDate>=todayISO()?l.nextDate:addDays(todayISO(),1),{type:'date'}))}
    ${fld('What to do',inp('nextAction',l.nextAction||''))}
    ${fld('Reason (added as a comment)',inp('reason','',{ph:'Optional'}),{full:true})}
  </div>`,foot:`<button type="button" class="btn" data-a="fuClear" data-id="${esc(id)}" style="margin-right:auto">Clear follow-up</button><button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>`});
}
async function saveLogMeet(fd){
  const l=clone(D.leads.get(fd.get('id')));if(!l)return;
  const type=fd.get('type')||'Meeting';const when=fd.get('when')?new Date(fd.get('when')).toISOString():nowISO();const summary=String(fd.get('summary')||'').trim();
  if(type==='Meeting'||type==='Visit')l.lastMeetingAt=when;
  l.lastActivityAt=when;l.nextDate=fd.get('nextDate')||'';l.nextAction=String(fd.get('nextAction')||'').trim();
  const by=S.me.owner||S.me.name||S.me.email;
  await put('interactions',{personId:l.personId||'',leadId:l.id,type,date:when.slice(0,10),at:when,summary,by,followUp:''},{audit:false});
  await put('comments',{leadId:l.id,personId:l.personId||'',kind:'log',text:`${type} on ${fmtDT(when)}${summary?': '+summary:''}`,by,byId:S.me.id,at:nowISO()},{audit:false});
  const x=l.personId&&P(l.personId);if(x&&(!x.p.lastContacted||x.p.lastContacted<when.slice(0,10))){const p=clone(x.p);p.lastContacted=when.slice(0,10);await put('people',p,{audit:false})}
  const newStage=fd.get('stage');l._title=leadTitle(l);await put('leads',l,{note:leadTitle(l)+': '+type.toLowerCase()+' logged'});
  if(newStage&&newStage!==stageOf(l).id)await setLeadStage(l.id,newStage);
  closeSheet();toast(type+' logged');
}
async function saveResched(fd){
  const l=clone(D.leads.get(fd.get('id')));if(!l)return;const old=l.nextDate;
  l.nextDate=fd.get('nextDate')||'';l.nextAction=String(fd.get('nextAction')||'').trim();l._title=leadTitle(l);
  await put('leads',l,{note:leadTitle(l)+': follow-up '+(old?fmtDM(old)+' → ':'')+fmtDM(l.nextDate)});
  const reason=String(fd.get('reason')||'').trim();
  await put('comments',{leadId:l.id,personId:l.personId||'',kind:'log',text:`Follow-up moved${old?' from '+fmtDate(old):''} to ${fmtDate(l.nextDate)}${reason?': '+reason:''}`,by:S.me.owner||S.me.name||S.me.email,byId:S.me.id,at:nowISO()},{audit:false});
  closeSheet();toast('Follow-up set for '+fmtDate(l.nextDate));
}

VIEWS.lead=()=>{
  const l=D.leads.get(S.route.id);if(!l||!leadVisible(l))return emptyBox('Lead not found','It may have been deleted.','<button class="btn" data-a="go" data-v="leads">Back to leads</button>');
  const st=stageOf(l);const stages=stagesFor(leadBiz(l));const W=canWrite();
  const x=l.personId&&P(l.personId);const cx=l.companyId&&X.co.get(l.companyId);
  const cms=X.comments.get(l.id)||[];
  const ints=x?x.ints.filter(i=>!i.leadId||i.leadId===l.id).slice(0,10):[];
  const ref=l.referrerId&&P(l.referrerId);
  return `<div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-a="back">${ic('back')}Back</button></div>
  <div class="ph"><div><div class="eyebrow">${esc(bizName(leadBiz(l)))} lead</div><h1>${esc(leadTitle(l))}</h1><div class="sub">${[x&&cx?`<a href="#" data-a="openCompany" data-id="${cx.c.id}">${esc(cx.c.name)}</a>`:'',inr(leadVal(l)),l.owner?'Owner: '+esc(l.owner):'',l.source?'Source: '+esc(l.source):''].filter(Boolean).join(' · ')}</div></div>
    <div class="actions">${x?`<button class="btn" data-a="openPerson" data-id="${x.p.id}">${ic('people')}Person</button>`:''}${cx?`<button class="btn" data-a="openCompany" data-id="${cx.c.id}">${ic('companies')}Company</button>`:''}${W?`<button class="btn pri" data-a="logMeet" data-id="${l.id}">${ic('log')}Log meeting / call</button><button class="btn" data-a="resched" data-id="${l.id}">${ic('today')}Reschedule</button><button class="btn" data-a="leadForm" data-id="${l.id}">${ic('edit')}Edit</button>`:''}</div></div>
  ${(x&&(x.black||x.coBlack))||(cx&&cx.black)?`<div class="note bad" style="margin-bottom:14px">Blacklisted ${x&&x.black?'person':'company'} · ${esc(((x&&(x.black||x.coBlack))||cx.black).reason||'no reason recorded')}</div>`:''}
  <div class="stepper" role="list">${stages.map((s,i)=>`<button class="step ${s===st?'on':''} ${s.kind} ${i<stages.indexOf(st)&&st.kind!=='lost'?'done':''}" ${W?`data-a="setStage" data-id="${l.id}" data-v="${esc(s.id)}"`:'disabled'} role="listitem">${esc(s.name)}</button>`).join('')}</div>
  <div class="grid p-grid" style="margin-top:16px">
    <div class="stack">
      ${panel('Lead details',`<dl class="kv"><dt>Business</dt><dd>${esc(bizName(leadBiz(l)))}</dd><dt>Stage</dt><dd>${esc(st.name)}</dd><dt>Expected value</dt><dd class="num">${inrFull(leadVal(l))}</dd><dt>Owner</dt><dd>${esc(l.owner||'—')}</dd><dt>Source</dt><dd>${esc(l.source||'—')}</dd><dt>Referred by</dt><dd>${ref?`<a href="#" data-a="openPerson" data-id="${ref.p.id}">${esc(ref.p.name)}</a>`:'—'}</dd><dt>Follow-up</dt><dd>${openLead(l)?dueText(l.nextDate)+(l.nextAction?' · '+esc(l.nextAction):''):'—'}</dd><dt>Last meeting</dt><dd>${l.lastMeetingAt?esc(fmtDT(l.lastMeetingAt))+' '+agoChip(l.lastMeetingAt):'Not logged yet'}</dd><dt>Last update</dt><dd>${agoChip(leadLastUpdate(l))}</dd><dt>Created</dt><dd>${fmtDate(l.createdAt)}</dd>${l.closedAt?`<dt>Closed</dt><dd>${fmtDate(l.closedAt)}</dd>`:''}${cfRows('leads',l.cf)}</dl>${l.notes?`<div class="note" style="margin-top:12px;white-space:pre-wrap">${esc(l.notes)}</div>`:''}`)}
      ${x?panel('Contact',personRow(x,{end:contactBtns(x.p)}),{flush:true}):''}
      ${ints.length?panel('Interactions',`<div class="timeline">${ints.map(i=>`<div class="tl"><div class="when">${fmtDate(i.date)}<div>${esc(i.type)}</div></div><div>${esc(i.summary||'—')}<div class="small muted">${esc(i.by||'')}</div></div></div>`).join('')}</div>`):''}
    </div>
    ${panel(`Comments & activity <span class="muted num">(${cms.filter(m=>m.kind!=='stage').length})</span>`,`
      ${W?`<form data-f="comment" class="comment-box"><input type="hidden" name="leadId" value="${l.id}"><textarea id="fm-comment" name="text" placeholder="Add a comment as ${esc(S.me.owner||S.me.name||'you')}…" required></textarea><div class="row" style="justify-content:space-between"><span class="small muted">Shown with your name and the time.</span><button class="btn pri sm" type="submit">Comment</button></div></form>`:''}
      <div class="comments">${cms.length?cms.slice().reverse().map(m=>m.kind==='log'?`<div class="cm sys log"><span><b>${esc(m.by||'')}</b> · ${esc(m.text)}</span><span class="small muted">${new Date(m.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>`:m.kind==='stage'?`<div class="cm sys"><span>${esc(m.by||'')} moved this to <b>${esc(m.text)}</b></span><span class="small muted">${new Date(m.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>`:`<div class="cm"><div class="avatar sm">${esc(initials(m.by))}</div><div class="cm-b"><div class="cm-h"><b>${esc(m.by||'Someone')}</b><span class="small muted">${new Date(m.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>${(m.byId===S.me.id||R().settings)?`<button class="iconbtn" data-a="delComment" data-id="${m.id}" title="Delete comment">${ic('trash')}</button>`:''}</div><div class="cm-t">${esc(m.text)}</div></div></div>`).join(''):'<div class="muted small">No comments yet. Add notes from calls and meetings so everyone sees the latest.</div>'}</div>`)}
  </div>`;
};
async function setLeadStage(id,stageId){
  const l=clone(D.leads.get(id));if(!l)return;const before=stageOf(l);
  l.stage=stageId;l.business=leadBiz(l);l._title=leadTitle(l);const after=stageOf(l);if(after===before)return;
  const idx=stagesFor(l.business).indexOf(after);if(after.kind!=='lost')l.reached=Math.max(l.reached||0,idx);
  if(!openLead(l))l.closedAt=l.closedAt||todayISO();else delete l.closedAt;
  await put('leads',l,{note:leadTitle(l)+': '+before.name+' → '+after.name});
  await put('comments',{leadId:l.id,personId:l.personId||'',kind:'stage',text:after.name,by:S.me.owner||S.me.name||S.me.email,byId:S.me.id,at:nowISO()},{audit:false});
  toast('Moved to '+after.name);
}
/* ---- referrals / network ---- */
VIEWS.network=()=>{
  const ppl=visPeople();
  const board=ppl.filter(x=>x.referred.length||x.refLeads.length).sort((a,b)=>b.refBusiness-a.refBusiness||b.referred.length-a.referred.length).slice(0,50);
  const roots=ppl.filter(x=>!x.p.introducedBy&&x.referred.length).sort((a,b)=>b.referred.length-a.referred.length).slice(0,12);
  const tree=(x,d)=>`<li><span class="node" data-a="openPerson" data-id="${x.p.id}"><b>${esc(x.p.name)}</b> ${holdChip(x.holding)}</span>${d<4&&x.referred.length?`<ul>${x.referred.map(r=>P(r.id)).filter(r=>r&&visible(r.p)).map(r=>tree(r,d+1)).join('')}</ul>`:''}</li>`;
  return `<div class="ph"><div><h1>Referrals & references</h1><div class="sub">Who introduced whom, who brings in business, and who can vouch for a new lead.</div></div></div>
  <div class="grid g2">
    <div class="stack">
    ${refFinderPanel()}
    ${panel('Referral trees',roots.length?`<div class="tree"><ul>${roots.map(r=>tree(r,0)).join('')}</ul></div>`:emptyBox('No referral links yet','Set “Introduced by” on a person to build the tree.'))}
    </div>
    ${panel('Referral leaderboard',board.length?`<p class="small muted" style="margin:0 16px 8px">One row per person, counting both: how many people they brought into your network (“${esc(bOv('people','introducedBy').label||'Introduced by')}” on people) and how many leads they sent you (“${esc(bOv('leads','referrer').label||'Referred by')}” on leads).</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th class="r" title="People whose “${esc(bOv('people','introducedBy').label||'Introduced by')}” is this person">${esc(bOv('people','introducedBy').label||'Introduced by')}</th><th class="r" title="Leads whose “${esc(bOv('leads','referrer').label||'Referred by')}” is this person">${esc(bOv('leads','referrer').label||'Referred by')} (leads)</th><th class="r">Business from those leads</th></tr></thead><tbody>${board.map(x=>`<tr class="click" data-a="openPerson" data-id="${x.p.id}"><td>${esc(x.p.name)}<div class="small muted">${esc(x.coNames[0]||'')}</div></td><td class="r">${x.referred.length?`<button class="linkbtn num" data-a="refList" data-k="intro" data-id="${x.p.id}" data-stop-row="1">${x.referred.length}</button>`:'0'}</td><td class="r">${x.refLeads.length?`<button class="linkbtn num" data-a="refList" data-k="leads" data-id="${x.p.id}" data-stop-row="1">${x.refLeads.length}</button>`:'0'}</td><td class="r">${inr(x.refBusiness)}</td></tr>`).join('')}</tbody></table></div>`:emptyBox('No referrers yet','Referrers appear once people have an introducer or leads have a referrer.'),{flush:true})}
  </div>`;
};

/* ---- segments ---- */
VIEWS.lists=()=>{
  const ls=[...D.lists.values()].sort((a,b)=>a.name.localeCompare(b.name));
  return `<div class="ph"><div><h1>Segments</h1><div class="sub">Saved, rule-based lists that refresh on their own as records change.</div></div><div class="actions">${canWrite()?`<button class="btn pri" data-a="listForm">${ic('plus')}New segment</button>`:''}</div></div>
  <div class="panel">${ls.length?`<div class="list">${ls.map(l=>{const n=evalRules(l.rules).length;return `<div class="li" data-a="openList" data-id="${l.id}"><div class="main-t"><div class="t">${esc(l.name)}</div><div class="s">${(l.rules||[]).map(ruleText).map(esc).join(' AND ')||'Everyone'}</div></div><div class="end"><span class="chip acc num">${n.toLocaleString('en-IN')}</span>${canWrite()?`<button class="btn sm" data-a="listForm" data-id="${l.id}">Edit</button>`:''}${R().camp&&R().write?`<button class="btn sm" data-a="campaignForm" data-list="${l.id}">Campaign</button>`:''}</div></div>`}).join('')}</div>`:emptyBox('No segments yet','Example: Industry is Pharma AND Region is Jubilee Hills AND Chit value > ₹10 L AND Holding type is Chit only.',canWrite()?'<button class="btn pri" data-a="listForm">Build a segment</button>':'')}</div>`;
};

/* ---- campaigns ---- */
function campStats(c){
  const vals=Object.values(c.results||{}).filter(Boolean);
  const n=set=>vals.filter(v=>set.includes(v)).length;
  return {sent:vals.length,delivered:n(['delivered','read','replied','clicked','lead','opted out']),read:n(['read','replied','clicked','lead']),replied:n(['replied','lead']),clicked:n(['clicked']),lead:n(['lead']),opted:n(['opted out'])};
}
VIEWS.campaigns=()=>{
  if(!R().camp)return emptyBox('Campaigns are for owners and managers','Ask an owner if you need access.');
  const cs=[...D.campaigns.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return `<div class="ph"><div><h1>Campaigns</h1><div class="sub">WhatsApp and email outreach to saved segments, with consent checked on every send.</div></div><div class="actions">${R().write?`<button class="btn pri" data-a="campaignForm">${ic('plus')}New campaign</button>`:''}</div></div>
  <div class="note warn" style="margin-bottom:14px">Bulk WhatsApp goes only through an official WhatsApp Business Platform number with Meta-approved templates. Owners' personal numbers are used for one-to-one chats only. Until the Business number is live, campaigns here prepare the audience and messages, export the send file for your WhatsApp provider or email tool, and track results.</div>
  <div class="panel">${cs.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campaign</th><th>Channel</th><th>Status</th><th class="r">Sent</th><th class="r">Read</th><th class="r">Replied</th><th class="r">Leads</th><th class="r">Opted out</th></tr></thead><tbody>${cs.map(c=>{const s=campStats(c);return `<tr class="click" data-a="openCampaign" data-id="${c.id}"><td><b>${esc(c.name)}</b><div class="small muted">${esc((D.lists.get(c.listId)||{}).name||'')} · ${fmtDate(c.sentAt||c.schedule||c.createdAt)}</div></td><td>${c.channel==='email'?'Email':'WhatsApp'}</td><td><span class="chip ${c.status==='Sent'?'good':c.status==='Scheduled'?'acc':''}">${esc(c.status||'Draft')}</span></td><td class="r">${s.sent}</td><td class="r">${s.read}</td><td class="r">${s.replied}</td><td class="r">${s.lead}</td><td class="r">${s.opted}</td></tr>`}).join('')}</tbody></table></div>`:emptyBox('No campaigns yet','Build a segment first, then write the message once with merge fields like {{first_name}}.',R().write?'<button class="btn pri" data-a="campaignForm">New campaign</button>':'')}</div>`;
};
function campAudience(c){
  const L=D.lists.get(c.listId);const all=L?evalRules(L.rules):[];
  const ok=[],sup={};all.forEach(x=>{const r=suppression(x,c.channel);if(r)sup[r]=(sup[r]||0)+1;else ok.push(x)});
  return {all,ok,sup};
}
VIEWS.campaign=()=>{
  const c=D.campaigns.get(S.route.id);if(!c)return emptyBox('Campaign not found','','<button class="btn" data-a="go" data-v="campaigns">Back</button>');
  const {all,ok,sup}=campAudience(c);const s=campStats(c);const res=c.results||{};
  const sample=ok[0]||all[0];
  const recips=(c.status==='Sent'?Object.keys(res).filter(k=>res[k]).map(P).filter(Boolean):ok).slice(0,S.ui.climit||60);
  const total=c.status==='Sent'?Object.keys(res).filter(k=>res[k]).length:ok.length;
  const funnel=[['Sent',s.sent],['Delivered',s.delivered],['Read',s.read],['Replied',s.replied],['Clicked',s.clicked],['Leads',s.lead],['Opted out',s.opted]].filter(r=>c.channel==='email'||r[0]!=='Clicked');
  return `<div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-a="back">${ic('back')}Back</button></div>
  <div class="ph"><div><h1>${esc(c.name)}</h1><div class="sub">${c.channel==='email'?'Email':'WhatsApp'} · from ${esc(c.sender||'—')} · to “${esc((D.lists.get(c.listId)||{}).name||'deleted segment')}” · <span class="chip ${c.status==='Sent'?'good':''}">${esc(c.status||'Draft')}</span></div></div>
  <div class="actions">${R().write&&c.status!=='Sent'?`<button class="btn" data-a="campaignForm" data-id="${c.id}">${ic('edit')}Edit</button>`:''}${R().send&&c.status!=='Sent'?`<button class="btn" data-a="campExport" data-id="${c.id}">${ic('download')}Export send file</button><button class="btn pri" data-a="campMarkSent" data-id="${c.id}">Mark as sent</button>`:''}${R().send&&c.status==='Sent'?`<button class="btn" data-a="campResults" data-id="${c.id}">${ic('import')}Import results</button>`:''}</div></div>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="panel stat"><div class="k">In segment</div><div class="v">${all.length.toLocaleString('en-IN')}</div><div class="d">people matching the rules today</div></div>
    <div class="panel stat"><div class="k">Will receive</div><div class="v">${ok.length.toLocaleString('en-IN')}</div><div class="d">after consent and DND checks</div></div>
    <div class="panel stat"><div class="k">Suppressed</div><div class="v">${(all.length-ok.length).toLocaleString('en-IN')}</div><div class="d">${Object.entries(sup).map(([k,v])=>esc(k)+': '+v).join(' · ')||'none'}</div></div>
  </div>
  <div class="grid g2">
    <div class="stack">
      ${panel('Message',`${c.channel==='email'&&c.subject?`<div class="small muted">Subject</div><div style="margin-bottom:8px"><b>${esc(sample?renderTemplate(c.subject,sample):c.subject)}</b></div>`:''}<div class="msg-preview">${esc(sample?renderTemplate(c.template,sample):c.template)}</div>${c.channel==='whatsapp'?`<div class="small muted" style="margin-top:8px">Meta template name: <span class="code">${esc(c.waTemplate||'not set')}</span> · ${esc(c.language||'English')}</div>`:''}${sample?`<div class="small faint" style="margin-top:6px">Preview shown for ${esc(sample.p.name)}.</div>`:''}`)}
      ${panel('Response funnel',bars(funnel.map(([l,v])=>({label:l,value:v})),{max:Math.max(1,s.sent||ok.length)}))}
    </div>
    ${panel(c.status==='Sent'?'Recipients & responses':'Recipients',recips.length?`<div class="list">${recips.map(x=>{const st=res[x.p.id]||'';return `<div class="li" data-a="openPerson" data-id="${x.p.id}"><div class="main-t"><div class="t">${esc(x.p.name)}</div><div class="s num">${esc(c.channel==='email'?(x.p.emails||[])[0]:(x.p.mobiles||[])[0])}</div></div><div class="end">${c.status!=='Sent'&&c.channel==='whatsapp'&&R().send?`<a class="btn sm" href="https://wa.me/${waNumber(x.p.mobiles[0])}?text=${encodeURIComponent(renderTemplate(c.template,x))}" target="_blank" rel="noopener" data-stop="1" data-one="${c.id}" data-id="${x.p.id}">${ic('wa')}${st?'Sent':'Send 1:1'}</a>`:''}${R().send&&(c.status==='Sent'||st)?`<select data-c="campRes" data-cid="${c.id}" data-id="${x.p.id}" aria-label="Response" style="border:1px solid var(--line);border-radius:6px;padding:4px;background:var(--surface)">${['',...RESULT_STATUS].map(o=>`<option ${o===st?'selected':''} value="${o}">${o||'—'}</option>`).join('')}</select>`:st?`<span class="chip">${esc(st)}</span>`:''}</div></div>`}).join('')}</div>${total>recips.length?`<div style="padding:12px;text-align:center"><button class="btn" data-a="moreRecips">Show more</button></div>`:''}`:emptyBox('No one to send to','Everyone in this segment is suppressed, or the segment is empty.'),{flush:true})}
  </div>
  ${c.channel==='whatsapp'&&c.status!=='Sent'?`<div class="note" style="margin-top:14px">“Send 1:1” opens WhatsApp with the message filled in, for a person to send by hand — fine for a handful of close contacts from an owner's own phone. For anything larger, export the send file and upload it to the WhatsApp Business provider.</div>`:''}`;
};

/* ---- dashboards ---- */
/* ---- data health ---- */
VIEWS.health=()=>{
  const ppl=visPeople();
  const inc=ppl.filter(x=>x.score<50).sort((a,b)=>a.score-b.score);
  const dups=X.dups.filter(g=>g.ids.every(id=>P(id)&&visible(P(id).p)));
  return `<div class="ph"><div><h1>Data health</h1><div class="sub">Clean, de-duplicated records are what everything else depends on.</div></div></div>
  <div class="grid g2">
    ${panel(`Possible duplicates <span class="muted num">(${dups.length})</span>`,dups.length?`<div class="list">${dups.slice(0,60).map(g=>{const xs=g.ids.map(P);return `<div class="li" style="cursor:default"><div class="main-t"><div class="t">${xs.map(x=>esc(x.p.name)).join(' · ')}</div><div class="s">${esc(g.why.join(', '))} · ${xs.map(x=>esc((x.p.mobiles||[])[0]||(x.p.emails||[])[0]||'')).join(' / ')}</div></div><div class="end">${canWrite()?`<button class="btn sm pri" data-a="merge" data-ids="${g.ids.join(',')}">${ic('merge')}Review & merge</button><button class="btn sm" data-a="notDup" data-ids="${g.ids.join(',')}">Not duplicates</button>`:''}</div></div>`}).join('')}</div>`:emptyBox('No duplicates found','Matching runs on mobile number, email, and name + company.'),{flush:true})}
    ${panel(`Needs enrichment <span class="muted num">(${inc.length})</span>`,inc.length?`<div class="list">${inc.slice(0,60).map(x=>personRow(x,{end:`<span class="chip warn num">${x.score}%</span>`})).join('')}</div>`:emptyBox('Every record is at least half complete',''),{flush:true})}
  </div>`;
};

/* ---- import ---- */
VIEWS.import=()=>{
  const st=S.imp;
  const head=`<div class="ph"><div><h1>Import</h1><div class="sub">Phone contacts (vCard or CSV from Google/iCloud), Excel sheets, the chit subscriber master, or the real estate customer list.</div></div><div class="actions"><button class="btn" data-a="xlsxTemplate" data-k="${esc(S.ui.impKind||'contacts')}">${ic('download')}Blank Excel template</button></div></div>`;
  if(!st||!st.rows)return head+`<div class="panel"><div class="bd"><form data-f="impStart" class="form">
    <label class="field"><span>What are you importing?</span><select name="kind" id="imp-kind">${Object.entries(KIND_LABEL).map(([k,l])=>`<option value="${k}" ${S.ui.impKind===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="field"><span>Part of which of my businesses?</span><select name="biz" id="imp-biz"><option value="">None</option>${allowedBiz().map(b=>`<option value="${esc(b.id)}" ${S.ui.biz===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Whose contacts are these?</span><select name="owner" id="imp-owner"><option value="">Not an owner's phone</option>${S.config.owners.map(o=>`<option ${o===S.me.owner?'selected':''}>${esc(o)}</option>`).join('')}</select><span class="hint">Tagged as the source on every record.</span></label>
    <label class="field full"><span>File</span><input type="file" name="file" id="imp-file" accept=".csv,.xlsx,.xls,.vcf,.vcard,.txt" required><span class="hint">.vcf, .csv, .xlsx or .xls. On iPhone: iCloud.com → Contacts → Export vCard. On Android: Google Contacts → Export → vCard or Google CSV.</span></label>
    <div class="full"><button class="btn pri" type="submit">Read file</button></div></form></div></div>`;
  const fields=importFields(st.kind);
  const prev=st.rows.slice(0,5);
  return head+`<div class="panel"><div class="hd"><h2>${esc(st.fileName)} · ${st.rows.length.toLocaleString('en-IN')} rows</h2><button class="btn sm ghost" data-a="impReset">Choose another file</button></div><div class="bd stack">
    <div class="small muted">Match each column to a field. We guessed from the headers; change anything that looks wrong.</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Column in file</th><th>Goes to</th><th>First values</th></tr></thead><tbody>${st.headers.map((h,i)=>`<tr><td><b>${esc(h)}</b></td><td><select data-c="impMap" data-i="${i}" aria-label="Field for ${esc(h)}" style="border:1px solid var(--line);border-radius:6px;padding:5px;background:var(--surface);max-width:220px"><option value="">— skip —</option>${fields.map(f=>`<option value="${f.k}" ${st.map[i]===f.k?'selected':''}>${esc(f.l)}</option>`).join('')}</select></td><td class="small muted">${prev.map(r=>esc(String(r[i]==null?'':r[i]).slice(0,40))).filter(Boolean).join(' · ')}</td></tr>`).join('')}</tbody></table></div>
    <div class="form">
      <label class="field"><span>When a row matches someone already here</span><select data-c="impDup" id="imp-dup"><option value="merge" ${st.dup==='merge'?'selected':''}>Merge: fill blanks, add new numbers and tags</option><option value="skip" ${st.dup==='skip'?'selected':''}>Skip the row</option><option value="create" ${st.dup==='create'?'selected':''}>Create a new record anyway</option></select><span class="hint">Matching uses mobile number, then email.</span></label>
      <label class="field"><span>Add a tag to everyone imported</span><input id="imp-tag" data-i="impTag" value="${esc(st.tag||'')}" placeholder="e.g. Diwali list 2026"></label>
    </div>
    ${st.result?`<div class="note">${st.result}</div>`:''}
    <div class="row"><button class="btn pri" data-a="impRun" ${st.busy?'disabled':''}>${st.busy?'Importing… '+esc(st.progress||''):'Import '+st.rows.length.toLocaleString('en-IN')+' rows'}</button></div>
  </div></div>`;
};
const IMPORT_FIELDS={
  contacts:[['name','Full name'],['first','First name'],['middle','Middle name'],['last','Last name'],['mobile','Mobile / phone'],['email','Email'],['company','Company'],['role','Designation / role'],['industry','Industry'],['subIndustry','Sub-industry'],['region','Region / locality'],['city','City'],['address','Address'],['dob','Birthday'],['anniversary','Anniversary'],['grade','Grade'],['tags','Tags / labels'],['notes','Notes'],['introducedBy','Introduced by (name)'],['website','Website'],['linkedin','LinkedIn'],['pan','PAN / KYC ref']].map(([k,l])=>({k,l})),
  chits:[['name','Subscriber name'],['mobile','Mobile'],['email','Email'],['group','Chit group / series'],['ticketNo','Ticket no.'],['chitValue','Chit value'],['emi','Instalment (EMI)'],['tenure','Tenure (months)'],['startDate','Start date'],['endDate','End date'],['prized','Prized / unprized'],['status','Status'],['branch','Branch'],['company','Company'],['region','Region / locality']].map(([k,l])=>({k,l})),
  re:[['name','Customer name'],['mobile','Mobile'],['email','Email'],['project','Project'],['unit','Unit / plot'],['ticketSize','Ticket size'],['bookingDate','Booking date'],['stage','Stage'],['paymentStage','Payment stage'],['company','Company'],['region','Region / locality']].map(([k,l])=>({k,l}))
};

const OPT_LISTS={
  regions:{t:'Regions & localities',get:()=>S.config.regions,set:v=>({regions:v}),ph:'e.g. Jubilee Hills'},
  owners:{t:'Owners',get:()=>S.config.owners,set:v=>({owners:v}),ph:'Owner name',sort:false},
  coRoles:{t:'Roles at a company',get:coRoles,set:v=>({coRoles:v}),ph:'e.g. Director'},
  sources:{t:'Sources',get:()=>S.config.sources,set:v=>({sources:v}),ph:'e.g. Family network'},
  turnover:{t:'Turnover bands',get:turnovers,set:v=>({turnover:v}),ph:'e.g. ₹5–25 Cr',sort:false},
  employees:{t:'Employee bands',get:empBands,set:v=>({employees:v}),ph:'e.g. 20–100',sort:false},
  projects:{t:'Real estate projects',get:()=>S.config.projects||[],set:v=>({projects:v}),ph:'Project name'},
  branches:{t:'Chit branches',get:()=>S.config.branches||[],set:v=>({branches:v}),ph:'Branch name'},
  sendersWA:{t:'WhatsApp sender identities',get:()=>S.config.senders.whatsapp,set:v=>({senders:Object.assign({},S.config.senders,{whatsapp:v})}),ph:'e.g. Official WhatsApp number',sort:false},
  sendersEmail:{t:'Email sender identities',get:()=>S.config.senders.email,set:v=>({senders:Object.assign({},S.config.senders,{email:v})}),ph:'Name <email@domain>',sort:false}
};
const BUILTIN_FIELDS={
  companies:[['Company name','Text','Required',{f:'name',lock:1}],['Group','Dropdown','',{tab:'groups',f:'group'}],['Industry','Dropdown','',{key:'industries',f:'industry'}],['Sub-industry','Dropdown','',{key:'industries',f:'subIndustry'}],['Region / locality','Dropdown','',{key:'regions',f:'region'}],['City','Text','',{f:'city'}],['Pincode','Text','Used to find references',{f:'pincode'}],['Owners','Multi-select','',{key:'owners',f:'owners'}],['Part of my businesses','Multi-select','',{tab:'businesses',f:'businesses'}],['Phone numbers','Phone','',{f:'phones'}],['Email','Email','',{f:'email'}],['GST number','Text','Checked against the blacklist',{f:'gst'}],['Website','Link','',{f:'website'}],['Turnover','Dropdown','',{key:'turnover',f:'turnover'}],['Employees','Dropdown','',{key:'employees',f:'employees'}],['Address','Text','',{f:'address'}],['LinkedIn, Facebook, Instagram, X, Justdial, IndiaMART, News','Links','',{f:'links',multi:1}],['Notes','Long text','',{f:'notes'}]],
  people:[['Name','Text','Required',{f:'name',lock:1}],['Mobile number(s)','Phone','One number can belong to only one person',{f:'mobiles'}],['Owner in charge','Dropdown','',{key:'owners',f:'ownerInCharge'}],['Company','Company','',{f:'co0'}],['Role at company','Dropdown','',{key:'coRoles',f:'role0'}],['Industry','Dropdown','',{key:'industries',f:'industry'}],['Region / locality','Dropdown','',{key:'regions',f:'region'}],['Pincode','Text','Used to find references',{f:'pincode'}],['Introduced by','Person','',{f:'introducedBy'}],['Relationship grade','Platinum / Gold / Silver','',{f:'grade'}],['Tags','Text','',{f:'tags'}],['Part of my businesses','Multi-select','',{tab:'businesses',f:'businesses'}],['Email(s)','Email','',{f:'emails'}],['Birthday','Date','',{f:'dob'}],['Anniversary','Date','',{f:'anniversary'}],['Address','Text','',{f:'address'}],['City','Text','',{f:'city'}],['PAN / KYC reference','Text','',{f:'pan'}],['Source','Dropdown','',{key:'sources',f:'source'}],['From whose contacts','Dropdown','',{key:'owners',f:'sourceOwner'}],['LinkedIn, website, Facebook, Instagram, X','Links','',{f:'links',multi:1}],['Notes','Long text','',{f:'notes'}],['WhatsApp and email opt-in, how given','Yes / No','',{f:'consent',multi:1}],['Do not disturb, opted out, private','Yes / No','',{f:'privacy',lock:1}]],
  leads:[['Business','Dropdown','',{tab:'businesses',f:'business',lock:1}],['Person','Person','A lead needs a person or a company',{f:'person'}],['Mobile (for a new person)','Phone','',{f:'mobile'}],['Company','Company','',{f:'company'}],['Owner','Dropdown','',{key:'owners',f:'owner'}],['Stage','Dropdown','',{tab:'stages',f:'stage',lock:1}],['Source','Dropdown','',{key:'sources',f:'source'}],['Referred by','Person','',{f:'referrer'}],['Expected value (₹)','Number','',{f:'expectedValue'}],['Follow-up date','Date','Shows on the dashboard, Follow-ups page and notifications',{f:'nextDate'}],['Follow-up: what to do','Text','',{f:'nextAction'}],['Last meeting','Date and time','Set when you log a meeting or call'],['Notes','Long text','',{f:'notes'}],['Cross-sell','Yes / No','',{f:'crossSell'}]],
  groups:[['Group name','Text','Required',{f:'name',lock:1}],['Notes','Long text','',{f:'notes'}]]
};
const bOv=(ent,f)=>((((S.config&&S.config.builtin)||{})[ent]||{})[f])||{};
const bRow=(ent,f)=>(BUILTIN_FIELDS[ent]||[]).find(r=>r[3]&&r[3].f===f);
// built-in field as the admin set it up: renamed, required or hidden (hidden fields keep their values)
const bHid=(ent,f)=>{const v=bOv(ent,f);return !!(v.hidden||v.deleted)};
function bf(ent,f,label,inner,o={}){const v=bOv(ent,f),row=bRow(ent,f),hid=bHid(ent,f);const h=fld(v.label&&!(row&&row[3].multi)?esc(v.label):label,inner,Object.assign({},o,{req:v.required&&!hid},v.hint?{hint:esc(v.hint)}:{}));return hid?`<div hidden>${h}</div>`:h}
const bwrap=(ent,f,html)=>bHid(ent,f)?`<div hidden>${html}</div>`:html;
function bReq(ent,fd){const ov=((S.config&&S.config.builtin)||{})[ent]||{};const miss=[];
  for(const [f,v] of Object.entries(ov)){if(!v||!v.required||v.hidden||v.deleted)continue;const row=bRow(ent,f);if(!row||row[3].multi||row[3].lock)continue;if(!fd.getAll(f).map(x=>String(x).trim()).some(Boolean))miss.push(v.label||row[0])}
  return miss}
// what a built-in field holds on a record, as plain values (used when a field is turned into a new one)
const BF_GET={
  people:{co0:p=>(p.companies||[]).slice(0,1).map(l=>(D.companies.get(l.companyId)||{}).name).filter(Boolean),role0:p=>(p.companies||[]).slice(0,1).map(l=>l.role).filter(Boolean),
    industry:p=>p.industry||((p.companies||[]).map(l=>(D.companies.get(l.companyId)||{}).industry).find(Boolean))||'',introducedBy:p=>p.introducedBy?personName(p.introducedBy):'',businesses:p=>(p.businesses||[]).map(bizName).filter(Boolean)},
  companies:{group:c=>groupName(c.groupId)||c.group||'',businesses:c=>(c.businesses||[]).map(bizName).filter(Boolean)},
  leads:{person:l=>l.personId?personName(l.personId):'',company:l=>(D.companies.get(l.companyId)||{}).name||'',referrer:l=>l.referrerId?personName(l.referrerId):'',mobile:()=>''},
  groups:{}
};
const bfValue=(ent,f,r)=>((BF_GET[ent]||{})[f]||(x=>x[f]))(r);
const bfVals=v=>(Array.isArray(v)?v:(v==null||v===''||v===false?[]:[v===true?'Yes':v])).map(x=>String(x).trim()).filter(Boolean);
function bfConvert(v,type){const a=bfVals(v);if(!a.length)return undefined;
  if(type==='multi')return a.length===1?splitList(a[0]):a;
  if(type==='number'){const n=num(a[0]);return isFinite(n)&&n!==0||/^0+$/.test(a[0])?n:undefined}
  if(type==='checkbox')return v===true||/^(y|yes|true|1)$/i.test(a[0]);
  if(type==='date')return parseDate(a[0])||a[0];
  return a.join(', ')}
const BF_TYPE_OF={'Text':'text','Long text':'textarea','Number':'number','Dropdown':'dropdown','Multi-select':'multi','Date':'date','Yes / No':'checkbox','Phone':'phone','Email':'email','Link':'url'};
function builtinTable(ent){
  const adm=R().settings;const rows=BUILTIN_FIELDS[ent].map(r=>[r[0],r[1],r[2],r[3]||{}]);
  const live=rows.filter(([,,,o])=>!(o.f&&bOv(ent,o.f).deleted)),gone=rows.filter(([,,,o])=>o.f&&bOv(ent,o.f).deleted);
  const tr=([l,t,n,o])=>{const v=o.f?bOv(ent,o.f):{};
    const name=v.label&&!o.multi?`<b>${esc(v.label)}</b> <span class="small muted">(was ${esc(l)})</span>`:`<b>${esc(l)}</b>`;
    const tags=`<span class="chip">Built-in</span>${v.required&&!v.hidden?' <span class="chip warn">Required</span>':''}${v.hidden?' <span class="chip">Hidden</span>':''}`;
    const btns=[o.key?`<button class="btn sm" data-a="optsEdit" data-k="${o.key}">Edit options</button>`:o.tab?`<button class="btn sm ghost" data-a="setupTab" data-v="${o.tab}">Set up</button>`:'',
      adm&&o.f&&!o.lock?`<button class="btn sm" data-a="bfEdit" data-e="${ent}" data-f="${o.f}">Change</button><button class="iconbtn" data-a="bfDel" data-e="${ent}" data-f="${o.f}" title="Delete field" aria-label="Delete ${esc(v.label||l)}">${ic('trash')}</button>`:''].filter(Boolean).join(' ');
    return `<tr class="${v.hidden?'muted':''}"><td>${name} ${tags}${v.hint?`<div class="small muted">${esc(v.hint)}</div>`:''}</td><td>${esc(t)}</td><td class="small muted">${esc(n||'')}${o.lock?' · cannot be changed':''}</td><td class="r nowrap">${btns}</td></tr>`};
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Field</th><th>Type</th><th>Notes</th><th></th></tr></thead><tbody>${live.map(tr).join('')}</tbody></table></div>${
    gone.length?`<div style="padding:12px 16px 4px"><h3 style="margin:0 0 6px">Deleted built-in fields</h3><div class="list">${gone.map(([l,,,o])=>{const v=bOv(ent,o.f);const cf=v.replacedBy&&customFields(ent).find(x=>x.key===v.replacedBy);return `<div class="li"><div class="main-t"><div class="t">${esc(v.label||l)}</div><div class="s">${cf?'Replaced by your field “'+esc(cf.label)+'” ('+esc(FIELD_TYPES[cf.type]||cf.type)+')':'Removed from forms and profile pages'} · data already saved is kept</div></div>${adm?`<div class="end"><button class="btn sm" data-a="bfRestore" data-e="${ent}" data-f="${o.f}">Restore</button></div>`:''}</div>`}).join('')}</div></div>`:''}${
    adm?'<p class="small muted" style="margin:8px 16px 12px">Owners and admins can change any built-in field (name, help text, required, hidden, and even its type) or delete it. Data already saved is never thrown away, so a deleted field can be restored.</p>':''}`;
}
function bfEditSheet(ent,f){
  if(!R().settings)return toast('Only an admin can change built-in fields.');
  const row=bRow(ent,f);if(!row||row[3].lock)return;const v=bOv(ent,f);const multi=!!row[3].multi;
  const recs=[...D[ent].values()];const distinct=[...new Set(recs.flatMap(r=>bfVals(bfValue(ent,f,r)).flatMap(x=>/,/.test(x)&&row[1]!=='Long text'?splitList(x):[x])))].sort((a,b)=>a.localeCompare(b)).slice(0,100);
  const used=recs.filter(r=>bfVals(bfValue(ent,f,r)).length).length;
  const optList=row[3].key?(OPT_LISTS[row[3].key]?OPT_LISTS[row[3].key].get():row[3].key==='industries'?industryNames():[]):[];
  const linked=row[3].key||row[3].tab||['mobiles','phones','emails','email','gst','co0','introducedBy','referrer','person','company','owner','ownerInCharge','owners','businesses','group','nextDate','expectedValue','pincode','region','industry','grade','source','crossSell','dob','anniversary'].includes(f);
  openSheet({title:'Change field · '+(v.label||row[0]),form:'bfEdit',wide:true,body:`<input type="hidden" name="ent" value="${ent}"><input type="hidden" name="f" value="${f}"><div class="form">
    ${multi?`<div class="full"><b>${esc(row[0])}</b><div class="small muted">A group of fields: it can be hidden or deleted, but not renamed or retyped.</div></div>`:fld('Field name',inp('label',v.label||'',{ph:row[0]}),{full:true,hint:'Leave empty to keep “'+esc(row[0])+'”.'})}
    ${multi?'':fld('Help text',inp('hint',v.hint||'',{ph:'Shown under the field on the form'}),{full:true})}
    ${multi?'':`<label class="check full"><input type="checkbox" name="required" ${v.required?'checked':''}> Required: the form cannot be saved without it</label>`}
    <label class="check full"><input type="checkbox" name="hidden" ${v.hidden?'checked':''}> Hide from the form for now (still shown on profile pages)</label>
    ${multi?'':`<div class="full panel" style="padding:12px 14px;margin-top:4px"><div class="field"><span>Field type</span><select id="fm-bftype" name="type" data-c="bftype"><option value="">Keep as built-in: ${esc(row[1])}</option>${Object.entries(FIELD_TYPES).map(([k,l])=>`<option value="${k}">Change to: ${esc(l)}</option>`).join('')}</select></div>
      <div id="bf-conv" hidden><p class="small muted" style="margin:8px 0">The built-in field is replaced by your own field of the new type. ${used?`Values already saved on <b>${plural(used,ent==='people'?'person':ent==='companies'?'company':ent==='leads'?'lead':'group',ent==='people'?'people':ent)}</b> are copied into it.`:'No records have a value yet.'}${linked?' Searches, filters, referrals and dashboards that use the built-in field keep its old values but stop updating for new entries.':''} You can change or delete the new field later like any other.</p>
      <div id="bf-opts" hidden><div class="field"><span>Options</span>${listEd('opt',(optList.length?optList:distinct),{ph:'Option'})}</div></div></div></div>`}
  </div>`,foot:`<button type="button" class="btn" data-a="bfReset" data-e="${ent}" data-f="${f}" style="margin-right:auto">Reset to default</button><button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>`});
}
async function saveBf(ent,f,val,merge){
  if(!R().settings)return toast('Only an admin can change built-in fields.');
  const all=clone((S.config&&S.config.builtin)||{});all[ent]=Object.assign({},all[ent]||{});
  const nv=merge?Object.assign({},all[ent][f]||{},val):val;
  if(nv)Object.keys(nv).forEach(k=>{if(nv[k]===''||nv[k]===false||nv[k]==null)delete nv[k]});
  if(nv&&Object.keys(nv).length)all[ent][f]=nv;else delete all[ent][f];
  await saveConfig({builtin:all});closeSheet();toast('Field saved');
}
async function submitBf(fd){
  const ent=fd.get('ent'),f=fd.get('f');const row=bRow(ent,f);if(!row)return;const type=fd.get('type')||'';
  const base={label:String(fd.get('label')||'').trim(),hint:String(fd.get('hint')||'').trim(),required:!!fd.get('required'),hidden:!!fd.get('hidden')};
  if(!type)return saveBf(ent,f,Object.assign({},bOv(ent,f),base,{hidden:base.hidden}));
  const label=base.label||bOv(ent,f).label||row[0];
  const options=type==='dropdown'||type==='multi'?leVals(fd,'opt'):[];
  if((type==='dropdown'||type==='multi')&&!options.length)return toast('Add at least one option.');
  const ok=await ask({title:'Change the field type?',text:`<b>${esc(label)}</b> becomes a <b>${esc(FIELD_TYPES[type])}</b> field. Values already saved are copied into it, and the original stays safe in the records, so you can restore it from Setup.`,buttons:[{l:'Cancel',v:null},{l:'Change field',v:1,cls:'pri'}]});if(!ok)return;
  const list=customFields(ent).slice();let key=slug(label),n=2;while(list.some(o=>o.key===key))key=slug(label)+'-'+n++;
  list.push({key,label,type,options,required:base.required,hint:base.hint});
  const recs=[];for(const r of D[ent].values()){const cv=bfConvert(bfValue(ent,f,r),type);if(cv===undefined)continue;const c=clone(r);c.cf=Object.assign({},c.cf||{},{[key]:cv});recs.push(c)}
  const all=clone((S.config&&S.config.builtin)||{});all[ent]=Object.assign({},all[ent]||{},{[f]:{label:base.label||undefined,deleted:true,replacedBy:key}});
  await saveConfig({customFields:Object.assign({},S.config.customFields||{},{[ent]:list}),builtin:all});
  if(recs.length)await putMany(ent,recs,`${label} changed to ${FIELD_TYPES[type]}`);
  closeSheet();toast(`${label} is now a ${FIELD_TYPES[type].toLowerCase()} field${recs.length?' · '+plural(recs.length,'value')+' copied':''}`);
}
async function bfDelete(ent,f){
  const row=bRow(ent,f);if(!row||row[3].lock)return;const name=bOv(ent,f).label||row[0];
  const ok=await ask({title:'Delete “'+name+'”?',text:'It disappears from the forms and profile pages for everyone. Data already saved is kept, so you can restore the field later from Setup.',buttons:[{l:'Cancel',v:null},{l:'Delete field',v:1,cls:'danger'}]});
  if(ok)await saveBf(ent,f,{deleted:true},true);
}
// profile pages: drop deleted built-in fields and use renamed labels
const KV_MAP={people:{Mobile:'mobiles',Email:'emails',Birthday:'dob',Anniversary:'anniversary','Owner in charge':'ownerInCharge',Source:'source','Introduced by':'introducedBy','KYC / PAN ref':'pan',Businesses:'businesses',Consent:'consent'},
  companies:{Group:'group',Businesses:'businesses',Owners:'owners',Phone:'phones',Email:'email',GST:'gst',Turnover:'turnover',Employees:'employees',Address:'address'},
  leads:{'Expected value':'expectedValue',Owner:'owner',Source:'source','Referred by':'referrer','Follow-up':'nextDate'}};
function kvF(ent,html){const m=KV_MAP[ent]||{};return html.replace(/<dt>([^<]*)<\/dt>(<dd[^>]*>[\s\S]*?<\/dd>)/g,(all,lab,dd)=>{const f=m[lab];if(!f)return all;const v=bOv(ent,f);if(v.deleted)return '';return v.label&&!(bRow(ent,f)||[,,,{}])[3].multi?`<dt>${esc(v.label)}</dt>${dd}`:all})}

/* ---- pop-up questions (stay above any open form) ---- */
function ask({title,text,buttons}){
  return new Promise(res=>{
    const w=document.createElement('div');w.className='dlg-wrap';w.setAttribute('role','alertdialog');w.setAttribute('aria-modal','true');
    w.innerHTML=`<div class="dlg"><h2>${esc(title)}</h2><p>${text}</p><div class="dlg-btns">${buttons.map((b,i)=>`<button type="button" class="btn ${b.cls||''}" data-i="${i}">${esc(b.l)}</button>`).join('')}</div></div>`;
    const done=v=>{w.remove();document.removeEventListener('keydown',kd,true);if(S._dlgCancel===cancel)S._dlgCancel=null;res(v)};const cancel=()=>done(null);S._dlgCancel=cancel;
    const kd=e=>{if(e.key==='Escape'){e.stopPropagation();done(null)}};
    w.addEventListener('click',e=>{const b=e.target.closest('button[data-i]');if(b){e.stopPropagation();done(buttons[+b.dataset.i].v)}else if(e.target===w)done(null)});
    document.addEventListener('keydown',kd,true);document.body.appendChild(w);
    const pri=w.querySelector('.btn.pri')||w.querySelector('button');pri&&pri.focus();
  });
}
const sameName=(a,b)=>{const n=x=>String(x||'').trim().replace(/\s+/g,' ').toLowerCase();return !!n(a)&&n(a)===n(b)};
// another record with exactly this name? Opens it, or lets people be saved anyway.
async function dupNameCheck(type,name,selfId){
  const hit=[...D[type].values()].find(r=>r.id!==selfId&&sameName(r.name,name));if(!hit)return true;
  const what={people:'person',companies:'company',groups:'group'}[type];
  const buttons=[{l:'Open existing '+what,v:'open'},...(type==='people'?[{l:'Save anyway',v:'save'}]:[]),{l:'Go back',v:null,cls:'pri'}];
  const r=await ask({title:'This name already exists',text:`A ${what} named <b>${esc(hit.name)}</b> is already in the system.${type==='people'?' If this is a different person with the same name, you can still save.':' Use the existing '+what+' or choose a different name.'}`,buttons});
  if(r==='open'){closeSheet();go({people:'person',companies:'company',groups:'group'}[type],hit.id);return false}
  return r==='save';
}
// a mobile number belongs to one person; only an admin can give it to someone else
async function dupMobileCheck(p,old){
  const had=new Set(((old&&old.mobiles)||[]).map(normPhone));
  const added=(p.mobiles||[]).map(normPhone).filter(m=>m&&!had.has(m));if(!added.length)return true;
  const hit=[...D.people.values()].find(x=>x.id!==p.id&&(x.mobiles||[]).some(m=>added.includes(normPhone(m))));if(!hit)return true;
  const num=(hit.mobiles||[]).find(m=>added.includes(normPhone(m)));
  if(R().settings){const r=await ask({title:'Mobile number already in use',text:`<b>${esc(num)}</b> already belongs to <b>${esc(hit.name)}</b>. As an admin you can still give it to this person too.`,buttons:[{l:'Open '+hit.name,v:'open'},{l:'Save anyway',v:'save'},{l:'Go back',v:null,cls:'pri'}]});
    if(r==='open'){closeSheet();go('person',hit.id);return false}return r==='save'}
  const r=await ask({title:'Mobile number already in use',text:`<b>${esc(num)}</b> already belongs to <b>${esc(hit.name)}</b>. A mobile number can belong to only one person; only an admin can add it to someone else.`,buttons:[{l:'Open '+hit.name,v:'open'},{l:'OK',v:null,cls:'pri'}]});
  if(r==='open'){closeSheet();go('person',hit.id)}return false;
}

function optsSheet(key){
  if(key==='industries')return openSheet({title:'Industry types',form:'optsForm',wide:true,body:`<input type="hidden" name="key" value="industries"><p class="small muted" style="margin-top:0">One industry per row, with its sub-industries separated by commas. Dropdowns show them A–Z.</p>${indEd(S.config.industries)}`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save industries</button>'});
  const L=OPT_LISTS[key];if(!L)return;
  openSheet({title:L.t,form:'optsForm',body:`<input type="hidden" name="key" value="${key}">${listEd('opt',L.get(),{ph:L.ph,sort:L.sort,orig:key==='owners'})}`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>'});
}
// owners: save the list and carry renames onto every lead, person, company, comment and team account
async function saveOwners(list,ren){
  if(ren.length){const ok=await ask({title:ren.length===1?'Rename this owner everywhere?':'Rename these owners everywhere?',text:ren.map(([a,b])=>`<b>${esc(a)}</b> → <b>${esc(b)}</b>`).join('<br>')+'<br><br>Every lead, person, company, comment and team account with the old name is updated.',buttons:[{l:'Cancel',v:null},{l:'Rename everywhere',v:1,cls:'pri'}]});if(!ok)return}
  const before=clone(S.config);S.config.owners=list;
  try{const r=await api('/api/config',{method:'PUT',body:{config:S.config,changed:['owners'],renameOwners:ren}});
    ren.forEach(([a,b])=>{if(S.me.owner===a)S.me.owner=b;if(S.ui.fu&&S.ui.fu.owner===a)S.ui.fu.owner=b;(S.users||[]).forEach(u=>{if(u.owner===a)u.owner=b})});
    const n=(r.renamed||[]).reduce((t,x)=>t+x.records,0);closeSheet();toast(ren.length?`Owners saved · ${n} record${n===1?'':'s'} updated`:'Saved');saveSnapshot();await pull(true);render()}
  catch(e){S.config=before;render();toast(e.code==='offline'?'Settings need a connection to save.':e.message)}
}
// names still on records (or team accounts) that are not in the owners list, e.g. after an earlier rename
function strayOwners(){
  const known=new Set(S.config.owners);const m=new Map();const add=(n,k)=>{if(!n||known.has(n))return;const c=m.get(n)||{leads:0,people:0,companies:0,users:0};c[k]++;m.set(n,c)};
  D.leads.forEach(l=>add(l.owner,'leads'));D.people.forEach(p=>{add(p.ownerInCharge,'people')});D.companies.forEach(c=>(c.owners||[]).forEach(o=>add(o,'companies')));(S.users||[]).forEach(u=>add(u.owner,'users'));
  return [...m.entries()];
}
function strayOwnersPanel(){
  const st=strayOwners();if(!st.length)return '';
  return panel('Old owner names still in use',`<p class="small muted" style="margin-top:0">These names are on records but not in your owners list, usually because an owner was renamed before renaming carried across. Pick who each one should become.</p><div class="list">${st.map(([n,c],i)=>`<form class="li" data-f="strayOwner" style="flex-wrap:wrap"><input type="hidden" name="from" value="${esc(n)}"><div class="main-t"><div class="t">${esc(n)}</div><div class="s">${[c.leads&&plural(c.leads,'lead'),c.people&&plural(c.people,'person','people'),c.companies&&plural(c.companies,'company','companies'),c.users&&plural(c.users,'team account')].filter(Boolean).join(' · ')}</div></div><div class="end"><select name="to" aria-label="Rename to" ${selS}>${S.config.owners.map(o=>`<option>${esc(o)}</option>`).join('')}</select><button class="btn sm pri" type="submit">Rename</button></div></form>`).join('')}</div>`);
}
async function saveOptsForm(fd){
  const key=fd.get('key');
  if(key==='industries'){const names=fd.getAll('indName'),subs=fd.getAll('indSubs');const inds=[];names.forEach((n,i)=>{n=String(n).trim();if(n&&!inds.some(x=>x.name.toLowerCase()===n.toLowerCase()))inds.push({name:n,subs:splitList(subs[i]||'')})});if(!inds.length)return toast('Keep at least one industry.');await saveConfig({industries:inds});closeSheet();return toast('Industries saved')}
  const vals=leVals(fd,'opt');if(!vals.length)return toast('Keep at least one option.');
  if(key==='owners'){const now=fd.getAll('opt').map(v=>String(v).trim()),orig=fd.getAll('optOrig').map(v=>String(v).trim());
    const ren=now.map((v,i)=>[orig[i]||'',v]).filter(([a,b])=>a&&b&&a!==b&&!vals.includes(a));
    return saveOwners(vals,ren)}
  await saveConfig(OPT_LISTS[key].set(vals));closeSheet();toast('Saved');
}
function rolesTab(){
  const rl=roleList();const used=id=>(S.users||[]).filter(u=>u.role===id).length;
  if(!S.users&&!S._usersLoading)loadUsers();
  if(!S.roleDraft)S.roleDraft=clone(rl);
  const d=S.roleDraft;
  return panel('Roles & permissions',`<p class="muted small" style="margin-top:0">Each person on the team has one role. Tick what each role can do. Owner / Admin always has everything. Business access and per-person exceptions are set on each team member.</p>
    <div class="tbl-wrap"><table class="tbl roles-tbl"><thead><tr><th>Permission</th>${d.map((r,i)=>`<th class="c">${r.id==='admin'?esc(r.label):`<input class="role-name" data-c="roleName" data-i="${i}" value="${esc(r.label)}" aria-label="Role name">`}<div class="small muted">${used(r.id)} people</div></th>`).join('')}</tr></thead>
    <tbody>${PERM_LIST.map(([k,l,h])=>`<tr><td><b>${esc(l)}</b>${h?`<div class="small muted">${esc(h)}</div>`:''}</td>${d.map((r,i)=>`<td class="c"><input type="checkbox" data-c="rolePerm" data-i="${i}" data-k="${k}" ${r.perms[k]?'checked':''} ${r.id==='admin'?'disabled':''} aria-label="${esc(r.label+': '+l)}"></td>`).join('')}</tr>`).join('')}
    <tr><td></td>${d.map((r,i)=>`<td class="c">${!r.builtin?`<button class="btn sm ghost" data-a="roleDel" data-i="${i}" ${used(r.id)?'disabled title="Move people to another role first"':''}>Delete</button>`:''}</td>`).join('')}</tr></tbody></table></div>
    <div class="row" style="margin-top:12px;justify-content:space-between"><form data-f="roleAdd" class="row"><input id="fm-newrole" name="name" placeholder="New role name, e.g. Branch manager" style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;min-width:220px"><button class="btn sm" type="submit">${ic('plus')}Add role</button></form>
    <div class="row">${S.roleDirty?'<span class="small muted">Unsaved changes</span><button class="btn sm" data-a="roleReset">Undo</button>':''}<button class="btn pri sm" data-a="roleSave" ${S.roleDirty?'':'disabled'}>Save roles</button></div></div>`);
}
/* ---- setup ---- */
const SETUP_GROUPS=[['Start',['overview']],['Your business',['businesses','stages','referrals','documents','groups','blacklist']],['Fields',['companyFields','peopleFields','leadFields','groupFields']],['Team and access',['team','roles']],['App',['branding','general']],['You',['account']]];
const SETUP_TABS=[
  {v:'overview',l:'Overview'},{v:'businesses',l:'My businesses',admin:1},{v:'stages',l:'Lead stages',admin:1},
  {v:'companyFields',l:'Company fields',admin:1},{v:'peopleFields',l:'People fields',admin:1},{v:'leadFields',l:'Lead fields',admin:1},{v:'groupFields',l:'Group fields',admin:1},
  {v:'documents',l:'Documents',admin:1},{v:'groups',l:'Groups'},{v:'referrals',l:'Referrals',admin:1},{v:'blacklist',l:'Blacklist'},{v:'roles',l:'Roles',admin:1},{v:'team',l:'Owners & team',admin:1},{v:'branding',l:'Branding',admin:1},{v:'general',l:'General',admin:1},{v:'account',l:'My account'}
];
const selS='style="border:1px solid var(--line);border-radius:6px;padding:5px;background:var(--surface)"';
function fieldsTable(ent){
  const fs=customFields(ent);
  return fs.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Field</th><th>Type</th><th>Options</th><th>Required</th><th></th></tr></thead><tbody data-dragsave="fields" data-ent="${ent}">${fs.map((f,i)=>`<tr data-i="${i}"><td class="gripc"><span class="grip" title="Drag to reorder" aria-hidden="true">⠿</span></td><td><b>${esc(f.label)}</b>${f.hint?`<div class="small muted">${esc(f.hint)}</div>`:''}</td><td>${esc(FIELD_TYPES[f.type]||f.type)}</td><td class="small">${esc((f.options||[]).join(', ')||'—')}</td><td>${f.required?'Yes':''}</td><td class="r nowrap"><button class="iconbtn" data-a="fieldMove" data-ent="${ent}" data-i="${i}" data-v="-1" title="Move up" ${i?'':'disabled'}>↑</button><button class="iconbtn" data-a="fieldMove" data-ent="${ent}" data-i="${i}" data-v="1" title="Move down" ${i<fs.length-1?'':'disabled'}>↓</button><button class="btn sm" data-a="fieldForm" data-ent="${ent}" data-i="${i}">Edit</button><button class="iconbtn" data-a="fieldDel" data-ent="${ent}" data-i="${i}" title="Delete field">${ic('trash')}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="muted small">No custom fields yet.</div>';
}
const fieldsPanel=(ent,title,intro)=>`<div class="stack">${panel('Built-in fields',builtinTable(ent),{flush:true})}${panel(title,`<p class="muted small" style="margin-top:0">${intro}</p>${fieldsTable(ent)}`,{right:`<button class="btn pri sm" data-a="fieldForm" data-ent="${ent}">${ic('plus')}Add field</button>`,flush:false})}</div>`;
function docTypesPanel(ent,title){
  const ts=docTypes(ent);
  return panel(title,`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Document</th><th>Period (FY / month)</th><th>Required</th><th></th></tr></thead><tbody>${ts.map((t,i)=>`<tr><td><b>${esc(t.name)}</b></td><td>${t.period?'Yes':''}</td><td>${t.required?'Yes':''}</td><td class="r nowrap"><button class="btn sm" data-a="docTypeForm" data-ent="${ent}" data-i="${i}">Edit</button><button class="iconbtn" data-a="docTypeDel" data-ent="${ent}" data-i="${i}" title="Delete document type">${ic('trash')}</button></td></tr>`).join('')}</tbody></table></div>`,{right:`<button class="btn pri sm" data-a="docTypeForm" data-ent="${ent}">${ic('plus')}Add document type</button>`});
}
function stagesEditor(){
  const bid=S.ui.stageBiz||businesses()[0].id;
  if(!S.stageDraft||S.stageDraft.bid!==bid)S.stageDraft={bid,list:clone(stagesFor(bid)),dirty:false};
  const d=S.stageDraft;const counts={};[...D.leads.values()].filter(l=>leadBiz(l)===bid).forEach(l=>{const s=stageOf(l);counts[s.id]=(counts[s.id]||0)+1});
  return `<div class="filters"><div class="seg" role="radiogroup" aria-label="Business">${businesses().map(b=>`<label><input type="radio" name="sbiz" data-c="stageBiz" value="${esc(b.id)}" ${b.id===bid?'checked':''}><span>${esc(b.name)}</span></label>`).join('')}</div></div>
  ${panel('Stages for '+esc(bizName(bid)),`<p class="muted small" style="margin-top:0">Stages run left to right on the lead board. Mark the stage that means the deal is done as <b>Won</b>, and one as <b>Lost</b>. Renaming a stage keeps its leads.</p>
    <div class="stage-ed" data-dragsave="stages">${d.list.map((s,i)=>`<div class="stage-row ${s.kind}" data-i="${i}"><span class="grip" title="Drag to reorder" aria-hidden="true">⠿</span><span class="num faint">${i+1}</span><input id="stg-${i}" value="${esc(s.name)}" data-c="stg" data-i="${i}" data-k="name" aria-label="Stage name"><select data-c="stg" data-i="${i}" data-k="kind" aria-label="Stage type" ${selS}>${[['open','In progress'],['won','Won'],['lost','Lost']].map(([v,l])=>`<option value="${v}" ${s.kind===v?'selected':''}>${l}</option>`).join('')}</select><span class="small muted nowrap">${counts[s.id]?plural(counts[s.id],'lead'):''}</span><button class="iconbtn" data-a="stgMove" data-i="${i}" data-v="-1" ${i?'':'disabled'} title="Move up">↑</button><button class="iconbtn" data-a="stgMove" data-i="${i}" data-v="1" ${i<d.list.length-1?'':'disabled'} title="Move down">↓</button><button class="iconbtn" data-a="stgDel" data-i="${i}" title="Remove stage">${ic('trash')}</button></div>`).join('')}</div>
    <div class="row" style="margin-top:12px;justify-content:space-between"><button class="btn sm" data-a="stgAdd">${ic('plus')}Add stage</button><div class="row">${d.dirty?'<span class="small muted">Unsaved changes</span><button class="btn sm" data-a="stgReset">Undo</button>':''}<button class="btn pri sm" data-a="stgSave" ${d.dirty?'':'disabled'}>Save stages</button></div></div>`)}`;
}
VIEWS.setup=()=>{
  const A=R().settings;const cfg=S.config;
  let tab=S.ui.stab||(A?'overview':'account');if(!A&&SETUP_TABS.find(t=>t.v===tab&&t.admin))tab='account';
  const mine=SETUP_TABS.filter(t=>A||!t.admin);const lbl=v=>(SETUP_TABS.find(t=>t.v===v)||{}).l;
  const groups=SETUP_GROUPS.map(([g,vs])=>[g,vs.filter(v=>mine.some(t=>t.v===v))]).filter(([,vs])=>vs.length);
  const tabs=`<nav class="stabs" aria-label="Setup sections">${groups.map(([g,vs])=>`<div class="stabs-g"><span class="stabs-l">${esc(g)}</span><div class="stabs-b">${vs.map(v=>`<button class="${v===tab?'on':''}" data-a="setupTab" data-v="${v}" ${v===tab?'aria-current="page"':''}>${esc(lbl(v))}</button>`).join('')}</div></div>`).join('')}</nav><select class="stabs-sel" data-c="stab" aria-label="Setup section">${groups.map(([g,vs])=>`<optgroup label="${esc(g)}">${vs.map(v=>`<option value="${v}" ${v===tab?'selected':''}>${esc(lbl(v))}</option>`).join('')}</optgroup>`).join('')}</select>`;
  let body='';
  if(tab==='overview'){
    const step=(done,t,s,v)=>`<div class="li" data-a="setupTab" data-v="${v}"><span class="tick ${done?'ok':''}">${done?'✓':''}</span><div class="main-t"><div class="t">${t}</div><div class="s">${s}</div></div><div class="end">${ic('back','flip')}</div></div>`;
    body=`<div class="grid g2"><div class="panel"><div class="hd"><h2>Set up in this order</h2></div><div class="list">
      ${step(!!(cfg.businesses&&cfg.businesses.length),'My businesses',plural(businesses().length,'business','businesses')+': '+esc(businesses().map(b=>b.name).join(', ')),'businesses')}
      ${step(!!(cfg.stages&&Object.keys(cfg.stages).length),'Lead stages','The steps each business takes a lead through','stages')}
      ${step(customFields('companies').length>0,'Company fields','Industry, regions and your own fields such as credit limit or segment','companyFields')}
      ${step(customFields('people').length>0,'People fields','Your own fields for people','peopleFields')}
      ${step(!!cfg.docTypes,'Documents','Which documents you collect for companies and people','documents')}
      ${step(D.groups.size>0,'Groups',plural(D.groups.size,'group')+' so far','groups')}
      ${step(!cfg.owners.some(o=>/^Owner \d$/.test(o)),'Owners & team','Owner names and who can sign in','team')}
      </div></div>
      <div class="stack">${panel('Then add your data',`<div class="row"><button class="btn pri" data-a="companyForm">${ic('companies')}Add a company</button><button class="btn" data-a="personForm">${ic('people')}Add a person</button><button class="btn" data-a="go" data-v="import">${ic('import')}Import a file</button></div><p class="small muted">A person can belong to several companies, each with their own role. A company can have many people and belong to one group.</p>`)}
      ${panel('In numbers',`<dl class="kv"><dt>Companies</dt><dd class="num">${D.companies.size.toLocaleString('en-IN')}</dd><dt>People</dt><dd class="num">${D.people.size.toLocaleString('en-IN')}</dd><dt>Groups</dt><dd class="num">${D.groups.size}</dd><dt>Leads</dt><dd class="num">${D.leads.size}</dd><dt>Documents</dt><dd class="num">${D.docs.size}</dd><dt>Blacklist entries</dt><dd class="num">${D.blacklist.size}</dd></dl>`)}</div></div>`;
  }else if(tab==='businesses'){
    const used=id=>({leads:[...D.leads.values()].filter(l=>leadBiz(l)===id).length,people:[...X.p.values()].filter(x=>x.biz.has(id)).length,cos:[...X.co.values()].filter(c=>c.biz.has(id)).length});
    body=panel('My businesses',`<p class="muted small" style="margin-top:0">Your own businesses. Tag companies and people with the businesses they deal with, and each business gets its own lead stages. Pick a business in the top bar to narrow every screen to it.</p>
      <div class="list">${businesses().map(b=>{const u=used(b.id);return `<div class="li" style="cursor:default"><span class="biz-dot"></span><div class="main-t"><div class="t">${esc(b.name)}</div><div class="s">${u.cos} companies · ${u.people} people · ${u.leads} leads</div></div><div class="end"><button class="btn sm" data-a="pickBiz" data-v="${esc(b.id)}">View</button><button class="btn sm" data-a="bizForm" data-id="${esc(b.id)}">Rename</button><button class="iconbtn" data-a="bizDel" data-id="${esc(b.id)}" title="Delete business">${ic('trash')}</button></div></div>`}).join('')}</div>`,{right:`<button class="btn pri sm" data-a="bizForm">${ic('plus')}Add business</button>`});
  }else if(tab==='stages')body=stagesEditor();
  else if(tab==='companyFields')body=fieldsPanel('companies','Your company fields','Add any field you want on every company: text, numbers, dropdowns, dates, yes/no. Dropdown fields also become filters and segment rules.');
  else if(tab==='peopleFields')body=fieldsPanel('people','Your people fields','Fields for every person, for example family details, preferred language or investment appetite.');
  else if(tab==='leadFields'){const lvf=leadValueField();const opts=[{v:'builtin',l:'Expected value (built-in)'},...customFields('leads').filter(f=>['number','dropdown','text'].includes(f.type)).map(f=>({v:f.key,l:f.label}))];
    body=panel('Lead value',`<p class="small muted" style="margin-top:0">The field used for value totals on the lead board, list, funnel and dashboard. Amounts like “250 L”, “2.5 Cr” or “2500000” are all understood.</p><div class="row" style="gap:8px;flex-wrap:wrap"><select data-c="leadValueField" aria-label="Field used for lead value" ${selS}>${opts.map(o=>`<option value="${esc(o.v)}" ${(lvf?lvf.key:'builtin')===o.v?'selected':''}>${esc(o.l)}</option>`).join('')}</select>${R().settings?'':'<span class="small muted">Only an admin can change this.</span>'}</div>`)+'<div style="height:16px"></div>'+fieldsPanel('leads','Your lead fields','Fields for every lead, for example product, chit group wanted, or budget range.')}
  else if(tab==='groupFields')body=fieldsPanel('groups','Your group fields','Fields for every group, for example promoter family, head office city or relationship since.');
  else if(tab==='roles')body=rolesTab();
  else if(tab==='referrals')body=refSetupTab();
  else if(tab==='documents')body=`<p class="muted" style="margin-top:0">Choose which documents you collect. Each company and person page then shows a checklist with upload buttons. Files up to 4 MB, stored privately in your database.</p><div class="grid g2">${docTypesPanel('companies','Company documents')}${docTypesPanel('people','People documents')}</div>`;
  else if(tab==='groups'){
    body=panel('Groups',`<div class="list">${[...X.g.values()].sort((a,b)=>a.g.name.localeCompare(b.g.name)).map(g=>`<div class="li" data-a="openGroup" data-id="${g.g.id}"><div class="avatar co">${esc(initials(g.g.name))}</div><div class="main-t"><div class="t">${esc(g.g.name)}</div><div class="s">${plural(g.cos.length,'company','companies')}</div></div></div>`).join('')||'<div class="empty">No groups yet.</div>'}</div>`,{flush:true,right:canWrite()?`<button class="btn pri sm" data-a="groupForm">${ic('plus')}Add group</button>`:''});
  }else if(tab==='blacklist'){
    const rows=[...D.blacklist.values()].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    const what=b=>b.kind==='company'?((D.companies.get(b.value)||{}).name||'Deleted company'):b.kind==='person'?(personName(b.value)||'Hidden or deleted person'):b.value;
    body=panel('Blacklist',`<p class="muted small">Anyone matching an entry is flagged in red wherever they appear, is left out of every campaign, and you are warned before adding them again.</p>`+(rows.length?`</div><div class="bd flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th>Value</th><th>Reason</th><th>Added</th><th></th></tr></thead><tbody>${rows.map(b=>`<tr><td>${esc(BL_KINDS[b.kind]||b.kind)}</td><td>${b.kind==='company'?`<a href="#" data-a="openCompany" data-id="${esc(b.value)}">${esc(what(b))}</a>`:b.kind==='person'?`<a href="#" data-a="openPerson" data-id="${esc(b.value)}">${esc(what(b))}</a>`:`<span class="num">${esc(what(b))}</span>`}</td><td>${esc(b.reason||'—')}</td><td class="small">${esc(b.by||'')} · ${fmtDate(b.at)}</td><td class="r">${R().del?`<button class="btn sm" data-a="unblack" data-id="${b.id}">Remove</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted small">Nothing blacklisted.</div>'),{right:canWrite()?`<button class="btn pri sm" data-a="blackForm">${ic('plus')}Add to blacklist</button>`:''});
  }else if(tab==='team'){
    if(!S.users&&!S._usersLoading)loadUsers();if(!S.auditRows&&!S._auditLoading)loadAudit();
    const users=S.users||[];const auditRows=S.auditRows||[];
    body=`<div class="grid g2"><div class="stack">
    ${strayOwnersPanel()}${panel('Owners',`<form data-f="optsForm" class="stack"><input type="hidden" name="key" value="owners"><p class="small muted" style="margin:0">Owners can be assigned to companies (several per company), to people and to leads, and their names appear on comments.</p>${listEd('opt',cfg.owners,{ph:'Owner name',sort:false,orig:true})}<div><button class="btn pri sm" type="submit">Save owners</button></div></form>`)}
    ${panel('Team & roles',`${S.users?`<div class="list">${users.map(u=>`<div class="li" style="cursor:default;padding-inline:0;flex-wrap:wrap"><div class="avatar">${esc(initials(u.name||u.email))}</div><div class="main-t"><div class="t">${esc(u.name||u.email)}${u.id===S.me.id?' (you)':''}${u.active?'':' <span class="chip bad">Disabled</span>'}${u.totpEnabled?' <span class="chip good">2-step</span>':''}${u.active&&!u.owner&&!roleOf(u.role).perms.all?' <span class="chip warn" title="Pick an owner name in the second dropdown">Sees nothing until given an owner name</span>':''}</div><div class="s">${esc(u.email)} · last sign-in ${u.lastLogin?fmtDate(u.lastLogin):'never'}</div></div>
        <div class="end" style="flex-wrap:wrap"><select data-c="userRole" data-id="${u.id}" aria-label="Role" ${selS}>${roleList().map(r=>`<option value="${r.id}" ${u.role===r.id?'selected':''}>${esc(r.label)}</option>`).join('')}</select><select data-c="userOwner" data-id="${u.id}" aria-label="Acts as owner" ${selS}><option value="">Staff</option>${cfg.owners.map(o=>`<option ${u.owner===o?'selected':''}>${esc(o)}</option>`).join('')}</select><button class="btn sm" data-a="userMenu" data-id="${u.id}">More</button></div></div>`).join('')}</div>`:'<div class="muted small">Loading team…</div>'}
      <div class="row" style="margin-top:12px"><button class="btn pri sm" data-a="userAdd">${ic('plus')}Add a team member</button></div>
      <div class="note" style="margin-top:10px">Owners see everything and can export. Managers see only people assigned to them and cannot export or send campaigns. Data entry staff add and update records but do not see campaigns. Read-only users can view and report.</div>`)}</div>
    ${panel('Audit log',auditRows.length?`<div class="tbl-wrap" style="max-height:560px;overflow:auto"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${auditRows.map(a=>`<tr><td class="small num">${new Date(a.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td><td class="small">${esc(a.who||'—')}</td><td class="small">${esc(a.action)} ${esc(a.entity)}${a.detail?' · '+esc(a.detail):''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted small">'+(S.auditRows?'Every change, sign-in and export is recorded here.':'Loading…')+'</div>',{flush:!!auditRows.length,right:'<button class="btn sm ghost" data-a="auditRefresh">Refresh</button>'})}</div>`;
  }else if(tab==='branding'){body=brandingTab();
  }else if(tab==='general'){
    body=`<div class="grid g2">${panel('Business settings',`<form data-f="biz" class="form"><label class="field full"><span>Cross-sell threshold (chit value)</span><input name="th" id="s-th" value="${esc(inr(cfg.crossSellThreshold))}"><span class="hint">Chit customers at or above this with no property are prompted for real estate.</span></label><div class="full"><button class="btn pri sm" type="submit">Save</button></div></form>
      <div class="list" style="margin-top:12px">${['projects','branches','sendersWA','sendersEmail'].map(k=>`<div class="li" data-a="optsEdit" data-k="${k}"><div class="main-t"><div class="t">${esc(OPT_LISTS[k].t)}</div><div class="s">${esc(OPT_LISTS[k].get().join(', ')||'None yet')}</div></div><div class="end"><span class="btn sm">Edit</span></div></div>`).join('')}</div>`)}
    ${panel('Data & backup',`<div class="stack">
      <div class="row"><button class="btn" data-a="exportPeople">${ic('download')}People (Excel)</button><button class="btn" data-a="exportCompanies">${ic('download')}Companies (Excel)</button><button class="btn" data-a="xlsxExport" data-k="leads">${ic('download')}Leads (Excel)</button><button class="btn" data-a="xlsxExport" data-k="groups">${ic('download')}Groups (Excel)</button><button class="btn" data-a="backup">${ic('download')}Full backup (JSON)</button></div><div class="small muted">Exports are limited to owners and written to the audit log. The database host also keeps restorable history.</div>
      <label class="field"><span>Offline copy on devices</span><select data-c="deviceCopy" aria-label="Offline copy on devices" ${selS}>${[['off','Nobody (safest)'],['owners','Owners only'],['all','Everyone']].map(([v,l])=>`<option value="${v}" ${(cfg.deviceCopy||'off')===v?'selected':''}>${l}</option>`).join('')}</select><span class="hint">A device with a copy opens without a connection, but the network stays on that phone or computer until someone signs out. With “Nobody”, existing copies are erased the next time each device opens the app.</span></label>
      <div class="row"><button class="btn" data-a="loadSample">Load sample data</button><button class="btn danger" data-a="removeSample">Remove sample data</button></div>
    </div>`)}</div>`;
  }else{
    body=panel('My account',`<dl class="kv"><dt>Name</dt><dd>${esc(S.me.name||'—')}</dd><dt>Email</dt><dd>${esc(S.me.email)}</dd><dt>Role</dt><dd>${esc(R().label)}</dd><dt>Acts as owner</dt><dd>${esc(S.me.owner||'— (staff)')}</dd><dt>Two-step sign-in</dt><dd>${S.me.totpEnabled?'<span class="chip good">On</span>':'<span class="chip warn">Off</span>'}${R().settings&&!S.me.totpEnabled?' <span class="small muted">Strongly recommended for owners</span>':''}</dd>${S.customer?`<dt>Network</dt><dd>${esc(S.customer.name)}</dd>`:''}</dl>
      <div class="row" style="margin-top:12px"><button class="btn sm" data-a="pwForm">Change password</button>${S.me.totpEnabled?'<button class="btn sm" data-a="totpOff">Turn off two-step sign-in</button>':'<button class="btn sm pri" data-a="totpOn">Turn on two-step sign-in</button>'}<button class="btn sm" data-a="endSessions">Sign out everywhere else</button><button class="btn sm" data-a="logout">Sign out</button></div>`);
  }
  return `<div class="ph"><div><h1>Setup</h1><div class="sub">Shape the app around how ${esc(shortName())} works. ${A?'':'Only owners can change most settings.'}</div></div></div>${tabs}${body}`;
};
VIEWS.settings=VIEWS.setup;

/* ============ sheet (modal) ============ */
let sheetOnClose=null;
function openSheet({title,body,foot='',wide=false,form=''}){
  const tag=form?'form':'div';
  $('#sheet-root').innerHTML=`<div class="sheet-wrap" data-a="sheetBg"><${tag} class="sheet ${wide?'wide':''}" ${form?`data-f="${form}" novalidate`:''} role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="hd"><h2>${esc(title)}</h2><button type="button" class="iconbtn" data-a="closeSheet" aria-label="Close">${ic('close')}</button></div><div class="bd" id="sheet-bd">${body}</div>${foot?`<div class="ft">${foot}</div>`:''}</${tag}></div>`;
  const f=$('#sheet-root input:not([type=hidden]):not([type=checkbox]):not([type=radio]),#sheet-root textarea');if(f&&window.innerWidth>700)setTimeout(()=>f.focus(),30);
}
function closeSheet(){if(typeof rec!=='undefined'&&rec){try{rec.stop()}catch(e){}}$('#sheet-root').innerHTML='';sheetOnClose&&sheetOnClose();sheetOnClose=null}
let toastT;function toast(m,ms){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,ms||Math.min(9000,Math.max(3200,String(m).length*55)))}
const fld=(label,inner,o={})=>`<label class="field ${o.full?'full':''}"><span>${label}${o.req?' <b class="req" aria-hidden="true">*</b>':''}</span>${inner}${o.hint?`<span class="hint">${o.hint}</span>`:''}</label>`;
const inp=(name,val,o={})=>`<input id="fm-${name}" name="${name}" value="${esc(val==null?'':val)}" ${o.type?`type="${o.type}"`:''} ${o.ph?`placeholder="${esc(o.ph)}"`:''} ${o.list?`list="${o.list}"`:''} ${o.req?'required':''} ${o.mode?`inputmode="${o.mode}"`:''} autocomplete="off">`;
const selI=(name,opts,val,blank='—')=>opts.length>BIG?combo({name,id:'fm-'+name,opts:/^(region|industry)$/.test(name)?azOpts(opts):opts,val,blank:blank===null?'Choose…':blank==='—'?'Type to search…':blank,allowBlank:blank!==null}):`<select id="fm-${name}" name="${name}">${blank!==null?`<option value="">${esc(blank)}</option>`:''}${opts.map(o=>{const v=typeof o==='object'?o.v:o,l=typeof o==='object'?o.l:o;return `<option value="${esc(v)}" ${String(val)===String(v)?'selected':''}>${esc(l)}</option>`}).join('')}</select>`;
const segI=(name,opts,val,dataC='')=>`<div class="seg">${opts.map(o=>{const v=typeof o==='object'?o.v:o,l=typeof o==='object'?o.l:o;return `<label><input type="radio" name="${name}" value="${esc(v)}" ${String(val)===String(v)?'checked':''} ${dataC?`data-c="${dataC}"`:''}><span>${esc(l)}</span></label>`}).join('')}</div>`;
let peopleDL=new Map();
function dlPeople(){
  peopleDL=new Map();const opts=[];
  for(const x of visPeople()){const l=x.p.name+((x.p.mobiles||[])[0]?' · '+x.p.mobiles[0]:'');peopleDL.set(l,x.p.id);if(opts.length<6000)opts.push(`<option value="${esc(l)}">`)}
  return `<datalist id="dl-people">${opts.join('')}</datalist>`;
}
function dlCompanies(){return `<datalist id="dl-co">${[...D.companies.values()].slice(0,6000).map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist>`}
function resolvePerson(label){
  label=String(label||'').trim();if(!label)return null;
  if(peopleDL.has(label))return peopleDL.get(label);
  const n=normName(label.split(' · ')[0]);const m=visPeople().filter(x=>normName(x.p.name)===n);
  return m.length===1?m[0].p.id:null;
}
const personLabel=id=>{const x=P(id);return x?x.p.name+((x.p.mobiles||[])[0]?' · '+x.p.mobiles[0]:''):''};
function findCompanyByName(n){const k=normName(n);if(!k)return null;for(const c of D.companies.values())if(normName(c.name)===k)return c;return null}

/* ---- person form ---- */
function personForm(id,prefill={}){
  const p=id?clone(D.people.get(id)):Object.assign({ownerInCharge:S.me.owner,source:'',consent:{}},prefill);
  if(id&&!p)return;
  const links=p.links||{};const cons=p.consent||{};
  const cos=(p.companies||[]).map(l=>({name:(D.companies.get(l.companyId)||{}).name||'',role:l.role||''}));while(cos.length<2)cos.push({name:'',role:''});S._blOk=false;
  const co0=findCompanyByName(cos[0].name);
  S._dupOk=false;
  openSheet({title:id?'Edit '+p.name:'Add a person',form:'person',body:`<input type="hidden" name="id" value="${esc(id||'')}">${dlPeople()}${dlCompanies()}
  <div class="form">
    ${fld('Name',inp('name',p.name,{req:true,ph:'Full name'}),{full:true})}
    ${bf('people','mobiles','Mobile number(s)',inp('mobiles',(p.mobiles||[]).join(', '),{ph:'98480 12345, …',mode:'tel'}),{hint:'Separate several with commas.'})}
    ${bf('people','ownerInCharge','Owner in charge',selI('ownerInCharge',S.config.owners,p.ownerInCharge))}
    ${bf('people','co0','Company',inp('co0',cos[0].name,{list:'dl-co',ph:'Start typing to pick or add'}))}
    ${bf('people','role0','Role at company',selI('role0',coRoles(),cos[0].role))}
    ${bf('people','industry','Industry',selI('industry',industryNames(),(co0&&co0.industry)||p.industry),{hint:'Saved on the company.'})}
    ${bf('people','region','Region / locality',selI('region',regionsAZ(),p.region||(co0&&co0.region)))}
    ${bf('people','pincode','Pincode',inp('pincode',p.pincode||(co0&&co0.pincode)||'',{mode:'numeric',ph:'500033'}))}
    ${bf('people','introducedBy','Introduced by',inp('introducedBy',personLabel(p.introducedBy),{list:'dl-people',ph:'Who referred them?'}))}
    ${bf('people','grade','Relationship grade',segI('grade',[{v:'',l:'None'},...GRADES],p.grade||''))}
    ${bf('people','tags','Tags',inp('tags',(p.tags||[]).join(', '),{ph:'e.g. Rotary, Temple trust'}),{full:true})}
    ${bf('people','businesses','Part of my businesses',checks('businesses',businesses().map(b=>({v:b.id,l:b.name})),p.businesses||(S.ui.biz?[S.ui.biz]:[])),{full:true})}
    ${cfInputs('people',p.cf)}
    <details class="more" ${id?'':''}><summary>More details</summary><div class="form">
      ${bf('people','emails','Email(s)',inp('emails',(p.emails||[]).join(', '),{type:'text',ph:'name@company.com',mode:'email'}),{full:true})}
      ${fld('Second company',inp('co1',cos[1].name,{list:'dl-co'}))}
      ${fld('Role there',selI('role1',coRoles(),cos[1].role))}
      ${bf('people','dob','Birthday',inp('dob',p.dob&&!String(p.dob).startsWith('1900')?p.dob:(p.dob||''),{type:'date'}))}
      ${bf('people','anniversary','Anniversary',inp('anniversary',p.anniversary,{type:'date'}))}
      ${bf('people','address','Address',inp('address',p.address),{full:true})}
      ${bf('people','city','City',inp('city',p.city||'Hyderabad'))}
      ${bf('people','pan','PAN / KYC reference',inp('pan',p.pan,{ph:'Optional'}))}
      ${bf('people','source','Source',selI('source',S.config.sources,p.source))}
      ${bf('people','sourceOwner','From whose contacts',selI('sourceOwner',S.config.owners,p.sourceOwner))}
      ${bf('people','links','LinkedIn',inp('linkedin',links.linkedin,{ph:'linkedin.com/in/…'}))}
      ${bf('people','links','Website',inp('website',links.website))}
      ${bf('people','links','Facebook',inp('facebook',links.facebook))}
      ${bf('people','links','Instagram',inp('instagram',links.instagram))}
      ${bf('people','links','X (Twitter)',inp('x',links.x))}
      ${bf('people','notes','Notes',`<textarea id="fm-notes" name="notes">${esc(p.notes||'')}</textarea>`,{full:true})}
      <div class="full stack" style="gap:8px">
        <h3>Consent & privacy</h3>
        <div ${bHid('people','consent')?'hidden':''} class="stack" style="gap:8px"><label class="check"><input type="checkbox" name="cw" id="fm-cw" ${cons.whatsapp?'checked':''}> Agreed to receive WhatsApp messages from ${esc(shortName())}</label>
        <label class="check"><input type="checkbox" name="ce" id="fm-ce" ${cons.email?'checked':''}> Agreed to receive emails from ${esc(shortName())}</label>
        ${fld('How was consent given?',inp('chow',cons.how,{ph:'e.g. verbally on call 12 Oct, signed form, replied YES'}))}</div>
        <label class="check"><input type="checkbox" name="dnd" id="fm-dnd" ${p.dnd?'checked':''}> Do not disturb (never include in campaigns)</label>
        <label class="check"><input type="checkbox" name="optedOut" id="fm-oo" ${p.optedOut?'checked':''}> Has opted out</label>
        <label class="check"><input type="checkbox" name="private" id="fm-priv" ${p.private?'checked':''}> Private: only the owner in charge can see this person</label>
      </div>
    </div></details>
  </div>`,foot:`${id&&R().del?`<button type="button" class="btn danger" data-a="delPerson" data-id="${id}" style="margin-right:auto">${ic('trash')}Delete</button>`:''}<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">${id?'Save changes':'Add person'}</button>`});
}
async function savePersonForm(fd){
  const id=fd.get('id');const old=id?D.people.get(id):null;
  const p=old?clone(old):{};
  const name=String(fd.get('name')||'').trim();if(!name){toast('Add a name first.');return}
  p.name=name;
  p.mobiles=splitList(fd.get('mobiles'));
  p.ownerInCharge=fd.get('ownerInCharge')||'';
  p.region=fd.get('region')||'';p.pincode=String(fd.get('pincode')||'').trim();
  p.grade=fd.get('grade')||'';
  p.tags=splitList(fd.get('tags'));
  p.businesses=fd.getAll('businesses');
  {const {cf,missing}=cfRead('people',fd,p.cf);if(missing.length)return toast('Fill in: '+missing.join(', '));p.cf=cf}
  if(fd.has('emails')){
    p.emails=splitList(fd.get('emails'));['dob','anniversary','address','city','pan','source','sourceOwner','notes'].forEach(k=>p[k]=String(fd.get(k)||'').trim());
    p.links={linkedin:fd.get('linkedin')||'',website:fd.get('website')||'',facebook:fd.get('facebook')||'',instagram:fd.get('instagram')||'',x:fd.get('x')||''};
    const cw=!!fd.get('cw'),ce=!!fd.get('ce');const oc=(old&&old.consent)||{};
    p.consent={whatsapp:cw,email:ce,how:String(fd.get('chow')||''),at:(cw!==!!oc.whatsapp||ce!==!!oc.email)?todayISO():(oc.at||'')};
    p.dnd=!!fd.get('dnd');p.optedOut=!!fd.get('optedOut');p.private=!!fd.get('private');
  }
  if((!old||!sameName(old.name,name))&&!(await dupNameCheck('people',name,id||'')))return;
  if(!(await dupMobileCheck(p,old)))return;
  S._dupOk=false;
  if(blWarn(blacklistHit({mobiles:p.mobiles,emails:p.emails||[],personId:old?'':''})))return;S._blOk=false;
  const intro=resolvePerson(fd.get('introducedBy'));p.introducedBy=intro&&intro!==p.id?intro:(String(fd.get('introducedBy')||'').trim()?p.introducedBy||'':'');
  // companies
  const links=[];const ind=fd.get('industry')||'';
  for(const [k,r] of [['co0','role0'],['co1','role1']]){
    const n=String(fd.get(k)||'').trim();if(!n)continue;
    let co=findCompanyByName(n);
    if(!co){co=await put('companies',{name:n,industry:k==='co0'?ind:'',region:k==='co0'?p.region:''})}
    else if(k==='co0'&&((ind&&co.industry!==ind)||(!co.region&&p.region))){co=clone(co);if(ind)co.industry=ind;if(!co.region)co.region=p.region;await put('companies',co)}
    links.push({companyId:co.id,role:fd.get(r)||''});
  }
  // keep companies beyond the two editable slots
  if(old&&(old.companies||[]).length>2)links.push(...old.companies.slice(2));
  p.companies=links;
  if(!links.length)p.industry=ind;else delete p.industry;
  const saved=await put('people',p);
  closeSheet();toast(old?'Saved':'Added '+saved.name);
  if(!old)go('person',saved.id);
}

/* ---- blacklist checks ---- */
function blacklistHit({mobiles=[],emails=[],gst='',companyId='',personId=''}){
  const bl=X.bl||{};if(!bl.phone)return null;
  return (personId&&bl.person.get(personId))||(companyId&&bl.company.get(companyId))||mobiles.map(normPhone).map(m=>bl.phone.get(m)).find(Boolean)||emails.map(normEmail).map(e=>bl.email.get(e)).find(Boolean)||(gst&&bl.gst.get(normGST(gst)))||null;
}
function blWarn(hit){if(!hit||S._blOk)return false;S._blOk=true;toast(`Blacklisted ${BL_KINDS[hit.kind].toLowerCase()}${hit.reason?' ('+hit.reason+')':''}. Press save again to continue anyway.`);return true}

/* ---- company form ---- */
function dlGroups(){return `<datalist id="dl-groups">${[...D.groups.values()].map(g=>`<option value="${esc(g.name)}">`).join('')}</datalist>`}
function companyForm(id,o={}){
  const c=id?clone(D.companies.get(id)):{owners:S.me.owner?[S.me.owner]:[],businesses:S.ui.biz?[S.ui.biz]:[],groupId:o.gid||''};if(id&&!D.companies.get(id))return;
  const L=c.links||{};S._blOk=false;
  openSheet({title:id?'Edit '+c.name:'Add a company',form:'company',wide:true,body:`<input type="hidden" name="id" value="${esc(id||'')}">${dlGroups()}<div class="form">
    ${fld('Company name',inp('name',c.name,{req:true}),{full:true})}
    ${bf('companies','group','Group',inp('group',groupName(c.groupId)||c.group||'',{list:'dl-groups',ph:'Pick a group or type a new one'}),{hint:'A group links companies owned by the same family or promoter.'})}
    ${bf('companies','industry','Industry',selI('industry',industryNames(),c.industry))}
    ${bf('companies','subIndustry','Sub-industry',`<input id="fm-subIndustry" name="subIndustry" list="dl-sub" value="${esc(c.subIndustry||'')}" autocomplete="off"><datalist id="dl-sub">${subIndustries().map(s=>`<option value="${esc(s)}">`).join('')}</datalist>`)}
    ${bf('companies','region','Region / locality',selI('region',regionsAZ(),c.region))}
    ${bf('companies','owners','Owners',checks('owners',S.config.owners,c.owners||[]),{full:true,hint:'Tick every owner who looks after this company.'})}
    ${bf('companies','businesses','Part of my businesses',checks('businesses',businesses().map(b=>({v:b.id,l:b.name})),c.businesses||[]),{full:true})}
    ${bf('companies','phones','Phone number(s)',inp('phones',(c.phones||[]).join(', '),{mode:'tel'}))}${bf('companies','email','Email',inp('email',c.email,{mode:'email'}))}
    ${bf('companies','pincode','Pincode',inp('pincode',c.pincode,{mode:'numeric',ph:'500033'}))}${bf('companies','city','City',inp('city',c.city||'Hyderabad'))}${bf('companies','gst','GST number',inp('gst',c.gst,{ph:'36AAAAA0000A1Z5'}))}${bf('companies','website','Website',inp('website',c.website))}
    ${bf('companies','turnover','Turnover',selI('turnover',turnovers(),c.turnover))}${bf('companies','employees','Employees',selI('employees',empBands(),c.employees))}
    ${cfInputs('companies',c.cf)}
    ${bf('companies','address','Address',inp('address',c.address),{full:true})}
    <details class="more"><summary>Links and notes</summary><div class="form">
    ${bf('companies','links','LinkedIn',inp('linkedin',L.linkedin))}${bf('companies','links','Facebook',inp('facebook',L.facebook))}
    ${bf('companies','links','Instagram',inp('instagram',L.instagram))}${bf('companies','links','X (Twitter)',inp('x',L.x))}
    ${bf('companies','links','Justdial',inp('justdial',L.justdial))}${bf('companies','links','IndiaMART',inp('indiamart',L.indiamart))}
    ${bf('companies','links','News / articles',inp('news',L.news),{full:true})}
    ${bf('companies','notes','Notes',`<textarea id="fm-notes" name="notes">${esc(c.notes||'')}</textarea>`,{full:true})}</div></details>
  </div>`,foot:`${id&&R().del?`<button type="button" class="btn danger" data-a="delCompany" data-id="${id}" style="margin-right:auto">${ic('trash')}Delete</button>`:''}<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>`});
}
async function groupIdFor(name){
  name=String(name||'').trim();if(!name)return '';
  const k=normName(name);const g=[...D.groups.values()].find(g=>normName(g.name)===k);
  if(g)return g.id;const n=await put('groups',{name});return n.id;
}
async function saveCompanyForm(fd){
  const id=fd.get('id');const old=id?D.companies.get(id):null;const c=old?clone(old):{};
  ['name','industry','subIndustry','region','pincode','city','turnover','employees','website','gst','email','address','notes'].forEach(k=>c[k]=String(fd.get(k)||'').trim());
  if(!c.name)return toast('Add the company name.');
  if((!old||!sameName(old.name,c.name))&&!(await dupNameCheck('companies',c.name,id||'')))return;
  c.gst=c.gst.toUpperCase();c.phones=splitList(fd.get('phones'));c.owners=fd.getAll('owners');c.businesses=fd.getAll('businesses');
  const {cf,missing}=cfRead('companies',fd,c.cf);if(missing.length)return toast('Fill in: '+missing.join(', '));c.cf=cf;
  if(blWarn(blacklistHit({mobiles:c.phones,gst:c.gst,companyId:id||''})))return;
  if(!id&&c.gst){const dup=[...D.companies.values()].find(o=>o.gst&&normGST(o.gst)===normGST(c.gst));if(dup&&!S._gstOk){S._gstOk=true;return toast(dup.name+' already has this GST number. Press save again to add anyway.')}}
  S._gstOk=false;S._blOk=false;
  c.groupId=await groupIdFor(fd.get('group'));delete c.group;
  c.links={};['linkedin','facebook','instagram','x','justdial','indiamart','news'].forEach(k=>c.links[k]=String(fd.get(k)||'').trim());
  const s=await put('companies',c);closeSheet();toast('Saved');if(!id)go('company',s.id);
}
function groupForm(id){
  const g=id?D.groups.get(id):{};
  openSheet({title:id?'Edit group':'Add a group',form:'group',body:`<input type="hidden" name="id" value="${esc(id||'')}"><div class="form">${fld('Group name',inp('name',g.name,{req:true,ph:'e.g. Reddy family group'}),{full:true})}${cfInputs('groups',g.cf)}${bf('groups','notes','Notes',`<textarea id="fm-gnotes" name="notes">${esc(g.notes||'')}</textarea>`,{full:true})}</div>`,
    foot:`${id&&R().del?`<button type="button" class="btn danger" data-a="delGroup" data-id="${id}" style="margin-right:auto">${ic('trash')}Delete</button>`:''}<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>`});
}
function linkPersonSheet(cid){
  const co=D.companies.get(cid);
  openSheet({title:'Add a person to '+co.name,form:'linkPerson',body:`<input type="hidden" name="cid" value="${esc(cid)}">${dlPeople()}<div class="form">
    ${fld('Existing person',inp('person','',{list:'dl-people',ph:'Start typing a name or number'}),{full:true,hint:'Or leave empty and use “New person” to create one.'})}
    ${fld('Role at '+esc(co.name),selI('role',coRoles(),'Owner'))}</div>`,
    foot:`<button type="button" class="btn" data-a="newPersonAt" data-cid="${esc(cid)}" style="margin-right:auto">${ic('plus')}New person</button><button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Add</button>`});
}

/* ---- chit / RE forms ---- */
function chitForm(id,pid){
  const c=id?clone(D.chits.get(id)):{personId:pid,status:'Active',prized:'Unprized'};
  openSheet({title:(id?'Edit chit':'Add chit')+' · '+personName(c.personId),form:'chit',body:`<input type="hidden" name="id" value="${esc(id||'')}"><input type="hidden" name="personId" value="${esc(c.personId)}"><div class="form">
    ${fld('Chit group / series',inp('group',c.group,{req:true}))}${fld('Ticket no.',inp('ticketNo',c.ticketNo))}
    ${fld('Chit value (₹)',inp('chitValue',c.chitValue?inrFull(c.chitValue).slice(1):'',{mode:'decimal',ph:'e.g. 10L or 1000000'}))}${fld('Instalment / EMI (₹)',inp('emi',c.emi?inrFull(c.emi).slice(1):'',{mode:'decimal'}))}
    ${fld('Tenure (months)',inp('tenure',c.tenure,{mode:'numeric'}))}${fld('Branch',`<input id="fm-branch" name="branch" list="dl-br" value="${esc(c.branch||'')}"><datalist id="dl-br">${(S.config.branches||[]).map(b=>`<option value="${esc(b)}">`).join('')}</datalist>`)}
    ${fld('Start date',inp('startDate',c.startDate,{type:'date'}))}${fld('End / maturity date',inp('endDate',c.endDate,{type:'date'}))}
    ${fld('Prized',segI('prized',['Unprized','Prized'],c.prized||'Unprized'))}${fld('Status',segI('status',CHIT_STATUS,c.status||'Active'))}
  </div><div class="note" style="margin-top:12px">For relationship context only. Auctions, receipts and statutory records stay in the chit software.</div>`,
  foot:`${id?`<button type="button" class="btn danger" data-a="delRec" data-type="chits" data-id="${id}" style="margin-right:auto">${ic('trash')}Delete</button>`:''}<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>`});
}
async function saveChitForm(fd){
  const id=fd.get('id');const c=id?clone(D.chits.get(id)):{};
  c.personId=fd.get('personId');['group','ticketNo','branch','startDate','endDate','prized','status'].forEach(k=>c[k]=String(fd.get(k)||'').trim());
  c.chitValue=num(fd.get('chitValue'));c.emi=num(fd.get('emi'));c.tenure=parseInt(fd.get('tenure'))||'';
  if(!c.endDate&&c.startDate&&c.tenure)c.endDate=addDays(c.startDate,Math.round(c.tenure*30.44));
  await put('chits',c);closeSheet();toast('Chit saved');
}
function reForm(id,pid){
  const r=id?clone(D.re.get(id)):{personId:pid,stage:'Enquiry'};
  openSheet({title:(id?'Edit property':'Add property')+' · '+personName(r.personId),form:'re',body:`<input type="hidden" name="id" value="${esc(id||'')}"><input type="hidden" name="personId" value="${esc(r.personId)}"><div class="form">
    ${fld('Project',`<input id="fm-project" name="project" list="dl-proj" value="${esc(r.project||'')}" required><datalist id="dl-proj">${(S.config.projects||[]).map(b=>`<option value="${esc(b)}">`).join('')}</datalist>`)}${fld('Unit / plot',inp('unit',r.unit))}
    ${fld('Ticket size (₹)',inp('ticketSize',r.ticketSize?inrFull(r.ticketSize).slice(1):'',{mode:'decimal',ph:'e.g. 1.2Cr'}))}${fld('Booking date',inp('bookingDate',r.bookingDate,{type:'date'}))}
    ${fld('Stage',segI('stage',RE_STAGES,r.stage||'Enquiry'),{full:true})}
    ${fld('Payment stage',inp('paymentStage',r.paymentStage,{ph:'e.g. Token paid, 30% paid'}),{full:true})}
  </div>`,foot:`${id?`<button type="button" class="btn danger" data-a="delRec" data-type="re" data-id="${id}" style="margin-right:auto">${ic('trash')}Delete</button>`:''}<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>`});
}
async function saveReForm(fd){
  const id=fd.get('id');const r=id?clone(D.re.get(id)):{};
  r.personId=fd.get('personId');['project','unit','bookingDate','stage','paymentStage'].forEach(k=>r[k]=String(fd.get(k)||'').trim());r.ticketSize=num(fd.get('ticketSize'));
  await put('re',r);closeSheet();toast('Property saved');
}

/* ---- lead form ---- */
function leadForm(id,o={}){
  const l=id?clone(D.leads.get(id)):{business:o.biz||S.ui.biz||allowedBiz()[0].id,owner:S.me.owner,personId:o.pid||'',companyId:o.cid||'',source:o.source||'',crossSell:!!o.crossSell};
  if(id&&!D.leads.get(id))return;
  const bid=o.forceBiz||leadBiz(l);const stages=stagesFor(bid);const cur=id?stageOf(l):stages[0];
  const ro=!canWrite();S._blOk=false;
  if(!l.companyId&&l.personId){const x=P(l.personId);if(x&&x.cos[0])l.companyId=x.cos[0].co.id}
  openSheet({title:id?'Edit lead · '+leadTitle(l):'New lead',form:'lead',wide:true,body:`<input type="hidden" name="id" value="${esc(id||'')}">${dlPeople()}${dlCompanies()}<div class="form">
    ${fld('Business',`<div id="lead-biz">${segI('business',allowedBiz().map(b=>({v:b.id,l:b.name})),bid,'leadBiz')}</div>`,{full:true})}
    ${bf('leads','person','Person',inp('person',personLabel(l.personId),{list:'dl-people',ph:'Existing person, or type a new name'}))}
    ${bf('leads','mobile','Mobile (for a new person)',inp('mobile','',{mode:'tel',ph:'98480 12345'}))}
    ${bf('leads','company','Company',inp('company',(D.companies.get(l.companyId)||{}).name||'',{list:'dl-co',ph:'Optional · pick or type a new one'}),{hint:'A lead needs a person, a company, or both.'})}
    ${bf('leads','owner','Owner',selI('owner',S.config.owners,l.owner))}
    ${fld('Stage',`<div id="lead-stage">${segI('stage',stages.map(s=>({v:s.id,l:s.name})),cur.id)}</div>`,{full:true})}
    ${bf('leads','source','Source',selI('source',S.config.sources,l.source))}
    ${bf('leads','referrer','Referred by',inp('referrer',personLabel(l.referrerId),{list:'dl-people',ph:'Optional'}))}
    ${bf('leads','expectedValue','Expected value (₹)',inp('expectedValue',l.expectedValue?inrFull(l.expectedValue).slice(1):'',{mode:'decimal',ph:'e.g. 25L'}))}
    ${bf('leads','nextDate','Follow-up date',inp('nextDate',l.nextDate||addDays(todayISO(),1),{type:'date'}),{hint:'You get a reminder that day, on the dashboard and in notifications.'})}
    ${bf('leads','nextAction','Follow-up: what to do',inp('nextAction',l.nextAction,{ph:'e.g. Call to fix site visit'}))}
    ${cfInputs('leads',l.cf)}
    ${bf('leads','notes','Notes',`<textarea id="fm-notes" name="notes">${esc(l.notes||'')}</textarea>`,{full:true,hint:'Day-to-day updates go in comments on the lead page.'})}
    <label class="check full" ${bHid('leads','crossSell')?'hidden':''}><input type="checkbox" name="crossSell" id="fm-xs" ${l.crossSell?'checked':''}> Cross-sell from another of my businesses</label>
  </div>`,foot:ro?'<button type="button" class="btn" data-a="closeSheet">Close</button>':`${id?`<button type="button" class="btn danger" data-a="delRec" data-type="leads" data-id="${id}" style="margin-right:auto">${ic('trash')}Delete</button>`:''}<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">${id?'Save':'Add lead'}</button>`});
}
async function saveLeadForm(fd){
  const id=fd.get('id');const old=id?D.leads.get(id):null;const l=old?clone(old):{};
  let pid=resolvePerson(fd.get('person'));const pname=String(fd.get('person')||'').trim();const mob=String(fd.get('mobile')||'').trim();
  const coName=String(fd.get('company')||'').trim();let co=coName?findCompanyByName(coName):null;
  if(!pid&&!pname&&!coName)return toast('Pick or type a person or a company.');
  if(blWarn(blacklistHit({mobiles:mob?[mob]:[],personId:pid||'',companyId:co?co.id:''})))return;S._blOk=false;
  const {cf,missing}=cfRead('leads',fd,l.cf);if(missing.length)return toast('Fill in: '+missing.join(', '));l.cf=cf;
  if(coName&&!co)co=await put('companies',{name:coName,businesses:[fd.get('business')],owners:fd.get('owner')?[fd.get('owner')]:[]});
  if(!pid&&pname){
    if(mob){const hit=visPeople().find(x=>x.mobiles.includes(normPhone(mob)));if(hit)pid=hit.p.id}
    if(!pid){const np=await put('people',{name:pname.split(' · ')[0],mobiles:mob?[mob]:[],ownerInCharge:fd.get('owner')||S.me.owner,source:fd.get('source')||'',tags:[],businesses:[fd.get('business')],companies:co?[{companyId:co.id,role:''}]:[]});pid=np.id}
  }
  l.personId=pid||'';l.companyId=co?co.id:'';l.business=fd.get('business');delete l.line;
  const prevStage=old?stageOf(old):null;
  l.stage=fd.get('stage')||stagesFor(l.business)[0].id;
  ['source','owner','nextAction','nextDate','notes'].forEach(k=>l[k]=String(fd.get(k)||'').trim());
  l.expectedValue=num(fd.get('expectedValue'));l.referrerId=resolvePerson(fd.get('referrer'))||'';l.crossSell=!!fd.get('crossSell');
  const st=stageOf(l);if(st.kind!=='lost')l.reached=Math.max(l.reached||0,stagesFor(l.business).indexOf(st));
  if(!openLead(l))l.closedAt=l.closedAt||todayISO();else delete l.closedAt;
  const x=pid&&P(pid);if(l.referrerId&&x&&!x.p.introducedBy&&l.referrerId!==pid){const pp=clone(x.p);pp.introducedBy=l.referrerId;await put('people',pp,{audit:false})}
  l._title=leadTitle(l);
  const saved=await put('leads',l);
  if(!old||(prevStage&&prevStage!==st))await put('comments',{leadId:saved.id,personId:saved.personId||'',kind:'stage',text:st.name,by:S.me.owner||S.me.name||S.me.email,byId:S.me.id,at:nowISO()},{audit:false});
  closeSheet();toast(id?'Lead saved':'Lead added');if(!id)go('lead',saved.id);
}

/* ---- setup sheets ---- */
function bizForm(id){
  const b=id?businesses().find(x=>x.id===id):{};
  openSheet({title:id?'Rename business':'Add a business',form:'bizForm',body:`<input type="hidden" name="id" value="${esc(id||'')}">${fld('Business name',inp('name',b.name,{req:true,ph:'e.g. Gold Loans'}))}${id?'':'<p class="small muted">It starts with a standard set of lead stages you can change under Lead stages.</p>'}`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>'});
}
function fieldForm(ent,i){
  const f=i!=null&&i!==''?customFields(ent)[+i]:{type:'text'};
  openSheet({title:(i!=null&&i!==''?'Edit field':'Add a field')+' · '+{companies:'companies',people:'people',leads:'leads'}[ent],form:'fieldForm',body:`<input type="hidden" name="ent" value="${ent}"><input type="hidden" name="i" value="${i==null?'':i}"><div class="form">
    ${fld('Field name',inp('label',f.label,{req:true,ph:'e.g. Credit limit'}),{full:true})}
    ${fld('Type',`<select id="fm-ftype" name="type" data-c="ftype">${Object.entries(FIELD_TYPES).map(([k,v])=>`<option value="${k}" ${f.type===k?'selected':''}>${v}</option>`).join('')}</select>`)}
    ${fld('Help text',inp('hint',f.hint,{ph:'Optional'}))}
    <div class="full" id="fopts" ${f.type==='dropdown'||f.type==='multi'?'':'hidden'}><div class="field"><span>Options</span>${listEd('opt',f.options||[],{ph:'Option'})}</div></div>
    <label class="check full"><input type="checkbox" name="required" id="fm-freq" ${f.required?'checked':''}> Required</label>
  </div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save field</button>'});
}
function docTypeForm(ent,i){
  const t=i!=null&&i!==''?docTypes(ent)[+i]:{};
  openSheet({title:(t.name?'Edit':'Add')+' document type',form:'docTypeForm',body:`<input type="hidden" name="ent" value="${ent}"><input type="hidden" name="i" value="${i==null?'':i}"><div class="form">
    ${fld('Document name',inp('name',t.name,{req:true,ph:'e.g. Bank statement'}),{full:true})}
    <label class="check full"><input type="checkbox" name="period" id="fm-dper" ${t.period?'checked':''}> Ask for the period (financial year or month) when uploading</label>
    <label class="check full"><input type="checkbox" name="required" id="fm-dreq" ${t.required?'checked':''}> Required: flag records that don't have it</label></div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>'});
}
function blackForm(kind,value){
  const label=kind==='company'?(D.companies.get(value)||{}).name:kind==='person'?personName(value):'';
  openSheet({title:'Add to blacklist',form:'black',body:`<div class="form">
    ${label?`<input type="hidden" name="kind" value="${esc(kind)}"><input type="hidden" name="value" value="${esc(value)}"><div class="full"><b>${esc(label)}</b> <span class="muted">(${esc(BL_KINDS[kind])})</span></div>`
      :`${fld('What to blacklist',segI('kind',[{v:'phone',l:'Phone number'},{v:'gst',l:'GST number'},{v:'email',l:'Email'}],'phone'),{full:true})}${fld('Number or GST',inp('value','',{req:true}),{full:true})}`}
    ${fld('Reason',`<textarea id="fm-blr" name="reason" placeholder="e.g. Defaulted on chit instalments, 2024"></textarea>`,{full:true})}
  </div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn danger" type="submit">Blacklist</button>'});
}
function docUploadSheet(ent,id,type){
  const types=docTypes(ent);const t=types.find(x=>x.id===type);
  openSheet({title:'Upload '+(t?t.name.toLowerCase():'a document'),form:'docUpload',body:`<input type="hidden" name="ent" value="${ent}"><input type="hidden" name="id" value="${esc(id)}"><div class="form">
    ${t?`<input type="hidden" name="type" value="${esc(t.id)}">`:fld('Document type',selI('type',types.map(x=>({v:x.id,l:x.name})).concat([{v:'other',l:'Other'}]),'',null),{full:true})}
    ${fld('File',`<input type="file" id="fm-file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.csv,.doc,.docx">`,{full:true,hint:'PDF, image, Excel or Word, up to 4 MB.'})}
    ${(!t||t.period)?fld('Period',inp('period','',{ph:'e.g. FY 2025-26 or Mar 2026'})):''}
    ${fld('Note',inp('note','',{ph:'Optional'}))}
  </div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Upload</button>'});
}
async function uploadDoc(fd){
  const file=fd.get('file');if(!file||!file.size)return toast('Choose a file.');
  if(file.size>4*1024*1024)return toast('That file is over 4 MB. Compress it or split it, then try again.');
  const ent=fd.get('ent'),id=fd.get('id');
  const q=new URLSearchParams({entity:ent,entityId:id,docType:fd.get('type')||'other',name:file.name,mime:file.type||'application/octet-stream',period:fd.get('period')||'',note:fd.get('note')||'',by:S.me.owner||S.me.name||S.me.email});
  let r;try{r=await fetch(apiUrl('/api/files?'+q),{method:'POST',headers:Object.assign({'content-type':'application/octet-stream'},authHeaders()),body:file,credentials:'omit'})}catch(e){return toast('You are offline. Uploads need a connection.')}
  const j=await r.json().catch(()=>({}));if(!r.ok)return toast(j.error||'Upload failed.');
  D.docs.set(j.doc.id,j.doc);scheduleDerive();closeSheet();toast('Uploaded '+file.name);
}

/* ---- interaction form ---- */
function intForm(pid,o={}){
  openSheet({title:'Log interaction · '+personName(pid),form:'int',body:`<input type="hidden" name="personId" value="${esc(pid)}"><input type="hidden" name="leadId" value="${esc(o.lid||'')}"><div class="form">
    ${fld('Type',segI('type',INT_TYPES,o.type||'Call'),{full:true})}
    ${fld('Date',inp('date',todayISO(),{type:'date'}))}
    ${fld('Follow up on',inp('followUp','',{type:'date'}),{hint:'Shows in Today’s calls on that day.'})}
    ${fld('What was discussed',`<textarea id="fm-summary" name="summary" placeholder="Short notes, or tap Dictate and speak."></textarea>`,{full:true})}
    <div class="full row">${(window.SpeechRecognition||window.webkitSpeechRecognition)?`<button type="button" class="btn sm" data-a="mic">🎙 Dictate</button><select id="fm-lang" aria-label="Dictation language" style="border:1px solid var(--line);border-radius:6px;padding:5px;background:var(--surface)"><option value="en-IN">English</option><option value="te-IN">Telugu</option><option value="hi-IN">Hindi</option></select>`:'<span class="small muted">Tip: use your keyboard’s microphone to dictate.</span>'}</div>
  </div>`,foot:`<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>`});
}
async function saveIntForm(fd){
  const i={personId:fd.get('personId'),leadId:fd.get('leadId')||'',type:fd.get('type'),date:fd.get('date')||todayISO(),followUp:fd.get('followUp')||'',summary:String(fd.get('summary')||'').trim(),by:S.me.owner||''};
  await put('interactions',i);
  const x=P(i.personId);if(x&&(!x.p.lastContacted||x.p.lastContacted<i.date)){const p=clone(x.p);p.lastContacted=i.date;await put('people',p,{audit:false})}
  closeSheet();toast('Logged');
}

/* ---- segment form ---- */
function listForm(id){
  const l=id?clone(D.lists.get(id)):{name:'',rules:[{field:'industry',op:'is',value:''}]};
  S.ruleDraft={id,name:l.name,rules:l.rules||[]};
  sheetOnClose=()=>{S.ruleDraft=null};
  openSheet({title:id?'Edit segment':'New segment',form:'list',wide:true,body:listFormBody(),foot:`${id?`<button type="button" class="btn danger" data-a="delRec" data-type="lists" data-id="${id}" style="margin-right:auto">${ic('trash')}Delete</button>`:''}<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save segment</button>`});
}
function opsFor(t){return t==='num'?['>','>=','<','<=']:t==='text'?['contains','is']:t==='bool'?['is']:['is','is not']}
function listFormBody(){
  const d=S.ruleDraft;const n=evalRules(d.rules.filter(r=>r.value!==''||ruleFields()[r.field].type==='bool'));
  return `<div class="stack">${fld('Segment name',`<input id="fm-lname" name="name" value="${esc(d.name)}" required data-i="ruleName" placeholder="e.g. Pharma owners in Jubilee Hills without property">`)}
  <h3>Include people where ALL of these are true</h3>
  ${d.rules.map((r,i)=>{const f=ruleFields()[r.field];const ops=opsFor(f.type);
    const val=f.type==='enum'?`<select data-c="rule" data-i="${i}" data-k="value" aria-label="Value"><option value="">Choose…</option>${f.opts().map(o=>`<option ${o===r.value?'selected':''}>${esc(o)}</option>`).join('')}</select>`:f.type==='bool'?`<select data-c="rule" data-i="${i}" data-k="value" aria-label="Value"><option value="yes" ${r.value!=='no'?'selected':''}>yes</option><option value="no" ${r.value==='no'?'selected':''}>no</option></select>`:`<input data-c="rule" data-i="${i}" data-k="value" value="${esc(r.value)}" aria-label="Value" placeholder="${/value|emi/i.test(f.label)?'e.g. 10L':''}">`;
    return `<div class="rule"><select data-c="rule" data-i="${i}" data-k="field" aria-label="Field">${Object.entries(ruleFields()).map(([k,v])=>`<option value="${k}" ${k===r.field?'selected':''}>${esc(v.label)}</option>`).join('')}</select><select data-c="rule" data-i="${i}" data-k="op" aria-label="Condition">${ops.map(o=>`<option ${o===r.op?'selected':''}>${o}</option>`).join('')}</select>${val}<button type="button" class="iconbtn" data-a="ruleDel" data-i="${i}" aria-label="Remove rule">${ic('close')}</button></div>`}).join('')}
  <div><button type="button" class="btn sm" data-a="ruleAdd">${ic('plus')}Add condition</button></div>
  <div class="note"><b class="num" style="color:var(--ink)">${n.length.toLocaleString('en-IN')}</b> people match right now${n.length?': '+n.slice(0,6).map(x=>esc(x.p.name)).join(', ')+(n.length>6?'…':''):''}. The list refreshes itself as records change.</div></div>`;
}
const refreshRuleBody=()=>{const bd=$('#sheet-bd');if(bd&&S.ruleDraft){const a=document.activeElement&&document.activeElement.id;bd.innerHTML=listFormBody();if(a&&$('#'+a))$('#'+a).focus()}};

/* ---- campaign form ---- */
function campaignForm(id,listId,draft){
  const c=draft||(id?clone(D.campaigns.get(id)):{channel:'whatsapp',listId:listId||'',status:'Draft',language:'English',template:'Dear {{first_name}},\n\n'});
  const lists=[...D.lists.values()];
  if(!lists.length){toast('Create a segment first, then build a campaign for it.');return go('lists')}
  openSheet({title:id?'Edit campaign':'New campaign',form:'campaign',wide:true,body:`<input type="hidden" name="id" value="${esc(id||'')}"><div class="form">
    ${fld('Campaign name',inp('name',c.name,{req:true,ph:'e.g. Diwali greetings 2026'}),{full:true})}
    ${fld('Channel',segI('channel',[{v:'whatsapp',l:'WhatsApp'},{v:'email',l:'Email'}],c.channel,'campChannel'))}
    ${fld('Send from',`<select id="fm-sender" name="sender">${(c.channel==='email'?S.config.senders.email:S.config.senders.whatsapp).map(s=>`<option ${s===c.sender?'selected':''}>${esc(s)}</option>`).join('')}</select>`,{hint:'Bulk WhatsApp only from the official Business number.'})}
    ${fld('Audience (segment)',selI('listId',lists.map(l=>({v:l.id,l:l.name+' ('+evalRules(l.rules).length+')'})),c.listId,null))}
    ${fld('Schedule for',inp('schedule',c.schedule,{type:'date'}))}
    ${c.channel==='email'?fld('Email subject',inp('subject',c.subject,{ph:'e.g. An invitation for {{first_name}}'}),{full:true}):`${fld('Approved Meta template name',inp('waTemplate',c.waTemplate,{ph:'e.g. diwali_greeting_2026'}))}${fld('Language',selI('language',['English','Telugu','Hindi'],c.language,null))}`}
    ${fld('Message',`<textarea id="fm-template" name="template" rows="8">${esc(c.template||'')}</textarea>`,{full:true,hint:'Merge fields: {{first_name}} {{name}} {{company}} {{owner}} {{region}} {{industry}}. Telugu and Hindi text work as typed.'})}
    <div class="full row">${['first_name','name','company','owner'].map(k=>`<button type="button" class="btn sm" data-a="insMerge" data-v="{{${k}}}">+ ${k}</button>`).join('')}</div>
    ${c.channel==='whatsapp'?'<div class="full note">Only people with a recorded WhatsApp opt-in are included. People marked do-not-disturb or opted out are always left out.</div>':'<div class="full note">Only people with an email address and a recorded email opt-in are included. Add an unsubscribe line in your email tool.</div>'}
  </div>`,foot:`${id?`<button type="button" class="btn danger" data-a="delRec" data-type="campaigns" data-id="${id}" style="margin-right:auto">${ic('trash')}Delete</button>`:''}<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save campaign</button>`});
}
async function saveCampaignForm(fd){
  const id=fd.get('id');const c=id?clone(D.campaigns.get(id)):{results:{}};
  ['name','channel','sender','listId','schedule','subject','waTemplate','language','template'].forEach(k=>{if(fd.has(k))c[k]=String(fd.get(k)||'')});
  if(!c.name.trim())return toast('Name the campaign.');
  c.status=c.status==='Sent'?'Sent':(c.schedule?'Scheduled':'Draft');
  const s=await put('campaigns',c);closeSheet();toast('Campaign saved');go('campaign',s.id);
}

/* ---- references sheet ---- */

/* ---- merge ---- */
const MERGE_FIELDS=[['name','Name'],['ownerInCharge','Owner in charge'],['grade','Grade'],['region','Region'],['city','City'],['address','Address'],['dob','Birthday'],['anniversary','Anniversary'],['source','Source'],['introducedBy','Introduced by'],['pan','PAN / KYC']];
function mergeSheet(ids){
  const ps=ids.map(id=>D.people.get(id)).filter(Boolean);if(ps.length<2)return toast('Pick at least two records.');
  const rows=MERGE_FIELDS.map(([k,l])=>{const vals=ps.map(p=>p[k]||'');if(vals.every(v=>!v))return '';const first=vals.findIndex(v=>v);
    return `<tr><th>${l}</th>${ps.map((p,i)=>`<td>${vals[i]?`<label><input type="radio" name="f_${k}" value="${i}" ${i===first?'checked':''}> ${esc(k==='introducedBy'?personName(vals[i]):k==='dob'||k==='anniversary'?fmtDate(vals[i]):vals[i])}</label>`:'<span class="faint">—</span>'}</td>`).join('')}</tr>`}).join('');
  const counts=ps.map(p=>{const x=P(p.id);return `${x.chits.length} chits · ${x.re.length} property · ${x.leads.length} leads · ${x.ints.length} interactions`});
  openSheet({title:'Merge '+ps.length+' records',wide:true,form:'merge',body:`<input type="hidden" name="ids" value="${ids.join(',')}">
    <div class="small muted" style="margin-bottom:10px">Pick the value to keep for each field. Mobiles, emails, tags, companies, notes, holdings, leads and history from every record are combined, so nothing is lost.</div>
    <div class="tbl-wrap"><table class="tbl merge-tbl"><thead><tr><th></th>${ps.map((p,i)=>`<th><label><input type="radio" name="keep" value="${i}" ${i===0?'checked':''}> Keep this record</label></th>`).join('')}</tr></thead><tbody>${rows}
    <tr><th>Mobiles</th>${ps.map(p=>`<td class="num">${(p.mobiles||[]).map(esc).join('<br>')||'—'}</td>`).join('')}</tr>
    <tr><th>Emails</th>${ps.map(p=>`<td>${(p.emails||[]).map(esc).join('<br>')||'—'}</td>`).join('')}</tr>
    <tr><th>Companies</th>${ps.map(p=>`<td>${esc(P(p.id).coNames.join(', ')||'—')}</td>`).join('')}</tr>
    <tr><th>Linked</th>${counts.map(c=>`<td class="small muted">${c}</td>`).join('')}</tr>
    </tbody></table></div>`,foot:`<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">${ic('merge')}Merge</button>`});
}
async function doMerge(fd){
  const ids=String(fd.get('ids')).split(',');const ps=ids.map(id=>clone(D.people.get(id)));
  const keep=+fd.get('keep')||0;const main=ps[keep];const others=ps.filter((_,i)=>i!==keep);
  MERGE_FIELDS.forEach(([k])=>{const i=fd.get('f_'+k);if(i!=null)main[k]=ps[+i][k]||''});
  main.mobiles=uniq(ps.flatMap(p=>p.mobiles||[]).map(m=>m.trim())).filter((m,i,a)=>a.findIndex(z=>normPhone(z)===normPhone(m))===i);
  main.emails=uniq(ps.flatMap(p=>(p.emails||[]).map(normEmail)));
  main.tags=uniq(ps.flatMap(p=>p.tags||[]));
  const seen=new Set();main.companies=ps.flatMap(p=>p.companies||[]).filter(l=>!seen.has(l.companyId)&&seen.add(l.companyId));
  main.notes=uniq(ps.map(p=>p.notes)).join('\n\n');
  const L={};Object.entries(main.links||{}).forEach(([k,v])=>{if(v)L[k]=v});others.forEach(p=>Object.entries(p.links||{}).forEach(([k,v])=>{if(v&&!L[k])L[k]=v}));main.links=L;
  main.consent={whatsapp:ps.some(p=>p.consent&&p.consent.whatsapp),email:ps.some(p=>p.consent&&p.consent.email),how:uniq(ps.map(p=>p.consent&&p.consent.how)).join('; '),at:(ps.map(p=>p.consent&&p.consent.at).filter(Boolean).sort().pop()||'')};
  main.dnd=ps.some(p=>p.dnd);main.optedOut=ps.some(p=>p.optedOut);main.private=ps.some(p=>p.private);
  main.lastContacted=ps.map(p=>p.lastContacted).filter(Boolean).sort().pop()||'';
  if(main.introducedBy&&others.some(o=>o.id===main.introducedBy))main.introducedBy='';
  const oid=new Set(others.map(o=>o.id));
  const move=async(type,key)=>{const ch=[...D[type].values()].filter(r=>oid.has(r[key])).map(r=>Object.assign(clone(r),{[key]:main.id}));if(ch.length)await putMany(type,ch)};
  await put('people',main,{note:'merged '+others.length+' duplicate(s) into '+main.name});
  await move('chits','personId');await move('re','personId');await move('leads','personId');await move('leads','referrerId');await move('interactions','personId');await move('comments','personId');await move('people','introducedBy');
  const camps=[...D.campaigns.values()].filter(c=>Object.keys(c.results||{}).some(k=>oid.has(k)));
  for(const c of camps){const cc=clone(c);for(const k of Object.keys(cc.results)){if(oid.has(k)){if(!cc.results[main.id])cc.results[main.id]=cc.results[k];cc.results[k]=null}}await put('campaigns',cc,{audit:false})}
  await delMany('people',[...oid]);
  S.ui.sel.clear();closeSheet();toast('Merged into '+main.name);go('person',main.id);
}

/* ---- deletions ---- */
const confirmBox=(msg,act,attrs)=>openSheet({title:'Are you sure?',body:`<p>${msg}</p>`,foot:`<button type="button" class="btn" data-a="closeSheet">Cancel</button><button type="button" class="btn danger" data-a="${act}" ${attrs}>Delete</button>`});
async function deletePerson(id){
  const x=P(id);if(!x)return;
  for(const [t,arr] of [['chits',x.chits],['re',x.re],['leads',x.leads],['interactions',x.ints],['comments',[...D.comments.values()].filter(m=>m.personId===id)]])if(arr.length)await delMany(t,arr.map(r=>r.id));
  await del('people',id);
}

/* ============ import ============ */
function parseCSV(text){
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!=='\r')f+=c}
  if(f!==''||row.length){row.push(f);rows.push(row)}
  return rows.filter(r=>r.some(v=>String(v).trim()!==''));
}
function qpDecode(s){try{return decodeURIComponent(s.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,'%$1'))}catch(e){return s}}
function parseVCF(text){
  text=text.replace(/\r\n/g,'\n').replace(/=\n/g,'').replace(/\n[ \t]/g,'');
  const cards=text.split(/BEGIN:VCARD/i).slice(1);const out=[];let maxP=1,maxE=1;
  for(const card of cards){const r={fn:'',first:'',last:'',tel:[],email:[],org:'',title:'',bday:'',adr:'',note:'',url:'',cat:''};
    for(const line of card.split('\n')){const m=line.match(/^([^:]+):(.*)$/);if(!m)continue;
      const parts=m[1].split(';');const key=parts[0].toUpperCase().replace(/^ITEM\d+\./,'');let v=m[2];
      if(/ENCODING=QUOTED-PRINTABLE/i.test(m[1]))v=qpDecode(v);v=v.replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\n/gi,' ').trim();
      if(key==='FN')r.fn=v;else if(key==='N'){const n=v.split(';');r.last=n[0]||'';r.first=[n[1],n[2]].filter(Boolean).join(' ')}
      else if(key==='TEL'&&v)r.tel.push(v);else if(key==='EMAIL'&&v)r.email.push(v);else if(key==='ORG')r.org=v.split(';')[0];else if(key==='TITLE')r.title=v;
      else if(key==='BDAY')r.bday=v;else if(key==='ADR')r.adr=v.split(';').filter(Boolean).join(', ');else if(key==='NOTE')r.note=v;else if(key==='URL')r.url=v;else if(key==='CATEGORIES')r.cat=v}
    maxP=Math.max(maxP,r.tel.length);maxE=Math.max(maxE,r.email.length);out.push(r)}
  const headers=['Full name','First name','Last name',...Array.from({length:maxP},(_,i)=>'Phone '+(i+1)),...Array.from({length:maxE},(_,i)=>'Email '+(i+1)),'Organization','Title','Birthday','Address','Note','URL','Categories'];
  const rows=out.map(r=>[r.fn,r.first,r.last,...Array.from({length:maxP},(_,i)=>r.tel[i]||''),...Array.from({length:maxE},(_,i)=>r.email[i]||''),r.org,r.title,r.bday,r.adr,r.note,r.url,r.cat]);
  return {headers,rows};
}
function guessField(h,kind){
  const s=h.toLowerCase().trim();
  if(/(type|label)$/.test(s)&&!/labels/.test(s))return '';
  const common=[[/(^| )(e-?mail)/,'email'],[/phone|mobile|cell|whatsapp|contact ?(no|number)/,'mobile'],[/^(full ?name|name|display name|subscriber( name)?|customer( name)?|client( name)?)$/,'name'],[/first ?name|given/,'first'],[/middle/,'middle'],[/last ?name|surname|family name/,'last'],[/organi[sz]ation( name)?$|^organization$|company|firm|business name/,'company'],[/locality|region|area/,'region'],[/^city/,'city']];
  const byKind={
    companies:[[/group/,'group'],[/sub.?industry/,'subIndustry'],[/industry|sector/,'industry'],[/pin|postal|zip/,'pincode'],[/gst/,'gst'],[/owner/,'owners'],[/business/,'businesses'],[/website|url/,'website'],[/turnover/,'turnover'],[/employee/,'employees'],[/address/,'address'],[/note/,'notes'],[/^company|^name/,'name']],
    leads:[[/^company|organi/,'company'],[/business/,'business'],[/stage|status/,'stage'],[/owner/,'owner'],[/source/,'source'],[/value|amount/,'expectedValue'],[/follow.?up.*(what|action|note)|next action/,'nextAction'],[/follow.?up|next date/,'nextDate'],[/meeting/,'lastMeetingAt'],[/note/,'notes'],[/name|person|contact/,'person']],
    groups:[[/note/,'notes'],[/name|group/,'name']],
    contacts:[[/pin|postal|zip/,'pincode'],[/organi[sz]ation title|designation|^title$|job title|^role/,'role'],[/sub.?industry/,'subIndustry'],[/industry|sector/,'industry'],[/address/,'address'],[/birth|dob/,'dob'],[/anniversary/,'anniversary'],[/grade|category$/,'grade'],[/labels|group membership|tags?$|categories/,'tags'],[/note/,'notes'],[/introduc|referr/,'introducedBy'],[/linkedin/,'linkedin'],[/website|url/,'website'],[/\bpan\b|kyc/,'pan']],
    chits:[[/group|series/,'group'],[/ticket/,'ticketNo'],[/chit ?(value|amount)|^value|sum/,'chitValue'],[/instal|emi|subscription/,'emi'],[/tenure|duration|months/,'tenure'],[/start|commence/,'startDate'],[/end|maturity|termination/,'endDate'],[/prized/,'prized'],[/status/,'status'],[/branch/,'branch']],
    re:[[/project|venture|layout/,'project'],[/unit|plot|flat|villa/,'unit'],[/ticket|amount|price|value|consideration|size/,'ticketSize'],[/booking/,'bookingDate'],[/payment/,'paymentStage'],[/stage|status/,'stage']]
  };
  const fl=importFields(kind);
  const exact=fl.find(f=>f.l.toLowerCase()===s||f.l.toLowerCase().replace(/ \(.*\)$/,'')===s);if(exact)return exact.k;
  for(const [re,k] of (byKind[kind]||[]).concat(common))if(re.test(s)&&fl.some(f=>f.k===k))return k;
  return '';
}
function parseDate(v){
  if(v==null||v==='')return '';
  if(v instanceof Date&&!isNaN(v))return localISO(v);
  const s=String(v).trim();let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  if((m=s.match(/^--(\d{2})-?(\d{2})/)))return `1900-${m[1]}-${m[2]}`;
  if((m=s.match(/^(\d{4})(\d{2})(\d{2})$/)))return `${m[1]}-${m[2]}-${m[3]}`;
  if((m=s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})$/))){let y=+m[3];if(y<100)y+=y>40?1900:2000;return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}
  if(/^\d{5}(\.\d+)?$/.test(s)){const n=+s;if(n>10000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+n*864e5);return d.toISOString().slice(0,10)}}
  const d=new Date(s);return isNaN(d)?'':localISO(d);
}
const matchOpt=(v,list)=>{const s=String(v||'').trim().toLowerCase();if(!s)return '';return list.find(o=>o.toLowerCase()===s)||list.find(o=>o.toLowerCase().startsWith(s)||s.startsWith(o.toLowerCase().split(' ')[0]))||''};
async function impStart(fd){
  const file=fd.get('file');if(!file||!file.name)return toast('Choose a file.');
  const kind=fd.get('kind'),owner=fd.get('owner'),biz=fd.get('biz')||'';S.ui.impKind=kind;
  let headers=[],rows=[];
  try{
    if(/\.(vcf|vcard)$/i.test(file.name)){({headers,rows}=parseVCF(await file.text()))}
    else if(/\.(csv|txt)$/i.test(file.name)){const all=parseCSV((await file.text()).replace(/^﻿/,''));headers=all[0]||[];rows=all.slice(1)}
    else{if(!window.XLSX)return toast('The Excel reader did not load. Save the sheet as CSV and try again.');
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});const ws=wb.Sheets[wb.SheetNames[0]];
      const all=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''}).filter(r=>r.some(v=>String(v).trim()!==''));headers=(all[0]||[]).map(String);rows=all.slice(1)}
  }catch(e){console.error(e);return toast('Could not read that file. Try saving it as CSV.')}
  if(!rows.length)return toast('No rows found in that file.');
  const map={};headers.forEach((h,i)=>{map[i]=guessField(String(h),kind)});
  S.imp={kind,owner,biz,fileName:file.name,headers:headers.map(String),rows,map,dup:'merge',tag:''};render();
}
async function impRun(){
  const st=S.imp;if(!st||st.busy)return;
  if(ENT_FIELDS[st.kind]){
    const need={companies:'name',groups:'name',leads:null}[st.kind];
    if(need&&!Object.values(st.map).includes(need))return toast('Match a column to the name first.');
    if(st.kind==='leads'&&!Object.values(st.map).some(k=>['person','mobile','company'].includes(k)))return toast('Match a column to the person, mobile or company.');
    st.busy=true;render();try{await impRunEntities(st)}catch(e){console.error(e);st.result='The import stopped part-way: '+esc(e.message||'unknown error')}st.busy=false;render();return;
  }
  if(!Object.values(st.map).some(k=>k==='name'||k==='first'||k==='mobile'))return toast('Map at least a name or a mobile column.');
  st.busy=true;st.progress='preparing';render();
  try{
  const mobIdx=new Map(),emIdx=new Map(),nameIdx=new Map();
  for(const x of X.p.values()){x.mobiles.forEach(m=>mobIdx.set(m,x.p.id));(x.p.emails||[]).forEach(e=>emIdx.set(normEmail(e),x.p.id))}
  const coIdx=new Map([...D.companies.values()].map(c=>[normName(c.name),c]));
  const ppl=new Map(),cos=new Map(),chits=new Map(),res=new Map();let created=0,merged=0,skipped=0,coNew=0,recs=0;const intro=[];
  const src={contacts:st.owner?'Phone contacts import':'',chits:'Chit subscriber master',re:'Real estate list'}[st.kind];
  const gradeMap={a:'Platinum',b:'Gold',c:'Silver',platinum:'Platinum',gold:'Gold',silver:'Silver'};
  const indNames=industryNames();
  for(const row of st.rows){
    const o={mobile:[],email:[],tags:[]};
    st.headers.forEach((h,i)=>{const k=st.map[i];if(!k)return;let v=row[i];if(v==null||v==='')return;
      if(k==='mobile')String(v).split(/:::|[,;\/]/).forEach(z=>{z=z.trim();if(z.replace(/\D/g,'').length>=6)o.mobile.push(z)});
      else if(k==='email')String(v).split(/:::|[,;]/).forEach(z=>{z=z.trim();if(z.includes('@'))o.email.push(z)});
      else if(k==='tags')String(v).split(/:::|[,;]/).forEach(z=>{z=z.replace(/\*?\s*myContacts|\* starred/gi,'').trim();if(z)o.tags.push(z)});
      else if(o[k]==null||o[k]==='')o[k]=v instanceof Date?v:String(v).trim()});
    let name=o.name||[o.first,o.middle,o.last].filter(Boolean).join(' ').trim();
    if(!name&&o.company&&st.kind==='contacts'&&!o.mobile.length){skipped++;continue}
    if(!name)name=o.mobile[0]||o.email[0]||'';
    if(!name){skipped++;continue}
    const nm=o.mobile.map(normPhone).filter(Boolean),ne=o.email.map(normEmail);
    let exId=nm.map(m=>mobIdx.get(m)).find(Boolean)||ne.map(e=>emIdx.get(e)).find(Boolean);
    if(exId&&st.dup==='skip'){skipped++;continue}
    if(st.dup==='create')exId=null;
    let p;
    if(exId){p=ppl.get(exId)||clone(D.people.get(exId));merged++}
    else{p={id:newId(),name,mobiles:[],emails:[],tags:[],companies:[],source:src,sourceOwner:st.owner||'',ownerInCharge:st.owner||'',consent:{},createdAt:nowISO(),createdBy:S.me.id||''};created++}
    p.mobiles=p.mobiles||[];p.emails=p.emails||[];p.tags=p.tags||[];p.companies=p.companies||[];
    o.mobile.forEach(m=>{if(!p.mobiles.some(z=>normPhone(z)===normPhone(m)))p.mobiles.push(m)});
    o.email.forEach(e=>{if(!p.emails.map(normEmail).includes(normEmail(e)))p.emails.push(e)});
    p.tags=uniq(p.tags.concat(o.tags,st.tag?[st.tag]:[]));
    if(st.biz)p.businesses=uniq((p.businesses||[]).concat(st.biz));
    const fill=(k,v)=>{if(v&&!p[k])p[k]=v};
    fill('city',o.city);fill('pincode',o.pincode);fill('address',o.address);
    {const cfk=Object.keys(o).filter(k=>k.startsWith('cf_'));if(cfk.length){p.cf=p.cf||{};customFields('people').forEach(f=>{const v=o['cf_'+f.key];if(v==null||v==='')return;p.cf[f.key]=f.type==='multi'?splitList(v):f.type==='number'?num(v):f.type==='checkbox'?/^(y|yes|true|1)$/i.test(v):f.type==='date'?parseDate(v):String(v)})}}fill('pan',o.pan);fill('dob',parseDate(o.dob));fill('anniversary',parseDate(o.anniversary));
    if(o.region){const r=matchOpt(o.region,S.config.regions);if(r)fill('region',r);else fill('city',o.region)}
    if(o.grade)fill('grade',gradeMap[String(o.grade).toLowerCase()]||'');
    if(o.notes&&!(p.notes||'').includes(o.notes))p.notes=[p.notes,o.notes].filter(Boolean).join('\n');
    if(o.linkedin||o.website){p.links=p.links||{};if(o.linkedin&&!p.links.linkedin)p.links.linkedin=o.linkedin;if(o.website&&!p.links.website)p.links.website=o.website}
    const ind=matchOpt(o.industry,indNames);
    if(o.company){const k=normName(o.company);let co=cos.get(k)||coIdx.get(k);
      if(!co){co={id:newId(),name:o.company,industry:ind,subIndustry:o.subIndustry||'',region:p.region||'',links:{},createdAt:nowISO()};coNew++}
      else co=cos.get(k)||clone(co);
      if(ind&&!co.industry)co.industry=ind;if(!co.region&&p.region)co.region=p.region;if(st.biz)co.businesses=uniq((co.businesses||[]).concat(st.biz));
      cos.set(k,co);coIdx.set(k,co);
      if(!p.companies.some(l=>l.companyId===co.id))p.companies.push({companyId:co.id,role:matchOpt(o.role,coRoles())||(o.role?'Other':'')});}
    else if(ind)fill('industry',ind);
    if(o.introducedBy)intro.push([p.id,o.introducedBy]);
    if(st.kind==='chits'&&(o.group||o.chitValue)){const ex=[...D.chits.values(),...chits.values()].find(c=>c.personId===p.id&&String(c.group)===String(o.group||'')&&String(c.ticketNo||'')===String(o.ticketNo||''));
      const c=ex?clone(ex):{id:newId(),personId:p.id};c.group=String(o.group||c.group||'');c.ticketNo=String(o.ticketNo||c.ticketNo||'');c.chitValue=num(o.chitValue)||c.chitValue||0;c.emi=num(o.emi)||c.emi||0;c.tenure=parseInt(o.tenure)||c.tenure||'';
      c.startDate=parseDate(o.startDate)||c.startDate||'';c.endDate=parseDate(o.endDate)||c.endDate||(c.startDate&&c.tenure?addDays(c.startDate,Math.round(c.tenure*30.44)):'');
      c.prized=/^p|yes|y$/i.test(String(o.prized||''))&&!/un/i.test(String(o.prized||''))?'Prized':(c.prized||'Unprized');c.status=matchOpt(o.status,CHIT_STATUS)||c.status||'Active';c.branch=o.branch||c.branch||'';chits.set(c.id,c);recs++}
    if(st.kind==='re'&&(o.project||o.unit)){const ex=[...D.re.values(),...res.values()].find(r=>r.personId===p.id&&String(r.project)===String(o.project||'')&&String(r.unit||'')===String(o.unit||''));
      const r=ex?clone(ex):{id:newId(),personId:p.id};r.project=String(o.project||r.project||'');r.unit=String(o.unit||r.unit||'');r.ticketSize=num(o.ticketSize)||r.ticketSize||0;r.bookingDate=parseDate(o.bookingDate)||r.bookingDate||'';r.stage=matchOpt(o.stage,RE_STAGES)||r.stage||'Booked';r.paymentStage=o.paymentStage||r.paymentStage||'';res.set(r.id,r);recs++}
    ppl.set(p.id,p);nm.forEach(m=>mobIdx.set(m,p.id));ne.forEach(e=>emIdx.set(e,p.id));
  }
  if(intro.length){for(const x of X.p.values())nameIdx.set(normName(x.p.name),(nameIdx.get(normName(x.p.name))||[]).concat(x.p.id));for(const p of ppl.values()){const k=normName(p.name);const a=nameIdx.get(k)||[];if(!a.includes(p.id))nameIdx.set(k,a.concat(p.id))}
    intro.forEach(([pid,n])=>{const a=nameIdx.get(normName(n))||[];if(a.length===1&&a[0]!==pid){const p=ppl.get(pid);if(p&&!p.introducedBy)p.introducedBy=a[0]}})}
  const inote='import '+st.fileName;
  st.progress='companies';render();if(cos.size)await putMany('companies',[...cos.values()],inote);
  st.progress='people';render();await putMany('people',[...ppl.values()],inote);
  if(chits.size){st.progress='chits';render();await putMany('chits',[...chits.values()],inote)}
  if(res.size){st.progress='property';render();await putMany('re',[...res.values()],inote)}
  audit('import',st.kind,'',`${st.fileName}: ${created} new, ${merged} merged, ${skipped} skipped`);
  if(Q.size)st.result='';
  st.result=`<b>Done.</b> ${created.toLocaleString('en-IN')} new people, ${merged.toLocaleString('en-IN')} matched and merged, ${skipped.toLocaleString('en-IN')} skipped, ${coNew} new companies${recs?', '+recs+' '+(st.kind==='chits'?'chit':'property')+' records':''}. Check <a href="#" data-a="go" data-v="health">Data health</a> for any remaining duplicates.`;
  toast('Import complete');
  }catch(e){console.error(e);st.result='The import stopped part-way: '+esc(e.message||e.code||'unknown error')+'. Records already saved are kept; running it again will merge rather than duplicate.'}
  st.busy=false;render();
}

/* ============ export ============ */
const csvCell=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const toCSV=rows=>'﻿'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
async function saveFile(filename,data,what){
  try{
    const blob=data instanceof Blob?data:new Blob([data],{type:/\.csv$/.test(filename)?'text/csv;charset=utf-8':/\.json$/.test(filename)?'application/json':'application/octet-stream'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
    audit('export',what,'',filename);toast('Downloaded '+filename);return true;
  }catch(e){console.error(e);toast('Could not create the file.');return false}
}
async function backup(){
  if(!R().exp)return;
  const out={exportedAt:nowISO(),config:S.config};Object.keys(D).forEach(k=>out[k]=[...D[k].values()]);
  await saveFile(fileStem()+'-backup-'+todayISO()+'.json',JSON.stringify(out,null,1),'full backup');
}
async function campExport(id){
  const c=D.campaigns.get(id);const {ok}=campAudience(c);
  const rows=c.channel==='email'?[['Name','Email','Subject','Message']].concat(ok.map(x=>[x.p.name,x.p.emails[0],renderTemplate(c.subject,x),renderTemplate(c.template,x)])):
    [['Name','Phone (E.164)','Template','Language','first_name','company','Message preview']].concat(ok.map(x=>[x.p.name,'+'+waNumber(x.p.mobiles[0]),c.waTemplate||'',c.language||'',firstName(x.p.name),(x.cos[0]&&x.cos[0].co.name)||'',renderTemplate(c.template,x)]));
  await saveFile(c.name.replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').toLowerCase()+'-send-file.csv',toCSV(rows),'campaign send file');
}

/* ============ Excel ============ */
const KIND_LABEL={contacts:'Contacts (people & companies)',companies:'Companies',leads:'Leads',groups:'Groups',chits:'Chit subscriber master',re:'Real estate customer list'};
const ENT_FIELDS={
  companies:[['name','Company name'],['group','Group'],['industry','Industry'],['subIndustry','Sub-industry'],['region','Region / locality'],['city','City'],['pincode','Pincode'],['owners','Owners (comma separated)'],['businesses','My businesses (comma separated)'],['gst','GST number'],['phones','Phone'],['email','Email'],['website','Website'],['turnover','Turnover'],['employees','Employees'],['address','Address'],['notes','Notes']],
  leads:[['person','Person name'],['mobile','Mobile'],['company','Company'],['business','Business'],['stage','Stage'],['owner','Owner'],['source','Source'],['expectedValue','Expected value'],['nextDate','Follow-up date'],['nextAction','Follow-up: what to do'],['lastMeetingAt','Last meeting'],['notes','Notes']],
  groups:[['name','Group name'],['notes','Notes']]
};
const CF_ENT={companies:'companies',leads:'leads',groups:'groups',contacts:'people'};
function importFields(kind){
  const base=ENT_FIELDS[kind]?ENT_FIELDS[kind].map(([k,l])=>({k,l})):IMPORT_FIELDS[kind];
  const ent=CF_ENT[kind];const cfs=ent?customFields(ent).map(f=>({k:'cf_'+f.key,l:f.label})):[];
  const extra=kind==='contacts'?[{k:'pincode',l:'Pincode'}]:[];
  return base.concat(extra,cfs);
}
function xlsxDownload(filename,rows,what,sheet){
  if(!window.XLSX){return saveFile(filename.replace(/\.xlsx$/,'.csv'),toCSV(rows),what)}
  try{const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(rows);
    ws['!cols']=(rows[0]||[]).map((h,i)=>({wch:Math.min(40,Math.max(10,...rows.slice(0,200).map(r=>String(r[i]==null?'':r[i]).length+2)))}));
    XLSX.utils.book_append_sheet(wb,ws,(sheet||'Sheet1').slice(0,31));XLSX.writeFile(wb,filename);audit('export',what,'',filename);toast('Downloaded '+filename);
  }catch(e){console.error(e);toast('Could not create the Excel file.')}
}
const cfCell=(f,v)=>Array.isArray(v)?v.join(', '):v===true?'Yes':v===false?'':(v==null?'':v);
async function exportPeople(){
  if(!R().exp)return toast('Your role cannot export.');
  const list=S.route.v==='people'?filteredPeople():visPeople();const cfs=customFields('people');
  const rows=[['Name','Mobiles','Emails','Companies','Roles','Industries','Regions','City','Pincode','Grade','Owner in charge','Businesses','Holding','Chit value (highest)','Active EMI','Property held','Tags','Source','Introduced by','Birthday','Anniversary','Last contacted','WhatsApp opt-in','Email opt-in','DND','Opted out','Blacklisted',...cfs.map(f=>f.label)]];
  list.forEach(x=>{const p=x.p;rows.push([p.name,(p.mobiles||[]).join(', '),(p.emails||[]).join(', '),x.coNames.join(', '),x.cos.map(c=>c.role).join(', '),x.industries.join(', '),x.regions.join(', '),p.city,p.pincode,p.grade,p.ownerInCharge,[...x.biz].map(bizName).join(', '),x.holding,x.chitMax||'',x.emi||'',x.reTotal||'',(p.tags||[]).join(', '),p.source,personName(p.introducedBy),p.dob,p.anniversary,x.lastContacted,p.consent&&p.consent.whatsapp?'Yes':'',p.consent&&p.consent.email?'Yes':'',p.dnd?'Yes':'',p.optedOut?'Yes':'',x.black?'Yes':'',...cfs.map(f=>cfCell(f,(p.cf||{})[f.key]))])});
  xlsxDownload(fileStem()+'-people-'+todayISO()+'.xlsx',rows,'people ('+list.length+')','People');
}
async function exportCompanies(){
  if(!R().exp)return toast('Your role cannot export.');
  const list=S.route.v==='companies'?filteredCompanies():[...X.co.values()];const cfs=customFields('companies');
  const rows=[ENT_FIELDS.companies.map(f=>f[1]).concat(['People','Open leads','Blacklisted'],cfs.map(f=>f.label))];
  list.forEach(c=>{const co=c.c;rows.push([co.name,groupName(co.groupId),co.industry,co.subIndustry,co.region,co.city,co.pincode,(co.owners||[]).join(', '),[...c.biz].map(bizName).join(', '),co.gst,(co.phones||[]).join(', '),co.email,co.website,co.turnover,co.employees,co.address,co.notes,c.people.length,c.leads.filter(openLead).length,c.black?'Yes':'',...cfs.map(f=>cfCell(f,(co.cf||{})[f.key]))])});
  xlsxDownload(fileStem()+'-companies-'+todayISO()+'.xlsx',rows,'companies ('+list.length+')','Companies');
}
function leadRowsXlsx(list){
  const cfs=customFields('leads');
  const rows=[ENT_FIELDS.leads.map(f=>f[1]).concat(['Last update','Status','Created',...cfs.map(f=>f.label)])];
  list.forEach(l=>{const x=l.personId&&P(l.personId);const co=l.companyId&&D.companies.get(l.companyId);rows.push([x?x.p.name:'',x?(x.p.mobiles||[]).join(', '):'',co?co.name:'',bizName(leadBiz(l)),stageOf(l).name,l.owner,l.source,leadVal(l)||'',l.nextDate,l.nextAction,l.lastMeetingAt?fmtDT(l.lastMeetingAt):'',l.notes,fmtDate(leadLastUpdate(l)),openLead(l)?'Open':isWon(l)?'Won':'Lost',fmtDate(l.createdAt),...cfs.map(f=>cfCell(f,(l.cf||{})[f.key]))])});
  return rows;
}
async function exportLeads(){if(!R().exp)return toast('Your role cannot export.');const list=filteredLeads();xlsxDownload(fileStem()+'-leads-'+todayISO()+'.xlsx',leadRowsXlsx(list),'leads ('+list.length+')','Leads')}
async function exportFollowups(){if(!R().exp)return toast('Your role cannot export.');const list=followupLeads();xlsxDownload(fileStem()+'-follow-ups-'+todayISO()+'.xlsx',leadRowsXlsx(list),'follow-ups ('+list.length+')','Follow-ups')}
async function exportGroups(){
  if(!R().exp)return toast('Your role cannot export.');const cfs=customFields('groups');
  const rows=[['Group name','Notes','Companies','People',...cfs.map(f=>f.label)]];
  [...X.g.values()].forEach(g=>{const ppl=new Set();g.cos.forEach(c=>c.people.forEach(o=>ppl.add(o.p.id)));rows.push([g.g.name,g.g.notes,g.cos.map(c=>c.c.name).join(', '),ppl.size,...cfs.map(f=>cfCell(f,(g.g.cf||{})[f.key]))])});
  xlsxDownload(fileStem()+'-groups-'+todayISO()+'.xlsx',rows,'groups ('+(rows.length-1)+')','Groups');
}
function templateXlsx(kind){
  const fields=importFields(kind).filter(f=>!['first','middle','last'].includes(f.k));
  const ex={companies:{name:'Radha Smelters Pvt Ltd',group:'Radha group',industry:'Manufacturing',region:'Jubilee Hills',pincode:'500033',owners:'Nitin',businesses:bizName('chit')},leads:{person:'Example Name',mobile:'98480 12345',company:'Example Pvt Ltd',business:bizName(businesses()[0].id),stage:stagesFor(businesses()[0].id)[0].name,owner:S.config.owners[0],nextDate:addDays(todayISO(),7)},groups:{name:'Example family group'},contacts:{name:'Example Name',mobile:'98480 12345',company:'Example Pvt Ltd',industry:'Pharma & Life Sciences',region:'Jubilee Hills'}}[kind]||{};
  xlsxDownload(fileStem()+'-'+kind+'-template.xlsx',[fields.map(f=>f.l),fields.map(f=>ex[f.k]||'')],'template '+kind,KIND_LABEL[kind]||kind);
}
function excelSheet(kind){
  const lab={people:'people',companies:'companies',leads:'leads',groups:'groups'}[kind];const imp=kind==='people'?'contacts':kind;
  openSheet({title:'Excel · '+lab,body:`<div class="list">
    ${R().exp?`<div class="li" data-a="xlsxExport" data-k="${kind}">${ic('download')}<div class="main-t"><div class="t">Download ${lab} to Excel</div><div class="s">${kind==='groups'?'All groups':'Everything matching the current filters'}, including your own fields</div></div></div>`:''}
    ${canWrite()?`<div class="li" data-a="xlsxImport" data-k="${imp}">${ic('import')}<div class="main-t"><div class="t">Upload ${lab} from Excel</div><div class="s">Add new ${lab} and update existing ones; you match the columns before anything is saved</div></div></div>
    <div class="li" data-a="xlsxTemplate" data-k="${imp}">${ic('log')}<div class="main-t"><div class="t">Download a blank template</div><div class="s">The right column headings, ready to fill in</div></div></div>`:''}</div>`});
}
// companies, leads and groups from Excel
async function impRunEntities(st){
  const get=(row,k)=>{const vals=[];st.headers.forEach((h,i)=>{if(st.map[i]===k&&row[i]!=null&&String(row[i]).trim()!=='')vals.push(row[i] instanceof Date?localISO(row[i]):String(row[i]).trim())});return vals.join(', ')};
  const cfOf=(ent,row,old)=>{const cf=Object.assign({},old||{});customFields(ent).forEach(f=>{const v=get(row,'cf_'+f.key);if(v==='')return;cf[f.key]=f.type==='multi'?splitList(v):f.type==='number'?num(v):f.type==='checkbox'?/^(y|yes|true|1)$/i.test(v):f.type==='date'?parseDate(v):v});return cf};
  const bizByName=n=>{const s=String(n||'').trim().toLowerCase();return (businesses().find(b=>b.name.toLowerCase()===s||b.id===s)||businesses().find(b=>s&&b.name.toLowerCase().includes(s))||{}).id||''};
  let created=0,updated=0,skipped=0;const coIdx=new Map([...D.companies.values()].map(c=>[normName(c.name),c]));
  const grpIdx=new Map([...D.groups.values()].map(g=>[normName(g.name),g]));
  const groups=new Map(),cos=new Map(),ppl=new Map(),leads=[];
  const groupFor=name=>{const k=normName(name);if(!k)return '';let g=groups.get(k)||grpIdx.get(k);if(!g){g={id:newId(),name:String(name).trim()};created+=st.kind==='groups'?0:0}groups.set(k,g);grpIdx.set(k,g);return g.id};
  const companyFor=name=>{const k=normName(name);if(!k)return null;let c=cos.get(k)||coIdx.get(k);if(!c){c={id:newId(),name:String(name).trim(),owners:[],businesses:[]};}else c=cos.get(k)||clone(c);cos.set(k,c);coIdx.set(k,c);return c};
  for(const row of st.rows){
    if(st.kind==='groups'){const name=get(row,'name');if(!name){skipped++;continue}const k=normName(name);const ex=groups.get(k)||grpIdx.get(k);const g=ex?clone(ex):{id:newId(),name};ex?updated++:created++;const n=get(row,'notes');if(n)g.notes=n;g.cf=cfOf('groups',row,g.cf);groups.set(k,g);grpIdx.set(k,g);continue}
    if(st.kind==='companies'){const name=get(row,'name');if(!name){skipped++;continue}const existed=coIdx.has(normName(name));const c=companyFor(name);existed?updated++:created++;
      ['industry','subIndustry','city','pincode','email','website','address','notes'].forEach(k=>{const v=get(row,k);if(v)c[k]=v});
      const ind=get(row,'industry');if(ind)c.industry=matchOpt(ind,industryNames())||ind;const reg=get(row,'region');if(reg)c.region=matchOpt(reg,S.config.regions)||reg;
      const gst=get(row,'gst');if(gst)c.gst=gst.toUpperCase();const ph=get(row,'phones');if(ph)c.phones=uniq((c.phones||[]).concat(splitList(ph)));
      const t=get(row,'turnover');if(t)c.turnover=matchOpt(t,turnovers())||t;const e=get(row,'employees');if(e)c.employees=matchOpt(e,empBands())||e;
      const ow=get(row,'owners');if(ow)c.owners=uniq((c.owners||[]).concat(splitList(ow).map(o=>matchOpt(o,S.config.owners)||o)));
      const bz=get(row,'businesses');c.businesses=uniq((c.businesses||[]).concat(splitList(bz).map(bizByName).filter(Boolean),st.biz?[st.biz]:[]));
      const g=get(row,'group');if(g)c.groupId=groupFor(g);c.cf=cfOf('companies',row,c.cf);continue}
    if(st.kind==='leads'){const pname=get(row,'person'),mob=get(row,'mobile'),cname=get(row,'company');if(!pname&&!cname&&!mob){skipped++;continue}
      const c=cname?companyFor(cname):null;let pid='';
      if(mob){const m=normPhone(mob.split(',')[0]);const hit=[...X.p.values()].find(x=>x.mobiles.includes(m))||[...ppl.values()].find(p=>(p.mobiles||[]).some(z=>normPhone(z)===m));if(hit)pid=hit.p?hit.p.id:hit.id}
      if(!pid&&pname){const hit=[...X.p.values()].filter(x=>normName(x.p.name)===normName(pname));if(hit.length===1)pid=hit[0].p.id}
      const bid=bizByName(get(row,'business'))||st.biz||allowedBiz()[0].id;
      if(!pid&&pname){const p={id:newId(),name:pname,mobiles:mob?splitList(mob):[],emails:[],tags:[],businesses:[bid],companies:c?[{companyId:c.id,role:''}]:[],ownerInCharge:get(row,'owner')||S.me.owner||'',source:get(row,'source')||''};ppl.set(p.id,p);pid=p.id}
      if(c&&!(c.businesses||[]).includes(bid))c.businesses=(c.businesses||[]).concat(bid);
      const sts=stagesFor(bid);const sv=get(row,'stage').toLowerCase();const stg=sts.find(x=>x.name.toLowerCase()===sv)||sts.find(x=>sv&&x.name.toLowerCase().startsWith(sv))||sts[0];
      const lm=get(row,'lastMeetingAt');const l={id:newId(),personId:pid,companyId:c?c.id:'',business:bid,stage:stg.id,reached:stg.kind==='lost'?0:sts.indexOf(stg),owner:matchOpt(get(row,'owner'),S.config.owners)||get(row,'owner')||S.me.owner||'',source:matchOpt(get(row,'source'),S.config.sources)||get(row,'source'),expectedValue:num(get(row,'expectedValue')),nextDate:parseDate(get(row,'nextDate')),nextAction:get(row,'nextAction'),lastMeetingAt:lm?(parseDate(lm)?new Date(parseDate(lm)+'T10:00:00').toISOString():''):'',notes:get(row,'notes'),cf:cfOf('leads',row,{})};
      if(stg.kind!=='open')l.closedAt=todayISO();leads.push(l);created++;continue}
  }
  const note='Excel import '+st.fileName;
  if(groups.size){st.progress='groups';render();await putMany('groups',[...groups.values()],note)}
  if(cos.size){st.progress='companies';render();await putMany('companies',[...cos.values()],note)}
  if(ppl.size){st.progress='people';render();await putMany('people',[...ppl.values()],note)}
  if(leads.length){st.progress='leads';render();leads.forEach(l=>{const x=P(l.personId);l._title=x?x.p.name:''});await putMany('leads',leads,note)}
  const what={companies:'companies',leads:'leads',groups:'groups'}[st.kind];
  st.result=`<b>Done.</b> ${created} new ${what}${updated?`, ${updated} existing ${what} updated`:''}${skipped?`, ${skipped} empty rows skipped`:''}${st.kind==='leads'&&ppl.size?`, ${ppl.size} new people`:''}${st.kind!=='companies'&&cos.size&&st.kind!=='groups'?`, ${cos.size} companies created or updated`:''}.`;
  toast('Import complete');
}

/* ============ sample data ============ */
async function loadSample(){
  if([...D.people.values()].some(p=>(p.tags||[]).includes('Sample')))return toast('Sample data is already loaded.');
  toast('Loading sample data…');
  const R0=(a,i)=>a[i%a.length];
  const owners=S.config.owners;
  const coDefs=[['Sri Venkateshwara Pharma','Pharma & Life Sciences','API / Bulk drugs','Jubilee Hills','SV Group'],['Deccan Formulations','Pharma & Life Sciences','Formulations','Banjara Hills','SV Group'],['Krishna Constructions','Real Estate & Construction','Developer','Kokapet',''],['Golconda Textiles','Textiles & Apparel','','Abids',''],['Nizam Jewellers','Jewellery & Bullion','','Punjagutta',''],['Cyber Pearl Tech','IT & ITES','Software services','HITEC City',''],['Hussain Sagar Hotels','Hospitality & Restaurants','Hotels','Begumpet',''],['Charminar Agro Mills','Agriculture & Agri-business','Rice mills','Other Telangana',''],['Banjara Diagnostics','Healthcare & Hospitals','Diagnostics','Banjara Hills',''],['Telangana Polymers','Manufacturing','Plastics & Packaging','Kukatpally',''],['Ameerpet Motors','Automobile & Dealerships','','Ameerpet',''],['Lakshmi Distributors','Trading & Distribution','FMCG distribution','Secunderabad',''],['Raghava & Co, Chartered Accountants','Professional Services','Chartered Accountants','Himayatnagar',''],['Gachibowli Life Sciences','Pharma & Life Sciences','CRO / CDMO','Gachibowli',''],['Sainik Educational Society','Education','Schools','Sainikpuri','']];
  const grpDefs={'SV Group':{id:newId(),name:'SV Group (sample)',sample:true},'Krishna':{id:newId(),name:'Krishna family (sample)',sample:true}};
  coDefs[2][4]='Krishna';coDefs[13][4]='SV Group';coDefs[9][4]='Krishna';
  const bizIds=businesses().map(b=>b.id);
  const cos=coDefs.map(([name,industry,subIndustry,region,group],k)=>({id:newId(),name,industry,subIndustry,region,groupId:group?grpDefs[group].id:'',owners:[S.config.owners[k%S.config.owners.length],...(k%4===0&&S.config.owners[1]?[S.config.owners[(k+1)%S.config.owners.length]]:[])],businesses:[bizIds[k%bizIds.length]],gst:'36AAB'+String(1000+k*37).slice(0,4)+'C1Z'+k%10,phones:[],sample:true,notes:'Sample record',links:{}}));
  const firsts=['Ravi','Srinivas','Anil','Prakash','Venkat','Suresh','Ramesh','Madhavi','Lakshmi','Kiran','Arjun','Naveen','Sridhar','Padma','Harish','Rajesh','Sunitha','Vamsi','Mahesh','Kavitha','Gopal','Sanjay','Deepak','Anjali','Imran','Farhan','Vikram','Rohit','Neha','Sai'];
  const lasts=['Reddy','Rao','Agarwal','Jain','Naidu','Chowdary','Varma','Goud','Sharma','Mehta','Gupta','Khan','Patel','Kapoor','Murthy'];
  const t=todayISO();const ppl=[];
  for(let i=0;i<40;i++){
    const co=cos[i%cos.length];const nm=R0(firsts,i)+' '+R0(lasts,i*7+3+Math.floor(i/30));
    const mob='9'+String(800000000+((i*7919)%99999999)).padStart(9,'0');
    const dob=`19${60+(i%30)}-${String(1+(i%12)).padStart(2,'0')}-${String(1+((i*3)%28)).padStart(2,'0')}`;
    const p={id:newId(),name:nm,mobiles:[mob],emails:i%3?[nm.toLowerCase().replace(' ','.')+'@example.com']:[],companies:[{companyId:co.id,role:R0(['Owner','Director','Partner','CFO','Owner'],i)}],region:co.region,city:'Hyderabad',ownerInCharge:R0(owners,i),grade:R0(['Platinum','Gold','Silver','Gold','',''],i),source:R0(['Family network','Existing customer referral','Phone contacts import','Chit subscriber master'],i),sourceOwner:R0(owners,i),tags:['Sample'],dob:i%4===0?addDays(t,i%7).replace(/^\d{4}/,dob.slice(0,4)):dob,consent:{whatsapp:i%5!==0,email:i%3===1,how:'Sample',at:t},lastContacted:addDays(t,-((i*13)%240)),notes:'Sample record — remove from Settings'};
    if(i>4&&i%3===0)p.introducedBy=ppl[i%5].id;
    if(i===12)p.mobiles=[ppl[3].mobiles[0]];
    ppl.push(p);
  }
  const chits=[],res=[],leads=[],ints=[];
  ppl.forEach((p,i)=>{
    if(i%5!==4){const v=R0([500000,1000000,2500000,5000000,1000000,2000000,10000000],i);const ten=R0([25,30,40,50],i);const st=addDays(t,-((i*37)%900));
      chits.push({id:newId(),personId:p.id,group:'NE-'+(20+i%9)+R0(['A','B','C'],i),ticketNo:String(1+i%25),chitValue:v,emi:Math.round(v/ten),tenure:ten,startDate:st,endDate:i%6===0?addDays(t,5+i):addDays(st,Math.round(ten*30.44)),prized:i%3===0?'Prized':'Unprized',status:'Active',branch:R0(['Abids','Kukatpally','Dilsukhnagar'],i)})}
    if(i%6===1)res.push({id:newId(),personId:p.id,project:R0(['NorthEast Meadows, Kokapet','NorthEast Greens, Shamshabad'],i),unit:'Plot '+(100+i),ticketSize:R0([8500000,12000000,24000000],i),bookingDate:addDays(t,-i*20),stage:R0(['Booked','Registered'],i),paymentStage:R0(['40% paid','Fully paid'],i)});
    if(i%3===0){const line=i%2?'chit':'re';const stg=stagesFor(line);const si=i%5;leads.push({id:newId(),personId:p.id,companyId:p.companies[0].companyId,business:line,stage:stg[si].id,reached:stg[si].kind==='lost'?0:si,createdAt:addDays(t,-((i*17)%150))+'T10:00:00.000Z',source:R0(S.config.sources,i),expectedValue:line==='re'?12000000:2500000,owner:p.ownerInCharge,nextAction:R0(['Call back','Site visit','Share brochure','Collect KYC'],i),nextDate:addDays(t,(i%5)-2),referrerId:p.introducedBy||'',crossSell:line==='re'&&i%5!==4})}
    if(i%2===0)ints.push({id:newId(),personId:p.id,type:R0(INT_TYPES,i),date:p.lastContacted,summary:R0(['Discussed renewal of chit after maturity','Interested in a plot for son, budget ₹1 Cr','Asked for a referral to pharma friends','Met at Rotary dinner, warm conversation'],i),followUp:i%8===0?t:'',by:p.ownerInCharge});
  });
  try{
    const n='sample data';await putMany('groups',Object.values(grpDefs),n);await putMany('companies',cos,n);await putMany('people',ppl,n);await putMany('chits',chits,n);await putMany('re',res,n);await putMany('leads',leads,n);
    const notes=['Called, interested. Wants details on the 25 L group.','Met at the office with his CFO. Sending the proposal tomorrow.','Asked for a site visit on Sunday.','Comparing with another chit company; follow up after Diwali.'];
    await putMany('comments',leads.slice(0,10).map((l,k)=>({id:newId(),leadId:l.id,personId:l.personId,kind:'comment',text:notes[k%notes.length],by:l.owner||S.me.owner||S.me.name,byId:S.me.id,at:addDays(t,-(k%6))+'T0'+(k%9)+':30:00.000Z'})),n);await putMany('interactions',ints,n);
    await putMany('lists',[{id:newId(),name:'Pharma customers (sample)',sample:true,rules:[{field:'industry',op:'is',value:'Pharma & Life Sciences'}]},{id:newId(),name:'Chit ≥ ₹10 L, no property (sample)',sample:true,rules:[{field:'chitValue',op:'>=',value:'10L'},{field:'holding',op:'is',value:'Chit only'}]}]);
    toast('Sample data loaded: 40 people');
  }catch(e){}
}
async function removeSample(){
  const ids=[...D.people.values()].filter(p=>(p.tags||[]).includes('Sample')).map(p=>p.id);const idset=new Set(ids);
  for(const t of ['chits','re','leads','interactions','comments']){const r=[...D[t].values()].filter(z=>idset.has(z.personId)).map(z=>z.id);if(r.length)await delMany(t,r)}
  const co=[...D.companies.values()].filter(c=>c.sample).map(c=>c.id);if(co.length)await delMany('companies',co);
  const ls=[...D.lists.values()].filter(c=>c.sample).map(c=>c.id);if(ls.length)await delMany('lists',ls);
  const gs=[...D.groups.values()].filter(g=>g.sample).map(g=>g.id);if(gs.length)await delMany('groups',gs);
  if(ids.length)await delMany('people',ids,'removed sample data');
  toast('Sample data removed');
}

/* ============ routing & render ============ */
function go(v,id){
  if(v==='more')return;
  S.routeStack.push(S.route);if(S.routeStack.length>30)S.routeStack.shift();
  S.route={v,id};if(v==='person'&&id)pushRecent(id);
  if(v==='people')S.ui.plimit=100;if(v==='campaign')S.ui.climit=60;
  closeSheet();$('#gresults').hidden=true;render();window.scrollTo(0,0);
}
function back(){S.route=S.routeStack.pop()||{v:'home'};render()}
function render(){
  if(!S.ready){return}
  renderNav();
  const v=S.route.v;
  if(S.loading&&!D.people.size){$('#view').innerHTML=emptyBox('Loading your network…','The first load brings every record to this device. After that the app opens instantly and only fetches changes.');return}
  let html;try{html=(VIEWS[v]||VIEWS.today)();const kv={person:'people',company:'companies',lead:'leads'}[v];if(kv&&typeof html==='string')html=kvF(kv,html)}catch(e){console.error(e);html=emptyBox('Something went wrong drawing this page',esc(e.message),'<button class="btn" data-a="go" data-v="today">Go to Today</button>')}
  const ae=document.activeElement;const aid=ae&&ae.id&&$('#view').contains(ae)?ae.id:null;const ss=aid&&ae.selectionStart!=null?[ae.selectionStart,ae.selectionEnd]:null;
  $('#view').innerHTML=html;
  if(aid){const el=document.getElementById(aid);if(el){el.focus();if(ss&&el.setSelectionRange)try{el.setSelectionRange(ss[0],ss[1])}catch(e){}}}
  if(v==='pipeline'||v==='leads')wireBoard();
}
function wireBoard(){
  $$('.card[draggable=true]').forEach(c=>c.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',c.dataset.lead);e.dataTransfer.effectAllowed='move'}));
  $$('.col').forEach(col=>{
    col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('drop')});
    col.addEventListener('dragleave',()=>col.classList.remove('drop'));
    col.addEventListener('drop',async e=>{e.preventDefault();col.classList.remove('drop');const id=e.dataTransfer.getData('text/plain');if(D.leads.get(id))await setLeadStage(id,col.dataset.stage)});
  });
}

/* ============ global search ============ */
const gsearch=debounce(()=>{
  const q=$('#gsearch').value.trim().toLowerCase();const box=$('#gresults');
  if(q.length<2){box.hidden=true;return}
  const qd=q.replace(/\D/g,'');const terms=q.split(/\s+/);
  const ppl=visPeople().filter(x=>terms.every(t=>x.search.includes(t))||(qd.length>=4&&x.mobiles.some(m=>m.includes(qd)))).slice(0,8);
  const cos=[...D.companies.values()].filter(c=>(c.name+' '+(c.industry||'')+' '+(c.group||'')).toLowerCase().includes(q)).slice(0,4);
  box.innerHTML=(ppl.length||cos.length)?`<div class="list">${ppl.map(x=>personRow(x)).join('')}${cos.map(c=>`<div class="li" data-a="openCompany" data-id="${c.id}"><div class="avatar co">${esc(initials(c.name))}</div><div class="main-t"><div class="t">${esc(c.name)}</div><div class="s">${esc([c.industry,c.region].filter(Boolean).join(' · '))}</div></div></div>`).join('')}</div>`:`<div class="empty">No match for “${esc(q)}”${canWrite()?`<div style="margin-top:8px"><button class="btn sm" data-a="personForm" data-name="${esc($('#gsearch').value.trim())}">Add as a new person</button></div>`:''}</div>`;
  box.hidden=false;
},120);

/* ============ events ============ */
const ACT={
  go:d=>{if(d.v==='more')return;if(d.v==='audit'&&S.ui.au){S.ui.au.scope=null}go(d.v)},
  openLead:d=>go('lead',d.id),
  optsEdit:d=>optsSheet(d.k),bfEdit:d=>bfEditSheet(d.e,d.f),bfReset:d=>saveBf(d.e,d.f,null),bfDel:d=>bfDelete(d.e,d.f),bfRestore:d=>saveBf(d.e,d.f,{deleted:false,replacedBy:''},true),
  excel:d=>excelSheet(d.k),xlsxExport:d=>{closeSheet();({people:exportPeople,companies:exportCompanies,leads:exportLeads,groups:exportGroups})[d.k]()},
  xlsxImport:d=>{closeSheet();S.ui.impKind=d.k;S.imp=null;go('import')},xlsxTemplate:d=>{closeSheet();templateXlsx(d.k)},
  logMeet:(d,e)=>{e&&e.stopPropagation&&e.stopPropagation();logMeetSheet(d.id)},resched:(d,e)=>reschedSheet(d.id),
  fuWin:d=>{S.ui.fu=Object.assign(S.ui.fu||{},{w:d.v});if(S.route.v!=='followups')go('followups');else render()},
  fuQuick:(d,e,el)=>{const f=el.closest('form');const i=f&&f.querySelector('[name=nextDate]');if(i)i.value=addDays(todayISO(),+d.n)},
  fuClear:async d=>{const l=clone(D.leads.get(d.id));l.nextDate='';l.nextAction='';await put('leads',l,{note:leadTitle(l)+': follow-up cleared'});closeSheet();toast('Follow-up cleared')},
  exportFollowups:()=>exportFollowups(),
  refMove:d=>{const a=S.refDraft,i=+d.i,j=i+(+d.v);[a[i],a[j]]=[a[j],a[i]];S.refDirty=true;render()},
  refReset:()=>{S.refDraft=null;S.refScopeDraft=null;S.refDirty=false;render()},
  refSave:async()=>{await saveConfig({refCriteria:S.refDraft.map(r=>({k:r.k,w:r.w,on:!!r.on})),refScope:S.refScopeDraft||S.config.refScope||'customers'});S.refDraft=null;S.refScopeDraft=null;S.refDirty=false;toast('Referral rules saved')},
  roleDel:d=>{S.roleDraft.splice(+d.i,1);S.roleDirty=true;render()},roleReset:()=>{S.roleDraft=null;S.roleDirty=false;render()},
  roleSave:async()=>{const roles=S.roleDraft.filter(r=>r.id!=='admin').map(r=>({id:r.id,name:String(r.label||'').trim()||r.id,perms:r.perms}));await saveConfig({roles});S.roleDraft=null;S.roleDirty=false;toast('Roles saved')},
  leAdd:(d,e,el)=>{const le=el.closest('.le');const tpl=le.querySelector('.le-row');const n=tpl.cloneNode(true);n.querySelectorAll('input').forEach(i=>i.value='');le.insertBefore(n,le.querySelector('.le-actions'));n.querySelector('input').focus()},
  leDel:(d,e,el)=>{const le=el.closest('.le');const r=el.closest('.le-row');if(le.querySelectorAll('.le-row').length>1)r.remove();else r.querySelectorAll('input').forEach(i=>i.value='')},
  leUp:(d,e,el)=>{const r=el.closest('.le-row');const p=r.previousElementSibling;if(p&&p.classList.contains('le-row'))r.parentNode.insertBefore(r,p)},
  leDown:(d,e,el)=>{const r=el.closest('.le-row');const n=r.nextElementSibling;if(n&&n.classList.contains('le-row'))r.parentNode.insertBefore(n,r)},
  leSort:(d,e,el)=>{const le=el.closest('.le');const rows=[...le.querySelectorAll('.le-row')];rows.sort((a,b)=>a.querySelector('input').value.localeCompare(b.querySelector('input').value,'en',{sensitivity:'base'}));rows.forEach(r=>le.insertBefore(r,le.querySelector('.le-actions')))},
  bell:()=>{NT.open=!NT.open;const n=$('#notif');n.hidden=!NT.open;if(NT.open)renderNotif()},ntClose:()=>{NT.open=false;$('#notif').hidden=true},
  ntDue:d=>{const l=D.leads.get(d.id);if(l)markDueSeen([l]);NT.open=false;$('#notif').hidden=true;paintBell();go('lead',d.id)},
  ntDueSeen:()=>{markDueSeen(myDue());paintBell()},
  ntToggleSeen:()=>{NT.showSeen=!NT.showSeen;renderNotif()},
  ntGoFollowups:()=>{markDueSeen(myDue());NT.open=false;$('#notif').hidden=true;paintBell();S.ui.fu=Object.assign(S.ui.fu||{},{w:'due'});go('followups')},
  ntOlder:async()=>{const min=Math.min(...NT.items.map(n=>n.id));try{const r=await api('/api/notify?before='+min);NT.items=NT.items.concat(r.items.filter(x=>!NT.items.some(n=>n.id===x.id)));NT.more=!!r.more}catch(e){toast(e.message)}renderNotif()},
  ntClearAll:async()=>{markDueSeen(myDue());try{await api('/api/notify',{method:'POST',body:{clear:true}})}catch(e){}NT.items=[];NT.unread=0;NT.more=false;paintBell();toast('Notifications cleared')},
  ntAllRead:async()=>{try{await api('/api/notify',{method:'POST',body:{all:true}})}catch(e){}NT.items.forEach(n=>n.read=true);NT.unread=0;paintBell()},
  ntOpen:async d=>{const n=NT.items.find(x=>x.id===+d.id);if(n&&!n.read){n.read=true;NT.unread=Math.max(0,NT.unread-1);api('/api/notify',{method:'POST',body:{ids:[n.id]}}).catch(()=>{})}NT.open=false;$('#notif').hidden=true;paintBell();openLink(d.link)},
  ntDesktop:async()=>{try{const p=await Notification.requestPermission();if(p!=='granted'){toast('Alerts are blocked in this browser. Allow notifications for this site in the browser settings.');return renderNotif()}
    const ok=await subscribePush();toast(ok?'Alerts are on for this device':'Alerts are on while the app is open. This browser cannot receive them when it is closed (on an iPhone, add the app to the home screen first).');renderNotif()}catch(e){toast('This browser does not support alerts.')}},
  chatToggle:()=>{CH.open?closeChat():openChat()},chatClose:()=>closeChat(),chatBack:()=>{CH.view='list';CH.editThread=null;renderChat();loadThreads()},
  chatOpen:d=>{CH.cur=d.id;CH.view='thread';renderChat();loadMsgs(true)},chatNew:()=>{CH.view='new';renderChat()},chatNewGroup:()=>{CH.view='group';CH.editThread=null;renderChat()},
  chatGroupEdit:()=>{CH.view='group';CH.editThread=CH.cur;renderChat()},
  chatDM:async d=>{try{const r=await api('/api/chat?a=dm',{method:'POST',body:{userId:d.id}});await loadThreads();CH.cur=r.thread;CH.view='thread';renderChat();loadMsgs(true)}catch(e){toast(e.message)}},
  chatDel:async d=>{const id=+d.id;if(CH.confirmDel!==id){CH.confirmDel=id;paintMsgs();setTimeout(()=>{if(CH.confirmDel===id){CH.confirmDel=null;paintMsgs()}},4000);return}CH.confirmDel=null;try{await api('/api/chat?a=delete',{method:'POST',body:{id}});const l=CH.msgs.get(CH.cur)||[];CH.msgs.set(CH.cur,l.map(m=>m.id===id?Object.assign({},m,{deleted:true,text:''}):m));paintMsgs()}catch(e){toast(e.message)}},
  userAccess:d=>userAccess(d.id),openGroup:d=>go('group',d.id),
  pickBiz:d=>{S.ui.biz=d.v||'';render()},setupTab:d=>{S.ui.stab=d.v;go('setup')},
  clearDash:()=>{S.ui.df={};S.ui.biz='';render()},dashCo:d=>{S.ui.cf={[d.f]:d.v==='Not set'?'':d.v};go('companies')},
  clearCoFilters:()=>{S.ui.cf={};S.ui.cq='';render()},moreCos:()=>{S.ui.climitCo=(S.ui.climitCo||200)+300;render()},
  clearLeadFilters:()=>{S.ui.lf={};render()},
  setStage:d=>setLeadStage(d.id,d.v),
  groupForm:d=>groupForm(d.id),linkPerson:d=>linkPersonSheet(d.cid),
  newPersonAt:d=>{closeSheet();personForm(null,{companies:[{companyId:d.cid,role:'Owner'}],businesses:(D.companies.get(d.cid)||{}).businesses||[]})},
  unlinkPerson:async d=>{const p=clone(D.people.get(d.pid));p.companies=(p.companies||[]).filter(l=>l.companyId!==d.cid);await put('people',p,{note:p.name+' removed from '+((D.companies.get(d.cid)||{}).name||'company')});toast('Removed')},
  delGroup:d=>confirmBox('Delete this group? Its companies stay, without a group.','doDelGroup',`data-id="${d.id}"`),
  doDelGroup:async d=>{closeSheet();const ch=[...D.companies.values()].filter(c=>c.groupId===d.id).map(c=>Object.assign(clone(c),{groupId:''}));if(ch.length)await putMany('companies',ch);await del('groups',d.id);toast('Group deleted');go('groups')},
  blackForm:d=>blackForm(d.kind,d.v),
  unblack:d=>confirmBox('Remove this blacklist entry?','doUnblack',`data-id="${d.id}"`),doUnblack:async d=>{closeSheet();await del('blacklist',d.id);toast('Removed from blacklist')},
  docUpload:d=>docUploadSheet(d.ent,d.id,d.type),
  docDel:d=>confirmBox('Delete this document? It cannot be recovered.','doDocDel',`data-id="${d.id}"`),
  docOpen:d=>openDoc(d.id),
  doDocDel:async d=>{closeSheet();try{await api('/api/files?id='+encodeURIComponent(d.id),{method:'DELETE'});D.docs.delete(d.id);scheduleDerive();toast('Document deleted')}catch(e){toast(e.message)}},
  delComment:d=>confirmBox('Delete this comment?','doDelComment',`data-id="${d.id}"`),doDelComment:async d=>{closeSheet();await del('comments',d.id);toast('Comment deleted')},
  bizForm:d=>bizForm(d.id),
  bizDel:d=>{const n=[...D.leads.values()].filter(l=>leadBiz(l)===d.id).length;if(n)return toast(`This business has ${n} leads. Move or delete them first.`);if(businesses().length<2)return toast('Keep at least one business.');confirmBox('Delete '+esc(bizName(d.id))+'?','doBizDel',`data-id="${esc(d.id)}"`)},
  doBizDel:async d=>{closeSheet();const st=Object.assign({},S.config.stages||{});delete st[d.id];await saveConfig({businesses:businesses().filter(b=>b.id!==d.id),stages:st});toast('Business deleted')},
  fieldForm:d=>fieldForm(d.ent,d.i),
  fieldMove:async d=>{const all=Object.assign({},S.config.customFields||{});const a=customFields(d.ent).slice();const i=+d.i,j=i+(+d.v);[a[i],a[j]]=[a[j],a[i]];all[d.ent]=a;await saveConfig({customFields:all})},
  fieldDel:d=>confirmBox('Delete the field “'+esc(customFields(d.ent)[+d.i].label)+'”? Values already saved stay in the records but are hidden.','doFieldDel',`data-ent="${d.ent}" data-i="${d.i}"`),
  doFieldDel:async d=>{closeSheet();const all=Object.assign({},S.config.customFields||{});all[d.ent]=customFields(d.ent).filter((_,k)=>k!==+d.i);await saveConfig({customFields:all});toast('Field deleted')},
  docTypeForm:d=>docTypeForm(d.ent,d.i),
  docTypeDel:async d=>{const all=Object.assign({},DEFAULT_DOC_TYPES,S.config.docTypes||{});all[d.ent]=docTypes(d.ent).filter((_,k)=>k!==+d.i);await saveConfig({docTypes:all});toast('Document type removed')},
  stgAdd:()=>{S.stageDraft.list.splice(Math.max(0,S.stageDraft.list.findIndex(s=>s.kind!=='open')),0,{id:'',name:'New stage',kind:'open'});S.stageDraft.dirty=true;render()},
  stgDel:d=>{S.stageDraft.list.splice(+d.i,1);S.stageDraft.dirty=true;render()},
  stgMove:d=>{const a=S.stageDraft.list,i=+d.i,j=i+(+d.v);[a[i],a[j]]=[a[j],a[i]];S.stageDraft.dirty=true;render()},
  stgReset:()=>{S.stageDraft=null;render()},
  stgSave:async()=>{const d=S.stageDraft;const used=new Set();
    for(const s of d.list){s.name=String(s.name||'').trim();if(!s.name)return toast('Every stage needs a name.');if(!s.id){let id=slug(s.name),n=2;while(d.list.some(o=>o!==s&&o.id===id))id=slug(s.name)+'-'+n++;s.id=id}if(used.has(s.id))s.id=s.id+'-'+newId().slice(-3);used.add(s.id)}
    if(!d.list.some(s=>s.kind==='open'))return toast('Keep at least one in-progress stage.');
    await saveConfig({stages:Object.assign({},S.config.stages||{},{[d.bid]:d.list})});d.dirty=false;toast('Stages saved')},
  exportCompanies:()=>exportCompanies(),
openPerson:d=>go('person',d.id),openCompany:d=>go('company',d.id),openCampaign:d=>go('campaign',d.id),
  openList:d=>{S.ui.pf={list:d.id};S.ui.pq='';go('people')},back:()=>back(),
  personForm:d=>personForm(d.id,d.name?{name:d.name}:{}),companyForm:d=>companyForm(d.id,{gid:d.gid}),chitForm:d=>chitForm(d.id,d.pid),reForm:d=>reForm(d.id,d.pid),
  leadForm:d=>leadForm(d.id,{pid:d.pid,cid:d.cid,biz:d.biz}),intForm:d=>intForm(d.pid,{lid:d.lid}),listForm:d=>listForm(d.id),campaignForm:d=>campaignForm(d.id,d.list),
  xsellLead:d=>leadForm(null,{pid:d.id,biz:'re',crossSell:true,source:'Existing customer referral'}),
  doneFollow:async d=>{const i=clone(D.interactions.get(d.id));i.followUpDone=true;await put('interactions',i,{audit:false});toast('Marked done')},
  advance:async d=>{const l=D.leads.get(d.id);const st=stagesFor(leadBiz(l));const i=st.indexOf(stageOf(l));const nx=st.slice(i+1).find(x=>x.kind!=='lost');if(nx)await setLeadStage(d.id,nx.id)},
  fav:d=>{toggleFav(d.id);render()},refs:d=>refsSheet({pid:d.pid,cid:d.cid}),
  sel:(d,e)=>{e.stopPropagation();S.ui.sel.has(d.id)?S.ui.sel.delete(d.id):S.ui.sel.add(d.id);render()},
  selAll:()=>{filteredPeople().forEach(x=>S.ui.sel.add(x.p.id));render()},selNone:()=>{S.ui.sel.clear();render()},
  moreRows:()=>{S.ui.plimit+=200;render()},moreRecips:()=>{S.ui.climit=(S.ui.climit||60)+200;render()},
  clearFilters:()=>{S.ui.pf={};S.ui.pq='';render()},
  dashFilter:d=>{S.ui.pf={[d.f]:d.v==='Not set'?'':d.v};S.ui.pq='';go('people')},
  bulkTag:()=>openSheet({title:'Tag '+S.ui.sel.size+' people',form:'bulkTag',body:`<div class="form">${fld('Tags',inp('tags','',{ph:'Comma separated',list:'dl-tags'})+`<datalist id="dl-tags">${allTags().map(t=>`<option value="${esc(t)}">`).join('')}</datalist>`,{full:true})}${fld('Action',segI('mode',[{v:'add',l:'Add tags'},{v:'remove',l:'Remove tags'}],'add'),{full:true})}</div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Apply</button>'}),
  bulkAssign:()=>openSheet({title:'Assign '+S.ui.sel.size+' people',form:'bulkAssign',body:fld('Owner in charge',selI('owner',S.config.owners,'',null)),foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Assign</button>'}),
  bulkGrade:()=>openSheet({title:'Grade '+S.ui.sel.size+' people',form:'bulkGrade',body:fld('Relationship grade',segI('grade',[{v:'',l:'None'},...GRADES],'Gold')),foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Apply</button>'}),
  bulkDelete:()=>confirmBox(`Delete ${S.ui.sel.size} people and their chits, property, leads and interactions? This cannot be undone.`,'doBulkDelete',''),
  doBulkDelete:async()=>{closeSheet();const ids=[...S.ui.sel];for(const id of ids)await deletePerson(id);S.ui.sel.clear();toast('Deleted '+ids.length)},
  mergeSel:()=>mergeSheet([...S.ui.sel].slice(0,4)),merge:d=>mergeSheet(d.ids.split(',')),
  notDup:async d=>{const ids=d.ids.split(',');await putMany('people',ids.slice(1).map(id=>Object.assign(clone(D.people.get(id)),{notDup:true})));toast('Marked as not duplicates')},
  brandLogoClear:()=>{S.brandDraft=Object.assign(S.brandDraft||{},{logo:''});render()},brandReset:()=>{S.brandDraft=null;render()},
  endSessions:async()=>{const ok=await ask({title:'Sign out everywhere else?',text:'Every other phone and browser signed in as you is signed out. This one stays signed in.',buttons:[{l:'Cancel',v:null},{l:'Sign them out',v:1,cls:'pri'}]});if(!ok)return;try{const r=await api('/api/auth?a=end-sessions',{method:'POST',body:{}});setToken(r.token);toast('Your other sessions are signed out')}catch(e){toast(e.message)}},
  reload:()=>location.reload(),
  logout:()=>logout(),leaveApp:()=>{try{ENV.leave()}catch(e){location.replace('/')}},pwForm:()=>pwForm(),totpOn:()=>totpOn(),totpOff:()=>totpOff(),userAdd:()=>userAdd(),userMenu:d=>userMenu(d.id),userEdit:d=>userEdit(d.id),refList:d=>refListSheet(d.id,d.k),auditFull:()=>{const sc=S._auditScope;closeSheet();S.ui.au=Object.assign(S.ui.au||{},{scope:sc&&sc.title!=='Everything'?sc:null});S.audv=null;go('audit')},auditMore:()=>loadAuditView(true),auditReload:()=>{S.audv=null;render()},auditClearScope:()=>{S.ui.au.scope=null;S.audv=null;render()},
  auditRefresh:()=>{S.auditRows=null;render()},
  userPw:d=>userPw(d.id),userToggle:d=>updateUser({id:d.id,active:d.v==='1'}),userTotp:d=>updateUser({id:d.id,resetTotp:true}),
  mic:()=>dictate(),
  copyText:async d=>{try{await navigator.clipboard.writeText(d.v);toast('Copied')}catch(e){toast('Select the text and copy it.')}},
  moreMenu:()=>openSheet({title:'More',body:`<div class="list">${NAV.filter(navAllowed).map(n=>`<div class="li" data-a="go" data-v="${n.v}">${ic(n.ic)}<div class="main-t"><div class="t">${n.label}</div></div></div>`).join('')}</div><div class="small muted" style="margin-top:12px">Signed in as ${esc(S.me.owner||'—')} · ${esc(R().label)}</div>`}),
  loadSample:()=>loadSample(),removeSample:()=>confirmBox('Remove every record tagged Sample, with its chits, property, leads and interactions?','doRemoveSample',''),doRemoveSample:()=>{closeSheet();removeSample()},
  exportPeople:()=>exportPeople(),backup:()=>backup(),
  dlTemplateOld:()=>saveFile(fileStem()+'-import-template.csv',toCSV([['Name','Mobile','Email','Company','Designation','Industry','Region','City','Birthday','Anniversary','Grade','Tags','Introduced by','Notes'],['Example Name','98480 12345','name@example.com','Example Pvt Ltd','Owner','Pharma & Life Sciences','Jubilee Hills','Hyderabad','15/08/1975','','Gold','Rotary','','']]),'import template'),
  impReset:()=>{S.imp=null;render()},impRun:()=>impRun(),
  ruleAdd:()=>{S.ruleDraft.rules.push({field:'region',op:'is',value:''});refreshRuleBody()},ruleDel:d=>{S.ruleDraft.rules.splice(+d.i,1);refreshRuleBody()},
  insMerge:d=>{const ta=$('#fm-template');if(!ta)return;const s=ta.selectionStart||ta.value.length;ta.value=ta.value.slice(0,s)+d.v+ta.value.slice(ta.selectionEnd||s);ta.focus();ta.selectionStart=ta.selectionEnd=s+d.v.length},
  campExport:d=>campExport(d.id),
  campMarkSent:d=>{const c=D.campaigns.get(d.id);const {ok}=campAudience(c);openSheet({title:'Mark as sent?',body:`<p>This records the campaign as sent to <b>${ok.length.toLocaleString('en-IN')}</b> people today, so their responses can be tracked. Do this once the messages have actually gone out from the WhatsApp Business provider or email tool.</p>`,foot:`<button type="button" class="btn" data-a="closeSheet">Cancel</button><button type="button" class="btn pri" data-a="doMarkSent" data-id="${d.id}">Mark as sent</button>`})},
  doMarkSent:async d=>{const c=clone(D.campaigns.get(d.id));const {ok}=campAudience(c);c.results=c.results||{};ok.forEach(x=>{if(!c.results[x.p.id])c.results[x.p.id]='sent'});c.status='Sent';c.sentAt=todayISO();closeSheet();await put('campaigns',c,{note:c.name+' sent to '+ok.length});toast('Campaign marked as sent')},
  campResults:d=>openSheet({title:'Import results',form:'campResults',body:`<input type="hidden" name="id" value="${d.id}"><p class="muted">Upload the delivery report from the WhatsApp provider or email tool as CSV. It needs a phone or email column and a status column (delivered, read, replied, clicked, opted out).</p>${fld('Report file',`<input type="file" name="file" id="fm-rfile" accept=".csv,.txt" required>`)}`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Import</button>'}),
  delPerson:d=>confirmBox(`Delete ${esc(personName(d.id))} with their chits, property, leads and interactions? This cannot be undone.`,'doDelPerson',`data-id="${d.id}"`),
  doDelPerson:async d=>{closeSheet();await deletePerson(d.id);toast('Deleted');go('people')},
  delCompany:d=>confirmBox('Delete this company? People stay, but lose the link to it.','doDelCompany',`data-id="${d.id}"`),
  doDelCompany:async d=>{closeSheet();const ch=[...D.people.values()].filter(p=>(p.companies||[]).some(l=>l.companyId===d.id)).map(p=>Object.assign(clone(p),{companies:p.companies.filter(l=>l.companyId!==d.id)}));if(ch.length)await putMany('people',ch);await del('companies',d.id);toast('Deleted');go('companies')},
  delRec:d=>confirmBox('Delete this record? This cannot be undone.','doDelRec',`data-type="${d.type}" data-id="${d.id}"`),
  doDelRec:async d=>{closeSheet();await del(d.type,d.id);toast('Deleted');if(d.type==='campaigns')go('campaigns')},
  closeSheet:()=>closeSheet(),sheetBg:(d,e,el)=>{if(e.target===el)closeSheet()}
};
document.addEventListener('click',e=>{
  const a=e.target.closest('a[data-stop]');
  if(a){e.stopPropagation();
    if(a.dataset.log&&canWrite()){const id=a.dataset.id,type=a.dataset.log;setTimeout(()=>intForm(id,{type}),400)}
    if(a.dataset.one){const c=clone(D.campaigns.get(a.dataset.one));c.results=c.results||{};if(!c.results[a.dataset.id]){c.results[a.dataset.id]='sent';put('campaigns',c,{audit:false})}}
    return}
  if(!e.target.closest('.search'))$('#gresults').hidden=true;
  const el=e.target.closest('[data-a]');if(!el)return;
  if(el.matches('input[type=checkbox]')&&el.dataset.a==='sel'){ACT.sel(el.dataset,e);return}
  const fn=ACT[el.dataset.a];if(!fn)return;
  if(el.tagName==='A'||el.closest('a[href="#"]'))e.preventDefault();
  Promise.resolve(fn(el.dataset,e,el)).catch(err=>console.error(err));
});
document.addEventListener('change',async e=>{
  const el=e.target;
  if(el.dataset.pf!==undefined){S.ui.pf[el.dataset.pf]=el.value;S.ui.plimit=100;S.ui.sel.clear();render();return}
  if(el.dataset.cf!==undefined){S.ui.cf=S.ui.cf||{};S.ui.cf[el.dataset.cf]=el.value;render();return}
  if(el.dataset.df!==undefined){S.ui.df=S.ui.df||{};S.ui.df[el.dataset.df]=el.value;render();return}
  if(el.dataset.lf!==undefined&&(el.tagName==='SELECT'||el.type==='hidden')){S.ui.lf=S.ui.lf||{};S.ui.lf[el.dataset.lf]=el.value;render();return}
  if(el.dataset.rf!==undefined){S.ui.rf=S.ui.rf||{};S.ui.rf[el.dataset.rf]=el.value;render();return}
  if(el.dataset.lfd){S.ui.lf=S.ui.lf||{};S.ui.lf[el.dataset.lfd]=el.value;render();return}
  if(el.dataset.fud){S.ui.fu[el.dataset.fud]=el.value;render();return}
  const c=el.dataset.c;if(!c)return;
  if(c==='todayAll'){S.ui.todayAll=el.value==='1';render()}
  else if(c==='pipeLine'){S.ui.pipeLine=el.value;render()}
  else if(c==='pipeOwner'){S.ui.pipeOwner=el.value;render()}
  else if(c==='impMap'){S.imp.map[el.dataset.i]=el.value}
  else if(c==='impDup'){S.imp.dup=el.value}
  else if(c==='rule'){const r=S.ruleDraft.rules[+el.dataset.i];r[el.dataset.k]=el.value;if(el.dataset.k==='field'){r.op=opsFor(ruleFields()[el.value].type)[0];r.value=ruleFields()[el.value].type==='bool'?'yes':''}refreshRuleBody()}
  else if(c==='leadBiz'){const st=stagesFor(el.value);const w=$('#lead-stage');if(w)w.innerHTML=segI('stage',st.map(x=>({v:x.id,l:x.name})),st[0].id)}
  else if(c==='biz'){S.ui.biz=el.value;render()}
  else if(c==='lmode'){S.ui.lmode=el.value;render()}
  else if(c==='stageBiz'){S.ui.stageBiz=el.value;S.stageDraft=null;render()}
  else if(c==='stg'){const s=S.stageDraft.list[+el.dataset.i];s[el.dataset.k]=el.value;S.stageDraft.dirty=true;if(el.dataset.k==='kind')render();else{const b=$('[data-a=stgSave]');if(b)b.disabled=false}}
  else if(c==='refOn'){S.refDraft[+el.dataset.i].on=el.checked;S.refDirty=true;render()}
  else if(c==='refW'){S.refDraft[+el.dataset.i].w=+el.value;S.refDirty=true;render()}
  else if(c==='refScope'){S.refScopeDraft=el.value;S.refDirty=true;render()}
  else if(c==='roleName'){S.roleDraft[+el.dataset.i].label=el.value;S.roleDirty=true;const b=$('[data-a=roleSave]');if(b)b.disabled=false}
  else if(c==='rolePerm'){S.roleDraft[+el.dataset.i].perms[el.dataset.k]=el.checked;S.roleDirty=true;const b=$('[data-a=roleSave]');if(b)b.disabled=false;const u=$('[data-a=roleReset]');if(!u)render()}
  else if(c==='fuWin'){S.ui.fu.w=el.value;render()}
  else if(c==='fuOwner'){S.ui.fu.owner=el.value;render()}
  else if(c==='fuStage'){S.ui.fu.stage=el.value;render()}
  else if(el.dataset.fud){S.ui.fu[el.dataset.fud]=el.value;render()}
  else if(c==='leadValueField'){if(!R().settings)return toast('Only an admin can change this.');saveConfig({leadValueField:el.value}).then(()=>toast('Lead value field saved'))}
  else if(c==='auEnt'){S.ui.au.entity=el.value;render()}
  else if(c==='auWho'){S.ui.au.who=el.value;render()}
  else if(c==='fmode'){S.ui.fmode=el.value;render()}
  else if(c==='bftype'){const cv=$('#bf-conv'),op=$('#bf-opts');if(cv)cv.hidden=!el.value;if(op)op.hidden=!(el.value==='dropdown'||el.value==='multi')}
  else if(c==='ftype'){const o=$('#fopts');if(o)o.hidden=!(el.value==='dropdown'||el.value==='multi')}
  else if(c==='campChannel'){const fd=new FormData(el.form);const draft={};for(const [k,v] of fd.entries())draft[k]=v;const id=draft.id;const keep=id?clone(D.campaigns.get(id)):{};Object.assign(keep,draft,{channel:el.value,sender:''});campaignForm(id||'',null,keep)}
  else if(c==='campRes'){const cc=clone(D.campaigns.get(el.dataset.cid));cc.results=cc.results||{};cc.results[el.dataset.id]=el.value||null;await put('campaigns',cc,{audit:false});
    if(el.value==='opted out'){const p=clone(D.people.get(el.dataset.id));if(p){p.optedOut=true;await put('people',p,{note:p.name+' opted out via campaign'})}}
    if(el.value==='lead')leadForm(null,{pid:el.dataset.id,source:'Campaign'})}
  else if(c==='brandLogo'){const f=el.files&&el.files[0];if(!f)return;if(!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type))return toast('Use a PNG, JPEG, WebP or SVG picture.');if(f.size>220*1024)return toast('That picture is over 220 KB. Use a smaller one.');
    const url=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result));fr.onerror=()=>rej(fr.error);fr.readAsDataURL(f)});S.brandDraft=Object.assign(S.brandDraft||{},{logo:url});render()}
  else if(c==='stab'){S.ui.stab=el.value;go('setup')}
  else if(c==='deviceCopy'){if(!R().settings)return toast('Only an owner can change this.');saveConfig({deviceCopy:el.value}).then(()=>toast('Saved'))}
  else if(c==='userRole'){await updateUser({id:el.dataset.id,role:el.value})}
  else if(c==='userOwner'){await updateUser({id:el.dataset.id,owner:el.value})}
});
const rerenderSoon=debounce(()=>render(),180);
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.id==='gsearch')return gsearch();
  if(el.dataset.rfi){S.ui.rf=S.ui.rf||{};S.ui.rf[el.dataset.rfi]=el.value;rerenderSoon();return}
  if(el.dataset.lf==='q'){S.ui.lf=S.ui.lf||{};S.ui.lf.q=el.value;rerenderSoon();return}
  const k=el.dataset.i;if(!k)return;
  if(k==='pq'){S.ui.pq=el.value;S.ui.plimit=100;rerenderSoon()}
  else if(k==='cq'){S.ui.cq=el.value;rerenderSoon()}
  else if(k==='gq'){S.ui.gq=el.value;rerenderSoon()}
  else if(k==='fuq'){S.ui.fu.q=el.value;rerenderSoon()}
  else if(k==='auq'){S.ui.au.q=el.value.trim();rerenderSoon()}
  else if(k==='impTag'){S.imp.tag=el.value}
  else if(k==='ruleName'){S.ruleDraft.name=el.value}
});
document.addEventListener('keydown',e=>{if(e.target&&e.target.id==='ch-text'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();const f=e.target.form;if(f)f.requestSubmit();return}if(e.key==='Escape'){if($('#sheet-root').innerHTML)closeSheet();$('#gresults').hidden=true}});
document.addEventListener('submit',async e=>{
  const f=e.target;const k=f.dataset.f;if(!k)return;e.preventDefault();
  const btn=f.querySelector('button[type=submit]');if(btn){if(btn.disabled)return;btn.disabled=true}
  const fd=new FormData(f);
  try{
    if(k==='setup'||k==='login'||k==='code'||k==='newpw')await authSubmit(k,fd);
    else if(k==='chatSend')await chatSend(fd);
    else if(k==='chatGroup'){const t=fd.get('thread');const r=await api('/api/chat?a='+(t?'groupEdit':'group'),{method:'POST',body:{thread:t,name:fd.get('gname'),members:fd.getAll('members')}});await loadThreads();CH.cur=r.thread;CH.view='thread';CH.editThread=null;renderChat();loadMsgs(true)}
    else if(k==='userAccess'){const pm={};['export','campaigns','send'].forEach(x=>pm[x]=!!fd.get('p_'+x));await updateUser({id:fd.get('id'),businesses:fd.getAll('biz'),perms:pm})}
    else if(['userAdd','userPw','pw','totp','totpOff'].includes(k))await accountSubmit(k,fd);
    else if(k==='bfEdit')await submitBf(fd);
    else if(k==='brandForm')await saveBrandForm(fd);
    else if(k==='userEdit'){const name=String(fd.get('name')||'').trim(),email=String(fd.get('email')||'').trim();if(!name)return toast('Enter a name.');await updateUser({id:fd.get('id'),name,email})}
    else if(k==='strayOwner')await saveOwners(S.config.owners.slice(),[[String(fd.get('from')),String(fd.get('to'))]]);
    else if({person:1,company:1,group:1,lead:1}[k]&&bReq({person:'people',company:'companies',group:'groups',lead:'leads'}[k],fd).length)toast('Fill in: '+bReq({person:'people',company:'companies',group:'groups',lead:'leads'}[k],fd).join(', '));
    else if(k==='person')await savePersonForm(fd);
    else if(k==='optsForm')await saveOptsForm(fd);
    else if(k==='logMeet')await saveLogMeet(fd);
    else if(k==='resched')await saveResched(fd);
    else if(k==='roleAdd'){const name=String(fd.get('name')||'').trim();if(!name)return toast('Name the role.');if(!S.roleDraft)S.roleDraft=clone(roleList());let id=slug(name),n=2;while(S.roleDraft.some(r=>r.id===id)||BUILTIN_ROLES[id])id=slug(name)+'-'+n++;S.roleDraft.push({id,label:name,perms:{all:true,write:true,delete:false,export:false,campaigns:false,send:false,settings:false},builtin:false});S.roleDirty=true;render()}
    else if(k==='group'){const id=fd.get('id');const name=String(fd.get('name')||'').trim();if(!name)return toast('Name the group.');const g=id?clone(D.groups.get(id)):{};if((!id||!sameName(g.name,name))&&!(await dupNameCheck('groups',name,id||'')))return;g.name=name;g.notes=String(fd.get('notes')||'');{const {cf,missing}=cfRead('groups',fd,g.cf);if(missing.length)return toast('Fill in: '+missing.join(', '));g.cf=cf}const s2=await put('groups',g);closeSheet();toast('Saved');if(!id)go('group',s2.id)}
    else if(k==='linkPerson'){const pid=resolvePerson(fd.get('person'));if(!pid)return toast('Pick a person from the list, or use New person.');const p=clone(D.people.get(pid));p.companies=(p.companies||[]).filter(l=>l.companyId!==fd.get('cid')).concat({companyId:fd.get('cid'),role:fd.get('role')||''});await put('people',p,{note:p.name+' added to '+((D.companies.get(fd.get('cid'))||{}).name||'')});closeSheet();toast('Added '+p.name)}
    else if(k==='comment'){const text=String(fd.get('text')||'').trim();if(!text)return;const l=D.leads.get(fd.get('leadId'));await put('comments',{leadId:l.id,personId:l.personId||'',kind:'comment',text,by:S.me.owner||S.me.name||S.me.email,byId:S.me.id,at:nowISO()});const ta=$('#fm-comment');if(ta)ta.value=''}
    else if(k==='black'){const kind=fd.get('kind');let value=String(fd.get('value')||'').trim();if(!value)return toast('Enter the number or GST.');if(kind==='phone')value=normPhone(value);if(kind==='gst')value=normGST(value);if(kind==='email')value=normEmail(value);await put('blacklist',{kind,value,reason:String(fd.get('reason')||'').trim(),by:S.me.owner||S.me.name||S.me.email,at:nowISO()});closeSheet();toast('Added to blacklist')}
    else if(k==='docUpload')await uploadDoc(fd);
    else if(k==='bizForm'){const id=fd.get('id');const name=String(fd.get('name')||'').trim();if(!name)return toast('Name the business.');let list=businesses().map(b=>Object.assign({},b));if(id)list=list.map(b=>b.id===id?Object.assign(b,{name}):b);else{let bid=slug(name);while(list.some(b=>b.id===bid))bid+='-2';list.push({id:bid,name})}await saveConfig({businesses:list});closeSheet();toast('Saved')}
    else if(k==='fieldForm'){const ent=fd.get('ent'),i=fd.get('i');const label=String(fd.get('label')||'').trim();if(!label)return toast('Name the field.');const type=fd.get('type');const options=type==='dropdown'||type==='multi'?leVals(fd,'opt'):[];if((type==='dropdown'||type==='multi')&&!options.length)return toast('Add at least one option.');
      const list=customFields(ent).slice();const f={label,type,options,required:!!fd.get('required'),hint:String(fd.get('hint')||'').trim()};
      if(i!==''){f.key=list[+i].key;list[+i]=f}else{let key=slug(label),n=2;while(list.some(o=>o.key===key))key=slug(label)+'-'+n++;f.key=key;list.push(f)}
      await saveConfig({customFields:Object.assign({},S.config.customFields||{},{[ent]:list})});closeSheet();toast('Field saved')}
    else if(k==='docTypeForm'){const ent=fd.get('ent'),i=fd.get('i');const name=String(fd.get('name')||'').trim();if(!name)return toast('Name the document.');const list=docTypes(ent).slice();const t={name,period:!!fd.get('period'),required:!!fd.get('required')};
      if(i!==''){t.id=list[+i].id;list[+i]=t}else{let id=slug(name),n=2;while(list.some(o=>o.id===id))id=slug(name)+'-'+n++;t.id=id;list.push(t)}
      await saveConfig({docTypes:Object.assign({},DEFAULT_DOC_TYPES,S.config.docTypes||{},{[ent]:list})});closeSheet();toast('Saved')}
    else if(k==='sources'){await saveConfig({sources:String(fd.get('src')).split('\n').map(x=>x.trim()).filter(Boolean)});toast('Saved')}
    else if(k==='company')await saveCompanyForm(fd);
    else if(k==='chit')await saveChitForm(fd);
    else if(k==='re')await saveReForm(fd);
    else if(k==='lead')await saveLeadForm(fd);
    else if(k==='int')await saveIntForm(fd);
    else if(k==='campaign')await saveCampaignForm(fd);
    else if(k==='merge')await doMerge(fd);
    else if(k==='impStart')await impStart(fd);
    else if(k==='list'){const d=S.ruleDraft;d.name=String(fd.get('name')||'').trim();if(!d.name){toast('Name the segment.')}else{const rules=d.rules.filter(r=>r.value!==''||ruleFields()[r.field].type==='bool');const l=d.id?clone(D.lists.get(d.id)):{};l.name=d.name;l.rules=rules;await put('lists',l);closeSheet();toast('Segment saved');if(S.route.v!=='lists')go('lists')}}
    else if(k==='bulkTag'){const tags=splitList(fd.get('tags'));const add=fd.get('mode')!=='remove';const ch=[...S.ui.sel].map(id=>D.people.get(id)).filter(Boolean).map(p=>{const n=clone(p);n.tags=add?uniq((n.tags||[]).concat(tags)):(n.tags||[]).filter(t=>!tags.includes(t));return n});await putMany('people',ch,(add?'tagged ':'untagged ')+ch.length+': '+tags.join(', '));closeSheet();toast('Updated '+ch.length)}
    else if(k==='bulkAssign'){const o=fd.get('owner');const ch=[...S.ui.sel].map(id=>D.people.get(id)).filter(Boolean).map(p=>Object.assign(clone(p),{ownerInCharge:o}));await putMany('people',ch,'assigned '+ch.length+' to '+o);closeSheet();toast('Assigned '+ch.length)}
    else if(k==='bulkGrade'){const g=fd.get('grade')||'';const ch=[...S.ui.sel].map(id=>D.people.get(id)).filter(Boolean).map(p=>Object.assign(clone(p),{grade:g}));await putMany('people',ch,'graded '+ch.length+' as '+(g||'none'));closeSheet();toast('Updated '+ch.length)}
    else if(k==='owners'){const o=splitList(String(fd.get('owners')).replace(/\n/g,','));if(o.length)await saveConfig({owners:o});toast('Saved')}
    else if(k==='industries'){const inds=String(fd.get('ind')).split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const [n,s]=l.split(':');return {name:n.trim(),subs:splitList(s||'')}});await saveConfig({industries:inds});toast('Saved')}
    else if(k==='regions'){await saveConfig({regions:String(fd.get('reg')).split('\n').map(s=>s.trim()).filter(Boolean)});toast('Saved')}
    else if(k==='biz'){const lines=n=>String(fd.get(n)||'').split('\n').map(s=>s.trim()).filter(Boolean);await saveConfig({crossSellThreshold:num(fd.get('th'))||S.config.crossSellThreshold,projects:lines('proj'),branches:lines('br'),senders:{whatsapp:lines('sw'),email:lines('se')}});toast('Saved')}
    else if(k==='campResults'){const file=fd.get('file');const rows=parseCSV((await file.text()).replace(/^﻿/,''));const h=(rows[0]||[]).map(s=>s.toLowerCase());const pi=h.findIndex(s=>/phone|mobile|number|wa_id|to/.test(s)),ei=h.findIndex(s=>/mail/.test(s)),si=h.findIndex(s=>/status|event|result/.test(s));
      if(si<0||(pi<0&&ei<0)){toast('Need a phone or email column and a status column.')}else{
      const c=clone(D.campaigns.get(fd.get('id')));c.results=c.results||{};const mob=new Map(),em=new Map();visPeople().forEach(x=>{x.mobiles.forEach(m=>mob.set(m,x.p.id));(x.p.emails||[]).forEach(e=>em.set(normEmail(e),x.p.id))});
      let n=0;const opt=[];const rank=['sent','delivered','read','clicked','replied','lead'];
      rows.slice(1).forEach(r=>{const id=(pi>=0&&mob.get(normPhone(r[pi])))||(ei>=0&&em.get(normEmail(r[ei])));let s=String(r[si]||'').toLowerCase().trim();if(/unsub|opt.?out|stop|block/.test(s))s='opted out';else if(/repl|respond/.test(s))s='replied';else if(/click/.test(s))s='clicked';else if(/read|open/.test(s))s='read';else if(/deliver/.test(s))s='delivered';else if(/sent/.test(s))s='sent';else s='';
        if(id&&s){const cur=c.results[id];if(s==='opted out'){c.results[id]=s;opt.push(id)}else if(cur!=='opted out'&&rank.indexOf(s)>rank.indexOf(cur||'')){c.results[id]=s}n++}});
      await put('campaigns',c,{note:'imported '+n+' results'});
      const ops=opt.map(id=>D.people.get(id)).filter(Boolean).map(p=>Object.assign(clone(p),{optedOut:true}));if(ops.length)await putMany('people',ops,ops.length+' opted out via campaign report');
      closeSheet();toast(n+' results matched'+(ops.length?', '+ops.length+' opted out':''))}}
  }catch(err){console.error(err);toast(err.message||'Something went wrong.')}
  finally{if(btn&&document.body.contains(btn))btn.disabled=false}
});
$('#fab').addEventListener('click',()=>openSheet({title:'Quick add',body:`<div class="list">
  <div class="li" data-a="personForm">${ic('people')}<div class="main-t"><div class="t">Person</div><div class="s">Name and mobile are enough</div></div></div>
  <div class="li" data-a="leadForm">${ic('pipeline')}<div class="main-t"><div class="t">Lead</div><div class="s">Chit or real estate opportunity</div></div></div>
  <div class="li" data-a="companyForm">${ic('companies')}<div class="main-t"><div class="t">Company</div><div class="s">With industry and region</div></div></div>
  <div class="li" data-a="go" data-v="import">${ic('import')}<div class="main-t"><div class="t">Import contacts</div><div class="s">vCard, CSV or Excel</div></div></div></div>`}));

/* ============ audit log: full view, per-screen view and right-click ============ */
const AUD_ENT={people:'Person',companies:'Company',leads:'Lead',comments:'Lead comment',groups:'Group',chits:'Chit',re:'Property',interactions:'Interaction',campaigns:'Campaign',lists:'Segment',blacklist:'Blacklist',settings:'Settings',owners:'Owners',team:'Team & sign-in',docs:'Document'};
const AUD_FILTERS=[['','Everything'],['leads,comments','Leads & comments'],['people','People'],['companies','Companies'],['groups','Groups'],['chits,re,interactions','Chits, property, interactions'],['campaigns,lists','Campaigns & segments'],['blacklist','Blacklist'],['settings,owners','Setup'],['team','Team & sign-ins'],['export','Exports']];
function auditQS(o){const p=new URLSearchParams();if(o.ids&&o.ids.length)p.set('ids',o.ids.slice(0,400).join(','));if(o.entity)p.set('entity',o.entity);if(o.who)p.set('who',o.who);if(o.q)p.set('q',o.q);if(o.before)p.set('before',o.before);return p.toString()}
// which records belong to a record's history (a lead's comments, a person's leads and chits…)
function auditIdsFor(kind,id){
  if(kind==='lead')return [id,...(X.comments.get(id)||[]).map(c=>c.id)];
  if(kind==='person'){const x=P(id);if(!x)return [id];return [id,...x.leads.flatMap(l=>[l.id,...(X.comments.get(l.id)||[]).map(c=>c.id)]),...x.chits.map(c=>c.id),...x.re.map(r=>r.id),...x.ints.map(i=>i.id)]}
  if(kind==='company'){return [id,...[...D.leads.values()].filter(l=>l.companyId===id).map(l=>l.id)]}
  return [id];
}
const recName=(kind,id)=>kind==='lead'?leadTitle(D.leads.get(id)||{}):kind==='person'?personName(id):kind==='company'?((D.companies.get(id)||{}).name||''):kind==='group'?groupName(id):'';
function auditScopeAt(el){
  const hit=el&&el.closest&&el.closest('[data-a=openLead][data-id],[data-lead],[data-a=openPerson][data-id],[data-a=openCompany][data-id],[data-a=openGroup][data-id]');
  if(hit){const kind=hit.dataset.lead?'lead':{openLead:'lead',openPerson:'person',openCompany:'company',openGroup:'group'}[hit.dataset.a];const id=hit.dataset.lead||hit.dataset.id;const n=recName(kind,id);if(n)return {title:n,ids:auditIdsFor(kind,id)}}
  const v=S.route.v,id=S.route.id;
  if(['lead','person','company','group'].includes(v)&&id)return {title:recName(v,id)||v,ids:auditIdsFor(v,id)};
  const byView={leads:['Leads','leads,comments'],pipeline:['Leads','leads,comments'],followups:['Leads & follow-ups','leads,comments'],people:['People','people'],companies:['Companies','companies'],groups:['Groups','groups'],campaigns:['Campaigns','campaigns'],lists:['Segments','lists'],setup:['Setup & team','settings,owners,team,blacklist'],settings:['Setup & team','settings,owners,team,blacklist'],import:['Imports','people,companies,leads']}[v];
  if(byView)return {title:byView[0],entity:byView[1]};
  return {title:'Everything',entity:''};
}
const audWhen=a=>new Date(a.at).toLocaleString('en-IN',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'});
function audWhat(a){
  const ent=String(a.entity||'');const kind={people:'person',companies:'company',leads:'lead',groups:'group'}[ent];
  let lab=ent.split(', ').map(e=>AUD_ENT[e]||e).join(', ');
  if(ent==='comments'){const c=D.comments.get(a.entity_id);if(c&&D.leads.get(c.leadId))return `${esc(lab)} · <a href="#" data-a="openLead" data-id="${esc(c.leadId)}">${esc(leadTitle(D.leads.get(c.leadId)))}</a>`}
  if(kind&&a.entity_id){const n=recName(kind,a.entity_id);if(n)return `${esc(lab)} · <a href="#" data-a="${{person:'openPerson',company:'openCompany',lead:'openLead',group:'openGroup'}[kind]}" data-id="${esc(a.entity_id)}">${esc(n)}</a>`}
  return esc(lab||'—');
}
const audRows=rows=>`<div class="tbl-wrap"><table class="tbl audit-tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>${rows.map(a=>`<tr><td class="small num nowrap">${audWhen(a)}</td><td class="small">${esc(a.who||'—')}</td><td class="small"><span class="chip ${/delete/.test(a.action)?'bad':/create|add|upload/.test(a.action)?'good':''}">${esc(a.action)}</span></td><td class="small">${audWhat(a)}</td><td class="small">${esc(a.detail||'')}</td></tr>`).join('')}</tbody></table></div>`;
async function auditSheet(scope){
  if(!R().settings)return toast('Only owners and admins can see the audit log.');
  openSheet({title:'Audit log · '+scope.title,wide:true,body:'<div class="muted">Loading…</div>',foot:`<button type="button" class="btn" data-a="auditFull" style="margin-right:auto">Open the full audit log</button><button type="button" class="btn pri" data-a="closeSheet">Close</button>`});
  S._auditScope=scope;
  try{const r=await api('/api/audit?'+auditQS(scope));const bd=$('#sheet-bd');if(!bd)return;
    bd.innerHTML=r.rows.length?audRows(r.rows)+(r.more?'<div class="small muted" style="margin-top:8px">Showing the latest 200. Open the full audit log to see older entries.</div>':''):'<div class="muted">No changes recorded for this yet.</div>'}
  catch(e){const bd=$('#sheet-bd');if(bd)bd.innerHTML=`<div class="muted">${esc(e.message)}</div>`}
}
function loadAuditView(more){
  const f=S.ui.au||(S.ui.au={});const A=S.audv||(S.audv={rows:[],more:false,key:''});
  const key=JSON.stringify([f.entity,f.who,f.q,f.scope&&f.scope.title]);if(!more&&A.key===key&&(A.rows.length||A.loading))return;
  A.key=key;A.loading=true;if(!more){A.rows=[];A.more=false}
  const o={entity:f.scope?f.scope.entity:f.entity,ids:f.scope&&f.scope.ids,who:f.who,q:f.q,before:more&&A.rows.length?A.rows[A.rows.length-1].id:''};
  api('/api/audit?'+auditQS(o)).then(r=>{if(A.key!==key)return;A.rows=more?A.rows.concat(r.rows):r.rows;A.more=r.more;A.loading=false;A.err='';if(S.route.v==='audit')render()}).catch(e=>{A.loading=false;A.err=e.message;if(S.route.v==='audit')render()});
}
VIEWS.audit=()=>{
  if(!R().settings)return emptyBox('Only owners and admins can see the audit log','Ask an owner if you need it.');
  loadAuditView(false);const f=S.ui.au;const A=S.audv;
  const whos=uniq([...(S.users||[]).map(u=>u.owner||u.name||u.email),...A.rows.map(a=>a.who)]).sort();
  return `<div class="ph"><div><h1>Audit log</h1><div class="sub">Every change, sign-in and export, newest first. Right-click any screen or record (long-press on a phone) to see just its history.</div></div><div class="actions"><button class="btn" data-a="auditReload">Refresh</button></div></div>
  ${f.scope?`<div class="note" style="margin-bottom:12px">Showing <b>${esc(f.scope.title)}</b> only. <button class="linkbtn" data-a="auditClearScope">Show everything</button></div>`:''}
  <div class="filters">${f.scope?'':`<select data-c="auEnt" aria-label="What">${AUD_FILTERS.map(([v,l])=>`<option value="${v}" ${(f.entity||'')===v?'selected':''}>${l}</option>`).join('')}</select>`}
    <select data-c="auWho" aria-label="Who"><option value="">Everyone</option>${whos.map(w=>`<option ${f.who===w?'selected':''}>${esc(w)}</option>`).join('')}</select>
    <input type="search" id="au-q" data-i="auq" value="${esc(f.q||'')}" placeholder="Search names, details, actions…" style="flex:1;min-width:180px"></div>
  <div class="panel">${A.err?`<div class="bd muted">${esc(A.err)}</div>`:A.rows.length?audRows(A.rows)+(A.more?`<div class="bd"><button class="btn" data-a="auditMore">Show older</button></div>`:''):`<div class="bd muted">${A.loading?'Loading…':'Nothing matches.'}</div>`}</div>`;
};
(function(){
  let menu=null;const hide=()=>{if(menu){menu.remove();menu=null}};
  document.addEventListener('contextmenu',e=>{
    if(!S.authed||!S.ready||!R().settings||e.shiftKey)return;
    const t=e.target;if(t.closest('input,textarea,select,[contenteditable],.dlg,#chat')||String(window.getSelection&&window.getSelection())){return}
    e.preventDefault();hide();const sc=auditScopeAt(t);
    menu=document.createElement('div');menu.className='ctx';menu.setAttribute('role','menu');
    menu.innerHTML=`<button role="menuitem" data-x="scope">${ic('log')}<span>Audit log · ${esc(sc.title)}</span></button><button role="menuitem" data-x="all">${ic('log')}<span>Full audit log</span></button><div class="ctx-hint">Shift + right-click for the browser menu</div>`;
    document.body.appendChild(menu);const w=menu.offsetWidth,h=menu.offsetHeight;
    menu.style.left=Math.max(8,Math.min(e.clientX,innerWidth-w-8))+'px';menu.style.top=Math.max(8,Math.min(e.clientY,innerHeight-h-8))+'px';
    menu.addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;hide();if(b.dataset.x==='scope')auditSheet(sc);else{S.ui.au=Object.assign(S.ui.au||{},{scope:null});go('audit')}});
  });
  ['click','scroll','resize','keydown'].forEach(t=>window.addEventListener(t,e=>{if(menu&&!(t==='click'&&menu.contains(e.target)))hide()},true));
})();

/* ============ phone Back button: step back inside the app, ask before leaving ============ */
// One extra history entry sits on top; pressing Back lands below it, we handle the step in the app and put it back.
const BK={leaving:false,asking:false};
function armBack(){if(!S.authed||BK.leaving||BK.asking)return;try{if(!(history.state&&history.state.neTrap))history.pushState({neTrap:1},'')}catch(e){}}
['pointerdown','keydown'].forEach(t=>document.addEventListener(t,()=>armBack(),true));
window.addEventListener('popstate',async()=>{
  if(BK.leaving||!S.authed)return;
  if(S._dlgCancel){S._dlgCancel();armBack();return}
  if($('#sheet-root').innerHTML){closeSheet();armBack();return}
  if(NT.open){NT.open=false;$('#notif').hidden=true;armBack();return}
  if(CH.open){closeChat();armBack();return}
  if(!$('#gresults').hidden){$('#gresults').hidden=true;armBack();return}
  if(S.routeStack.length){back();window.scrollTo(0,0);armBack();return}
  if(S.route.v!=='home'){S.route={v:'home'};render();armBack();return}
  if(BK.asking)return;BK.asking=true;
  const r=await ask({title:'Close the app?',text:'The app will close. Do you want to go back?',buttons:[{l:'Yes, close',v:1},{l:'No, stay',v:null,cls:'pri'}]});
  BK.asking=false;
  if(r){BK.leaving=true;history.back();setTimeout(()=>{try{window.close()}catch(e){}BK.leaving=false;toast('You can close this tab now.')},600)}else armBack();
});

/* ============ drag to reorder (mouse and touch) ============ */
(function(){
  let drag=null;
  const rowsOf=box=>[...box.children].filter(el=>el.matches('.le-row,tr,.stage-row'));
  const scroller=el=>{for(let n=el;n&&n!==document.body;n=n.parentElement){const cs=getComputedStyle(n);if(/(auto|scroll)/.test(cs.overflowY)&&n.scrollHeight>n.clientHeight)return n}return document.scrollingElement};
  document.addEventListener('pointerdown',e=>{
    const g=e.target.closest('.grip');if(!g)return;const row=g.closest('.le-row,tr,.stage-row');if(!row)return;
    e.preventDefault();try{g.setPointerCapture(e.pointerId)}catch(_){}
    drag={row,box:row.parentElement,g,sc:scroller(row),y:e.clientY};row.classList.add('dragging');document.body.classList.add('is-dragging');
  });
  document.addEventListener('pointermove',e=>{
    if(!drag)return;e.preventDefault();drag.y=e.clientY;
    const {row,box}=drag;const others=rowsOf(box).filter(r=>r!==row);
    const before=others.find(r=>{const b=r.getBoundingClientRect();return e.clientY<b.top+b.height/2});
    if(before){if(row.nextElementSibling!==before)box.insertBefore(row,before)}
    else{const last=others[others.length-1];if(last&&last.nextElementSibling!==row)last.after(row)}
    const sb=drag.sc.getBoundingClientRect?drag.sc.getBoundingClientRect():{top:0,bottom:innerHeight};const top=drag.sc===document.scrollingElement?0:sb.top,bot=drag.sc===document.scrollingElement?innerHeight:sb.bottom;
    if(e.clientY<top+40)drag.sc.scrollTop-=12;else if(e.clientY>bot-40)drag.sc.scrollTop+=12;
  },{passive:false});
  const end=async()=>{
    if(!drag)return;const {row,box}=drag;drag=null;row.classList.remove('dragging');document.body.classList.remove('is-dragging');
    const order=rowsOf(box).map(r=>+r.dataset.i);
    if(box.dataset.dragsave==='fields'){const ent=box.dataset.ent;const cur=customFields(ent);if(order.some((v,i)=>v!==i)){const all=Object.assign({},S.config.customFields||{});all[ent]=order.map(i=>cur[i]);await saveConfig({customFields:all});toast('Order saved')}}
    else if(box.dataset.dragsave==='stages'&&S.stageDraft){if(order.some((v,i)=>v!==i)){S.stageDraft.list=order.map(i=>S.stageDraft.list[i]);S.stageDraft.dirty=true;render()}}
  };
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
})();

/* ============ access ============ */
const allowedBiz=()=>{const a=S.me.businesses||[];return a.length?businesses().filter(b=>a.includes(b.id)):businesses()};

/* ============ notifications ============ */
const NT={items:[],unread:0,lastId:Number(LS.get('ntLast',0))||0,open:false,more:false,showSeen:false};
const dueSeenKey=()=>'dueSeen:'+(S.me&&S.me.id||'');
const dueSeen=()=>LS.get(dueSeenKey(),{});
const isDueSeen=l=>dueSeen()[l.id]===l.nextDate;
function markDueSeen(ls){const m=dueSeen();const live=new Set([...D.leads.keys()]);Object.keys(m).forEach(k=>{if(!live.has(k))delete m[k]});ls.forEach(l=>m[l.id]=l.nextDate);LS.set(dueSeenKey(),m)}
const newDue=()=>myDue().filter(l=>!isDueSeen(l));
function myDue(){const t=todayISO();const mine=S.me.owner&&[...D.leads.values()].some(l=>l.owner===S.me.owner);return [...D.leads.values()].filter(l=>leadVisible(l)&&openLead(l)&&l.nextDate&&l.nextDate<=t&&(!mine||!l.owner||l.owner===S.me.owner)).sort((a,b)=>a.nextDate.localeCompare(b.nextDate))}
async function pollNotify(){
  if(!S.authed)return;
  try{const r=await api('/api/notify');const older=NT.items.filter(n=>!r.items.some(x=>x.id===n.id)&&n.id<Math.min(...r.items.map(x=>x.id),Infinity));NT.items=r.items.concat(older);NT.unread=r.unread;if(!older.length)NT.more=!!r.more;
    const fresh=r.items.filter(n=>!n.read&&n.id>NT.lastId);
    if(fresh.length){NT.lastId=Math.max(...fresh.map(n=>n.id));LS.set('ntLast',NT.lastId);fresh.slice(0,3).forEach(n=>desktopAlert(n.text,n.link));if(!NT.open)toast(fresh[0].text)}
  }catch(e){}
  const due=myDue();const k='dueAlert:'+todayISO();
  if(due.length&&!LS.get(k,false)){LS.set(k,true);desktopAlert(`${plural(due.length,'follow-up')} due today`,'home')}
  paintBell();
}
function desktopAlert(text,link){try{if('Notification' in window&&Notification.permission==='granted'&&document.visibilityState!=='visible'){const n=new Notification(appName(),{body:text,icon:S.brand.logo||'/cf_crm/icon-192.png',tag:link||text});n.onclick=()=>{window.focus();openLink(link);n.close()}}}catch(e){}}
function paintBell(){const due=newDue().length;const b=$('#bell-n');if(b){const n=NT.unread+due;b.textContent=n>99?'99+':n;b.hidden=!n}if(NT.open)renderNotif()}
function openLink(link){if(!link)return;const [k,id]=String(link).split(/:(.*)/s);if(k==='lead')go('lead',id);else if(k==='company')go('company',id);else if(k==='person')go('person',id);else if(k==='chat'){openChat(id)}else if(k==='home')go('home');else if(k==='followups')go('followups')}
function renderNotif(){
  const el=$('#notif');if(!el)return;const all=myDue();const fresh=all.filter(l=>!isDueSeen(l));const t=todayISO();
  const list=NT.showSeen?all:fresh;const shown=list.slice(0,100);
  const dueI=l=>`<button class="np-i due ${isDueSeen(l)?'':'unread'}" data-a="ntDue" data-id="${l.id}"><span class="np-t">${esc(leadTitle(l))} · ${esc(l.nextAction||'Follow up')}</span><span class="np-d ${l.nextDate<t?'late':''}">${l.nextDate<t?plural(daysSince(l.nextDate),'day')+' overdue':'due today'}${l.owner?' · '+esc(l.owner):''}</span></button>`;
  const anything=fresh.length||NT.unread||NT.items.length;
  el.innerHTML=`<div class="np-h"><b>Notifications${NT.unread+fresh.length?` <span class="muted num">(${NT.unread+fresh.length} new)</span>`:''}</b><div class="row">${anything?'<button class="btn ghost sm" data-a="ntClearAll" title="Mark everything as seen and clear the activity list">Clear all</button>':''}<button class="iconbtn" data-a="ntClose" aria-label="Close">${ic('close')}</button></div></div>
  <div class="np-b">
  <div class="np-sec row" style="justify-content:space-between"><span>Follow-ups due${fresh.length?` · ${fresh.length} new`:''}</span>${all.length?`<span class="row" style="gap:6px">${all.length>fresh.length||NT.showSeen?`<button class="linkbtn" data-a="ntToggleSeen">${NT.showSeen?'New only':'Show all '+all.length}</button>`:''}${fresh.length?'<button class="linkbtn" data-a="ntDueSeen">Mark seen</button>':''}</span>`:''}</div>
  ${shown.length?shown.map(dueI).join('')+(list.length>shown.length?`<div class="np-empty">${list.length-shown.length} more…</div>`:''):`<div class="np-empty">${all.length?`No new follow-ups. ${plural(all.length,'follow-up')} still due.`:'No follow-ups due.'}</div>`}
  ${all.length?`<button class="np-more" data-a="ntGoFollowups">Open Follow-ups to see all ${all.length} due ›</button>`:''}
  <div class="np-sec row" style="justify-content:space-between"><span>Activity${NT.unread?` · ${NT.unread} unread`:''}</span>${NT.unread?'<button class="linkbtn" data-a="ntAllRead">Mark all read</button>':''}</div>${NT.items.length?NT.items.map(n=>`<button class="np-i ${n.read?'':'unread'}" data-a="ntOpen" data-id="${n.id}" data-link="${esc(n.link||'')}"><span class="np-t">${esc(n.text)}</span><span class="np-d">${new Date(n.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></button>`).join('')+(NT.more?'<button class="np-more" data-a="ntOlder">Show older</button>':''):'<div class="np-empty">Nothing yet. You will see leads, companies and people assigned to you, comments on your leads and chat messages here.</div>'}</div>
  ${'Notification' in window&&Notification.permission!=='granted'?`<div class="np-f"><button class="btn sm" data-a="ntDesktop">Turn on alerts on this device</button><span class="small muted">Follow-up reminders, assignments and messages arrive even when the app is closed.</span></div>`:''}`;
}

/* ============ chat ============ */
const CH={open:false,threads:[],users:[],cur:null,msgs:new Map(),view:'list',timer:null,tTimer:null,confirmDel:null};
const chatUnread=()=>CH.threads.reduce((a,t)=>a+(t.unread||0),0);
async function loadThreads(){try{const r=await api('/api/chat?a=threads');CH.threads=r.threads;CH.users=r.users;paintChatBadge();if(CH.open&&CH.view!=='thread')renderChat()}catch(e){}}
function paintChatBadge(){const b=$('#chat-n');if(b){const n=chatUnread();b.textContent=n>99?'99+':n;b.hidden=!n}}
const threadName=t=>{if(!t)return '';if(t.kind==='direct'){const o=(t.members||[]).find(id=>id!==S.me.id);const u=CH.users.find(x=>x.id===o);return u?u.name:'Direct message'}return t.name};
function openChat(threadId){CH.open=true;$('#chat').hidden=false;document.body.classList.add('chat-on');if(threadId){CH.cur=threadId;CH.view='thread';loadMsgs(true)}else if(CH.view==='thread'&&CH.cur){loadMsgs(true)}renderChat();loadThreads();clearInterval(CH.timer);CH.timer=setInterval(()=>{if(CH.open&&CH.view==='thread'&&document.visibilityState==='visible')loadMsgs()},3000)}
function closeChat(){CH.open=false;$('#chat').hidden=true;document.body.classList.remove('chat-on');clearInterval(CH.timer)}
async function loadMsgs(reset){
  const id=CH.cur;if(!id)return;const have=CH.msgs.get(id)||[];
  const after=reset?0:(have.length?have[have.length-1].id:0);
  try{const r=await api('/api/chat?a=messages&thread='+encodeURIComponent(id)+'&after='+after);
    let list=reset?r.messages:have.concat(r.messages);
    if(r.deleted&&r.deleted.length)list=list.map(m=>r.deleted.includes(m.id)?Object.assign({},m,{deleted:true,text:''}):m);
    const changed=reset||r.messages.length||(r.deleted||[]).length;CH.msgs.set(id,list);
    const t=CH.threads.find(x=>x.id===id);if(t&&t.unread){t.unread=0;paintChatBadge()}
    if(changed&&CH.view==='thread'&&CH.cur===id)paintMsgs();
  }catch(e){}
}
function renderChat(){
  const el=$('#chat');if(!el||!CH.open)return;
  if(CH.view==='thread'){const t=CH.threads.find(x=>x.id===CH.cur);
    el.innerHTML=`<div class="ch-h"><button class="iconbtn" data-a="chatBack" aria-label="All chats">${ic('back')}</button><div class="ch-title"><b>${esc(threadName(t)||'Chat')}</b><span class="small">${t?(t.kind==='business'?'Business channel · everyone with access':t.kind==='group'?plural((t.members||[]).length,'member'):'Direct message'):''}</span></div>${t&&t.kind==='group'&&(t.createdBy===S.me.id||R().settings)?`<button class="iconbtn" data-a="chatGroupEdit" aria-label="Edit group">${ic('edit')}</button>`:''}<button class="iconbtn" data-a="chatClose" aria-label="Close chat">${ic('close')}</button></div>
      <div class="ch-msgs" id="ch-msgs"></div>
      <form class="ch-in" data-f="chatSend"><textarea id="ch-text" name="text" rows="1" placeholder="Message ${esc(threadName(t)||'')}" aria-label="Message"></textarea><button class="btn pri" type="submit" aria-label="Send">Send</button></form>`;
    paintMsgs();const ta=$('#ch-text');if(ta&&window.innerWidth>700)ta.focus();return}
  if(CH.view==='new'||CH.view==='group'){const isG=CH.view==='group';const editing=isG&&CH.editThread?CH.threads.find(x=>x.id===CH.editThread):null;
    el.innerHTML=`<div class="ch-h"><button class="iconbtn" data-a="chatBack" aria-label="Back">${ic('back')}</button><div class="ch-title"><b>${isG?(editing?'Edit group':'New group'):'New chat'}</b></div><button class="iconbtn" data-a="chatClose" aria-label="Close chat">${ic('close')}</button></div>
    <div class="ch-body">${isG?`<form data-f="chatGroup" class="stack" style="padding:12px"><input type="hidden" name="thread" value="${esc(editing?editing.id:'')}">${fld('Group name',inp('gname',editing?editing.name:'',{req:true,ph:'e.g. Kokapet launch team'}))}<div class="small muted">Members</div>${checks('members',CH.users.filter(u=>u.id!==S.me.id).map(u=>({v:u.id,l:u.name+(u.owner?' · '+u.owner:'')})),editing?editing.members:[])}<button class="btn pri" type="submit">${editing?'Save group':'Create group'}</button></form>`
      :`<div class="list">${CH.users.filter(u=>u.id!==S.me.id).map(u=>`<button class="li ch-t" data-a="chatDM" data-id="${u.id}"><div class="avatar sm">${esc(initials(u.name))}</div><div class="main-t"><div class="t">${esc(u.name)}</div><div class="s">${esc(u.owner||'Staff')}</div></div></button>`).join('')||'<div class="np-empty">Add team members in Setup → Owners & team to chat with them.</div>'}</div>`}</div>`;return}
  const sec=(title,list)=>list.length?`<div class="np-sec">${title}</div>${list.map(t=>`<button class="li ch-t" data-a="chatOpen" data-id="${esc(t.id)}"><div class="avatar sm ${t.kind==='business'?'biz':''}">${t.kind==='business'?'#':esc(initials(threadName(t)))}</div><div class="main-t"><div class="t">${esc(threadName(t))}</div><div class="s">${t.last?(t.last.deleted_at?'<i>Message deleted</i>':esc((t.last.who||'')+': '+t.last.text)):'No messages yet'}</div></div>${t.unread?`<span class="badge">${t.unread}</span>`:''}</button>`).join('')}`:'';
  el.innerHTML=`<div class="ch-h"><div class="ch-title"><b>Team chat</b></div><button class="btn sm" data-a="chatNew">New chat</button><button class="btn sm" data-a="chatNewGroup">New group</button><button class="iconbtn" data-a="chatClose" aria-label="Close chat">${ic('close')}</button></div>
  <div class="ch-body">${sec('Business channels',CH.threads.filter(t=>t.kind==='business'))}${sec('Direct messages',CH.threads.filter(t=>t.kind==='direct'))}${sec('Groups',CH.threads.filter(t=>t.kind==='group'))}${CH.threads.length?'':'<div class="np-empty">Loading chats…</div>'}</div>`;
}
function paintMsgs(){
  const box=$('#ch-msgs');if(!box)return;const list=CH.msgs.get(CH.cur)||[];const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<60;
  let lastDay='';
  box.innerHTML=list.length?list.map(m=>{const mine=m.userId===S.me.id;const d=new Date(m.at);const day=d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});const sep=day!==lastDay?`<div class="ch-day">${day}</div>`:'';lastDay=day;
    return `${sep}<div class="msg ${mine?'me':''} ${m.deleted?'del':''}">${!mine?`<div class="msg-who">${esc(m.who||'')}</div>`:''}<div class="msg-b">${m.deleted?'<i>This message was deleted</i>':esc(m.text)}</div><div class="msg-m">${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}${(mine||R().settings)&&!m.deleted?` · <button class="linkbtn" data-a="chatDel" data-id="${m.id}">${CH.confirmDel===m.id?'Tap again to delete':'Delete'}</button>`:''}</div></div>`}).join(''):'<div class="np-empty">No messages yet. Say hello.</div>';
  if(atBottom||!box.dataset.init){box.scrollTop=box.scrollHeight;box.dataset.init='1'}
}
async function chatSend(fd){
  const text=String(fd.get('text')||'').trim();if(!text||!CH.cur)return;const ta=$('#ch-text');if(ta)ta.value='';
  try{const r=await api('/api/chat?a=send',{method:'POST',body:{thread:CH.cur,text}});const l=CH.msgs.get(CH.cur)||[];if(!l.some(m=>m.id===r.message.id))l.push(r.message);CH.msgs.set(CH.cur,l);paintMsgs();const b=$('#ch-msgs');if(b)b.scrollTop=b.scrollHeight}
  catch(e){toast(e.message);if(ta)ta.value=text}
}

/* ============ team & account ============ */
async function loadUsers(){S._usersLoading=true;try{const r=await api('/api/users');S.users=r.users;S.companies=r.companies||[]}catch(e){S.users=[];toast(e.message)}S._usersLoading=false;if(S.route.v==='settings'||S.route.v==='setup')render()}
async function loadAudit(){S._auditLoading=true;try{S.auditRows=(await api('/api/audit')).rows}catch(e){S.auditRows=[]}S._auditLoading=false;if(S.route.v==='settings'||S.route.v==='setup')render()}
async function updateUser(patch){
  try{const r=await api('/api/users',{method:'PATCH',body:patch});S.users=(S.users||[]).map(u=>u.id===r.user.id?r.user:u);if(r.user.id===S.me.id)applyMe(r.user);toast('Saved');closeSheet();render()}
  catch(e){toast(e.message);render()}
}
const genPw=()=>{const a='abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';const b=new Uint32Array(12);crypto.getRandomValues(b);return [...b].map(n=>a[n%a.length]).join('')};
function userAdd(){
  openSheet({title:'Add a team member',form:'userAdd',body:`<div class="form">
    ${fld('Name',inp('name','',{req:true}))}${fld('Email (used to sign in)',inp('email','',{req:true,mode:'email'}))}
    ${fld('Role',selI('role',roleOpts(),'entry',null),{hint:'Define roles and what they can do in Setup → Roles.'})}
    ${fld('Acts as owner',selI('owner',[{v:'__new__',l:'New owner name: their own name'},...S.config.owners],'','Staff (not an owner)'),{hint:'People, leads and follow-ups are assigned to owner names. A Manager sees only what is assigned to their owner name, so a Manager left as Staff gets their own.'})}
    ${(S.companies||[]).length>1?fld('Company',selI('companyId',S.companies.map(c=>({v:String(c.id),l:c.name})),String(S.me.companyId||''),null),{hint:'They sign in at this company. Every company of the network sees the same data.'}):''}
    ${fld('Temporary password',inp('password',genPw()),{full:true,hint:'Share it with them privately. They must choose their own password the first time they sign in. Not used if they already have a login in this company.'})}
  </div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Add</button>'});
}
function userMenu(id){
  const u=(S.users||[]).find(x=>x.id===id);if(!u)return;
  openSheet({title:u.name||u.email,body:`<div class="stack"><div class="muted">${esc(u.email)} · ${esc(ROLES[u.role].label)}${u.owner?' · '+esc(u.owner):''}</div>
    <div class="row"><button class="btn pri" data-a="userEdit" data-id="${id}">Edit name & email</button><button class="btn" data-a="userAccess" data-id="${id}">Access & permissions</button><button class="btn" data-a="userPw" data-id="${id}">Reset password</button>${u.totpEnabled?`<button class="btn" data-a="userTotp" data-id="${id}">Reset two-step sign-in</button>`:''}${u.id!==S.me.id?`<button class="btn ${u.active?'danger':''}" data-a="userToggle" data-id="${id}" data-v="${u.active?'0':'1'}">${u.active?'Disable account':'Enable account'}</button>`:''}</div>
    <div class="small muted">Disabling signs them out everywhere and keeps their history.</div></div>`});
}
function userEdit(id){
  const u=(S.users||[]).find(x=>x.id===id);if(!u)return;
  openSheet({title:'Edit team member',form:'userEdit',body:`<input type="hidden" name="id" value="${esc(id)}"><div class="form">
    ${fld('Name',inp('name',u.name||'',{req:true,ph:'Full name'}),{full:true})}
    ${fld('Email (used to sign in)',inp('email',u.email,{req:true,mode:'email'}),{full:true,hint:'If you change it, they sign in with the new email from now on. Their password stays the same.'})}
    <div class="full small muted">The owner name they act as is set in the team list (the second dropdown).</div></div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save</button>'});
}
function userAccess(id){
  const u=(S.users||[]).find(x=>x.id===id);if(!u)return;const role=ROLES[u.role]||ROLES.readonly;const pm=u.perms||{};
  const val=(k,def)=>typeof pm[k]==='boolean'?pm[k]:def;
  openSheet({title:'Access · '+(u.name||u.email),form:'userAccess',body:`<input type="hidden" name="id" value="${esc(id)}"><div class="stack">
    <div><b>Role:</b> ${esc(role.label)} <span class="small muted">(change the role from the team list)</span></div>
    ${fld('Businesses they can work on',checks('biz',businesses().map(b=>({v:b.id,l:b.name})),u.businesses||[]),{hint:'Leave all unticked for access to every business. Leads, chits and property of other businesses are hidden from them, and so are those business chat channels.'})}
    <div class="small muted">Permissions</div>
    <label class="check"><input type="checkbox" name="p_export" ${val('export',role.exp)?'checked':''}> Can export data</label>
    <label class="check"><input type="checkbox" name="p_campaigns" ${val('campaigns',role.camp)?'checked':''}> Can see and build campaigns</label>
    <label class="check"><input type="checkbox" name="p_send" ${val('send',role.send)?'checked':''}> Can mark campaigns as sent</label>
    <div class="note small">Owners always have full access. Managers only ever see people assigned to their owner name.</div></div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Save access</button>'});
}
function userPw(id){const pw=genPw();openSheet({title:'Reset password',form:'userPw',body:`<input type="hidden" name="id" value="${esc(id)}">${fld('New temporary password',inp('password',pw),{hint:'Share it privately. Their other sessions are signed out.'})}`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Set password</button>'})}
function pwForm(){openSheet({title:'Change password',form:'pw',body:`<div class="form">${fld('Current password',inp('current','',{type:'password',req:true}),{full:true})}${fld('New password',inp('next','',{type:'password',req:true}),{full:true,hint:'At least 10 characters. Not all numbers, not a common password, not your name or email. Your other devices are signed out.'})}</div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Change password</button>'})}
async function totpOn(){
  try{const r=await api('/api/auth?a=totp-start',{method:'POST',body:{}});
    openSheet({title:'Turn on two-step sign-in',form:'totp',body:`<div class="stack"><p>Scan this with Google Authenticator, Microsoft Authenticator or any authenticator app, then enter the 6-digit code it shows.</p><img src="${r.qr}" alt="QR code for your authenticator app" width="220" height="220" style="background:#fff;padding:8px;border-radius:8px;align-self:center"><div class="small muted">Can't scan? Enter this key: <span class="code">${esc(r.secret)}</span></div>${fld('Code from the app',inp('code','',{mode:'numeric',req:true,ph:'123456'}))}</div>`,foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn pri" type="submit">Turn on</button>'})}
  catch(e){toast(e.message)}
}
function totpOff(){openSheet({title:'Turn off two-step sign-in',form:'totpOff',body:fld('Current code from your authenticator app',inp('code','',{mode:'numeric',req:true})),foot:'<button type="button" class="btn" data-a="closeSheet">Cancel</button><button class="btn danger" type="submit">Turn off</button>'})}
async function logout(){
  if(Q.size&&!S._forceLogout){S._forceLogout=true;return toast(`${Q.size} change(s) have not reached the server yet. Connect to the internet, or press Sign out again to discard them.`)}
  await unsubscribePush();
  Q.clear();LS.del('queue');LS.del('queueUser');await IDB.clear();
  try{ENV.logout()}catch(e){location.replace('/')}
}
async function accountSubmit(k,fd){
  if(k==='userAdd'){let owner=String(fd.get('owner')||'');const nm=String(fd.get('name')||'').trim();
    // a Manager with no owner name would see nothing at all: give them their own
    if(owner==='__new__'||(!owner&&!roleOf(String(fd.get('role'))).perms.all))owner=nm;
    if(owner&&!S.config.owners.includes(owner))await saveConfig({owners:S.config.owners.concat(owner)});
    const r=await api('/api/users',{method:'POST',body:{name:fd.get('name'),email:fd.get('email'),role:fd.get('role'),owner,password:fd.get('password'),companyId:fd.get('companyId')||S.me.companyId}});S.users=(S.users||[]).filter(u=>u.id!==r.user.id).concat(r.user);closeSheet();render();
    const link=location.origin+(r.loginUrl||'');
    if(r.existing){openSheet({title:'Access given',body:`<p>${esc(r.user.name||r.user.email)} already had a login. They can open the app at <b>${esc(link)}</b> with their own password.</p>`});return}
    openSheet({title:'Account created',body:`<p>Send these details to ${esc(r.user.name||r.user.email)} privately:</p><div class="msg-preview">Link: ${esc(link)}\nEmail: ${esc(r.user.email)}\nTemporary password: ${esc(fd.get('password'))}</div><div class="row" style="margin-top:10px"><button class="btn" data-a="copyText" data-v="${esc(`Link: ${link}\nEmail: ${r.user.email}\nTemporary password: ${fd.get('password')}`)}">${ic('copy')}Copy</button></div>`});return}
  if(k==='userPw'){await updateUser({id:fd.get('id'),password:fd.get('password')});toast('Password set to '+fd.get('password'));return}
  if(k==='pw'){const r=await api('/api/auth?a=password',{method:'POST',body:{current:fd.get('current'),next:fd.get('next')}});setToken(r.token);closeSheet();toast('Password changed. Your other devices are signed out.');return}
  if(k==='totp'){const r=await api('/api/auth?a=totp-enable',{method:'POST',body:{code:fd.get('code')}});setToken(r.token);S.me.totpEnabled=true;closeSheet();render();toast('Two-step sign-in is on');return}
  if(k==='totpOff'){await api('/api/auth?a=totp-disable',{method:'POST',body:{code:fd.get('code')}});S.me.totpEnabled=false;closeSheet();render();toast('Two-step sign-in is off');return}
}

/* ============ documents: open with the sign-in token ============ */
async function openDoc(id){
  const doc=D.docs.get(id);const w=window.open('','_blank');
  try{
    const r=await fetch(apiUrl('/api/files?id='+encodeURIComponent(id)),{headers:authHeaders(),credentials:'omit',cache:'no-store'});
    if(!r.ok){let j={};try{j=await r.json()}catch(e){}throw new Error(j.error||j.message||'The document could not be opened.')}
    const blob=await r.blob();const url=URL.createObjectURL(blob);
    if(w&&/^(application\/pdf|image\/(png|jpe?g|webp|gif))$/.test(blob.type)){w.location.href=url}
    else{if(w)w.close();const a=document.createElement('a');a.href=url;a.download=(doc&&doc.name)||'document';document.body.appendChild(a);a.click();a.remove()}
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(e){if(w)w.close();toast(e.code==='offline'||e instanceof TypeError?'You are offline. Documents need a connection.':e.message)}
}

/* ============ branding tab (owners) ============ */
// the built-in palette (app.css), shown for any colour a customer has not set
const LIGHT_DEFAULTS={bg:'#EFF6F9',surface:'#FFFFFF',surface2:'#E3F0F5',ink:'#0D2A33',muted:'#4A6873',line:'#D2E3EA',accent:'#08809A',accent2:'#0B97B0',accentSoft:'#D8EEF4',accentInk:'#FFFFFF',brandInk:'#0B6B80',gold:'#FFD60A',gold2:'#D9AE00',goldSoft:'#FFF5C2',goldInk:'#3D3100'};
const DARK_DEFAULTS={bg:'#08171D',surface:'#0E2229',surface2:'#143039',ink:'#E2F0F4',muted:'#93B1BA',line:'#1E3D47',accent:'#3CC0D6',accent2:'#62D0E2',accentSoft:'#103A45',accentInk:'#04191F',brandInk:'#6FD3E3',gold:'#FFD60A',gold2:'#E3B800',goldSoft:'#3A3209',goldInk:'#FFE873'};
const BRAND_FIELDS=[['accent','Main colour','Buttons, links, the selected menu item'],['accent2','Main colour, lighter','Hover and highlights'],['accentSoft','Main colour, pale','Selected backgrounds'],['accentInk','Text on the main colour',''],['brandInk','Wordmark and headings',''],['gold','Second colour','The quick-add button and badges'],['gold2','Second colour, deeper','Markers and borders'],['goldSoft','Second colour, pale','Picked filters'],['goldInk','Text on the second colour',''],['bg','Page background',''],['surface','Panels',''],['surface2','Panels, shaded',''],['ink','Text',''],['muted','Quiet text',''],['line','Lines and borders','']];
const cssVar=(name)=>getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function brandingTab(){
  const b=S.brand||{};const w=b.wordmark||{};const draft=S.brandDraft||(S.brandDraft={logo:b.logo||''});
  const colorRow=(set,k,label,hint)=>{const cur=((b[set]||{})[k])||(set==='colors'?LIGHT_DEFAULTS:DARK_DEFAULTS)[k]||'#000000';const val=/^#[0-9a-fA-F]{6}$/.test(cur)?cur:'#000000';const isSet=!!((b[set]||{})[k]);
    return `<label class="field"><span>${esc(label)}</span><span class="row" style="gap:8px;flex-wrap:nowrap"><input type="color" name="${set}_${k}" value="${esc(val)}" style="width:44px;height:32px;padding:0;border:1px solid var(--line);border-radius:6px;background:none"><span class="small muted num">${esc(val.toUpperCase())}${!isSet?' (default)':''}</span></span>${hint?`<span class="hint">${esc(hint)}</span>`:''}</label>`};
  return `<form data-f="brandForm" class="stack">
    <div class="grid g2">${panel('Name and logo',`<div class="form">
      ${fld('App name',inp('appName',b.appName||'',{ph:'e.g. NorthEast Network'}),{full:true,hint:'Shown in the browser tab and on alerts.'})}
      ${fld('Short name',inp('shortName',b.shortName||'',{ph:'e.g. NorthEast'}),{hint:'Used in sentences such as “messages from …”.'})}
      ${fld('Wordmark, first part',inp('wa',w.a||'',{ph:'e.g. north'}))}
      ${fld('Wordmark, second part',inp('wb',w.b||'',{ph:'e.g. east'}))}
      ${fld('Line under the wordmark',inp('wsub',w.sub||'',{ph:'e.g. Network'}))}
      <div class="field full"><span>Logo</span><div class="row" style="gap:12px;align-items:center">${draft.logo?`<img src="${esc(draft.logo)}" alt="Logo" style="width:56px;height:56px;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:var(--surface)">`:'<span class="small muted">No logo: the initials of the app name are shown.</span>'}<label class="btn sm">${ic('import')}Upload<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-c="brandLogo" hidden></label>${draft.logo?'<button type="button" class="btn sm ghost" data-a="brandLogoClear">Remove</button>':''}</div><span class="hint">PNG, JPEG, WebP or SVG, up to 300 KB. A square picture works best.</span></div>
    </div>`)}
    ${panel('Preview',`<div class="stack"><div style="padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface)">${brandHTML()}</div><p class="small muted" style="margin:0">Every company of ${esc((S.customer&&S.customer.name)||'this network')} sees the same branding. Save to apply it.</p></div>`)}</div>
    <div class="grid g2">${panel('Colours',`<div class="form">${BRAND_FIELDS.map(([k,l,h])=>colorRow('colors',k,l,h)).join('')}</div>`)}
    ${panel('Colours in dark mode',`<p class="small muted" style="margin-top:0">Used when the phone or computer is set to dark mode.</p><div class="form">${BRAND_FIELDS.map(([k,l])=>colorRow('dark',k,l,'')).join('')}</div>`)}</div>
    <div class="row"><button class="btn pri" type="submit">Save branding</button><button type="button" class="btn ghost" data-a="brandReset">Undo changes</button></div>
  </form>`;
}
async function saveBrandForm(fd){
  const b=S.brand||{};const pick=set=>{const o={};BRAND_FIELDS.forEach(([k])=>{const v=String(fd.get(set+'_'+k)||'').toUpperCase();const was=((b[set]||{})[k]||'').toUpperCase();
    // a dark colour nobody chose stays unset unless it was changed here
    if(!was){const def=((set==='colors'?LIGHT_DEFAULTS:DARK_DEFAULTS)[k]||'').toUpperCase();if(!v||v===def)return}
    if(/^#[0-9A-F]{6}$/.test(v))o[k]=v});return o};
  const next={appName:String(fd.get('appName')||'').trim(),shortName:String(fd.get('shortName')||'').trim(),wordmark:{a:String(fd.get('wa')||'').trim(),b:String(fd.get('wb')||'').trim(),sub:String(fd.get('wsub')||'').trim()},colors:pick('colors'),dark:Object.assign({},b.dark||{},pick('dark'))};
  const logo=(S.brandDraft&&S.brandDraft.logo)||'';if(logo)next.logo=logo;
  const r=await api('/api/brand',{method:'PUT',body:{brand:next}});S.brandDraft=null;applyBrand(r.brand);saveSnapshot();render();toast('Branding saved');
}

/* ============ push: alerts when the app is closed ============ */
// The service worker is registered by the platform page (crm-sw.js, scope /);
// this page only subscribes it, so the server can send this device a push.
const b64u=s=>{const p='='.repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))};
async function subscribePush(){
  try{
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||Notification.permission!=='granted')return false;
    const reg=await navigator.serviceWorker.getRegistration('/');if(!reg)return false;
    const {key}=await api('/api/push/key');if(!key)return false;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(key)});
    await api('/api/push/subscribe',{method:'POST',body:{subscription:sub.toJSON()}});
    return true;
  }catch(e){console.warn('push',e);return false}
}
async function unsubscribePush(){try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg&&await reg.pushManager.getSubscription();if(sub)await api('/api/push/unsubscribe',{method:'POST',body:{endpoint:sub.endpoint}})}catch(e){}}

/* ============ voice notes ============ */
let rec=null;
function dictate(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;const ta=$('#fm-summary');const b=$('[data-a=mic]');
  if(!SR||!ta)return toast('Voice typing is not supported in this browser. Use your keyboard’s microphone instead.');
  if(rec){rec.stop();return}
  rec=new SR();rec.lang=($('#fm-lang')||{}).value||'en-IN';rec.interimResults=false;rec.continuous=true;
  rec.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)ta.value=(ta.value?ta.value.trimEnd()+' ':'')+e.results[i][0].transcript.trim()};
  rec.onend=()=>{rec=null;if(b)b.textContent='🎙 Dictate'};rec.onerror=e=>{toast(e.error==='not-allowed'?'Allow microphone access to dictate.':'Voice typing stopped.')};
  rec.start();if(b)b.textContent='■ Stop';
}

/* ============ sign-in screens ============ */
function showAuth(mode,msg){
  S.authMode=mode;document.body.classList.add('auth-on');
  const root=$('#auth');root.hidden=false;
  const head=`<div style="padding:0 0 18px">${brandHTML()}</div>`;
  if(mode==='code'){root.innerHTML=`<form class="auth-card" data-f="code">${head}<h1>Two-step sign-in</h1><p class="muted">Enter the 6-digit code from your authenticator app.</p>${fld('Code',inp('code','',{mode:'numeric',req:true,ph:'123456'}))}<div class="auth-msg" id="auth-msg">${esc(msg||'')}</div><button class="btn pri" type="submit">Continue</button><button type="button" class="btn ghost" data-a="logout">Sign out</button><p class="small muted">Lost your phone? Ask an owner to reset your two-step sign-in in Setup → Owners & team.</p></form>`;const f=root.querySelector('input');if(f)setTimeout(()=>f.focus(),30);return}
  if(mode==='newpw'){root.innerHTML=`<form class="auth-card" data-f="newpw">${head}<h1>Choose your own password</h1><p class="muted">Your password was set for you. Choose a new one before you continue. It signs you out on every other device.</p>${fld('Current password',inp('current','',{type:'password',req:true}))}${fld('New password',inp('next','',{type:'password',req:true}),{hint:'At least 10 characters. Not all numbers, not a common password, not your name or email.'})}${fld('New password again',inp('again','',{type:'password',req:true}))}<div class="auth-msg" id="auth-msg">${esc(msg||'')}</div><button class="btn pri" type="submit">Save and continue</button><button type="button" class="btn ghost" data-a="logout">Sign out</button></form>`;const f=root.querySelector('input');if(f)setTimeout(()=>f.focus(),30);return}
  if(mode==='login'){root.hidden=true;document.body.classList.remove('auth-on');authLost();return}
  if(mode==='blocked'){root.innerHTML=`<div class="auth-card">${head}<h1>Can't open this app</h1><p class="muted">${esc(msg||'You do not have access.')}</p><button class="btn pri" data-a="leaveApp">Back to my apps</button></div>`;return}
  if(mode==='setup')root.innerHTML=`<form class="auth-card" data-f="setup">${head}<h1>Set up NorthEast Network</h1><p class="muted">Create the first owner account. You can add the other owners and staff after signing in.</p>
    ${fld('Your name',inp('name','',{req:true,ph:'e.g. Shaurya'}))}${fld('Your name as one of the three owners',inp('owner','',{ph:'Shown on records and follow-ups'}))}${fld('Email',inp('email','',{req:true,mode:'email'}))}${fld('Password',inp('password','',{type:'password',req:true}),{hint:'At least 8 characters.'})}
    <div class="auth-msg" id="auth-msg">${esc(msg||'')}</div><button class="btn pri" type="submit">Create owner account</button></form>`;
  else if(mode==='offline')root.innerHTML=`<div class="auth-card">${head}<h1>You're offline</h1><p class="muted">Connect to the internet to sign in. Once signed in on this device, the app also opens offline.</p><button class="btn pri" data-a="reload">Try again</button></div>`;
  else root.innerHTML=`<form class="auth-card" data-f="login">${head}<h1>Sign in</h1>
    ${fld('Email',inp('email',S._lastEmail||'',{req:true,mode:'email'}))}${fld('Password',inp('password','',{type:'password',req:true}))}
    <div id="code-wrap" ${S._needCode?'':'hidden'}>${fld('6-digit code from your authenticator app',inp('code','',{mode:'numeric',ph:'123456'}))}</div>
    <div class="auth-msg" id="auth-msg">${esc(msg||'')}</div><button class="btn pri" type="submit">Sign in</button><p class="small muted">Forgot your password? Ask an owner to reset it in Settings → Team & roles.</p></form>`;
  const f=root.querySelector('input');if(f)setTimeout(()=>f.focus(),30);
}
function hideAuth(){document.body.classList.remove('auth-on');$('#auth').hidden=true;$('#auth').innerHTML=''}
async function authSubmit(k,fd){
  const msg=$('#auth-msg');
  try{
    if(k==='code'){const r=await api('/api/auth?a=totp-verify',{method:'POST',body:{code:fd.get('code')}});setToken(r.token);hideAuth();return boot()}
    if(k==='newpw'){if(fd.get('next')!==fd.get('again')){msg.textContent='The two new passwords are not the same.';return}const r=await api('/api/auth?a=password',{method:'POST',body:{current:fd.get('current'),next:fd.get('next')}});setToken(r.token);hideAuth();toast('Password changed. Other devices are signed out.');return boot()}
    if(k==='setup'){const r=await api('/api/auth?a=setup',{method:'POST',body:{name:fd.get('name'),owner:fd.get('owner'),email:fd.get('email'),password:fd.get('password')}});return startSession(r.user)}
    S._lastEmail=fd.get('email');
    const r=await api('/api/auth?a=login',{method:'POST',body:{email:fd.get('email'),password:fd.get('password'),code:fd.get('code')||''}});
    if(r.needCode){S._needCode=true;$('#code-wrap').hidden=false;$('#fm-code').focus();msg.textContent='Enter the code from your authenticator app.';return}
    S._needCode=false;startSession(r.user);
  }catch(e){msg.textContent=e.message;if(/code/i.test(e.message)){S._needCode=true;const w=$('#code-wrap');if(w)w.hidden=false}}
}

/* ============ boot ============ */
let pollTimer=null;
async function startSession(user){
  const qUser=LS.get('queueUser',null);if(qUser&&qUser!==user.id&&Q.size){Q.clear();saveQ()}LS.set('queueUser',user.id);
  const prev=await IDB.get('snap');
  applyMe(user);hideAuth();
  const prevAllowed=prev&&prev.config&&(prev.config.deviceCopy==='all'||(prev.config.deviceCopy==='owners'&&user.role==='admin'));
  if(prev&&!prevAllowed)IDB.clear();
  if(prev&&prevAllowed&&prev.v===3&&prev.me&&prev.me.id===user.id&&prev.me.role===user.role&&prev.me.owner===user.owner&&String(prev.me.businesses||[])===String(user.businesses||[])){
    TYPES.forEach(t=>D[t]=new Map((prev.data[t]||[]).map(r=>[r.id,r])));S.config=Object.assign(clone(DEFAULT_CONFIG),prev.config||{});S.cursor=prev.cursor;
    for(const o of Q.values()){if(!D[o.t])continue;if(o.x)D[o.t].delete(o.i);else D[o.t].set(o.i,o.d)}
    S.ready=true;derive();render();armBack();pull(false);
  }else{
    S.ready=true;S.loading=true;render();armBack();await pull(true);S.loading=false;
  }
  flush();
  // the platform page passes a link from a tapped alert; later taps arrive through openLinkHandler
  try{ENV.openLinkHandler=openLink;if(ENV.initialLink){const l=ENV.initialLink;ENV.initialLink=null;setTimeout(()=>openLink(l),400)}}catch(e){}
  if('Notification' in window&&Notification.permission==='granted')subscribePush();
  clearInterval(pollTimer);pollTimer=setInterval(()=>{if(S.authed){if(document.visibilityState==='visible')pull(false);if(Q.size)flush();pollNotify();loadThreads()}},20000);
  pollNotify();loadThreads();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.authed)pull(false)});
window.addEventListener('online',()=>{if(S.authed){flush();pull(false)}});
window.addEventListener('offline',()=>setOffline(true));
async function boot(){
  let me;
  try{me=await api('/api/auth?a=me')}
  catch(e){
    if(e.code==='offline'){const snap=await IDB.get('snap');if(snap&&snap.v===3&&snap.me){if(snap.brand)applyBrand(snap.brand,snap.customer);applyMe(snap.me);S.authed=true;TYPES.forEach(t=>D[t]=new Map((snap.data[t]||[]).map(r=>[r.id,r])));for(const o of Q.values()){if(!D[o.t])continue;if(o.x)D[o.t].delete(o.i);else D[o.t].set(o.i,o.d)}S.config=Object.assign(clone(DEFAULT_CONFIG),snap.config||{});S.cursor=snap.cursor;S.ready=true;derive();render();setOffline(true);return}return showAuth('offline')}
    if(e.status===401)return; // the platform page is taking them to sign in
    // signed in at the other company of the same network: open it there instead
    if(e.status===403&&/not belong to this company/i.test(e.message)){try{if(await ENV.toOwnCompany())return}catch(x){}return showAuth('blocked','You are signed in to a different company. Sign out and sign in again here, or go back to your own apps.')}
    return showAuth('blocked',e.status>=500||!e.status?'The server could not be reached. Try again in a moment.':e.message);
  }
  applyBrand(me.brand,me.customer);
  if(me.needCode)return showAuth('code');
  if(me.mustChangePassword){S._pwUser=me.user;return showAuth('newpw')}
  startSession(me.user);
}
boot();
})();
