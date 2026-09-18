import test from 'node:test';
import assert from 'node:assert/strict';
test('concurrent hearing requests share one refresh, carry a deadline and cache results',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  calls++;assert.ok(options.signal instanceof AbortSignal);
  await new Promise(resolve=>setTimeout(resolve,10));
  return {ok:true,json:async()=>[]};
 });
 const {getHearings}=await import('../hearings.js?concurrency');
 const [a,b]=await Promise.all([getHearings(),getHearings()]);
 assert.equal(calls,5);assert.deepEqual(a,b);assert.equal(a.errors.length,0);
 await getHearings();assert.equal(calls,5);
});
test('one failed city does not discard successful cities; forced refresh recovers',async t=>{
 let fail=true;
 t.mock.method(globalThis,'fetch',async url=>{
  if(fail&&url.includes('sunnyvaleca'))throw new Error('Upstream unavailable');
  return {ok:true,json:async()=>url.includes('eventitems')?[]:[{EventId:1,EventBodyName:'Planning Commission',EventDate:'2026-09-24T00:00:00'}]};
 });
 const {getHearings}=await import('../hearings.js?failure');
 const partial=await getHearings();assert.equal(partial.errors.length,1);assert.equal(partial.hearings.length,4);
 fail=false;const recovered=await getHearings({force:true});assert.equal(recovered.errors.length,0);assert.equal(recovered.hearings.length,5);
});
test('malformed upstream responses produce structured failures instead of crashing',async t=>{
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({error:'not an array'})}));
 const {getHearings}=await import('../hearings.js?shape');
 const result=await getHearings();assert.equal(result.errors.length,5);assert.equal(result.hearings.length,0);
});
