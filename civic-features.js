import crypto from 'node:crypto';
import './public/project-civic.js';
import './public/project-evidence.js';
import {PROJECTS} from './data/projects.js';
const {esc,safeURL,matchedHearings,day}=globalThis.ProjectCivic;
const projectById=new Map(PROJECTS.map(p=>[p.id,p]));
export async function initCivicFeatures(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS project_feedback (id SERIAL PRIMARY KEY, project_id TEXT NOT NULL, note TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS project_alerts (username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE, project_id TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(username,project_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS hearing_alert_deliveries (username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE, event_key TEXT NOT NULL, state TEXT NOT NULL, claimed_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(username,event_key))`);
}
export function hearingAlertsFor(project,feed,now=new Date()){
  const today=day(now),last=day(new Date(now.getTime()+8*86400000));
  return matchedHearings(project,feed,now).filter(h=>h.date<=last&&h.date>=today&&safeURL(h.agendaFile||h.agendaUrl));
}
export function registerCivicFeatures(app,{pool,authMiddleware,isAdminRequest,cronSecret,getHearings,sendEmail,emailsPaused,cityLabels={}}){
  const rate=new Map();
  const cityQuality=new Map(Object.entries(cityLabels).map(([id,label])=>[id,{id,label,records:0,checkedRecords:0,coverage:'Resources and meetings only'}]));
  for(const project of PROJECTS){
    const q=cityQuality.get(project.city)||{id:project.city,label:cityLabels[project.city]||project.city,records:0,checkedRecords:0,coverage:'Partial project coverage'};
    q.records++;if(globalThis.ProjectCivic.profile(project).checkedAt)q.checkedRecords++;
    q.coverage='Partial project coverage';cityQuality.set(project.city,q);
  }
  app.get('/api/coverage-quality',(_req,res)=>res.json({cities:[...cityQuality.values()].sort((a,b)=>a.label.localeCompare(b.label)),note:'Counts include source records and historical applications. Complete citywide inventories have not been certified. A last activity date is not a source-check date.'}));
  app.get('/api/project-record/:id',(req,res)=>{const project=projectById.get(req.params.id);if(!project)return res.status(404).json({error:'Project not found.'});res.json({project});});
  app.post('/api/project-feedback',async(req,res)=>{
    const id=String(req.body?.projectId||''),note=String(req.body?.note||'').trim();
    if(!projectById.has(id)||note.length<10||note.length>3000)return res.status(400).json({error:'Choose a project and describe the correction in 10–3,000 characters.'});
    if(!pool)return res.status(503).json({error:'Corrections are temporarily unavailable. Please try again.'});
    const ip=req.ip,now=Date.now(),entry=rate.get(ip);
    if(entry&&entry.until>now&&entry.count>=5)return res.status(429).json({error:'Please wait before sending another correction.'});
    if(rate.size>5000)for(const [key,value]of rate)if(value.until<now)rate.delete(key);
    rate.set(ip,entry&&entry.until>now?{...entry,count:entry.count+1}:{count:1,until:now+3600000});
    try{await pool.query('INSERT INTO project_feedback (project_id,note) VALUES ($1,$2)',[id,note]);return res.status(201).json({ok:true});}
    catch{return res.status(503).json({error:'The correction could not be saved. Please try again.'});}
  });
  app.get('/api/admin/project-feedback',async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    if(!await isAdminRequest(req))return res.status(404).json({error:'API route not found.'});
    try{const result=await pool.query('SELECT id,project_id,note,created_at FROM project_feedback ORDER BY created_at DESC LIMIT 100');res.json({reports:result.rows});}
    catch{res.status(503).json({error:'Corrections are temporarily unavailable.'});}
  });
  app.get('/api/project-alerts',authMiddleware,async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    try{const r=await pool.query('SELECT project_id FROM project_alerts WHERE username=$1',[req.username]);res.json({projectIds:r.rows.map(r=>r.project_id),projects:r.rows.map(r=>projectById.get(r.project_id)).filter(Boolean).map(p=>({id:p.id,addr:p.addr,city:p.city}))});}
    catch{res.status(503).json({error:'Hearing alerts are temporarily unavailable.'});}
  });
  app.post('/api/project-alerts',authMiddleware,async(req,res)=>{
    const id=String(req.body?.projectId||'');
    if(!projectById.has(id)||typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'Choose a valid project and alert setting.'});
    try{
      if(!req.body.enabled){await pool.query('DELETE FROM project_alerts WHERE username=$1 AND project_id=$2',[req.username,id]);return res.json({ok:true,enabled:false});}
      const user=await pool.query('SELECT email FROM users WHERE username=$1',[req.username]);
      if(!user.rows[0]?.email)return res.status(400).json({error:'Add an email address in Your Account before enabling hearing alerts.'});
      const feed=await getHearings();
      if(!feed.cities?.includes(projectById.get(id).city))return res.status(400).json({error:'A live agenda feed is not connected for this city yet. Use its official meeting calendar.'});
      const count=await pool.query('SELECT COUNT(*)::int AS n FROM project_alerts WHERE username=$1',[req.username]);
      if(count.rows[0].n>=100)return res.status(400).json({error:'You can track up to 100 projects for hearing alerts.'});
      await pool.query('INSERT INTO project_alerts (username,project_id) VALUES ($1,$2) ON CONFLICT (username,project_id) DO NOTHING',[req.username,id]);
      res.json({ok:true,enabled:true});
    }catch{res.status(503).json({error:'The alert setting could not be saved.'});}
  });
  let pending=false;
  app.post('/api/cron/hearing-alerts',async(req,res)=>{
    if(!cronSecret||req.headers['x-cron-secret']!==cronSecret)return res.status(401).json({error:'Invalid cron secret.'});
    if(!pool)return res.status(503).json({error:'Database unavailable.'});
    if(pending)return res.status(409).json({error:'A hearing-alert run is already in progress.'});
    const dryRun=req.body?.dryRun!==false;
    if(emailsPaused&&!dryRun)return res.json({paused:true,sent:0});
    pending=true;
    try{
      const feed=await getHearings();
      const subscriptions=await pool.query('SELECT a.username,a.project_id,u.email FROM project_alerts a JOIN users u ON u.username=a.username WHERE u.email IS NOT NULL');
      let due=0,sent=0,failed=0;
      for(const sub of subscriptions.rows){
        const project=projectById.get(sub.project_id);if(!project)continue;
        for(const hearing of hearingAlertsFor(project,feed)){
          const source=hearing.agendaFile||hearing.agendaUrl;
          const eventKey=crypto.createHash('sha256').update([project.id,hearing.city,hearing.body,hearing.date,source].join('|')).digest('hex');
          const seen=await pool.query('SELECT state FROM hearing_alert_deliveries WHERE username=$1 AND event_key=$2',[sub.username,eventKey]);
          if(seen.rows.length&&seen.rows[0].state!=='failed')continue;
          due++;if(dryRun)continue;
          const claim=await pool.query(`INSERT INTO hearing_alert_deliveries (username,event_key,state) VALUES ($1,$2,'sending') ON CONFLICT (username,event_key) DO UPDATE SET state='sending',claimed_at=now() WHERE hearing_alert_deliveries.state='failed' RETURNING event_key`,[sub.username,eventKey]);
          if(!claim.rows.length)continue;
          let providerAccepted=false;
          try{
            const origin=process.env.SITE_URL||'https://calcivicdashboard.com';
            await sendEmail(sub.email,'Hearing alert: '+project.addr,
              '<h1>Your tracked project is on an agenda</h1><p>'+esc(project.addr)+'</p><p>'+esc(hearing.body+' · '+hearing.date+(hearing.time?' · '+hearing.time:''))+'</p><p><a href="'+esc(source)+'">Read the agenda and participation instructions</a></p><p>Check the agenda for cancellations, comment deadlines and speaking limits. This message does not establish an appeal deadline.</p><p><a href="'+esc(origin)+'/?city='+encodeURIComponent(project.city)+'&project='+encodeURIComponent(project.id)+'">Open the project and manage this alert</a>. You requested hearing alerts for this project. Turn them off in its project details.</p>',{idempotencyKey:'hearing-'+eventKey+'-'+crypto.createHash('sha256').update(sub.username).digest('hex').slice(0,16)});
            providerAccepted=true;
            await pool.query("UPDATE hearing_alert_deliveries SET state='sent' WHERE username=$1 AND event_key=$2",[sub.username,eventKey]);sent++;
          }catch{if(!providerAccepted)await pool.query("UPDATE hearing_alert_deliveries SET state='failed' WHERE username=$1 AND event_key=$2",[sub.username,eventKey]);failed++;}
        }
      }
      res.json({dryRun,due,sent,failed,feedErrors:(feed.errors||[]).length});
    }catch{res.status(503).json({error:'The hearing-alert run could not finish. No new delivery is assumed.'});}
    finally{pending=false;}
  });
}
