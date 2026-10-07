import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./helpers/pglite-loader.mjs',import.meta.url);
process.env.DATABASE_URL='postgres://mem/mem';
process.env.PORT='3994';process.env.CRON_SECRET='recovery-test-secret';
const {server}=await import('../server.js');
const {Pool,failNextSessionInsert,closeDatabase}=await import('./helpers/pglite-pg.mjs');
const pool=new Pool();
const base='http://127.0.0.1:3994';
const headers={'x-cron-secret':process.env.CRON_SECRET};
after(async()=>{await pool.end();await new Promise(resolve=>server.close(resolve));await closeDatabase();});
for(let i=0;i<100;i++){
 try{if((await fetch(base+'/api/admin/users?limit=1',{headers})).ok)break;}catch{}
 await new Promise(resolve=>setTimeout(resolve,100));
}
const list=async query=>{const response=await fetch(base+'/api/admin/users?'+query,{headers});return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};};
const guest=(guestId,username,ip,cf)=>fetch(base+'/api/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip,...(cf?{'cf-connecting-ip':cf}:{})},body:JSON.stringify({guestId,username})});
const signUp=body=>fetch(base+'/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('startup health confirms that profile registration is ready',async()=>{
 const health=await(await fetch(base+'/api/health')).json();assert.equal(health.guestRegistrationReady,true);assert.equal(health.databaseReady,true);
});
test('a missed browser profile is recovered once and duplicate tabs keep one row',async()=>{
 const id=crypto.randomUUID();
 const responses=await Promise.all([guest(id,'Recovered Reader','203.0.113.50'),guest(id,'Recovered Reader','203.0.113.50')]);
 assert.ok(responses.every(r=>r.ok));
 assert.equal((await list('q=Recovered')).body.total,1);
 assert.equal((await guest(id,'Recovered Reader','203.0.113.50')).status,200);
 assert.equal((await list('q=Recovered')).body.total,1);
});
test('31 different visitors behind one Cloudflare edge do not hit one registration limit',async()=>{
 for(let i=0;i<31;i++)assert.equal((await guest(crypto.randomUUID(),'Cloud Reader '+i,'104.22.17.198','203.0.113.'+(100+i))).status,200);
 const {body}=await list('q=Cloud%20Reader');assert.equal(body.total,31);
 assert.equal(body.users[0].signup_ip,'203.0.113.130');
});
test('a real shared address keeps its limit and tells the client when to retry',async()=>{
 for(let i=0;i<30;i++)assert.equal((await guest(crypto.randomUUID(),'Shared Reader '+i,'198.51.100.80')).status,200);
 const denied=await guest(crypto.randomUUID(),'Waiting Reader','198.51.100.80');
 assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))>0);
});
test('signing up before the guest request arrives still keeps one linked profile',async()=>{
 const guestId=crypto.randomUUID();
 const signed=await signUp({guestId,username:'earlysignup',password:'only-test-password'});
 assert.equal(signed.status,200);
 assert.equal((await guest(guestId,'Late Generated Name','203.0.113.90')).status,200);
 const {body}=await list('q=earlysignup');assert.equal(body.total,1);assert.equal(body.users[0].kind,'account');
 assert.equal((await list('q=Late%20Generated')).body.total,0);
});
test('a signup response lost in transit can be retried without making another account',async()=>{
 const body={guestId:crypto.randomUUID(),username:'retrysignup',password:'only-test-password'};
 assert.equal((await signUp(body)).status,200);
 const retried=await signUp(body);assert.equal(retried.status,200);
 const credentials=await retried.json();assert.ok(credentials.token);
 assert.equal((await fetch(base+'/api/timeline',{headers:{authorization:'Bearer '+credentials.token}})).status,200);
 assert.equal((await list('q=retrysignup')).body.total,1);
 assert.equal((await signUp({...body,password:'different-test-password'})).status,409,'id alone never authenticates');
});
test('a guest name collision cannot drop either visitor',async()=>{
 for(const id of [crypto.randomUUID(),crypto.randomUUID()])assert.equal((await guest(id,'Same Display Name','203.0.113.91')).status,200);
 assert.equal((await list('q=Same%20Display')).body.total,2);
});
test('all stored profiles remain reachable beyond 500, even if a new row arrives between pages',async()=>{
 for(let i=0;i<610;i++)await pool.query("INSERT INTO users(username,kind) VALUES($1,'guest')",['Archive Reader '+String(i).padStart(4,'0')]);
 const first=await list('q=Archive&limit=100');
 assert.equal(first.body.total,610);assert.equal(first.body.users.length,100);assert.match(first.cache,/no-store/);
 const ids=new Set(first.body.users.map(u=>u.id));let cursor=first.body.nextCursor;
 await pool.query("INSERT INTO users(username,kind) VALUES('Archive Latest','guest')");
 while(cursor){const {body}=await list('q=Archive&limit=100&before='+cursor);for(const row of body.users){assert.ok(!ids.has(row.id),'pages never repeat an id');ids.add(row.id);}cursor=body.nextCursor;}
 assert.equal(ids.size,610,'every pre-existing profile remains reachable');
 const older=await list('q=Archive%20Reader%200001');assert.equal(older.body.total,1);assert.equal(older.body.users[0].username,'Archive Reader 0001');
 assert.equal((await list('limit=-10')).body.users.length,1);
 assert.equal((await list('before=invalid')).status,400);
 assert.equal((await fetch(base+'/api/admin/users?q=Archive')).status,404,'search stays owner-only');
});

