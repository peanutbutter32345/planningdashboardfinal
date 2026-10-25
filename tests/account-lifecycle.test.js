import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../public/guest.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const section=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('guest timeline dates and deleting encoded keys survive a reload',async()=>{
  const storage=memory(),g=new DashboardGuest.GuestStore(storage,memory());
  const key='city:read/a proposal';
  await g.request('/api/timeline',{method:'PUT',body:JSON.stringify({itemKey:key,status:'doing',note:'Read agenda',dueDate:'2026-11-01'})});
  const reopened=new DashboardGuest.GuestStore(storage,memory());
  assert.equal((await reopened.request('/api/timeline')).items[0].due_date,'2026-11-01');
  const path='/api/timeline/'+encodeURIComponent(key);
  assert.equal(reopened.handles(path),true);
  await reopened.request(path,{method:'DELETE'});
  assert.deepEqual((await new DashboardGuest.GuestStore(storage,memory()).request('/api/timeline')).items,[]);
});

const apiSource=section('async function apiCall(', '// The guest id travels');
function apiFixture(fetch){
  const ctx=vm.createContext({authToken:'account-a',accountSessionVersion:1,fetch,guestAuthForm:false,currentScreen:'account',window:{},guestProfile:{handles:()=>false},renderAuthNavState(){},renderAccountPage(){}});
  ctx.clearAuthSession=()=>{ctx.authToken=null;ctx.accountSessionVersion++;};
  vm.runInContext(apiSource,ctx);return ctx;
}
test('an in-flight response cannot populate a different signed-in account',async()=>{
  const waiting=deferred(),ctx=apiFixture(()=>waiting.promise);
  const result=ctx.apiCall('/api/stars');
  ctx.authToken='account-b';ctx.accountSessionVersion++;
  waiting.resolve({ok:true,status:200,json:async()=>({stars:[{private:'account-a'}]})});
  await assert.rejects(result,/account changed/);
  assert.equal(ctx.authToken,'account-b');
});
test('expired sessions clear the stale token and show the login prompt',async()=>{
  const ctx=apiFixture(async()=>({ok:false,status:401,json:async()=>({error:'Session expired.'})}));
  await assert.rejects(ctx.apiCall('/api/stars'),/Session expired/);
  assert.equal(ctx.authToken,null);assert.equal(ctx.guestAuthForm,true);
  assert.match(ctx.window.pendingLoginReason,/Log in again/);
});
test('a wrong password does not clear another active session',async()=>{
  const ctx=apiFixture(async()=>({ok:false,status:401,json:async()=>({error:'Incorrect username or password.'})}));
  await assert.rejects(ctx.apiCall('/api/login'),/Incorrect/);
  assert.equal(ctx.authToken,'account-a');
});
test('switching accounts cancels map and timeline autosaves',()=>{
  const cancelled=[],password={value:'old-password'};
  const ctx=vm.createContext({document:{getElementById:()=>password},clearTimeout:id=>cancelled.push(id),yaSaveTimer:12,tkSaveTimers:new Map([['station',34]]),tkState:new Map(),tkProfileLoaded:true,yaPins:['private-pin'],remItems:['private-reminder']});
  vm.runInContext(section('function resetAccountMemory(){','function setAuthSession('),ctx);
  ctx.resetAccountMemory();
  assert.deepEqual(cancelled,[12,34]);assert.equal(ctx.yaSaveTimer,null);assert.equal(ctx.yaPins.length,0);assert.equal(ctx.tkSaveTimers.size,0);assert.equal(password.value,'');
});

