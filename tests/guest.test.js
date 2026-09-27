import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/guest.js';
const {GuestStore}=globalThis.DashboardGuest;
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const post=(data,method='POST')=>({method,body:JSON.stringify(data)});
test('a new guest profile starts with no username and requires one be chosen',async()=>{
 const storage=memory(),g=new GuestStore(storage,memory());
 assert.equal(g.data.username,'');
 assert.equal(new GuestStore(storage,memory()).data.username,'');
 await g.update('My Custom Name');
 assert.equal(new GuestStore(storage,memory()).data.username,'My Custom Name');
 const old={...g.data,username:'Guest'};storage.setItem('sbpd_guest_v1',JSON.stringify(old));
 assert.equal(new GuestStore(storage,memory()).data.username,'');
});
test('guest saves survive reload and preserve encoded item IDs',async()=>{
 const storage=memory(),session=memory(),g=new GuestStore(storage,session);
 assert.equal(g.unlocked,true);
 const id='https://example.gov/project?a=1';
 await g.request('/api/stars',post({itemType:'resource',itemId:id,itemData:{title:'Official record'}}));
 await g.request('/api/timeline',post({itemKey:'berkeley:read',status:'done',note:'Read the proposal'},'PUT'));
 await g.request('/api/account/preferences',post({homeCity:'berkeley',emailFrequency:'off',categories:['housing']},'PATCH'));
 const reopened=new GuestStore(storage,memory());
 assert.equal((await reopened.request('/api/stars')).stars.length,1);
 assert.equal((await reopened.request('/api/timeline')).items[0].status,'done');
 assert.equal((await reopened.request('/api/account/preferences')).homeCity,'berkeley');
 await reopened.request('/api/stars/resource/'+encodeURIComponent(id),{method:'DELETE'});
 assert.equal((await reopened.request('/api/stars')).stars.length,0);
});
test('county-only setup and automatic name changes survive a new browser session',async()=>{
 const storage=memory(),g=new GuestStore(storage,memory());
 const id=g.data.id;
 g.data.setup={county:'Alameda',city:null,interests:[],wantInvolved:true};g.save();
 await g.update('otter2026');
 const reopened=new GuestStore(storage,memory());
 assert.equal(reopened.data.id,id);
 assert.equal(reopened.data.username,'otter2026');
 assert.deepEqual(reopened.data.setup,{county:'Alameda',city:null,interests:[],wantInvolved:true});
 await assert.rejects(reopened.update('!'),/3–30/);
 assert.equal(new GuestStore(storage,memory()).data.username,'otter2026');
});
test('optional guest lock hashes passwords and requires the old password for changes',async()=>{
 const storage=memory(),session=memory(),g=new GuestStore(storage,session);
 await g.update('Test Reader','test-password-only');
 assert.equal(g.data.username,'Test Reader');
 assert.ok(g.data.passwordHash);
 assert.ok(!storage.getItem('sbpd_guest_v1').includes('test-password-only'));
 g.lock();assert.equal(g.unlocked,false);
 await assert.rejects(g.request('/api/stars'),/Unlock/);
 await assert.rejects(g.unlock('wrong-password'),/incorrect/);
 await g.unlock('test-password-only');
 await assert.rejects(g.update('Test Reader','changed-test-password','wrong-password'),/incorrect/);
 await g.update('Test Reader','changed-test-password','test-password-only');
 const reopened=new GuestStore(storage,memory());assert.equal(reopened.unlocked,false);
 await assert.rejects(reopened.unlock('test-password-only'),/incorrect/);
 await reopened.unlock('changed-test-password');assert.equal(reopened.unlocked,true);
});
test('guest-only API routes never simulate server authentication or sending email',async()=>{
 const g=new GuestStore(memory(),memory());
 assert.equal(g.handles('/api/login'),false);assert.equal(g.handles('/api/register'),false);
 assert.equal(g.handles('/api/chat'),false);assert.equal(g.handles('/api/reminders'),true);
 await assert.rejects(g.request('/api/account/preferences',post({email:'test@example.com',emailFrequency:'weekly'},'PATCH')),/password/);
 await assert.rejects(g.request('/api/reminders/email',post({})),/password/);
 const {reminder}=await g.request('/api/reminders',post({kind:'board',refId:'berkeley:council',label:'Council meeting',city:'berkeley'}));
 assert.equal(reminder.in_digest,false);
 await g.request('/api/reminders/'+reminder.id,{method:'DELETE'});
 assert.equal((await g.request('/api/reminders')).reminders.length,0);
});
test('missing or malformed local storage creates a usable guest profile',async()=>{
 const broken={getItem:()=>'{broken',setItem:()=>{throw Error('blocked');}};
 const g=new GuestStore(broken,memory());assert.equal(g.unlocked,true);assert.equal(g.persistent,false);
 assert.deepEqual((await g.request('/api/stars')).stars,[]);
 const partial=memory();partial.setItem('sbpd_guest_v1',JSON.stringify({version:1,username:'Incomplete'}));
 const recovered=new GuestStore(partial,memory());assert.ok(Array.isArray(recovered.data.stars));
});

