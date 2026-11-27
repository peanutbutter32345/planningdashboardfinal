import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
let mode='valid',messages;
const provider=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  messages=JSON.parse(raw).messages;
  const id='fact-lg-50-los-gatos-4';
  const answer=mode==='valid'?'Town Council approved it on March 4, 2025 ['+id+'].':mode==='bad-citation'?'A permit was issued yesterday [made-up-document].':'An unsupported answer.';
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'test',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:JSON.stringify({on_topic:true,answer,resource_ids:mode==='missing'?[]:[id]})}}]}));
});
await new Promise(r=>provider.listen(4352,r));
process.env.LLM_API_KEY='local-test-only';process.env.LLM_BASE_URL='http://127.0.0.1:4352/v1';process.env.PORT='4351';delete process.env.DATABASE_URL;
const {server}=await import('../server.js');
after(async()=>{await new Promise(r=>server.close(r));await new Promise(r=>provider.close(r));});
async function ask(){const response=await fetch('http://127.0.0.1:4351/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'What is the approval status of Los Gatos Lodge at 50 Los Gatos-Saratoga Road?',context:{cityKey:'losgatos',cityLabel:'Los Gatos',projects:[{id:'malicious',addr:'CLIENT_CANARY',stage:'completed'}],links:[{label:'CLIENT_CANARY',url:'https://attacker.example'}]}})});assert.equal(response.status,200);return response.json();}
test('answers use server records and cite only supplied documents',async()=>{
  mode='valid';const data=await ask();assert.equal(data.meta.grounded,true);assert.match(data.answer,/March 4, 2025/);assert.equal(data.resources[0].id,'fact-lg-50-los-gatos-4');
  assert.equal(JSON.stringify(messages).includes('CLIENT_CANARY'),false,'browser-provided records and URLs are not authoritative');
  assert.ok(JSON.stringify(messages).includes('155'));
});
test('no citations produces an explicit unknown instead of attaching plausible nearby links',async()=>{
  mode='missing';const data=await ask();assert.equal(data.meta.grounded,false);assert.match(data.answer,/I don't know/);assert.equal(data.resources.length,0);
});
test('an invented inline citation cannot pass just because another selected resource is valid',async()=>{
  mode='bad-citation';const data=await ask();assert.equal(data.meta.grounded,false);assert.match(data.answer,/I don't know/);assert.doesNotMatch(data.answer,/yesterday/);
});
