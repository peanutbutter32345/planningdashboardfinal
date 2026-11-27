import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {initCivicFeatures,registerCivicFeatures,hearingAlertsFor} from '../civic-features.js';
const db=new PGlite();
await db.query('CREATE TABLE users (username TEXT PRIMARY KEY,email TEXT)');
await db.query("INSERT INTO users VALUES ('one','one@example.test'),('two','two@example.test'),('noemail',NULL)");
await initCivicFeatures(db);
const app=express();app.use(express.json());
const sent=[];let fail=false;
const date=new Date(Date.now()+7*86400000).toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
const hearing={city:'losgatos',body:'Town Council',date,agendaUrl:'https://city.example/agenda',matters:[{projects:[{id:'lg-50-los-gatos'}]}]};
registerCivicFeatures(app,{pool:db,authMiddleware:(req,res,next)=>{if(!req.headers.authorization)return res.status(401).json({error:'Sign in.'});req.username=req.headers.authorization;next();},isAdminRequest:async req=>req.headers['x-owner']==='yes',cronSecret:'test',getHearings:async()=>({cities:['losgatos'],hearings:[hearing],errors:[]}),sendEmail:async(...args)=>{if(fail)throw Error('provider unavailable');sent.push(args);},emailsPaused:false});
const server=app.listen(0);await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port;
const call=async(path,{user,body,headers={}}={})=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{authorization:user}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
test('corrections validate the record and note and remain owner-only',async()=>{
  assert.equal((await call('/api/project-feedback',{body:{projectId:'not-real',note:'Please correct this'}})).status,400);
  const ok=await call('/api/project-feedback',{body:{projectId:'lg-50-los-gatos',note:'Please check the updated permit number.'}});assert.equal(ok.status,201);
  assert.equal((await call('/api/admin/project-feedback')).status,404);
  const reports=await call('/api/admin/project-feedback',{headers:{'x-owner':'yes'}});assert.equal(reports.data.reports[0].project_id,'lg-50-los-gatos');
});
test('alerts require an authenticated user, valid project and saved email',async()=>{
  assert.equal((await call('/api/project-alerts')).status,401);
  assert.equal((await call('/api/project-alerts',{user:'one',body:{projectId:'bad',enabled:true}})).status,400);
  assert.equal((await call('/api/project-alerts',{user:'noemail',body:{projectId:'lg-50-los-gatos',enabled:true}})).status,400);
  assert.equal((await call('/api/project-alerts',{user:'one',body:{projectId:'lg-50-los-gatos',enabled:true}})).status,200);
  assert.deepEqual((await call('/api/project-alerts',{user:'two'})).data.projectIds,[]);
});
test('cron dry runs send nothing, actual runs deliver once, and unsubscribe stops delivery',async()=>{
  const path='/api/cron/hearing-alerts',headers={'x-cron-secret':'test'};
  assert.equal((await call(path,{body:{dryRun:false}})).status,401);
  const dry=await call(path,{headers,body:{}});assert.equal(dry.data.due,1);assert.equal(sent.length,0);
  const actual=await call(path,{headers,body:{dryRun:false}});assert.equal(actual.data.sent,1);assert.equal(sent.length,1);
  assert.match(sent[0][2],/city=losgatos/);assert.ok(sent[0][3].idempotencyKey);
  assert.equal((await call(path,{headers,body:{dryRun:false}})).data.sent,0);
  await call('/api/project-alerts',{user:'one',body:{projectId:'lg-50-los-gatos',enabled:false}});
  assert.deepEqual((await call('/api/project-alerts',{user:'one'})).data.projectIds,[]);
});
test('a failed email can retry without creating duplicate successful deliveries',async()=>{
  await call('/api/project-alerts',{user:'two',body:{projectId:'lg-50-los-gatos',enabled:true}});
  fail=true;const failed=await call('/api/cron/hearing-alerts',{headers:{'x-cron-secret':'test'},body:{dryRun:false}});assert.equal(failed.data.failed,1);
  fail=false;const retry=await call('/api/cron/hearing-alerts',{headers:{'x-cron-secret':'test'},body:{dryRun:false}});assert.equal(retry.data.sent,1);
  assert.equal((await call('/api/cron/hearing-alerts',{headers:{'x-cron-secret':'test'},body:{dryRun:false}})).data.sent,0);
});
test('alerts ignore expired or unmatched hearings and accept only the next eight days',()=>{
  const project={id:'project'};const item=days=>({date:new Date(Date.now()+days*86400000).toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'}),agendaUrl:'https://city.example',matters:[{projects:[project]}]});
  assert.equal(hearingAlertsFor(project,{hearings:[item(-2),item(7),item(15),{...item(3),matters:[]}]}).length,1);
});
