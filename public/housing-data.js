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
 /* A city's own GIS, merged on the same address rule. Run before the HCD merge: where both
    describe the same address the city's record is the live one and the HCD row is a line from an
    annual return, so the city wins and HCD is skipped as a duplicate.

    Kept separate from merge() above because these are not a housing sample. Each city means
    something different by "project" - a planning pipeline, a commercial list, an affordable
    housing programme, a capital improvement programme - so every record carries the name of the
    layer it came from and the city note says which, rather than implying they are all the same. */
 function mergeCityProjects(cities,snapshot){
  if(!snapshot?.cities)return;
  for(const [key,entry] of Object.entries(snapshot.cities)){
   const city=cities[key];if(!city||!entry?.records?.length)continue;
   const seen=new Set(city.data.map(p=>addressKey(p.addr)));
   const additions=entry.records.filter(p=>{const id=addressKey(p.addr);if(seen.has(id))return false;seen.add(id);return true;});
   if(!additions.length)continue;
   city.data.push(...additions);
   city.feed.push(...additions.filter(p=>p.lastDate).map(p=>({date:p.lastDate,id:p.id,title:p.addr,body:p.lastNote,stage:p.stage})));
   city.livePipeline={what:entry.what,layer:entry.layer,url:entry.url,count:additions.length};
  }
 }
 root.DashboardHousing={merge,mergeCityProjects,addressKey};
})(globalThis);
