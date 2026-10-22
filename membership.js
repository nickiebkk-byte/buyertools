import {connect} from './spark-data.mjs';
const MC=['AU','BC','BD','BM','BR','DH','DW','EC','ET','FC','FD','FT','GD','HO','HT','HW','IT','KC','LT','MA','OL','PA','PB','PE','PT','SA','VS','CO MC'];
const $=id=>document.getElementById(id),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=window.BUYERBUDDY_CONFIG||{},preview=window.BUYERBUDDY_PREVIEW===true;
const statuses={pending:'รออนุมัติ',approved:'อนุมัติแล้ว',rejected:'ไม่อนุมัติ',suspended:'ระงับ'};
let dataAdapter,memberUnsubscribe=null,connectionUnsubscribe=null;
let auth,sdk,me=null,members=[],selected=null,busy=false,authFlow=false,appLoaded=false,lockTimer=null;
const number=n=>Number(n||0).toLocaleString('th-TH',{maximumFractionDigits:1});
const date=n=>n?new Date(n).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Bangkok'}):'—';
const day=(offset=0)=>new Date(Date.now()+7*3600000+offset*86400000).toISOString().slice(0,10);
for(const el of document.querySelectorAll('.mc-options'))el.insertAdjacentHTML('beforeend',MC.map(m=>`<option>${E(m)}</option>`).join(''));
$('startDate').value=day(-29);$('endDate').value=day();
function screen(id){for(const name of ['authScreen','waitingScreen','adminScreen','calculatorScreen'])$(name).hidden=name!==id;}
function notify(id,message){$(id).textContent=message;}
function errorMessage(e){const map={'auth/invalid-credential':'อีเมลหรือรหัสผ่านไม่ถูกต้อง','auth/email-already-in-use':'อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ','auth/weak-password':'รหัสผ่านยังไม่ผ่านเกณฑ์ความปลอดภัย','auth/too-many-requests':'ทำรายการถี่เกินไป กรุณารอสักครู่','auth/popup-closed-by-user':'ปิดหน้าต่าง GOOGLE แล้ว','auth/unauthorized-domain':'เว็บไซต์ยังไม่ได้เพิ่มใน AUTHORIZED DOMAINS','auth/network-request-failed':'เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ต'};return map[e.code]||e.message||'ทำรายการไม่สำเร็จ';}
function configured(){return Boolean(cfg.firebase?.apiKey&&cfg.firebase?.projectId&&cfg.firebase?.authDomain&&cfg.firebase?.appId&&cfg.firebase?.databaseURL);}
function needConfig(){if(!auth)throw Error('ยังไม่ได้เชื่อม Firebase กรุณาตั้งค่าก่อนใช้งานจริง');}
async function api(action,data={}){needConfig();if(!dataAdapter)throw Error('กำลังเชื่อมฐานข้อมูล');return dataAdapter.api(action,data);}
function stopApp(){memberUnsubscribe?.();memberUnsubscribe=null;appLoaded=false;$('calculatorFrame').srcdoc='';clearInterval(lockTimer);lockTimer=null;}
function authTab(register){$('loginForm').hidden=register;$('registerForm').hidden=!register;$('completeProfile').hidden=true;$('loginTab').setAttribute('aria-pressed',String(!register));$('registerTab').setAttribute('aria-pressed',String(register));notify('authMessage','');}
$('loginTab').onclick=()=>authTab(false);$('registerTab').onclick=()=>authTab(true);
async function formTask(form,fn,messageId='authMessage'){
  if(busy)return;busy=true;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);notify(messageId,'กำลังดำเนินการ…');
  try{await fn();notify(messageId,'');}catch(e){notify(messageId,errorMessage(e));}finally{busy=false;buttons.forEach(b=>b.disabled=false);}
}
$('loginForm').onsubmit=e=>{e.preventDefault();formTask(e.currentTarget,async()=>{needConfig();const v=Object.fromEntries(new FormData($('loginForm')));await sdk.signInWithEmailAndPassword(auth,v.email.trim(),v.password);});};
$('registerForm').onsubmit=e=>{e.preventDefault();formTask(e.currentTarget,async()=>{
  needConfig();const v=Object.fromEntries(new FormData($('registerForm')));if(!/^[a-zA-Z0-9._%+-]+@homepro[.]co[.]th$/i.test(v.email.trim()))throw Error('ใช้อีเมล @homepro.co.th เท่านั้น');if(v.password!==v.confirmPassword)throw Error('รหัสผ่านทั้งสองช่องต้องตรงกัน');
  authFlow=true;try{const {user}=await sdk.createUserWithEmailAndPassword(auth,v.email.trim(),v.password);await api('register',{fullName:v.fullName,employeeId:v.employeeId,mc:v.mc});await sdk.sendEmailVerification(user);}finally{authFlow=false;await refresh();}
});};
$('completeProfile').onsubmit=e=>{e.preventDefault();formTask(e.currentTarget,async()=>{await api('register',Object.fromEntries(new FormData($('completeProfile'))));if(!auth.currentUser.emailVerified)await sdk.sendEmailVerification(auth.currentUser);await refresh();});};
$('googleAdmin').onclick=async()=>{try{needConfig();const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({login_hint:'nickiebkk@gmail.com',prompt:'select_account'});await sdk.signInWithPopup(auth,provider);}catch(e){notify('authMessage',errorMessage(e));}};
$('resetPassword').onclick=async()=>{try{needConfig();const email=$('loginForm').elements.email.value.trim();if(!email)throw Error('กรอกอีเมลในช่องอีเมลก่อน');await sdk.sendPasswordResetEmail(auth,email);notify('authMessage','หากมีบัญชีนี้ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจอีเมล');}catch(e){notify('authMessage',errorMessage(e));}};
$('logout').onclick=async()=>{stopApp();try{if(auth)await sdk.signOut(auth);}catch(e){notify('authMessage',errorMessage(e));}screen('authScreen');};
$('resendVerification').onclick=async()=>{try{await sdk.sendEmailVerification(auth.currentUser);$('waitingText').textContent='ส่งอีเมลยืนยันแล้ว กรุณาตรวจกล่องจดหมายและ SPAM';}catch(e){$('waitingText').textContent=errorMessage(e);}};
$('refreshStatus').onclick=()=>refresh();
async function refresh(){
  if(!auth?.currentUser)return;try{
    await sdk.reload(auth.currentUser);await auth.currentUser.getIdToken(true);
    const email=auth.currentUser.email||'';$('accountName').textContent=email;$('logout').hidden=false;
    if(!auth.currentUser.emailVerified){screen('waitingScreen');$('waitingTitle').textContent='ยืนยันอีเมลก่อนครับ';$('waitingText').textContent='เปิดลิงก์ยืนยันในอีเมล '+email+' แล้วกดตรวจสถานะอีกครั้ง';$('resendVerification').hidden=false;return;}
    me=await api('status');$('resendVerification').hidden=true;$('adminEntry').hidden=!me.isAdmin;$('appEntry').hidden=me.profile?.status!=='approved';
    if(!me.profile){screen('authScreen');$('loginForm').hidden=true;$('registerForm').hidden=true;$('completeProfile').hidden=false;return;}
    const status=me.profile.status;if(status!=='approved'){stopApp();screen('waitingScreen');$('waitingTitle').textContent=status==='deleted'?'สมาชิกถูกลบจากแอปแล้ว':statuses[status]||'ยังเข้าใช้งานไม่ได้';$('waitingText').textContent=status==='pending'?'ยืนยันอีเมลแล้ว ขณะนี้รอ ADMIN ตรวจสอบคำขอ':status==='rejected'?'คำขอยังไม่ได้รับอนุมัติ กรุณาติดต่อผู้ดูแลระบบ':'สิทธิ์การใช้งานถูกระงับ กรุณาติดต่อผู้ดูแลระบบ';return;}
    if(me.isAdmin)await openAdmin();else await openApp();
  }catch(e){stopApp();screen('waitingScreen');$('waitingTitle').textContent='ตรวจสอบบัญชีไม่สำเร็จ';$('waitingText').textContent=errorMessage(e);$('resendVerification').hidden=true;}
}
async function openApp(){
  if(preview){notify('adminMessage','นี่คือภาพตัวอย่าง ยังไม่เชื่อมระบบสมาชิกจริง');return;}
  screen('calculatorScreen');notify('appMessage','กำลังตรวจสิทธิ์และเปิดเครื่องมือ…');
  try{
    if(!appLoaded){const uid=auth.currentUser.uid;const html=await dataAdapter.loadApp();if(auth.currentUser?.uid!==uid)throw Error('บัญชีเปลี่ยน กรุณาเข้าใหม่');const base=new URL('.',location.href).href;$('calculatorFrame').srcdoc=html.replace('<head>','<head><base href="'+E(base)+'">');appLoaded=true;memberUnsubscribe=dataAdapter.watchMember(uid,m=>{if(m?.status!=='approved'){stopApp();refresh();}},()=>{stopApp();screen('waitingScreen');$('waitingTitle').textContent='ตรวจสิทธิ์ไม่สำเร็จ';$('waitingText').textContent='กรุณาตรวจสถานะสมาชิกอีกครั้ง';});}
    notify('appMessage','');await api('usage',{kind:'session',eventId:crypto.randomUUID()});
    clearInterval(lockTimer);lockTimer=setInterval(async()=>{try{const s=await api('status');if(s.profile?.status!=='approved'){stopApp();await refresh();}}catch{stopApp();screen('waitingScreen');$('waitingTitle').textContent='กรุณาตรวจสถานะอีกครั้ง';$('waitingText').textContent='ไม่สามารถตรวจสิทธิ์ได้ เครื่องมือถูกปิดจนกว่าจะเชื่อมต่อได้';}},60000);
  }catch(e){stopApp();notify('appMessage',errorMessage(e));}
}
$('appEntry').onclick=openApp;
window.addEventListener('message',async e=>{
  if(e.source!==$('calculatorFrame').contentWindow||e.data?.type!=='buyerbuddy-calculation'||!appLoaded)return;
  try{await api('usage',{kind:'calculation',eventId:e.data.eventId,formulaId:e.data.formulaId});}catch(err){if([401,403].includes(err.status)){stopApp();await refresh();}}
});
async function openAdmin(){
  if(!preview&&!me?.isAdmin)return;screen('adminScreen');
  try{if(!preview){members=(await api('members')).members;await loadDashboard();}renderMembers();}catch(e){notify('adminMessage',errorMessage(e));}
}
$('adminEntry').onclick=openAdmin;$('reloadAdmin').onclick=openAdmin;
function adminTab(isMembers){$('dashboardPanel').hidden=isMembers;$('membersPanel').hidden=!isMembers;$('dashboardTab').setAttribute('aria-pressed',String(!isMembers));$('membersTab').setAttribute('aria-pressed',String(isMembers));}
$('dashboardTab').onclick=()=>adminTab(false);$('membersTab').onclick=()=>adminTab(true);
function metric(label,value){return `<div class="kpi"><span>${E(label)}</span><strong>${number(value)}</strong></div>`;}
function renderDashboard(d){
  $('kpis').innerHTML=metric('สมาชิกปัจจุบัน',d.rows.reduce((s,r)=>s+r.members,0))+metric('รออนุมัติ',d.rows.reduce((s,r)=>s+r.pending,0))+metric('ผู้ใช้จริงในช่วงนี้',d.activeUsers)+metric('เข้าใช้งาน (เซสชัน)',d.rows.reduce((s,r)=>s+r.sessions,0))+metric('คำนวณสำเร็จ',d.rows.reduce((s,r)=>s+r.calculations,0));
  const rows=[...d.rows].sort((a,b)=>b.calculations-a.calculations),max=Math.max(1,...rows.map(r=>r.calculations));
  $('mcBars').innerHTML=rows.filter(r=>r.calculations).slice(0,10).map(r=>`<div class="bar-row"><span>${E(r.mc)}</span><div class="bar-track"><div class="bar-fill" style="width:${r.calculations/max*100}%"></div></div><strong>${number(r.calculations)}</strong></div>`).join('')||'<p class="empty">ยังไม่มีการใช้งานในช่วงนี้</p>';
  $('topFormulas').innerHTML=d.formulas.map((r,i)=>`<div class="formula-row"><span>${i+1}. ${E(r.name)}</span><strong>${number(r.count)} ครั้ง</strong></div>`).join('')||'<p class="empty">ยังไม่มีการคำนวณ</p>';
  const maxDay=Math.max(1,...d.trend.map(r=>r.calculations));$('dailyTrend').innerHTML=d.trend.map(r=>`<div class="bar-row"><span>${E(r.day)}</span><div class="bar-track"><div class="bar-fill" style="width:${r.calculations/maxDay*100}%"></div></div><strong>${number(r.calculations)}</strong></div>`).join('')||'<p class="empty">ยังไม่มีข้อมูลรายวัน</p>';
  $('mcTable').innerHTML=d.rows.map(r=>`<tr><th>${E(r.mc)}</th><td>${number(r.members)}</td><td>${number(r.approved)}</td><td>${number(r.pending)}</td><td>${number(r.activeUsers)}</td><td>${number(r.sessions)}</td><td>${number(r.calculations)}</td><td>${number(r.frequency)}</td><td>${date(r.lastUsed)}</td></tr>`).join('');
}
async function loadDashboard(){if(preview)return;const d=await api('dashboard',{start:$('startDate').value,end:$('endDate').value,mc:$('dashboardMc').value});renderDashboard(d);}
$('dashboardFilters').onsubmit=e=>{e.preventDefault();formTask(e.currentTarget,loadDashboard,'adminMessage');};
function renderMembers(){
  const q=$('memberSearch').value.trim().toLowerCase(),mc=$('memberMc').value,status=$('memberStatus').value;
  const list=members.filter(m=>(!mc||m.mc===mc)&&(!status||m.status===status)&&(!q||[m.fullName,m.email,m.employeeId].some(v=>String(v||'').toLowerCase().includes(q)))).sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||b.createdAt-a.createdAt);
  $('memberCount').textContent=`แสดง ${number(list.length)} จาก ${number(members.length)} คน`;
  $('memberList').innerHTML=list.map(m=>`<article class="member-card"><h3>${E(m.fullName)}</h3><span class="badge ${E(m.status)}">${E(statuses[m.status]||m.status)}</span><p>${E(m.email)}</p><p>MC: ${E(m.mc)} · รหัส: ${E(m.employeeId)}</p><p>สมัคร: ${date(m.createdAt)} · ยืนยันอีเมล: ${m.emailVerified?'แล้ว':'ยัง'}</p>${m.role==='admin'?'<p class="hint">ADMIN หลัก</p>':`<div class="member-actions"><button data-edit="${E(m.uid)}">แก้ไข / อนุมัติ</button><button data-delete="${E(m.uid)}">ลบ</button></div>`}</article>`).join('')||'<p class="empty">ไม่พบสมาชิกตามที่เลือก</p>';
}
for(const id of ['memberSearch','memberMc','memberStatus'])$(id).addEventListener('input',renderMembers);
$('memberList').onclick=e=>{
  const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(!edit&&!del)return;
  if(preview){notify('adminMessage','ข้อมูลตัวอย่าง — ปุ่มจัดการจะใช้งานได้เมื่อเชื่อม Firebase จริง');return;}
  selected=members.find(m=>m.uid===(edit?.dataset.edit||del?.dataset.delete));if(!selected)return;
  if(edit){for(const k of ['fullName','employeeId','mc','status'])$('editForm').elements[k].value=selected[k];$('editEmail').textContent=selected.email;notify('editError','');$('editDialog').showModal();}
  else{$('deleteForm').reset();$('deleteEmail').textContent=selected.email;notify('deleteError','');$('deleteDialog').showModal();}
};
$('cancelEdit').onclick=()=>$('editDialog').close();$('cancelDelete').onclick=()=>$('deleteDialog').close();
$('editForm').onsubmit=e=>{e.preventDefault();formTask(e.currentTarget,async()=>{await api('editMember',{uid:selected.uid,revision:selected.revision,...Object.fromEntries(new FormData($('editForm')))});$('editDialog').close();await openAdmin();notify('adminMessage','บันทึกข้อมูลสมาชิกแล้ว');},'editError');};
$('deleteForm').onsubmit=e=>{e.preventDefault();formTask(e.currentTarget,async()=>{await api('deleteMember',{uid:selected.uid,revision:selected.revision,confirm:$('deleteForm').elements.confirm.value});$('deleteDialog').close();await openAdmin();notify('adminMessage','ลบสมาชิกจากแอปและปิดสิทธิ์แล้ว บัญชี AUTH ยังอยู่ หากต้องการลบถาวรให้ทำใน Firebase Console');},'deleteError');};
async function init(){
  if(preview){
    $('setupNotice').hidden=false;$('setupNotice').textContent='ตัวอย่างหน้าจอ — ข้อมูลสมมติ ยังไม่รับสมัครจริง';
    const banner=document.createElement('p');banner.className='notice';banner.textContent='ตัวอย่างหน้าจอ • ข้อมูลสมมติ • ยังไม่เชื่อม Firebase';document.querySelector('.masthead').after(banner);
    const now=Date.now();members=[{uid:'demo1',fullName:'ตัวอย่างสมาชิก KC',email:'sample.kc@homepro.co.th',employeeId:'DEMO001',mc:'KC',status:'pending',createdAt:now},{uid:'demo2',fullName:'ตัวอย่างสมาชิก SA',email:'sample.sa@homepro.co.th',employeeId:'DEMO002',mc:'SA',status:'approved',createdAt:now}];
    const rows=MC.map((mc,i)=>({mc,members:i<4?12-i:0,approved:i<4?10-i:0,pending:i<4?2:0,activeUsers:i<4?8-i:0,sessions:i<4?40-i*7:0,calculations:i<4?180-i*35:0,frequency:i<4?5:0,lastUsed:i<4?now:0}));
    renderDashboard({rows,activeUsers:26,formulas:[{name:'ราคาขายตาม Margin เป้าหมาย',count:210},{name:'ซื้อ X แถม Y',count:140},{name:'SELL-THROUGH',count:84}],trend:[{day:day(-2),calculations:105},{day:day(-1),calculations:128},{day:day(),calculations:97}]});
    $('adminEntry').hidden=false;$('appEntry').hidden=true;$('adminEntry').onclick=openAdmin;
    const switcher=document.createElement('button');switcher.textContent='ดูหน้าสมัคร';switcher.onclick=()=>{screen('authScreen');authTab(true);};document.querySelector('.account').append(switcher);await openAdmin();return;
  }
  if(!configured()){$('setupNotice').hidden=false;return;}
  try{
    const {initializeApp}=await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js');
    sdk=await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js');const app=initializeApp(cfg.firebase);auth=sdk.getAuth(app);dataAdapter=await connect(app,auth);connectionUnsubscribe=dataAdapter.watchConnection(connected=>{if(!connected&&appLoaded){stopApp();screen('waitingScreen');$('waitingTitle').textContent='การเชื่อมต่อขาดหาย';$('waitingText').textContent='เชื่อมอินเทอร์เน็ตแล้วกดตรวจสถานะอีกครั้ง';}});auth.languageCode='th';await sdk.setPersistence(auth,sdk.browserSessionPersistence);
    sdk.onAuthStateChanged(auth,async user=>{if(authFlow)return;stopApp();if(user)await refresh();else{me=null;screen('authScreen');authTab(false);$('logout').hidden=true;$('adminEntry').hidden=true;$('appEntry').hidden=true;$('accountName').textContent='';}});
  }catch(e){notify('authMessage',errorMessage(e));}
}
init();
