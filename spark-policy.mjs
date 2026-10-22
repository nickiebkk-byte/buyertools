export const MC=['AU','BC','BD','BM','BR','DH','DW','EC','ET','FC','FD','FT','GD','HO','HT','HW','IT','KC','LT','MA','OL','PA','PB','PE','PT','SA','VS','CO MC'];
export const ADMIN_EMAIL='nickiebkk@gmail.com';
export const dayKey=(time=Date.now())=>String(Math.floor((time+25200000)/86400000));
export const companyEmail=value=>/^[a-zA-Z0-9._%+-]+@homepro[.]co[.]th$/i.test(String(value||''));
export const owner=user=>user?.email?.toLowerCase()===ADMIN_EMAIL&&user.emailVerified===true;
export function profile(v){const fullName=String(v.fullName||'').trim(),employeeId=String(v.employeeId||'').trim(),mc=String(v.mc||'');if(fullName.length<2||fullName.length>100)throw Error('กรอกชื่อ–นามสกุล 2–100 ตัวอักษร');if(!/^[A-Za-z0-9_-]{1,30}$/.test(employeeId))throw Error('รหัสพนักงานไม่ถูกต้อง');if(!MC.includes(mc))throw Error('เลือก MC จากรายการ');return {fullName,employeeId,mc};}
export function range(start,end){const parse=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?Date.parse(s+'T00:00:00+07:00'):NaN;const a=parse(start),b=parse(end);if(!Number.isFinite(a+b)||new Date(a+25200000).toISOString().slice(0,10)!==start||new Date(b+25200000).toISOString().slice(0,10)!==end||a>b||b-a>=90*86400000)throw Error('เลือกวันที่จริง ช่วงไม่เกิน 90 วัน');return {start:dayKey(a),end:dayKey(b)};}
export function summarize(members,days,catalog,filter=''){
 if(filter&&!MC.includes(filter))throw Error('MC ไม่ถูกต้อง');
 const rows=MC.filter(mc=>!filter||mc===filter).map(mc=>({mc,members:0,approved:0,pending:0,activeUsers:0,sessions:0,calculations:0,frequency:0,lastUsed:0,_users:new Set()}));
 const by=Object.fromEntries(rows.map(r=>[r.mc,r])),allUsers=new Set(),trend={},formulas={};
 for(const m of Object.values(members||{})){const r=by[m.mc];if(!r||m.status==='deleted')continue;r.members++;if(m.status==='approved')r.approved++;if(m.status==='pending')r.pending++;}
 for(const [day,users] of Object.entries(days||{}))for(const [uid,events] of Object.entries(users||{})){
  const previous={};for(const e of Object.values(events||{}).sort((a,b)=>a.at-b.at)){
   const r=by[e.mc];if(!r||!Number.isFinite(e.at)||!['session','calculation'].includes(e.kind))continue;
   const date=new Date(Number(day)*86400000).toISOString().slice(0,10);trend[date]??={day:date,sessions:0,calculations:0};
   if(previous[e.mc]===undefined||e.at-previous[e.mc]>=1800000){r.sessions++;trend[date].sessions++;}previous[e.mc]=e.at;
   if(e.kind==='calculation'&&catalog[e.formulaId]){r.calculations++;trend[date].calculations++;formulas[e.formulaId]??={id:e.formulaId,name:catalog[e.formulaId].name,count:0};formulas[e.formulaId].count++;}
   r.lastUsed=Math.max(r.lastUsed,e.at);r._users.add(uid);allUsers.add(uid);
  }
 }
 for(const r of rows){r.activeUsers=r._users.size;r.frequency=r.activeUsers?r.sessions/r.activeUsers:0;delete r._users;}
 return {rows,activeUsers:allUsers.size,trend:Object.values(trend).sort((a,b)=>a.day.localeCompare(b.day)),formulas:Object.values(formulas).sort((a,b)=>b.count-a.count).slice(0,10)};
}
