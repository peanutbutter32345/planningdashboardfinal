import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./helpers/pglite-loader.mjs',import.meta.url);
process.env.DATABASE_URL='postgres://mem/mem';process.env.PORT='3995';process.env.CRON_SECRET='content-test-secret';process.env.ADMIN_USERNAMES='contentowner';
const {server}=await import('../server.js');
const {Pool,closeDatabase}=await import('./helpers/pglite-pg.mjs');const pool=new Pool();
const base='http://127.0.0.1:3995';
after(async()=>{await new Promise(resolve=>server.close(resolve));await closeDatabase();});
async function call(path,{method='GET',body,token}={}){const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
for(let i=0;i<100;i++){try{if((await call('/api/health')).body.databaseReady)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
const signup=async username=>(await call('/api/register',{method:'POST',body:{username,password:'test-password-only'}})).body.token;
const owner=await signup('contentowner'),reader=await signup('contentreader');
let advisor;
test('site content reads and writes are restricted to the configured admin account',async()=>{
 for(const token of [undefined,reader,'forged-token']){
  assert.equal((await call('/api/admin/site-content/advisors',{token})).status,404);
  assert.equal((await call('/api/admin/site-content/advisors',{method:'POST',token,body:{name:'Unauthorized'}})).status,404);
  assert.equal((await call('/api/admin/site-content/advisors/unknown',{method:'PUT',token,body:{name:'Unauthorized',version:1}})).status,404);
 }
 assert.equal((await call('/api/site-content')).status,404);
});
test('admin entries are durable and have no public content endpoint',async()=>{
 const saved=await call('/api/admin/site-content/advisors',{method:'POST',token:owner,body:{name:'Test Advisor',role:'Planning researcher',organization:'Test organization'}});
 assert.equal(saved.status,201);advisor=saved.body.entry;assert.equal(advisor.archived,false);
 const stored=await pool.query('SELECT data FROM site_content WHERE id=$1',[advisor.id]);assert.equal(stored.rows[0].data.name,'Test Advisor');
 assert.ok((await call('/api/admin/site-content/advisors',{token:owner})).body.entries.some(entry=>entry.id===advisor.id));
 assert.equal((await call('/api/site-content')).status,404);
});
test('edits prevent conflicts and archives remain recoverable',async()=>{
 const path='/api/admin/site-content/advisors/'+advisor.id;
 let response=await call(path,{method:'PUT',token:owner,body:{...advisor,role:'Updated role'}});assert.equal(response.status,200);
 assert.equal(response.body.entry.role,'Updated role');
 assert.equal((await call(path,{method:'PUT',token:owner,body:{...advisor,name:'Stale edit'}})).status,409);
 advisor=response.body.entry;
 response=await call(path,{method:'PUT',token:owner,body:{...advisor,archived:true}});advisor=response.body.entry;
 assert.equal((await call('/api/admin/site-content/advisors',{token:owner})).body.entries.find(entry=>entry.id===advisor.id).archived,true);
 response=await call(path,{method:'PUT',token:owner,body:{...advisor,archived:false}});assert.equal(response.status,200);advisor=response.body.entry;assert.equal(advisor.archived,false);
 assert.equal((await call('/api/admin/site-content/advisors')).status,404);
});
test('unsafe links, invalid content types and malformed fields are rejected',async()=>{
 for(const body of [{name:'X',image:'javascript:alert(1)'},{name:'X',url:'data:text/html,hi'},{name:'X',url:'https://secret:pass@example.com'},{name:'X',image:'http://example.com/a.jpg'},{name:'X',archived:'yes'},{name:'X',position:-1},{name:'X'.repeat(101)},{role:'Missing name'}]){
  assert.equal((await call('/api/admin/site-content/advisors',{method:'POST',token:owner,body})).status,400);
 }
 assert.equal((await call('/api/admin/site-content/other',{token:owner})).status,404);
 assert.equal((await call('/api/admin/site-content/featured',{method:'POST',token:owner,body:{name:'Missing link'}})).status,400);
});
test('features retain their source links and display in the chosen order',async()=>{
 for(const [name,position] of [['Second',20],['First',10]])assert.equal((await call('/api/admin/site-content/featured',{method:'POST',token:owner,body:{name,title:'Dashboard feature',url:'https://example.com/story',position}})).status,201);
 const result=(await call('/api/admin/site-content/featured',{token:owner})).body.entries.filter(entry=>entry.url==='https://example.com/story');assert.deepEqual(result.map(x=>x.name),['First','Second']);assert.equal(result[0].url,'https://example.com/story');
});
test('initial profiles have links and restart preserves owner edits',async()=>{
 const {initSiteContent}=await import('../site-content.js');
 const entries=(await call('/api/admin/site-content/advisors',{token:owner})).body.entries;
 assert.deepEqual(entries.filter(entry=>entry.id.startsWith('advisor-')).map(entry=>entry.name),['Emily Gnecco','Erik Nolthenius','Kimberly Mosley','Dr. Jeannice Fairrer Samani']);
 assert.ok(entries.filter(entry=>entry.id.startsWith('advisor-')).every(entry=>entry.url.startsWith('https://')));
 const emily=entries.find(entry=>entry.id==='advisor-emily-gnecco');
 assert.equal((await call('/api/admin/site-content/advisors/'+emily.id,{token:owner,method:'PUT',body:{...emily,role:'Independent advisor'}})).status,200);
 await initSiteContent(pool);
 const after=(await call('/api/admin/site-content/advisors',{token:owner})).body.entries;
 assert.equal(after.find(entry=>entry.id===emily.id).role,'Independent advisor');
 assert.equal(after.filter(entry=>entry.id===emily.id).length,1);
});
test('all portraits and logos require admin authorization and are not public static files',async()=>{
 for(const asset of ['emily-gnecco.png','erik.png','brisbane.png','south-bay-today.png','civic-tech-guide.png']){
  const path='/api/admin/site-content/assets/'+asset;
  for(const token of [undefined,reader,'forged-token'])assert.equal((await fetch(base+path,{headers:token?{authorization:'Bearer '+token}:{}})).status,404);
  const response=await fetch(base+path,{headers:{authorization:'Bearer '+owner}});
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/png/);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.ok((await response.arrayBuffer()).byteLength>100);
  for(const path of ['/data/site-profile-assets/','/site-profile-assets/'])assert.equal((await fetch(base+path+asset)).status,404);
 }
 assert.equal((await call('/api/admin/site-content/assets/not-allowed.png',{token:owner})).status,404);
 assert.equal((await call('/api/admin/site-content/advisors',{token:owner,method:'POST',body:{name:'X',image:'/api/admin/site-content/assets/../secret.png'}})).status,400);
});
test('expired owner sessions cannot read or update content',async()=>{
 await pool.query("UPDATE sessions SET created_at=now()-interval '100 days' WHERE token=$1",[owner]);
 assert.equal((await call('/api/admin/site-content/advisors',{token:owner})).status,404);
 assert.equal((await call('/api/admin/site-content/advisors/'+advisor.id,{method:'PUT',token:owner,body:{...advisor}})).status,404);
 assert.equal((await call('/api/admin/site-content/assets/emily-gnecco.png',{token:owner})).status,404);
});
