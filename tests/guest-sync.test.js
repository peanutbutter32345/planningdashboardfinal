import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import '../public/guest.js';
const {GuestStore,GuestSync}=globalThis.DashboardGuest;
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const ok=()=>({ok:true,status:200,json:async()=>({ok:true}),headers:new Headers()});
function fixture(send,storage=memory()){
 const store=new GuestStore(storage,memory()),timers=new Map();let time=100000,id=0;
 const sync=new GuestSync(store,{fetch:send,now:()=>time,schedule:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},cancel:id=>timers.delete(id)});
 return {store,sync,timers,storage,advance:ms=>{time+=ms;},run:async()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);time+=timer.delay;timer.fn();if(sync.pending)await sync.pending;}};
}
test('first visit, unchanged reload and old missed profile keep one identity',async()=>{
 const sent=[];const f=fixture(async(path,options)=>{sent.push(JSON.parse(options.body));assert.equal(options.keepalive,true);return ok();});
 await f.sync.sync();assert.equal(sent.length,1);
 const reopened=fixture(async(path,options)=>{sent.push(JSON.parse(options.body));return ok();},f.storage);
 await reopened.sync.sync();assert.equal(sent.length,1,'acknowledged unchanged profile is not resent');
 delete reopened.store.data.serverSync;reopened.store.save();
 await reopened.sync.sync();assert.equal(sent.length,2);assert.equal(sent[0].guestId,sent[1].guestId,'recovery uses the existing id');
});
for(const failure of ['offline',500,503,408,429])test(`registration retries after ${failure} without changing the id`,async()=>{
 const sent=[];const f=fixture(async(path,options)=>{
  sent.push(JSON.parse(options.body));
  if(sent.length>1)return ok();
  if(failure==='offline')throw Error('network unavailable');
  return {ok:false,status:failure,headers:new Headers(failure===429?{'Retry-After':'60'}:{})};
 });
 assert.equal(await f.sync.sync(),false);assert.equal(f.store.data.serverSync,undefined);
 assert.equal(f.timers.size,1);if(failure===429)assert.equal([...f.timers.values()][0].delay,60000);
 await f.run();assert.equal(f.store.syncState(100000).due,false);assert.equal(sent[0].guestId,sent[1].guestId);
});
test('changing the name and city while the first request is pending sends both snapshots',async()=>{
 const sent=[];let complete;
 const f=fixture(async(path,options)=>{sent.push(JSON.parse(options.body));return sent.length===1?new Promise(resolve=>complete=resolve):ok();});
 const first=f.sync.sync();assert.equal(f.sync.sync(),first,'concurrent triggers share the request');
 await f.store.update('Reader Two');f.store.data.preferences.homeCity='sanjose';
 complete(ok());await first;
 assert.equal(f.store.data.serverSync.username,sent[0].username,'acknowledgement covers only what was sent');
 assert.equal(f.store.syncState(100000).due,true);
 await f.run();assert.equal(sent.length,2);assert.equal(sent[1].username,'Reader Two');assert.equal(sent[1].homeCity,'sanjose');
 assert.equal(f.store.syncState(100000).due,false);
});
test('signing into a password account stops pending guest retries',async()=>{
 const f=fixture(async()=>{throw Error('offline');});let signedIn=false;f.sync.active=()=>!signedIn;
 await f.sync.sync();signedIn=true;await f.run();assert.equal(f.timers.size,0);
});
test('invalid input does not create an endless retry loop',async()=>{
 const f=fixture(async()=>({ok:false,status:400,headers:new Headers()}));
 await f.sync.sync();assert.equal(f.timers.size,0);assert.equal(f.store.data.serverSync,undefined);
});
test('a timed-out request remains due and retries',async()=>{
 const f=fixture(async(path,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')))));
 const pending=f.sync.sync();assert.equal([...f.timers.values()][0].delay,15000);
 await f.run();await pending;assert.equal(f.timers.size,1);assert.equal(f.store.data.serverSync,undefined);
});

// Execute the real setup-completion function. This checks the path that used to never call
// /api/guest, independent of whether the visitor typed a name or chose a specific city.
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const finish=html.slice(html.indexOf('function finishOnboard(){'),html.indexOf('async function saveGuestName('));
for(const name of ['', 'Chosen Name'])for(const city of [null,'sanjose'])test(`setup records ${name?'chosen':'generated'} name with ${city||'county only'}`,async()=>{
 const calls=[];const f=fixture(async(path,options)=>{calls.push(JSON.parse(options.body));return ok();});
 if(name)await f.store.update(name);
 const context=vm.createContext({guestProfile:f.store,onboard:{county:'Santa Clara',city,interests:[],wantInvolved:true,userLoc:null},CITIES:{sanjose:{county:'Santa Clara'}},isGuest:()=>true,syncGuestProfile:()=>f.sync.sync(),setCountyScope:()=>{},switchCity:()=>{}});
 vm.runInContext(finish,context);context.finishOnboard();await f.sync.pending;
 assert.equal(calls.length,1);assert.equal(calls[0].homeCity,city);assert.ok(calls[0].username);
});

test('arrival is registered even when storage access throws and setup has never opened',async()=>{
 const sent=[];
 const context=vm.createContext({crypto,Uint8Array,TextEncoder,AbortController,setTimeout,clearTimeout,fetch:async(path,options)=>{sent.push(JSON.parse(options.body));return ok();}});
 Object.defineProperty(context,'localStorage',{get(){throw Error('SecurityError');}});
 Object.defineProperty(context,'sessionStorage',{get(){throw Error('SecurityError');}});
 vm.runInContext(readFileSync(new URL('../public/guest.js',import.meta.url),'utf8'),context);
 const start=html.slice(html.indexOf('const profileStorage='),html.indexOf('let guestAuthForm=false;'));
 vm.runInContext(start,context);await vm.runInContext('guestSync.pending',context);
 assert.equal(sent.length,1);assert.match(sent[0].username,/^[A-Za-z]+ \d{4}$/);
 assert.equal(vm.runInContext('guestProfile.persistent',context),false);
});
test('an older browser without randomUUID still creates an id and saves reminders',async()=>{
 const context=vm.createContext({crypto:{getRandomValues:crypto.getRandomValues.bind(crypto)}});
 vm.runInContext(readFileSync(new URL('../public/guest.js',import.meta.url),'utf8'),context);
 const g=new context.DashboardGuest.GuestStore(memory(),memory());
 assert.match(g.data.id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 const {reminder}=await g.request('/api/reminders',{method:'POST',body:JSON.stringify({kind:'board',refId:'test',label:'Test'})});
 assert.notEqual(reminder.id,g.data.id);
});
test('a lost response is retried with the same id and can acknowledge an existing server row',async()=>{
 let responseCount=0;const ids=[];
 const f=fixture(async(path,options)=>{
  ids.push(JSON.parse(options.body).guestId);
  if(++responseCount===1)throw Error('Response lost after server committed');
  return {ok:true,status:200,headers:new Headers(),json:async()=>({ok:true,created:false})};
 });
 await f.sync.sync();await f.run();assert.equal(ids[0],ids[1]);assert.equal(f.store.syncState(100000).due,false);
});
test('a failed attempt remains recoverable after closing and reopening the page',async()=>{
 const f=fixture(async()=>{throw Error('offline');});await f.sync.sync();f.sync.stop();
 const sent=[];const returning=fixture(async(path,options)=>{sent.push(JSON.parse(options.body));return ok();},f.storage);
 await returning.sync.sync();assert.equal(sent[0].guestId,f.store.data.id);assert.equal(returning.store.syncState(100000).due,false);
});
test('every inline script parses after the registration changes',()=>{
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
});

test('browser timer APIs retain their window receiver',async()=>{
 const context=vm.createContext({crypto,AbortController,fetch:async()=>ok()});
 vm.runInContext(`globalThis.setTimeout=function(){if(this!==globalThis)throw Error('Illegal invocation');return 1;};globalThis.clearTimeout=function(){if(this!==globalThis)throw Error('Illegal invocation');};`,context);
 vm.runInContext(readFileSync(new URL('../public/guest.js',import.meta.url),'utf8'),context);
 const store=new context.DashboardGuest.GuestStore(memory(),memory());
 const sync=new context.DashboardGuest.GuestSync(store);
 assert.equal(await sync.sync(),true);assert.ok(store.data.serverSync);
});

test('successful login remains usable for this visit when storage writes are blocked',()=>{
 const elements=new Map();const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);}};
 const context=vm.createContext({document,profileStorage:{setItem(){throw Error('Quota exceeded');},removeItem(){throw Error('Blocked');}},resetAccountMemory(){},guestProfile:{data:{username:'Guest Name',stars:[]},unlocked:true},Map,accountSessionVersion:0});
 const functions=html.slice(html.indexOf('function setAuthSession('),html.indexOf('// Event delegation - handles every star'));
 vm.runInContext(functions,context);context.setAuthSession('test-session-only','testaccount');
 assert.equal(context.authToken,'test-session-only');assert.match(elements.get('accountSyncStatus').textContent,/Signed in for this visit/);
 context.clearAuthSession();assert.equal(context.authToken,null);
});