test('a failed session write rolls back the new account and remains retryable',async()=>{
 const body={guestId:crypto.randomUUID(),username:'rollbacksignup',password:'only-test-password'};
 failNextSessionInsert();assert.equal((await signUp(body)).status,500);
 assert.equal((await list('q=rollbacksignup')).body.total,0);
 assert.equal((await signUp(body)).status,200);assert.equal((await list('q=rollbacksignup')).body.total,1);
});
test('a failed guest upgrade preserves its identity, name and home city',async()=>{
 const guestId=crypto.randomUUID();await guest(guestId,'Upgrade Original','203.0.113.92');
 await pool.query("UPDATE users SET home_city='sanjose' WHERE guest_id=$1",[guestId]);
 const body={guestId,username:'upgradefinal',password:'only-test-password'};
 failNextSessionInsert();assert.equal((await signUp(body)).status,500);
 assert.equal((await list('q=Upgrade%20Original')).body.total,1);
 assert.equal((await list('q=upgradefinal')).body.total,0);
 assert.equal((await signUp(body)).status,200);
 const kept=await pool.query("SELECT guest_id,home_city FROM users WHERE username='upgradefinal'");
 assert.equal(kept.rows[0].guest_id,guestId);assert.equal(kept.rows[0].home_city,'sanjose');
});
test('community and admin totals agree with actual profiles and account types',async()=>{
 const community=await(await fetch(base+'/api/community',{headers})).json();
 const stats=await(await fetch(base+'/api/admin/stats',{headers})).json();
 const rows=(await pool.query('SELECT kind FROM users')).rows;
 assert.equal(community.users,rows.length);assert.equal(stats.users,rows.length);
 assert.equal(community.registered,rows.filter(u=>u.kind==='account').length);
 assert.equal(stats.guests,rows.filter(u=>u.kind==='guest').length);
 assert.equal(community.registered+community.guests,community.users);
});

test('late guest requests cannot undo upgraded account preferences or its chosen name',async()=>{
 const guestId=crypto.randomUUID();assert.equal((await signUp({guestId,username:'upgradeprefs',password:'only-test-password'})).status,200);
 await pool.query("UPDATE users SET home_city='sanjose' WHERE guest_id=$1",[guestId]);
 const response=await fetch(base+'/api/guest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({guestId,username:'Old Guest Label',namePicked:false,homeCity:'oakland'})});
 assert.equal(response.status,200);
 const row=(await list('q=upgradeprefs')).body.users[0];assert.equal(row.home_city,'sanjose');assert.equal(row.name_chosen,true);
});
test('a guest can clear a selected city when switching back to a county view',async()=>{
 const guestId=crypto.randomUUID();await guest(guestId,'County Reader','203.0.113.93');
 await pool.query("UPDATE users SET home_city='sanjose' WHERE guest_id=$1",[guestId]);
 assert.equal((await guest(guestId,'County Reader','203.0.113.93')).status,200);
 assert.equal((await list('q=County%20Reader')).body.users[0].home_city,null);
});

test('collisions in both short id suffixes still register every visitor',async()=>{
 for(let i=1;i<=4;i++)assert.equal((await guest('12345678-1234-4123-8123-'+String(i).padStart(12,'0'),'Prefix Collision','203.0.113.94')).status,200);
 assert.equal((await list('q=Prefix%20Collision')).body.total,4);
});
test('case-insensitive display-name collisions never reject an existing profile',async()=>{
 const id=crypto.randomUUID();await guest(id,'Rename Original','203.0.113.95');
 await guest(crypto.randomUUID(),'Rename Taken','203.0.113.95');
 assert.equal((await guest(id,'rename taken','203.0.113.95')).status,200);
 assert.equal((await guest(id,'rename original','203.0.113.95')).status,200,'own name can change case');
 assert.equal((await list('q=Rename')).body.total,2);
});
