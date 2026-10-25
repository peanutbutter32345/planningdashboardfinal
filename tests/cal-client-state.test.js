import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/cal/app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'');
function client(handler){
 const requests=[],values=new Map(),elements=new Map();
 const element=selector=>{if(!elements.has(selector))elements.set(selector,{value:'',textContent:'',className:'',disabled:false,addEventListener(){},remove(){},querySelector(){return element('button');}});return elements.get(selector);};
 const context=vm.createContext({console,URL,URLSearchParams,Date,Math,Number,String,Set,Map,JSON,crypto:{randomUUID:()=> 'test-device-123'},location:{origin:'http://localhost',hash:'',search:''},history:{replaceState(){}},localStorage:{getItem:key=>values.get(key)||null,setItem:(key,v)=>values.set(key,v)},setTimeout:()=>1,clearTimeout(){},window:{addEventListener(){}},document:{querySelector:element,addEventListener(){},createElement:()=>element('toast'),body:{append(){}}},fetch:async(url,options={})=>{requests.push({url,options});return handler(url,options);}});
 vm.runInContext(source,context);vm.runInContext("var originalRender=render;toast=()=>{};render=async()=>{};",context);
 return {context,requests,values,element,run:code=>vm.runInContext(code,context)};
}
const response=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}}));
test('account timeline removal deletes the matching cloud item before discarding its device copy',async()=>{
 const c=client(()=>response({ok:true}));c.run("profile={username:'Example',token:'local-test-token',guestId:'device'};saved=[{id:'https://example.org/news?a=1',kind:'news'}];");
 assert.equal(await c.run("removeSaved('https://example.org/news?a=1')"),true);
 assert.equal(c.requests[0].options.method,'DELETE');assert.equal(c.requests[0].url,'/api/stars/news/cal%3Ahttps%3A%2F%2Fexample.org%2Fnews%3Fa%3D1');assert.equal(c.run('saved.length'),0);
 assert.ok(c.values.has('cal_civic_saved_account_example'));
});
test('a failed account removal keeps the saved item available for a retry',async()=>{
 const c=client(()=>response({error:'Offline'},503));c.run("profile={username:'Example',token:'local-test-token',guestId:'device'};saved=[{id:'filing-1',kind:'environmental filing'}];");
 assert.equal(await c.run("removeSaved('filing-1')"),false);assert.equal(c.run('saved.length'),1);
});
test('guest saves stay on the device, and separate accounts use separate saved-item namespaces',async()=>{
 const c=client(()=>{throw Error('Guest save must not call account API');});c.run("profile={username:'Oak1234',guestId:'device'};place={id:'p0669070',name:'Santa Barbara'};saved=[];");
 await c.run("saveItem({id:'filing-1',kind:'environmental filing',name:'Original record'})");assert.equal(c.requests.length,0);assert.ok(c.values.has('cal_civic_saved_guest_device'));
 c.run("profile.token='local-test-token';profile.username='FirstAccount';");const first=c.run('savedKey()');c.run("profile.username='SecondAccount';");assert.notEqual(c.run('savedKey()'),first);
});
test('creating an account carries existing guest filings and participation plans into cloud saves',async()=>{
 const c=client((url,options)=>url==='/api/register'?response({token:'local-test-token',username:'NewAccount'}):url==='/api/stars'&&options.method!=='POST'?response({stars:[]}):response({ok:true}));
 c.element('#authName').value='NewAccount';c.element('#authPassword').value='test-only-password';
 c.run("profile={username:'Oak1234',guestId:'device'};saved=[{id:'filing-1',kind:'environmental filing',name:'Original record'},{id:'plan-1',kind:'plan',name:'Attend a meeting'}];");
 await c.run("auth({querySelector:()=>({disabled:false})},'register')");
 const writes=c.requests.filter(r=>r.url==='/api/stars'&&r.options.method==='POST').map(r=>JSON.parse(r.options.body));assert.equal(writes.length,2);assert.deepEqual(writes.map(r=>r.itemType),['project','resource']);assert.ok(writes.every(r=>r.itemData.edition==='cal'));assert.equal(c.run('saved.length'),2);assert.equal(c.element('#authPassword').value,'');
});
test('a slower response from a previous locality cannot replace the current locality or its map context',async()=>{
 const pending=[];const c=client(()=>new Promise(resolve=>pending.push(resolve)));
 c.run("render=originalRender;catalog={places:[{id:'first',name:'First'},{id:'second',name:'Second'}]};controls=()=>{};setHash=()=>{};hero=()=>{};drawMap=()=>{};renderers.overview=()=>place.name;state.view='overview';state.place='first';");
 const earlier=c.run('render()');c.run("state.place='second';");const later=c.run('render()');
 pending[1](await response({id:'second',name:'Second'}));await later;pending[0](await response({id:'first',name:'First'}));await earlier;
 assert.equal(c.run('place.id'),'second');assert.equal(c.element('#view').innerHTML,'Second');
});
