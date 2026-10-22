import * as P from './spark-policy.mjs';
export async function connect(app,auth){
 const F=await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js');
 const db=F.getDatabase(app),catalog=await fetch('formula-catalog.json').then(r=>{if(!r.ok)throw Error('โหลดรายชื่อสูตรไม่สำเร็จ');return r.json();});
 const ref=p=>F.ref(db,p),value=async p=>(await F.get(ref(p))).val();
 let lastCalculation=0,lastSession=0;
 function current(){const u=auth.currentUser;if(!u)throw Error('กรุณาเข้าสู่ระบบ');if(!P.companyEmail(u.email)&&!P.owner(u))throw Error('เฉพาะอีเมล HomePro และ ADMIN ที่กำหนด');return u;}
 function admin(){const u=current();if(!P.owner(u))throw Error('เฉพาะ ADMIN เท่านั้น');return u;}
 async function status(){
  const u=current();let m=await value('members/'+u.uid);
  if(P.owner(u)&&!m){const now=F.serverTimestamp();await F.set(ref('members/'+u.uid),{uid:u.uid,email:u.email.toLowerCase(),fullName:'ADMIN',employeeId:'ADMIN',mc:'CO MC',status:'approved',role:'admin',emailVerified:true,createdAt:now,updatedAt:now,revision:1});m=await value('members/'+u.uid);}
  if(m&&m.status!=='deleted'&&u.emailVerified&&!m.emailVerified){const out=await F.runTransaction(ref('members/'+u.uid),old=>old?.status!=='deleted'&&old&&!old.emailVerified?{...old,emailVerified:true,updatedAt:F.serverTimestamp(),revision:old.revision+1}:undefined);if(out.committed)m=out.snapshot.val();}
  return {profile:m,emailVerified:u.emailVerified,isAdmin:P.owner(u)};
 }
 async function approved(){const u=current(),m=await value('members/'+u.uid);if(!u.emailVerified||!m||m.status!=='approved'||m.email!==u.email.toLowerCase())throw Object.assign(Error('บัญชียังไม่ได้รับอนุมัติหรือถูกระงับ'),{status:403});return m;}
 async function api(action,data={}){
  const u=current();
  if(action==='status')return status();
  if(action==='register'){
   if(!P.companyEmail(u.email))throw Error('สมัครด้วย @homepro.co.th เท่านั้น');const fields=P.profile(data),now=F.serverTimestamp();
   const out=await F.runTransaction(ref('members/'+u.uid),old=>old?undefined:{uid:u.uid,email:u.email.toLowerCase(),...fields,status:'pending',role:'member',emailVerified:u.emailVerified,createdAt:now,updatedAt:now,revision:1});
   if(!out.committed)throw Error('มีคำขอสมัครแล้ว หรือบัญชีถูกลบจากแอป กรุณาติดต่อ ADMIN');return status();
  }
  if(action==='usage'){
   const m=await approved(),now=Date.now();if(!['session','calculation'].includes(data.kind))throw Error('ประเภทเหตุการณ์ไม่ถูกต้อง');
   if(data.kind==='calculation'&&(!catalog[data.formulaId]||now-lastCalculation<2000))return {recorded:false};
   if(data.kind==='session'&&now-lastSession<1800000)return {recorded:false};
   const event={kind:data.kind,mc:m.mc,at:F.serverTimestamp(),formulaId:data.kind==='calculation'?String(data.formulaId):'session'};
   if(!/^[A-Za-z0-9_-]{16,80}$/.test(data.eventId||''))throw Error('EVENT ID ไม่ถูกต้อง');
   await F.set(ref(`usageDays/${P.dayKey(now)}/${u.uid}/${data.eventId}`),event);
   if(data.kind==='calculation')lastCalculation=now;else lastSession=now;return {recorded:true};
  }
  admin();
  if(action==='members')return {members:Object.values(await value('members')||{}).filter(m=>m.status!=='deleted')};
  if(action==='dashboard'){
   const r=P.range(data.start,data.end);const [members,days]=await Promise.all([value('members'),F.get(F.query(ref('usageDays'),F.orderByKey(),F.startAt(r.start),F.endAt(r.end))).then(s=>s.val())]);
   return P.summarize(members,days,catalog,data.mc||'');
  }
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(data.uid||'')||data.uid===u.uid)throw Error('ไม่สามารถแก้ไข ADMIN หลัก');
  const old=await value('members/'+data.uid);if(!old||old.status==='deleted'||old.role==='admin')throw Error('ไม่พบสมาชิกที่จัดการได้');
  if(action==='editMember'){
   const fields=P.profile(data);if(!['pending','approved','rejected','suspended'].includes(data.status))throw Error('สถานะไม่ถูกต้อง');if(data.status==='approved'&&!old.emailVerified)throw Error('สมาชิกต้องยืนยันอีเมลและกดตรวจสถานะก่อนอนุมัติ');
   const out=await F.runTransaction(ref('members/'+data.uid),m=>m&&m.status!=='deleted'&&m.revision===Number(data.revision)?{...m,...fields,status:data.status,updatedAt:F.serverTimestamp(),revision:m.revision+1}:undefined);
   if(!out.committed)throw Error('ข้อมูลเปลี่ยนไปแล้ว กรุณารีเฟรช');return {ok:true};
  }
  if(action==='deleteMember'){
   if(data.confirm!==old.email)throw Error('พิมพ์อีเมลสมาชิกเพื่อยืนยัน');
   const out=await F.runTransaction(ref('members/'+data.uid),m=>m&&m.revision===Number(data.revision)&&m.status!=='deleted'?{uid:data.uid,status:'deleted',deletedAt:F.serverTimestamp(),revision:m.revision+1}:undefined);
   if(!out.committed)throw Error('ข้อมูลเปลี่ยนไปแล้ว กรุณารีเฟรช');return {ok:true};
  }
  throw Error('ไม่พบคำสั่ง');
 }
 async function loadApp(){await approved();const d=await value('protectedApp');if(!d?.chunks)throw Error('ยังไม่ได้ติดตั้งเครื่องมือ กรุณานำเข้าไฟล์ protected-app.json ที่โหนด protectedApp');return Object.keys(d.chunks).sort().map(k=>d.chunks[k]).join('');}
 return {api,loadApp,watchConnection:fn=>F.onValue(ref('.info/connected'),s=>fn(s.val()===true)),watchMember:(uid,fn,onError)=>F.onValue(ref('members/'+uid),s=>fn(s.val()),onError)};
}