test('a guest profile syncs once, again when it changes, and again a day later',()=>{
 const storage=memory(),g=new GuestStore(storage,memory());
 const t0=Date.UTC(2026,8,20,12,0,0);
 const first=g.syncState(t0);
 assert.equal(first.due,true);                                   // never sent before
 assert.equal(first.payload.guestId,g.data.id);
 assert.equal(first.payload.username,g.data.username);
 g.markSynced(t0);
 assert.equal(g.syncState(t0+60_000).due,false);                 // not on every page load
 assert.equal(g.syncState(t0+25*3600_000).due,true);             // a day later, still here
 g.markSynced(t0);
 g.data.preferences.homeCity='concord';
 assert.equal(g.syncState(t0+60_000).due,true);                  // they chose a place
 g.markSynced(t0);
 g.data.username='Chosen Name';
 assert.equal(g.syncState(t0+60_000).due,true);                  // they renamed themselves
 assert.equal(g.syncState(t0+60_000).payload.homeCity,'concord');
 // The sync record survives a reload, so a returning visitor is not re-counted.
 g.markSynced(t0);
 assert.equal(new GuestStore(storage,memory()).syncState(t0+60_000).due,false);
});

// Exploring without setup should let someone in rather than hand them a form. They get a name,
// and it is a real account from that moment: everything on the site works under it, with no
// password anywhere until an email address is involved.
test('exploring without setup names the reader and leaves the name changeable',async()=>{
 const storage=memory(),g=new GuestStore(storage,memory());
 assert.equal(g.data.username,'','nothing is assumed before they act');
 const given=g.ensureUsername();
 assert.match(given,/^[A-Za-z]+ \d{4}$/);
 assert.equal(g.nameWasGenerated,true);
 assert.equal(g.ensureUsername(),given,'a second visit must not rename them');
 assert.equal(new GuestStore(storage,memory()).data.username,given,'and it survives a reload');
 await g.update('Maria Lopez');
 assert.equal(g.nameWasGenerated,false,'choosing a name clears the generated mark');
 assert.equal(new GuestStore(storage,memory()).nameWasGenerated,false);
});
test('a name that was typed long before this existed is never overwritten',async()=>{
 const storage=memory(),g=new GuestStore(storage,memory());
 await g.update('Chosen Earlier');
 delete g.data.namePicked; g.save();                  // a profile saved by an older build
 const returning=new GuestStore(storage,memory());
 assert.equal(returning.ensureUsername(),'Chosen Earlier');
 assert.equal(returning.nameWasGenerated,false,'an unmarked name counts as theirs, not ours');
});
test('a name is enough for everything except email',async()=>{
 const g=new GuestStore(memory(),memory());
 g.ensureUsername();
 // The things a reader actually does, none of which may ask for a password.
 await g.request('/api/stars',post({itemType:'project',itemId:'sv-1',itemData:{}}));
 assert.equal((await g.request('/api/stars')).stars.length,1);
 await g.request('/api/timeline',post({itemKey:'k',status:'done',note:''},'PUT'));
 assert.equal((await g.request('/api/timeline')).items.length,1);
 await g.request('/api/account/preferences',post({homeCity:'berkeley',categories:['Housing']},'PATCH'));
 assert.equal((await g.request('/api/account/preferences')).homeCity,'berkeley');
});
test('email asks for a password, and for a name we did not invent',async()=>{
 const g=new GuestStore(memory(),memory());
 g.ensureUsername();
 await assert.rejects(
  ()=>g.request('/api/account/preferences',post({email:'me@example.com',emailFrequency:'biweekly'},'PATCH')),
  /name you picked/,'a generated name must not end up on a real address');
 await g.update('Maria Lopez');
 await assert.rejects(
  ()=>g.request('/api/account/preferences',post({email:'me@example.com',emailFrequency:'biweekly'},'PATCH')),
  /password/,'once the name is theirs, only the password is outstanding');
 const blocker=g.emailBlocker();
 assert.ok(!/name you picked/.test(blocker),'and the message stops asking for a name they gave');
});
