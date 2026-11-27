(function(){
  const civic=window.ProjectCivic;
  const glossary=document.createElement('dialog');glossary.id='glossaryDialog';glossary.className='civic-glossary-dialog';
  glossary.innerHTML='<button type="button" class="btn secondary" data-close-glossary>Close glossary</button><h2>Planning glossary</h2><dl>'+Object.entries(civic.GLOSSARY).map(([term,[definition,url]])=>'<dt id="glossary-'+term.replace(/[^a-z0-9]+/gi,'-')+'">'+civic.esc(term)+'</dt><dd>'+civic.esc(definition)+' <a href="'+civic.esc(url)+'" target="_blank" rel="noopener">Read the official guidance ↗</a></dd>').join('')+'</dl>';
  document.body.append(glossary);
  let glossaryFocus=null;
  const floatingTip=document.createElement('div');floatingTip.className='glossary-floating-tip';floatingTip.hidden=true;document.body.append(floatingTip);
  const showTip=anchor=>{const term=anchor.dataset.glossary;const definition=civic.GLOSSARY[term]?.[0];if(!definition)return;floatingTip.textContent=definition;floatingTip.hidden=false;const rect=anchor.getBoundingClientRect();floatingTip.style.left=Math.max(8,Math.min(rect.left,innerWidth-Math.min(290,innerWidth-24)-8))+'px';floatingTip.style.top=Math.max(8,rect.bottom+8)+'px';};
  document.addEventListener('pointerover',event=>{const anchor=event.target.closest('[data-glossary]');if(anchor)showTip(anchor);});
  document.addEventListener('focusin',event=>{const anchor=event.target.closest('[data-glossary]');if(anchor)showTip(anchor);});
  document.addEventListener('pointerout',event=>{if(event.target.closest('[data-glossary]')&&!floatingTip.contains(event.relatedTarget))floatingTip.hidden=true;});
  document.addEventListener('focusout',()=>{floatingTip.hidden=true;});
  document.addEventListener('scroll',()=>{floatingTip.hidden=true;},true);
  const openGlossary=target=>{glossaryFocus=document.activeElement;floatingTip.hidden=true;glossary.showModal();glossary.querySelector(target||'h2')?.scrollIntoView({block:'nearest'});};
  glossary.querySelector('[data-close-glossary]').onclick=()=>glossary.close();
  glossary.addEventListener('close',()=>glossaryFocus?.focus?.());
  document.addEventListener('click',event=>{const term=event.target.closest('[data-glossary]');if(term){event.preventDefault();openGlossary('#glossary-'+term.dataset.glossary.replace(/[^a-z0-9]+/gi,'-'));}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){floatingTip.hidden=true;}if(event.key==='Escape')document.querySelectorAll('.glossary-term:focus-within,.glossary-term:hover').forEach(el=>el.classList.add('tooltip-dismissed'));});
  document.addEventListener('focusout',event=>event.target.closest('.glossary-term')?.classList.remove('tooltip-dismissed'));
  let termId=0,queued=false;const pending=new Set();
  const terms=Object.keys(civic.GLOSSARY).sort((a,b)=>b.length-a.length);
  const pattern=new RegExp('\\b('+terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace("'","['’]")).join('|')+')\\b','gi');
  function annotate(root){
    if(!root.isConnected)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];let node;
    while((node=walker.nextNode())){
      if(!node.parentElement.closest('.card .desc,.record-note,.ps-sec p,.ps-lede,.ps-note')||node.parentElement.closest('a,button,textarea,script,style,.glossary-term'))continue;
      nodes.push(node);
    }
    for(const text of nodes){
      pattern.lastIndex=0;const matches=[...text.nodeValue.matchAll(pattern)];if(!matches.length)continue;
      const fragment=document.createDocumentFragment();let at=0;
      for(const match of matches){
        fragment.append(document.createTextNode(text.nodeValue.slice(at,match.index)));
        const term=match[0].toLowerCase().replace('’',"'"),definition=civic.GLOSSARY[term];if(!definition)continue;
        const wrap=document.createElement('span');wrap.className='glossary-term';
        const a=document.createElement('a');a.href='#glossary-'+term.replace(/[^a-z0-9]+/gi,'-');a.dataset.glossary=term;a.textContent=match[0];
        const tip=document.createElement('span');tip.id='term-tip-'+(++termId);tip.className='sr-only';tip.role='tooltip';tip.textContent=definition[0];a.setAttribute('aria-describedby',tip.id);
        wrap.append(a,tip);fragment.append(wrap);at=match.index+match[0].length;
      }
      fragment.append(document.createTextNode(text.nodeValue.slice(at)));text.replaceWith(fragment);
    }
  }
  const observer=new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&!node.closest('.glossary-term,.leaflet-container,.gm-style'))pending.add(node);
    if(queued||!pending.size)return;queued=true;
    requestAnimationFrame(()=>{queued=false;observer.disconnect();const roots=[...pending];pending.clear();roots.filter(r=>!roots.some(other=>other!==r&&other.contains(r))).forEach(annotate);observe();});
  });
  function observe(){observer.observe(document.body,{subtree:true,childList:true});}
  annotate(document.body);observe();
  let currentProject=null;
  setInterval(()=>{const active=currentProject;if(!active?.host?.isConnected||active.host.closest('[hidden]'))return;const deadlines=civic.profile(active.record,active.city).deadlines;active.host.querySelectorAll('[data-civic-deadline]').forEach(counter=>{const item=deadlines.find(d=>d.at===counter.dataset.civicDeadline&&(d.kind||'comment')===counter.dataset.deadlineKind);const status=civic.deadline(item);if(status&&counter.textContent!==status.text)counter.textContent=status.text;});},60000);
  window.addEventListener('project:open',async event=>{
    const {record,city}=event.detail;
    const host=document.getElementById('projectParticipation');
    currentProject={host,record,city,feed:null};
    const form=document.getElementById('projectFeedbackForm');
    if(form)form.addEventListener('submit',async e=>{
      e.preventDefault();const status=document.getElementById('projectFeedbackStatus'),button=form.querySelector('button');button.disabled=true;
      try{const r=await fetch('/api/project-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:record.id,note:form.querySelector('textarea').value})});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save the correction.');status.textContent='Correction received. The site owner can review it.';form.querySelector('textarea').value='';}
      catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    });
    const toggle=document.getElementById('projectAlertToggle'),status=document.getElementById('projectAlertStatus');let enabled=false;
    if(toggle){
      toggle.addEventListener('click',async()=>{
        if(typeof isLoggedIn!=='function'||!isLoggedIn()){status.textContent='Sign in and add an email address in Your Account to enable email alerts. You can still read all project details without an account.';return;}
        toggle.disabled=true;
        try{const data=await apiCall('/api/project-alerts',{method:'POST',body:JSON.stringify({projectId:record.id,enabled:!enabled})});enabled=data.enabled;toggle.textContent=enabled?'Turn off this project’s hearing alerts':'Alert me when this project is on an agenda';status.textContent=enabled?'Hearing alerts enabled. We check connected agendas about every six hours while the service is running and aim to notify you in the week before the hearing, or later if the agenda is published late. These alerts are separate from monthly recaps.':'Hearing alerts turned off.';}
        catch(error){status.textContent=error.message;}finally{toggle.disabled=false;}
      });
      if(typeof isLoggedIn==='function'&&isLoggedIn())apiCall('/api/project-alerts').then(data=>{if(!toggle.isConnected)return;enabled=data.projectIds.includes(record.id);toggle.textContent=enabled?'Turn off this project’s hearing alerts':'Alert me when this project is on an agenda';}).catch(()=>{});
    }
    try{const feed=await loadCalendarMeetings();if(host?.isConnected&&document.getElementById('projectParticipation')===host){currentProject={host,record,city,feed};host.innerHTML=civic.participationHTML(record,city,feed);}}
    catch{/* The official calendar and explicitly unknown fields remain available. */}
  });
  document.querySelector('[data-open-glossary]')?.addEventListener('click',()=>openGlossary());
  const oldHash=location.hash;
  if(oldHash.startsWith('#project=')){const id=new URLSearchParams(oldHash.slice(1)).get('project');const found=typeof findProject==='function'?findProject(id):null;if(found){switchCity(found.cityKey);openProjectSheet(id);}}
  async function refreshProjectAlerts(){
    const host=document.getElementById('accountProjectAlerts');if(!host)return;
    try{const data=await apiCall('/api/project-alerts');host.replaceChildren();if(!data.projects?.length){host.textContent='No project hearing alerts enabled.';return;}for(const project of data.projects){const row=document.createElement('p'),link=document.createElement('a'),off=document.createElement('button');link.href='/?city='+encodeURIComponent(project.city)+'&project='+encodeURIComponent(project.id);link.textContent=project.addr;off.type='button';off.className='btn secondary';off.textContent='Turn off';off.setAttribute('aria-label','Turn off hearing alerts for '+project.addr);off.onclick=async()=>{off.disabled=true;try{await apiCall('/api/project-alerts',{method:'POST',body:JSON.stringify({projectId:project.id,enabled:false})});await refreshProjectAlerts();}catch(error){host.textContent=error.message;}};row.append(link,document.createTextNode(' '),off);host.append(row);}}
    catch(error){host.textContent=error.message;}
  }
  document.getElementById('refreshProjectAlerts')?.addEventListener('click',refreshProjectAlerts);
  document.addEventListener('click',event=>{if(event.target.closest('[data-acct="email"]'))void refreshProjectAlerts();});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('#loadProjectCorrections');if(!button)return;
    const host=document.getElementById('projectCorrections');button.disabled=true;
    try{const data=await apiCall('/api/admin/project-feedback');host.innerHTML=data.reports.length?'<ul>'+data.reports.map(r=>'<li><strong>'+civic.esc(r.project_id)+'</strong> · '+civic.esc(String(r.created_at).slice(0,10))+'<p>'+civic.esc(r.note)+'</p></li>').join('')+'</ul>':'No corrections have been submitted.';}
    catch(error){host.textContent=error.message;}finally{button.disabled=false;}
  });
})();
