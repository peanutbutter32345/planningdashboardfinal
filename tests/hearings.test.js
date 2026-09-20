import test from 'node:test';
import assert from 'node:assert/strict';
test('concurrent hearing requests share one refresh, carry a deadline and cache results',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  calls++;assert.ok(options.signal instanceof AbortSignal);
  await new Promise(resolve=>setTimeout(resolve,10));
  return {ok:true,json:async()=>[]};
 });
 const {getHearings,LEGISTAR_CITIES}=await import('../hearings.js?concurrency');
 const [a,b]=await Promise.all([getHearings(),getHearings()]);
 assert.equal(calls,Object.keys(LEGISTAR_CITIES).length);assert.deepEqual(a,b);assert.equal(a.errors.length,0);
 await getHearings();assert.equal(calls,Object.keys(LEGISTAR_CITIES).length);
});
test('one failed city does not discard successful cities; forced refresh recovers',async t=>{
 let fail=true;
 t.mock.method(globalThis,'fetch',async url=>{
  if(fail&&url.includes('sunnyvaleca'))throw new Error('Upstream unavailable');
  return {ok:true,json:async()=>url.includes('eventitems')?[]:[{EventId:1,EventBodyName:'Planning Commission',EventDate:'2026-09-24T00:00:00'}]};
 });
 const {getHearings,LEGISTAR_CITIES}=await import('../hearings.js?failure');
 const partial=await getHearings();assert.equal(partial.errors.length,1);assert.equal(partial.hearings.length,Object.keys(LEGISTAR_CITIES).length-1);
 fail=false;const recovered=await getHearings({force:true});assert.equal(recovered.errors.length,0);assert.equal(recovered.hearings.length,Object.keys(LEGISTAR_CITIES).length);
});
test('malformed upstream responses produce structured failures instead of crashing',async t=>{
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({error:'not an array'})}));
 const {getHearings,LEGISTAR_CITIES}=await import('../hearings.js?shape');
 const result=await getHearings();assert.equal(result.errors.length,Object.keys(LEGISTAR_CITIES).length);assert.equal(result.hearings.length,0);
});
test('West San Jose keeps the shared San Jose hearings in email briefings',async()=>{
 const {hearingsForCity}=await import('../hearings.js');
 const meeting={city:'sanjose',body:'City Council',date:'2026-09-29'};
 assert.deepEqual(hearingsForCity({hearings:[meeting,{city:'sunnyvale'}]},'westsanjose'),[meeting]);
});
