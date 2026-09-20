/* Shared merge keeps older researched records authoritative at matching addresses. */
(function(root){
 function addressKey(value){
  const text=String(value||'').toLowerCase().replace(/[^a-z0-9 ]/g,' '),m=text.match(/\b(\d{1,6})\s+([a-z]+)(?:\s+([a-z]+))?/);
  if(!m)return text.trim().replace(/\s+/g,' ');
  const direction={n:'north',s:'south',e:'east',w:'west',north:'north',south:'south',east:'east',west:'west'};
  return m[1]+':'+(direction[m[2]]?direction[m[2]]+':'+(m[3]||''):m[2]);
 }
 function merge(cities,snapshot){
  if(!snapshot?.cities)return;
  for(const [key,records] of Object.entries(snapshot.cities)){
   const city=cities[key];if(!city)continue;
   const existing=[...city.data,...(key==='sanjose'?(cities.westsanjose?.data||[]):[])];
   const seen=new Set(existing.map(p=>addressKey(p.addr)));
   const additions=records.filter(p=>{const id=addressKey(p.addr);if(seen.has(id))return false;seen.add(id);return true;});
   city.data.push(...additions);
   city.feed.push(...additions.filter(p=>p.lastDate).map(p=>({date:p.lastDate,id:p.id,title:p.addr,body:p.lastNote,stage:p.stage})));
   if(city.coverage==='directory')city.note='City resources and a sourced housing sample from HCD annual progress reports. These are reported milestones, not a complete current project inventory. Check official city records for later changes.';
   city.coverage='sample';city.housingActivity=snapshot.activity[key];
  }
 }
 root.DashboardHousing={merge,addressKey};
})(globalThis);