const transferSource=section('async function transferGuestItems(',"document.getElementById('signupForm').addEventListener");
const guestItems=()=>({stars:[{item_type:'project',item_id:'p1',item_data:{}}],timeline:[{item_key:'station',status:'done',note:'Notes',due_date:'2026-11-02'}],reminders:[{kind:'board',ref_id:'council',label:'Council'}],history:[{question:'What is proposed?',answer:'A public proposal.',resources:[],city:'sanjose'}],preferences:{homeCity:null,categories:[]}});
function transferFixture(onCall=()=>{}){
  const calls=[],ctx=vm.createContext({accountSessionVersion:1,
    apiCall:async(path,options)=>{calls.push([path,JSON.parse(options.body)]);await onCall(path,ctx);},
    apiAddStar:async(...args)=>{calls.push(['/api/stars',args]);await onCall('/api/stars',ctx);},
    apiSavePreferences:async(...args)=>calls.push(['/api/account/preferences',args])});
  vm.runInContext(transferSource,ctx);return {ctx,calls};
}
test('guest upgrade includes answers and dates without sending an invalid empty topic list',async()=>{
  const {ctx,calls}=transferFixture();const original=guestItems();
  assert.equal((await ctx.transferGuestItems(original)).length,0);
  assert.equal(calls.find(c=>c[0]==='/api/timeline')[1].dueDate,'2026-11-02');
  assert.equal(calls.find(c=>c[0]==='/api/chat/history')[1].question,'What is proposed?');
  assert.equal(calls.find(c=>c[0]==='/api/account/preferences')[1][3],undefined);
  assert.equal(original.history.length,1,'originals remain on the device');
});
test('one failed import cannot prevent other saved items from transferring',async()=>{
  const {ctx,calls}=transferFixture(path=>{if(path==='/api/stars')throw Error('Offline for one request');});
  assert.equal((await ctx.transferGuestItems(guestItems())).length,1);
  assert.ok(calls.some(c=>c[0]==='/api/chat/history'));
  assert.ok(calls.some(c=>c[0]==='/api/account/preferences'));
});
test('guest import stops sending when the reader switches accounts mid-upgrade',async()=>{
  const {ctx,calls}=transferFixture((_path,ctx)=>{ctx.accountSessionVersion++;});
  assert.ok((await ctx.transferGuestItems(guestItems())).length>0);
  assert.equal(calls.length,1);
});

const logoutSource=section('async function logOutAccount(){',"document.getElementById('logoutBtn').addEventListener");
test('logout clears the browser immediately and revokes its exact server token',async()=>{
  const waiting=deferred(),requests=[];
  const ctx=vm.createContext({authToken:'account-a',accountSessionVersion:1,guestAuthForm:false,AbortSignal,window:{},isGuest:()=>false,renderAccountPage(){},fetch:(path,options)=>{requests.push({path,options});return waiting.promise;}});
  ctx.clearAuthSession=()=>{ctx.authToken=null;ctx.accountSessionVersion++;};
  vm.runInContext(logoutSource,ctx);
  const result=ctx.logOutAccount();
  assert.equal(ctx.authToken,null);
  assert.equal(requests[0].path,'/api/logout');assert.equal(requests[0].options.headers.Authorization,'Bearer account-a');
  waiting.resolve({ok:true,status:200});await result;
});
test('offline logout explains the remaining server session without restoring login',async()=>{
  const ctx=vm.createContext({authToken:'account-a',accountSessionVersion:1,guestAuthForm:false,AbortSignal,window:{},isGuest:()=>false,renderAccountPage(){},fetch:async()=>{throw Error('Offline');}});
  ctx.clearAuthSession=()=>{ctx.authToken=null;ctx.accountSessionVersion++;};
  vm.runInContext(logoutSource,ctx);await ctx.logOutAccount();
  assert.equal(ctx.authToken,null);assert.match(ctx.window.pendingLoginReason,/server could not be reached/);
});

for(const name of ['login','signup'])test(`${name} ignores duplicate submits and re-enables the form after a failure`,async()=>{
  let handler,calls=0;
  const waiting=deferred(),submit={disabled:false};
  const form={dataset:{},querySelector:()=>submit,addEventListener:(_event,fn)=>handler=fn};
  const elements={
    [name+'Form']:form,[name+'Username']:{value:'previewreader'},
    [name+'Password']:{value:'PreviewOnlyPassword42!'},[name+'Error']:{textContent:''}
  };
  const ctx=vm.createContext({document:{getElementById:id=>elements[id]},
    apiLogin:()=>{calls++;return waiting.promise;},apiRegister:()=>{calls++;return waiting.promise;},
    guestProfile:{unlocked:false},setAuthSession(){},renderAccountPage(){}});
  const source=section(`document.getElementById('${name}Form').addEventListener('submit', async (e)=>{`,
    name==='login'?'// Try each saved item independently':'async function logOutAccount(){');
  vm.runInContext(source,ctx);
  const event={preventDefault(){},currentTarget:form};
  const first=handler(event);await handler(event);
  assert.equal(calls,1);assert.equal(submit.disabled,true);
  waiting.resolve(Promise.reject(Error('Temporary network failure')));await first;
  assert.match(elements[name+'Error'].textContent,/Temporary network failure/);
  assert.equal(submit.disabled,false);assert.equal(form.dataset.busy,undefined);
});
