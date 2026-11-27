/* Shared source-backed project details. Unknown facts stay unknown. */
(function(root){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
  const link=(url,label)=>safeURL(url)?'<a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label)+' ↗</a>':esc(label);
  const day=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const dateText=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',year:'numeric'}):'Not documented';
  const STAGES=[['preliminary','Preliminary application'],['complete','Application complete'],['commission','Planning Commission'],['council','City Council'],['appeal','Appeal window'],['permit','Building permit'],['construction','Construction']];
  const PATHWAYS={
    ministerial:['Ministerial','If the project qualifies and meets the applicable objective standards, the city must approve it without a discretionary hearing.'],
    limited:['Streamlined or limited','State housing law limits some local grounds for denial or changes. The exact limits depend on the project and its eligibility.'],
    discretionary:['Discretionary','The city reviews the proposal through a discretionary process and may deny it on legally supported grounds; state housing protections can still apply.'],
    unknown:['Not established','The linked records do not establish how much discretion the city has. Ask the planning department which approval process applies.']
  };
  const GLOSSARY={
    entitlement:['An approval allowing a particular development or use. A building permit may still be needed.','https://www.hcd.ca.gov/planning-and-community-development'],
    vesting:['Rules or development rights preserved at a legally defined point in an application. Which rights are preserved depends on the law and facts.','https://www.hcd.ca.gov/planning-and-community-development/housing-accountability-unit'],
    "builder's remedy":['A Housing Accountability Act protection that can limit denial of qualifying housing applications when a city lacks a compliant housing element. Eligibility is project-specific.','https://www.hcd.ca.gov/planning-and-community-development/housing-accountability-unit'],
    'density bonus':['Extra housing density and, when applicable, concessions or waivers in exchange for qualifying affordable housing or other statutory criteria.','https://www.hcd.ca.gov/planning-and-community-development/housing-accountability-unit'],
    'CEQA exemption':['A statutory or categorical basis for not preparing a full CEQA environmental review, subject to the applicable requirements and exceptions.','https://opr.ca.gov/ceqa/'],
    'conditions of approval':['Requirements attached to an approval, such as design changes, mitigation measures or work required before permits are issued.','https://www.hcd.ca.gov/planning-and-community-development'],
    'deemed complete':['The agency has determined that an application contains the information needed for processing. This is not project approval.','https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=65943.'],
    ministerial:['A review against objective rules, without discretionary judgment, for projects that meet the applicable eligibility requirements.','https://www.hcd.ca.gov/planning-and-community-development/statutory-determinations']
  };
  function sourceFor(record,city={}){return safeURL(record.sourceUrl)||safeURL(city.planning)||(city.ctaLinks||[]).map(l=>safeURL(l.url)).find(Boolean)||null;}
  function profile(record,city={}){
    const evidence=root.PROJECT_EVIDENCE?.[record.id]||{};
    const stated=record.approvalProcess;
    const process=evidence.discretion||(['ministerial','limited','discretionary'].includes(stated?.kind)&&safeURL(stated.sourceUrl)?stated:null);
    const kind=process?.kind||'unknown';
    return {evidence,kind,label:PATHWAYS[kind]?.[0]||PATHWAYS.unknown[0],explanation:process?.explanation||PATHWAYS[kind]?.[1]||PATHWAYS.unknown[1],
      legalSource:safeURL(process?.sourceUrl),checkedAt:evidence.checkedAt||record.lastChecked||record.retrievedAt||null,
      source:sourceFor(record,city),milestones:evidence.milestones||record.milestones||[],deadlines:evidence.deadlines||record.deadlines||[],
      participation:evidence.participation||record.participation||{},conflicts:evidence.conflicts||record.sourceConflicts||[],facts:evidence.facts||[]};
  }
  function deadline(item,now=new Date()){
    if(!item?.sourceUrl||!safeURL(item.submitUrl)||!safeURL(item.sourceUrl))return null;
    const value=String(item.at||'');
    // Never invent an end-of-day or a time zone for a date-only notice.
    const dated=/^\d{4}-\d{2}-\d{2}$/.test(value);
    const timed=/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value);
    if(!dated&&!timed)return null;
    const today=day(now);
    const diff=dated?Math.round((Date.parse(value+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000):(Date.parse(value)-now.getTime())/86400000;
    if(!Number.isFinite(diff))return null;
    if(dated&&new Date(Date.parse(value+'T12:00:00Z')).toISOString().slice(0,10)!==value)return null;
    const type=item.kind==='appeal'?'Appeal window':'Public comment';
    if(diff<0)return {state:'closed',text:type+' deadline passed',date:value,item};
    if(dated&&diff===0)return {state:'today',text:type+' deadline is today; confirm the cutoff time',date:value,item};
    if(dated)return {state:'open',text:type+' deadline in '+diff+' '+(diff===1?'day':'days')+'; confirm the cutoff time',date:value,item};
    const n=Math.ceil(diff);
    return {state:'open',text:type+(n<=1?' closes within 24 hours':' closes in '+n+' days'),date:value,item};
  }
  function matchedHearings(record,feed,now=new Date()){
    const today=day(now);
    return (feed?.hearings||[]).filter(h=>h.date>=today&&(h.matters||[]).some(m=>(m.projects||[]).some(p=>p.id===record.id))).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function label(record,stage){
    const title=record.displayName||record.addr||record.id;
    return [title,Number.isFinite(record.units)&&record.units>0?record.units+' '+(record.unitLabel||(record.type==='Residential'?'homes':'housing units')):null,stage||record.reportedStatus||record.stage||'status not documented'].filter(Boolean).join(', ');
  }
  function coverage(city={}){
    if(city.coverageComplete===true&&safeURL(city.coverageSource))return {kind:'complete',label:'Complete for the stated source and scope',detail:city.coverageScope||'See the coverage source for its scope.'};
    if((city.data||[]).length||city.recordCount>0)return {kind:'partial',label:'Partial project coverage',detail:'Selected records are included. This is not a complete inventory of development or permits.'};
    return {kind:'directory',label:'Resources and meetings only',detail:'No verified project inventory is connected. Check official planning and meeting pages.'};
  }
  function card(record,city){
    const p=profile(record,city);
    const open=p.deadlines.map(d=>deadline(d)).filter(d=>d&&d.state!=='closed').sort((a,b)=>a.date.localeCompare(b.date))[0];
    return '<div class="project-trust"><span><span>City discretion:</span> <span>'+esc(p.label)+'</span></span><span>'+(p.checkedAt?'<span>Last checked</span> '+esc(dateText(p.checkedAt)):'<span>Source check date not recorded</span>')+'</span></div>'+(open?'<p class="project-deadline-preview"><strong data-civic-deadline="'+esc(open.item.at)+'" data-deadline-kind="'+esc(open.item.kind||'comment')+'">'+esc(open.text)+'</strong> '+link(open.item.submitUrl,'How to submit')+'</p>':'');
  }
  function participationHTML(record,city,feed,now=new Date()){
    const p=profile(record,city),details=p.participation;
    const hearing=matchedHearings(record,feed,now)[0];
    const directory=root.MEETING_DIRECTORY?.[record.city];
    const meetings=city.meetings||(directory?.links||[]).find(l=>/agenda|calendar/i.test(l.title))?.url||root.MEETING_DIRECTORY?.[record.city]?.agendas||root.MEETING_DIRECTORY?.[record.city]?.url||(city.ctaLinks||[]).find(l=>/meeting|agenda/i.test(l.label))?.url;
    const dls=p.deadlines.map(d=>deadline(d,now)).filter(Boolean);
    const source=safeURL(details.sourceUrl);
    const verified=Boolean(source);
    let html='<h3>How to participate</h3>';
    if(feed&&record.city&&!feed.cities?.includes(record.city))html+='<p>No live agenda feed is connected for this city. Automatic hearing alerts cannot detect its project hearings yet. Use the official calendar.</p>';
    html+=hearing?'<p><strong>Next hearing</strong>: '+esc(dateText(hearing.date)+(hearing.time?' · '+hearing.time:'')+' · '+hearing.body)+'</p><p>'+link(hearing.agendaFile||hearing.agendaUrl,'Read the current agenda and speaking instructions')+'</p>':'<p>No upcoming hearing for this project is verified here. Check the official calendar.</p>';
    if(verified){
      html+='<p>'+esc(details.context||'Participation instructions from the linked record. Confirm the next meeting’s instructions before attending.')+'</p>';
      html+='<dl class="participation-facts"><dt>Ways to speak</dt><dd>'+esc(details.methods||'Not documented; check the agenda.')+'</dd><dt>Written comments</dt><dd>'+(details.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)?'<a href="mailto:'+esc(details.email)+'">'+esc(details.email)+'</a>':'Not documented; check the agenda.')+'</dd><dt>Speaking time</dt><dd>'+esc(details.speakingTime||'Not documented; check the agenda.')+'</dd></dl>';
      if(details.agencyEmail&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.agencyEmail))html+='<p><strong>Lead agency contact</strong>: <a href="mailto:'+esc(details.agencyEmail)+'">'+esc(details.agencyEmail)+'</a>. Confirm the submission instructions in the notice.</p>';
      html+='<p>'+link(source,'Participation source')+'</p>';
    }else html+='<p>Speaking format, comment email and speaking time are not yet verified for this project. The current agenda has the instructions.</p>';
    html+='<div class="project-deadlines">'+(dls.length?dls.map(d=>'<p><strong data-civic-deadline="'+esc(d.item.at)+'" data-deadline-kind="'+esc(d.item.kind||'comment')+'">'+esc(d.text)+'</strong><br>'+esc(d.date)+(d.item.note?' · '+esc(d.item.note):'')+'<br>'+link(d.item.submitUrl,d.state==='closed'?'Read the original notice':'How to submit')+' · '+link(d.item.sourceUrl,'Deadline source')+'</p>').join(''):'<p>No verified open comment or appeal deadline is recorded. Do not assume that comments or appeals remain open.</p>')+'</div>';
    return html+'<div class="ps-links">'+(meetings?link(meetings,'Official meetings and agendas'):'')+' '+(p.source?link(p.source,'Project source'):'')+'</div>';
  }
  function details(record,city={}){
    const p=profile(record,city),confirmed=p.milestones.filter(m=>m.date&&safeURL(m.sourceUrl));
    const sequence=STAGES.map(([key,title])=>{
      const items=confirmed.filter(m=>m.step===key);
      return '<li class="'+(items.length?'documented':'unverified')+'"><strong>'+esc(title)+'</strong>'+(items.length?items.map(m=>'<span>'+esc(dateText(m.date)+' · '+m.text)+' '+link(m.sourceUrl,'Source')+'</span>').join(''):'<span>Not documented in the connected records.</span>')+'</li>';
    }).join('');
    const next=p.evidence.nextStep||'No next milestone is verified. Ask the planning department about the next decision or permit.';
    return '<section class="ps-sec civic-discretion"><h3>Can the city still say no?</h3><p><strong>'+esc(p.label)+'</strong></p><p>'+esc(p.explanation)+'</p>'+(p.legalSource?'<p>'+link(p.legalSource,'Approval process source')+'</p>':'')+'<p class="ps-note">General information, not legal advice. Eligibility and legal rights require the actual application and current law.</p></section>'
      +'<section class="ps-sec"><h3>Project timeline</h3><p>'+esc('Latest reported stage: '+(record.reportedStatus||record.stage||'not documented'))+'</p><p>'+esc(next)+'</p><details class="project-timeline"><summary>Approval steps and dated records</summary><ol>'+sequence+'</ol></details></section>'
      +'<section class="ps-sec project-participation" id="projectParticipation" aria-live="polite">'+participationHTML(record,city,null)+'</section>'
      +(p.conflicts.length?'<section class="ps-sec project-conflicts"><h3>Sources disagree or have changed</h3><p>These records report different statuses. Dates and scope matter; neither is silently discarded.</p><ul>'+p.conflicts.map(c=>'<li><strong>'+esc(c.status)+'</strong> · '+esc(c.date?dateText(c.date):'Record date not stated')+'<p>'+esc(c.note||'')+'</p>'+link(c.sourceUrl,c.label||'Source')+'</li>').join('')+'</ul></section>':'')
      +'<section class="ps-sec"><h3>Freshness and fact sources</h3><p>'+esc(p.checkedAt?'Last checked '+dateText(p.checkedAt):'Last checked: not recorded. The activity date is not a verification date.')+'</p><p>'+esc(coverage(city).label+' · '+coverage(city).detail)+'</p>'+(p.facts.length?'<dl class="project-fact-sources">'+p.facts.map(f=>'<dt>'+esc(f.label)+'</dt><dd>'+esc(f.value)+' '+link(f.sourceUrl,f.sourceLabel||'Source')+'</dd>').join(''):'<p>Per-fact document references have not been added to this record. Use the linked original record to confirm the displayed facts.</p>')+'</section>'
      +'<section class="ps-sec"><h3>Keep track or correct a record</h3><button class="btn secondary" type="button" id="projectAlertToggle">Alert me when this project is on an agenda</button><p id="projectAlertStatus" role="status"></p><details><summary>Report an error</summary><form id="projectFeedbackForm"><label for="projectFeedbackNote">What needs correcting?</label><textarea id="projectFeedbackNote" required minlength="10" maxlength="3000" rows="4"></textarea><p>Project ID: <code>'+esc(record.id)+'</code>. Your note goes to the site owner for review.</p><button class="btn" type="submit">Send correction</button><p id="projectFeedbackStatus" role="status"></p></form></details></section>';
  }
  root.ProjectCivic={esc,safeURL,day,dateText,profile,deadline,matchedHearings,label,coverage,card,details,participationHTML,GLOSSARY,STAGES};
})(globalThis);
