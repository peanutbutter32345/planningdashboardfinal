/* Device-only guest persistence; never supplies a server auth token. */
(function(root){
 const KEY='sbpd_guest_v1';
 /* Pressing "Explore without setup" should let someone in, not hand them a form. They get a name
    straight away and everything on the site works under it. The name is a label, not a
    credential - the profile id below is what identifies the device - so it can be anything, and
    it is meant to be changed. namePicked records whether a person chose it or we did, which is
    what the email flow checks before putting a made-up name on a real account. */
 const NAME_WORDS=['Heron','Otter','Egret','Quail','Finch','Kestrel','Plover','Pelican','Poppy','Cedar','Alder','Willow','Laurel','Juniper','Madrone','Manzanita','Sequoia','Lupine','Sorrel','Bayberry'];
 const generateUsername=()=>NAME_WORDS[Math.floor(Math.random()*NAME_WORDS.length)]+' '+(Math.floor(Math.random()*9000)+1000);
 function uuid(){
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
 }
 function browserStorage(getter){
  try{return getter();}catch{
   const memory=new Map();
   return {getItem:key=>memory.get(key)||null,setItem:(key,value)=>{memory.set(key,value);throw Error('Browser storage is unavailable.');},removeItem:key=>memory.delete(key)};
  }
 }
 const encode=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
 async function verifier(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return encode(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:210000},key,256)));}
 class GuestStore{
  // Give every visitor an identity immediately, including someone who leaves before setup.
  // Existing ids and names survive, so a returning missed profile can be recovered once.
  constructor(storage,session){this.storage=storage;this.session=session;this.persistent=true;let d;try{d=JSON.parse(storage.getItem(KEY));}catch{}this.data=d&&d.version===1&&typeof d.id==='string'&&typeof d.username==='string'&&['stars','timeline','reminders','history'].every(k=>Array.isArray(d[k]))&&d.preferences&&typeof d.preferences==='object'?d:{version:1,id:uuid(),username:generateUsername(),namePicked:false,stars:[],timeline:[],reminders:[],history:[],preferences:{email:null,emailFrequency:'off',homeCity:null,categories:[]}};if(!this.data.username||this.data.username==='Guest'){this.data.username=generateUsername();this.data.namePicked=false;}this.save();}
  save(){try{this.storage.setItem(KEY,JSON.stringify(this.data));}catch{this.persistent=false;}}
  get unlocked(){if(!this.data.passwordHash)return true;try{return this.session.getItem(KEY)===this.data.id;}catch{return false;}}
  lock(){try{this.session.removeItem(KEY);}catch{}}
  async unlock(password){if(this.data.passwordHash&&await verifier(password,this.data.passwordSalt)!==this.data.passwordHash)throw Error('That guest password is incorrect.');this.session.setItem(KEY,this.data.id);}
  async update(username,password,currentPassword=''){
   if(!this.unlocked)throw Error('Unlock this account on this device first.');
   if(!/^[a-zA-Z0-9_ ]{3,30}$/.test(username))throw Error('Use 3–30 letters, numbers, spaces or underscores.');
   if(password){if(password.length<8||password.length>200)throw Error('Use a password between 8 and 200 characters.');if(this.data.passwordHash)await this.unlock(currentPassword);const salt=encode(crypto.getRandomValues(new Uint8Array(16)));this.data.passwordHash=await verifier(password,salt);this.data.passwordSalt=salt;this.session.setItem(KEY,this.data.id);}
   this.data.username=username;this.data.namePicked=true;this.save();
  }
  /* Called when someone explores without filling anything in. A device that already has a name
     keeps it, including one typed long before this existed. */
  ensureUsername(){
   if(!this.data.username){this.data.username=generateUsername();this.data.namePicked=false;this.save();}
   return this.data.username;
  }
  /* A name we invented is fine for reading the site under. It is not fine on an account that
     sends email to a real address, so the upgrade asks for one they chose. */
  get nameWasGenerated(){return this.data.namePicked===false;}
  /* Anything that sends email needs an account with a password behind it, and a name the person
     chose - "Heron 1100" should not be what arrives in someone's inbox. Say which of the two is
     missing rather than the same sentence for both. */
  emailBlocker(){
   return this.nameWasGenerated
    ? 'Email needs a password, and a name you picked rather than the one we gave you. Both are on the Account page, and your saved items come with you.'
    : 'Email needs a password on your account. Add one on the Account page and your saved items come with you.';
  }
  handles(path){return /^\/api\/(stars(?:\/|$)|account\/preferences$|timeline$|reminders(?:\/|$)|chat\/history(?:\/|$))/.test(path);}
  async request(path,options={},cities=[]){
   if(!this.unlocked)throw Error('Unlock your account in the Account page to reach your saved items.');
   const method=options.method||'GET',b=options.body?JSON.parse(options.body):{},d=this.data;
   let result={ok:true};
   if(path.startsWith('/api/stars')){
    if(method==='GET')return {stars:d.stars};
    if(method==='POST'){d.stars=d.stars.filter(x=>!(x.item_type===b.itemType&&x.item_id===b.itemId));d.stars.push({item_type:b.itemType,item_id:b.itemId,item_data:b.itemData});}
    if(method==='DELETE'){const [type,id]=path.slice('/api/stars/'.length).split('/').map(decodeURIComponent);d.stars=d.stars.filter(x=>!(x.item_type===type&&x.item_id===id));}
   }else if(path==='/api/account/preferences'){
    if(method==='GET')return {...d.preferences,cities};
    if(b.email||b.emailFrequency&&b.emailFrequency!=='off')throw Error(this.emailBlocker());
    d.preferences={...d.preferences,...b,email:null,emailFrequency:'off'};
   }else if(path==='/api/timeline'){
    if(method==='GET')return {items:d.timeline};
    if(method==='PUT'){d.timeline=d.timeline.filter(x=>x.item_key!==b.itemKey);d.timeline.push({item_key:b.itemKey,status:b.status,note:b.note});}
   }else if(path==='/api/reminders/email'){throw Error('Email reminders need a password on your account. The reminder is saved on this device either way.');
   }else if(path.startsWith('/api/reminders')){
    if(method==='GET')return {reminders:d.reminders};
    const id=path.split('/').pop();
    if(method==='POST'){const row={id:uuid(),kind:b.kind,ref_id:b.refId,label:b.label,detail:b.detail,url:b.url,city:b.city,in_digest:false,created_at:new Date().toISOString()};d.reminders=d.reminders.filter(x=>!(x.kind===b.kind&&x.ref_id===b.refId));d.reminders.push(row);result={reminder:row};}
    if(method==='DELETE')d.reminders=d.reminders.filter(x=>x.id!==id);
    if(method==='PATCH')throw Error('Email digest settings need a password on your account.');
   }else if(path.startsWith('/api/chat/history')){
    if(method==='GET')return {history:d.history};
    if(method==='POST'){const row={...b,id:uuid(),created_at:new Date().toISOString()};d.history.unshift(row);result={id:row.id};}
    if(method==='DELETE')d.history=path==='/api/chat/history'?[]:d.history.filter(x=>x.id!==path.split('/').pop());
   }else throw Error('This needs a password on your account.');
   this.save();if(!this.persistent)throw Error('Browser storage is unavailable. Changes are kept only until this page closes.');return result;
  }
  /* A guest is a user of the site, so the server is told one exists: an id, the name we generated
     and the place they chose, and nothing else. It is worth one call when the profile is new, when
     the name or city changes, and once a day after that - not on every page load. */
  syncState(now=Date.now()){
   const d=this.data,payload={guestId:d.id,username:d.username,homeCity:d.preferences?.homeCity||null,
    namePicked:d.namePicked===undefined?null:Boolean(d.namePicked)};
   const last=d.serverSync||null;
   const changed=!last||last.username!==payload.username||last.homeCity!==payload.homeCity
    ||last.namePicked!==payload.namePicked;
   const stale=!last||!(now-Number(last.at)<24*60*60*1000);
   return {payload,due:changed||stale};
  }
  markSynced(now=Date.now(),payload=this.syncState(now).payload){
   this.data.serverSync={at:now,username:payload.username,homeCity:payload.homeCity,namePicked:payload.namePicked};
   this.save();
  }
 }
 // Only acknowledge the snapshot actually sent. Changes made while a request is pending
 // remain due, and failures leave the persisted profile available for another attempt.
 class GuestSync {
  constructor(store,{fetch:send=root.fetch.bind(root),active=()=>true,now=()=>Date.now(),schedule=root.setTimeout.bind(root),cancel=root.clearTimeout.bind(root)}={}){
   this.store=store;this.send=send;this.active=active;this.now=now;this.schedule=schedule;this.cancel=cancel;
   this.pending=null;this.timer=null;this.failures=0;this.retryAt=0;
  }
  stop(){if(this.timer!==null)this.cancel(this.timer);this.timer=null;}
  retry(delay){this.stop();this.retryAt=this.now()+delay;this.timer=this.schedule(()=>{this.timer=null;this.sync();},delay);}
  sync(){
   if(this.pending)return this.pending;
   if(!this.active()||!this.store.data.username)return Promise.resolve(false);
   const {payload,due}=this.store.syncState(this.now());
   if(!due)return Promise.resolve(true);
   if(this.retryAt>this.now()){if(this.timer===null)this.retry(this.retryAt-this.now());return Promise.resolve(false);}
   this.stop();
   this.pending=this.attempt(payload).finally(()=>{this.pending=null;});
   return this.pending;
  }
  async attempt(payload){
   let retryAfter=0;
   const controller=new AbortController();
   const timeout=this.schedule(()=>controller.abort(),15000);
   try{
    const response=await this.send('/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true,signal:controller.signal});
    if(response.ok&&(await response.json()).ok){
     this.store.markSynced(this.now(),payload);this.failures=0;this.retryAt=0;
     if(this.store.syncState(this.now()).due)this.retry(0);
     return true;
    }
    const header=response.headers?.get('Retry-After');
    if(header)retryAfter=/^\d+$/.test(header)?Number(header)*1000:Math.max(0,Date.parse(header)-this.now());
    // Invalid input needs an edit, not a background request loop.
    if(response.status>=400&&response.status<500&&![408,429].includes(response.status))return false;
   }catch{}
   finally{this.cancel(timeout);}
   this.failures++;this.retry(Math.max(retryAfter||0,Math.min(300000,2000*2**Math.min(this.failures-1,8))));
   return false;
  }
 }
 root.DashboardGuest={GuestStore,GuestSync,browserStorage,uuid};
})(globalThis);
