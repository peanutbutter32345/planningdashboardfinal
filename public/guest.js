/* Device-only guest persistence; never supplies a server auth token. */
(function(root){
 const KEY='sbpd_guest_v1';
 const encode=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
 async function verifier(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return encode(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:210000},key,256)));}
 class GuestStore{
  // A brand-new profile starts with no username at all - onboarding requires one be typed before
  // the site is usable, rather than handing out a name nobody chose. A returning device keeps
  // whatever name is already stored, even an older randomly-generated one.
  constructor(storage,session){this.storage=storage;this.session=session;this.persistent=true;let d;try{d=JSON.parse(storage.getItem(KEY));}catch{}this.data=d&&d.version===1&&typeof d.id==='string'&&typeof d.username==='string'&&['stars','timeline','reminders','history'].every(k=>Array.isArray(d[k]))&&d.preferences&&typeof d.preferences==='object'?d:{version:1,id:crypto.randomUUID(),username:'',stars:[],timeline:[],reminders:[],history:[],preferences:{email:null,emailFrequency:'off',homeCity:null,categories:[]}};if(this.data.username==='Guest')this.data.username='';this.save();}
  save(){try{this.storage.setItem(KEY,JSON.stringify(this.data));}catch{this.persistent=false;}}
  get unlocked(){if(!this.data.passwordHash)return true;try{return this.session.getItem(KEY)===this.data.id;}catch{return false;}}
  lock(){try{this.session.removeItem(KEY);}catch{}}
  async unlock(password){if(this.data.passwordHash&&await verifier(password,this.data.passwordSalt)!==this.data.passwordHash)throw Error('That guest password is incorrect.');this.session.setItem(KEY,this.data.id);}
  async update(username,password,currentPassword=''){
   if(!this.unlocked)throw Error('Unlock this guest profile first.');
   if(!/^[a-zA-Z0-9_ ]{3,30}$/.test(username))throw Error('Use 3–30 letters, numbers, spaces or underscores.');
   if(password){if(password.length<8||password.length>200)throw Error('Use a password between 8 and 200 characters.');if(this.data.passwordHash)await this.unlock(currentPassword);const salt=encode(crypto.getRandomValues(new Uint8Array(16)));this.data.passwordHash=await verifier(password,salt);this.data.passwordSalt=salt;this.session.setItem(KEY,this.data.id);}
   this.data.username=username;this.save();
  }
  handles(path){return /^\/api\/(stars(?:\/|$)|account\/preferences$|timeline$|reminders(?:\/|$)|chat\/history(?:\/|$))/.test(path);}
  async request(path,options={},cities=[]){
   if(!this.unlocked)throw Error('Unlock your guest profile in Account to access saved items.');
   const method=options.method||'GET',b=options.body?JSON.parse(options.body):{},d=this.data;
   let result={ok:true};
   if(path.startsWith('/api/stars')){
    if(method==='GET')return {stars:d.stars};
    if(method==='POST'){d.stars=d.stars.filter(x=>!(x.item_type===b.itemType&&x.item_id===b.itemId));d.stars.push({item_type:b.itemType,item_id:b.itemId,item_data:b.itemData});}
    if(method==='DELETE'){const [type,id]=path.slice('/api/stars/'.length).split('/').map(decodeURIComponent);d.stars=d.stars.filter(x=>!(x.item_type===type&&x.item_id===id));}
   }else if(path==='/api/account/preferences'){
    if(method==='GET')return {...d.preferences,cities};
    if(b.email||b.emailFrequency&&b.emailFrequency!=='off')throw Error('Add a password to your profile to enable email summaries. Your guest profile stays on this device until then.');
    d.preferences={...d.preferences,...b,email:null,emailFrequency:'off'};
   }else if(path==='/api/timeline'){
    if(method==='GET')return {items:d.timeline};
    if(method==='PUT'){d.timeline=d.timeline.filter(x=>x.item_key!==b.itemKey);d.timeline.push({item_key:b.itemKey,status:b.status,note:b.note});}
   }else if(path==='/api/reminders/email'){throw Error('Email reminders need a password on your profile. Your reminder is saved on this device either way.');
   }else if(path.startsWith('/api/reminders')){
    if(method==='GET')return {reminders:d.reminders};
    const id=path.split('/').pop();
    if(method==='POST'){const row={id:crypto.randomUUID(),kind:b.kind,ref_id:b.refId,label:b.label,detail:b.detail,url:b.url,city:b.city,in_digest:false,created_at:new Date().toISOString()};d.reminders=d.reminders.filter(x=>!(x.kind===b.kind&&x.ref_id===b.refId));d.reminders.push(row);result={reminder:row};}
    if(method==='DELETE')d.reminders=d.reminders.filter(x=>x.id!==id);
    if(method==='PATCH')throw Error('Email digest settings need a password on your profile.');
   }else if(path.startsWith('/api/chat/history')){
    if(method==='GET')return {history:d.history};
    if(method==='POST'){const row={...b,id:crypto.randomUUID(),created_at:new Date().toISOString()};d.history.unshift(row);result={id:row.id};}
    if(method==='DELETE')d.history=path==='/api/chat/history'?[]:d.history.filter(x=>x.id!==path.split('/').pop());
   }else throw Error('This needs a password on your profile.');
   this.save();if(!this.persistent)throw Error('Browser storage is unavailable. Changes are kept only until this page closes.');return result;
  }
  /* A guest is a user of the site, so the server is told one exists: an id, the name we generated
     and the place they chose, and nothing else. It is worth one call when the profile is new, when
     the name or city changes, and once a day after that - not on every page load. */
  syncState(now=Date.now()){
   const d=this.data,payload={guestId:d.id,username:d.username,homeCity:d.preferences?.homeCity||null};
   const last=d.serverSync||null;
   const changed=!last||last.username!==payload.username||last.homeCity!==payload.homeCity;
   const stale=!last||!(now-Number(last.at)<24*60*60*1000);
   return {payload,due:changed||stale};
  }
  markSynced(now=Date.now()){
   const {payload}=this.syncState(now);
   this.data.serverSync={at:now,username:payload.username,homeCity:payload.homeCity};
   this.save();
  }
 }
 root.DashboardGuest={GuestStore};
})(globalThis);