const submit=html.slice(html.indexOf('async function submitOnboard(){'),html.indexOf('// Offer the eight nearest tracked cities'));
const exploreStart=html.indexOf("document.getElementById('onboardExplore').addEventListener('click',async()=>{");
const exploreBody=html.slice(exploreStart+"document.getElementById('onboardExplore').addEventListener('click',async()=>{".length,html.indexOf('});\n// The note says',exploreStart));
for(const county of ['Santa Clara','San Mateo','San Francisco','Alameda','Contra Costa','Marin','Napa','Solano','Sonoma'])for(const entry of ['submit','explore'])for(const chosen of [false,true])for(const specificCity of [false,true])test(`${entry}: ${county}, ${chosen?'typed':'generated'} name, ${specificCity?'city':'county only'}`,async()=>{
 const calls=[];const f=fixture(async(path,options)=>{calls.push(JSON.parse(options.body));return ok();});
 const elements=new Map();const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'',style:{}});return elements.get(id);}};
 document.getElementById('onboardUsername').value=chosen?'My Bay Name':f.store.data.username;
 const context=vm.createContext({document,guestProfile:f.store,onboard:{county,city:specificCity?'testcity':null,interests:[],wantInvolved:true,userLoc:null},CITIES:{testcity:{county}},onboardComplete:()=>true,isGuest:()=>true,syncGuestProfile:()=>f.sync.sync(),saveGuestName:async input=>{if(input.value!==f.store.data.username)await f.store.update(input.value);return true;},setCountyScope(){},switchCity(){},refreshOnboardGate(){},renderAuthNavState(){},renderOnboardCityBtns(){},showScreen(){},showPage(){},applyDeepLink(){},setNavMenu(){}});
 vm.runInContext(finish+'\n'+submit+'\nasync function explore(){'+exploreBody+'}',context);
 await context[entry==='submit'?'submitOnboard':'explore']();if(f.sync.pending)await f.sync.pending;
 assert.equal(calls.length,1);assert.equal(calls[0].guestId,f.store.data.id);assert.equal(calls[0].homeCity,specificCity?'testcity':null);assert.equal(f.store.nameWasGenerated,!chosen);
});
test('leaving the generated setup name unchanged does not label it as user-chosen',async()=>{
 const f=fixture(async()=>ok());const elements=new Map();const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);}};
 const input={value:f.store.data.username,removeAttribute(){},setAttribute(){}};
 const context=vm.createContext({document,guestProfile:f.store,isGuest:()=>true,renderAuthNavState(){},syncGuestProfile:()=>f.sync.sync()});
 const fn=html.slice(html.indexOf('async function saveGuestName('),html.indexOf('function wireGuestName('));vm.runInContext(fn,context);
 assert.equal(await context.saveGuestName(input,'status'),true);assert.equal(f.store.nameWasGenerated,true);
 input.value='My Chosen Name';await context.saveGuestName(input,'status');assert.equal(f.store.nameWasGenerated,false);
 if(f.sync.pending)await f.sync.pending;f.sync.stop();
});
