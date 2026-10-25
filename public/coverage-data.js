/* Additional localities use the existing BayDashboard data and rendering contracts. */
(function(root){
 const expansion=root.COVERAGE_EXPANSION;
 if(!expansion)return;
 for(const [key,city] of Object.entries(expansion.cities)){
  if(!root.REGIONAL_DATA.cities[key])root.REGIONAL_DATA.cities[key]=city;
 }
 Object.assign(root.LOCAL_CITY_PHOTOS,expansion.photos);
 Object.assign(root.MEETING_DIRECTORY,expansion.meetings);
 Object.assign(root.HOUSING_RECORDS.activity,expansion.activity);
 const pending=new Map(),loaded=new Set();
 async function load(key,cities,fetcher=root.fetch.bind(root)){
  const c=cities[key];
  if(!c?.recordsUrl||loaded.has(key))return false;
  if(pending.has(key))return pending.get(key);
  const request=(async()=>{
   const response=await fetcher(c.recordsUrl,{cache:'no-cache'});
   if(!response.ok)throw Error('The city records could not be loaded. Please retry.');
   const data=await response.json();
   if(!Array.isArray(data.records)||data.records.length!==c.recordCount)throw Error('Incomplete city record response. Please retry.');
   c.data=data.records;
   c.feed=data.records.filter(r=>r.lastDate).map(r=>({date:r.lastDate,id:r.id,title:r.addr,body:r.lastNote,stage:r.stage}));
   loaded.add(key);
   return true;
  })();
  pending.set(key,request);
  try{return await request;}finally{pending.delete(key);}
 }
 root.DashboardCoverage={load,loaded};
})(globalThis);
