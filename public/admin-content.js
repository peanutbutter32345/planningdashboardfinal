(() => {
  const panel=document.getElementById('frontAdmin'),hero=document.querySelector('.hero-copy');
  let allowed=false,accessGeneration=0;
  const privateImages=new Set();
  const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const button=(text,action,className='btn secondary')=>{const node=el('button',text,className);node.type='button';node.addEventListener('click',action);return node;};
  const safeUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
  function external(text,url){const link=el('a',text);link.href=safeUrl(url);link.target='_blank';link.rel='noopener noreferrer';return link;}
  function portrait(entry){
    const wrap=el('span',(entry.name||'?').slice(0,1).toUpperCase(),'front-entry-image');
    const privatePath=/^\/api\/admin\/site-content\/assets\/[a-z0-9-]+\.(png|jpg)$/.test(entry.image||'');
    if(privatePath||safeUrl(entry.image)){
      const img=el('img');img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';
      img.addEventListener('load',()=>wrap.replaceChildren(img),{once:true});img.addEventListener('error',()=>img.remove(),{once:true});wrap.append(img);
      if(privatePath){
        const ticket=accessGeneration,token=authToken;
        fetch(entry.image,{headers:{Authorization:'Bearer '+token},cache:'no-store'})
          .then(response=>{if(!response.ok)throw Error('Image unavailable');return response.blob();})
          .then(blob=>{if(!allowed||ticket!==accessGeneration||token!==authToken)return;const url=URL.createObjectURL(blob);privateImages.add(url);img.src=url;img.addEventListener('load',()=>{URL.revokeObjectURL(url);privateImages.delete(url);},{once:true});})
          .catch(()=>img.remove());
      }else img.src=safeUrl(entry.image);
    }
    return wrap;
  }
  function createPanel(kind,body){
  let entries=[],generation=0,dirty=false,busy=false,page=0,rotation=null;
  let paused=Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  function stopRotation(){if(rotation!==null)clearInterval(rotation);rotation=null;}
  function startRotation(pageCount){
    stopRotation();
    if(kind!=='advisors'||pageCount<2||paused)return;
    rotation=setInterval(()=>{
      if(!allowed||panel.hidden||document.hidden||busy||body.matches(':hover')||body.contains(document.activeElement)||!body.getClientRects().length)return;
      page=(page+1)%pageCount;draw();
    },4000);
  }
  function canLeave(){return !busy&&(!dirty||window.confirm('Discard the unsaved changes in this form?'));}
  function status(text,error=false){const note=el('p',text,'front-status'+(error?' error':''));note.setAttribute('role','status');return note;}
  function draw(message=''){
    stopRotation();
    body.replaceChildren();dirty=false;
    const active=entries.filter(entry=>!entry.archived),archived=entries.filter(entry=>entry.archived);
    const pageCount=Math.max(1,Math.ceil(active.length/2));page=Math.min(page,pageCount-1);
    const list=el('div',undefined,'front-entry-page');
    list.setAttribute('aria-label',kind==='advisors'?'Advisor profiles':'Sites and newsletters');
    if(!active.length){const empty=el('div',undefined,'front-empty');empty.append(el('h3',kind==='advisors'?'People behind the project':'The dashboard, in the news'),el('p',kind==='advisors'?'Add an advisor’s name, photo and role. Their profile will appear here.':'Add a publication, its logo and a link to the feature.'));body.append(empty);}
    for(const entry of active.slice(page*2,page*2+2)){
      const row=el('div',undefined,'front-entry '+kind),copy=el('div',undefined,'front-entry-copy'),name=el('strong');
      name.append(safeUrl(entry.url)?external(entry.name,entry.url):document.createTextNode(entry.name));
      copy.append(name,el('p',kind==='advisors'?[entry.role,entry.organization].filter(Boolean).join(' · '):entry.title));
      if(entry.description)copy.append(el('p',entry.description));
      if(safeUrl(entry.url)){const link=external(kind==='advisors'?'View information ↗':'Read feature ↗',entry.url);link.className='front-source-link';copy.append(link);}
      row.append(portrait(entry),copy,button('Edit',()=>edit(entry),'front-edit'));list.append(row);
    }
    if(active.length)body.append(list);
    if(pageCount>1){
      const nav=el('nav',undefined,'front-pagination');nav.setAttribute('aria-label',kind==='advisors'?'Advisor pages':'Feature pages');
      const switchPage=(delta,direction)=>{page=(page+delta+pageCount)%pageCount;draw();body.querySelector('[data-direction="'+direction+'"]').focus({preventScroll:true});};
      const previous=button('←',()=>switchPage(-1,'previous'),'front-page-button'),next=button('→',()=>switchPage(1,'next'),'front-page-button');
      previous.dataset.direction='previous';next.dataset.direction='next';previous.setAttribute('aria-label','Previous page');next.setAttribute('aria-label','Next page');
      const count=el('span',(page+1)+' / '+pageCount,'front-page-count');
      if(kind==='advisors'){
        const toggle=button(paused?'Play':'Pause',()=>{paused=!paused;draw();body.querySelector('[data-rotation]').focus({preventScroll:true});},'front-edit');
        toggle.dataset.rotation='true';toggle.setAttribute('aria-label',paused?'Start automatic advisor rotation':'Pause automatic advisor rotation');nav.append(toggle);
      }
      nav.append(previous,count,next);body.append(nav);
    }
    const footer=el('div',undefined,'front-admin-footer');footer.append(button(kind==='advisors'?'+ Add advisor':'+ Add feature',()=>edit(null)),button('Refresh',()=>load(),'front-edit'));body.append(footer);
    if(archived.length){const details=el('details',undefined,'front-archive');details.append(el('summary','Archived ('+archived.length+')'));for(const entry of archived){const row=el('div',undefined,'front-entry');row.append(el('span',entry.name),button('Restore',()=>restore(entry),'front-edit'));details.append(row);}body.append(details);}
    if(kind==='advisors')body.append(el('p','Advisors provide independent feedback. BayDashboard is not affiliated with or endorsed by their cities or employers.','front-disclaimer'));
    body.append(status(message||'Visible only when signed in as an administrator.'));
    startRotation(pageCount);
  }
  async function load(message=''){
    if(!allowed)return;stopRotation();const ticket=++generation;body.replaceChildren(status('Loading…'));
    try{const data=await apiCall('/api/admin/site-content/'+kind);if(ticket!==generation||!allowed)return;entries=data.entries;draw(message);}
    catch(err){if(ticket!==generation)return;body.replaceChildren(status(err.message,true),button('Try again',()=>load()));}
  }
  async function restore(entry){
    if(busy)return;busy=true;const ticket=generation;
    try{await apiCall('/api/admin/site-content/'+kind+'/'+entry.id,{method:'PUT',body:JSON.stringify({...entry,archived:false})});if(allowed&&ticket===generation)await load('Restored.');}
    catch(err){if(ticket===generation)body.append(status(err.message,true));}finally{busy=false;}
  }
  function edit(entry){
    stopRotation();
    dirty=false;body.replaceChildren();const form=el('form'),heading=el('div',undefined,'front-form-title');
    heading.append(el('h3',(entry?'Edit ':'Add ')+(kind==='advisors'?'advisor':'feature')),button('Cancel',()=>{if(canLeave())draw();},'front-edit'));form.append(heading);
    const fields=el('div',undefined,'front-fields'),inputs={};
    const definitions=kind==='advisors'
      ? [['name','Full name','text',100],['role','Role / title','text',120],['organization','Organization','text',160],['url','Profile link (optional)','url',2000],['image','Photo URL or private image path','text',2000],['description','Short bio (optional)','textarea',600]]
      : [['name','Publication / organization','text',100],['title','Article or feature title','text',200],['url','Link to feature','url',2000],['image','Logo URL or private image path','text',2000],['description','Description (optional)','textarea',600]];
    for(const [key,label,type,max] of definitions){const wrap=el('label',label,'front-field'+(['url','image','description'].includes(key)?' wide':'')),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.name=key;input.value=entry?.[key]||'';input.maxLength=max;input.required=key==='name'||(kind==='featured'&&key==='url');if(type==='url')input.placeholder='https://';wrap.append(input);fields.append(wrap);inputs[key]=input;}
    const orderLabel=el('label','Display order','front-field'),order=el('input');order.type='number';order.min='0';order.max='9999';order.step='1';order.required=true;order.value=String(entry?.position??entries.length);orderLabel.append(order);fields.append(orderLabel);form.append(fields);
    const actions=el('div',undefined,'front-form-actions'),save=el('button','Save','btn'),note=status('Only the admin account can see these entries.');save.type='submit';actions.append(save);
    async function persist(archived=false){
      if(!allowed||busy||!form.reportValidity())return;busy=true;const ticket=generation;
      const data={...Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value.trim()])),position:Number(order.value),archived,...(entry?{version:entry.version}:{})};
      form.querySelectorAll('input,textarea,button').forEach(n=>n.disabled=true);note.textContent='Saving…';
      try{await apiCall('/api/admin/site-content/'+kind+(entry?'/'+entry.id:''),{method:entry?'PUT':'POST',body:JSON.stringify(data)});if(allowed&&ticket===generation){dirty=false;await load(archived?'Archived. You can restore it below.':'Saved.');}}
      catch(err){if(ticket!==generation)return;note.className='front-status error';note.textContent=err.message;form.querySelectorAll('input,textarea,button').forEach(n=>n.disabled=false);}
      finally{busy=false;}
    }
    if(entry)actions.append(button('Archive',()=>persist(true)));form.append(actions,note);body.append(form);body.scrollTop=0;
    form.addEventListener('input',()=>dirty=true);form.addEventListener('submit',event=>{event.preventDefault();persist();});
  }
  return {
    show(data){entries=data.entries;draw();},
    clear(){stopRotation();generation++;entries=[];dirty=false;busy=false;page=0;body.replaceChildren();}
  };
  }
  const columns=[
    {kind:'advisors',controller:createPanel('advisors',document.getElementById('frontAdvisorsBody'))},
    {kind:'featured',controller:createPanel('featured',document.getElementById('frontFeaturedBody'))}
  ];
  async function refreshAccess(){
    const ticket=++accessGeneration;allowed=false;panel.hidden=true;hero.classList.add('without-advisors');columns.forEach(column=>column.controller.clear());
    privateImages.forEach(url=>URL.revokeObjectURL(url));privateImages.clear();
    if(!authToken)return;
    try{
      const results=await Promise.all(columns.map(column=>apiCall('/api/admin/site-content/'+column.kind)));
      if(ticket!==accessGeneration||!authToken)return;
      allowed=true;columns.forEach((column,index)=>column.controller.show(results[index]));panel.hidden=false;hero.classList.remove('without-advisors');
    }catch{/* Normal visitors keep the standard front page. */}
  }
  globalThis.SiteAdmin={refreshAccess};
  refreshAccess();
})();
