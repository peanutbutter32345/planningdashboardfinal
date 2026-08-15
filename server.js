import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { SOURCES } from './data/sources.js';
import { SYSTEM_INSTRUCTIONS } from './instructions.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
const vectorStoreId = (process.env.OPENAI_VECTOR_STORE_ID || '').trim();
const enableWebSearch = String(process.env.ENABLE_WEB_SEARCH || '').toLowerCase() === 'true';

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. The site will load, but /api/ask will return a configuration error.');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing-key' });

app.use(express.json({ limit: '4mb' }));
app.use(express.static('public'));

const STOP = new Set(['what','which','where','when','why','how','are','the','and','for','with','from','about','this','that','have','does','near','city','project','projects','planning','please','tell','show','into','under','over','most','major']);

function tokens(text='') {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}

function rankSources(question, cityLabel) {
  const q = tokens(question);
  const citySources = SOURCES.filter(s => !cityLabel || s.city === cityLabel);
  const categoryBoosts = [
    [/housing|affordable|bmr|unit|residential|adu/, ['Housing','Development','Project']],
    [/transport|traffic|bike|bicycle|pedestrian|transit|caltrain|vmt|road|street|corridor|vision zero/, ['Transportation']],
    [/permit|building permit|entitlement/, ['Permits','Development']],
    [/zoning|land use|general plan|specific plan|precise plan/, ['Zoning','Land Use','Planning']],
    [/ceqa|eir|environment|environmental/, ['Environmental']],
    [/hearing|meeting|council|commission|agenda|comment|participat/, ['Meetings','Public Records','Planning']],
    [/capital|cip|public works|infrastructure|facility|park/, ['Capital Projects','Public Works']],
    [/map|gis/, ['GIS']],
  ];
  const boosted = new Set();
  for (const [re,cats] of categoryBoosts) if (re.test(question.toLowerCase())) cats.forEach(c => boosted.add(c));

  return citySources.map(s => {
    const hay = `${s.title} ${s.category} ${s.note} ${s.url}`.toLowerCase();
    let score = boosted.has(s.category) ? 8 : 0;
    for (const word of q) if (hay.includes(word)) score += word.length >= 6 ? 4 : 2;
    if (s.category === 'Development' || s.category === 'Planning') score += 1;
    return {source:s, score};
  }).sort((a,b)=>b.score-a.score).slice(0,18).map(x=>x.source);
}

function projectHaystack(p) {
  return [p.id,p.addr,p.address,p.name,p.type,p.desc,p.description,p.applicant,p.fileNo,p.fileNumber,p.lastNote,p.flag,p.stage].filter(Boolean).join(' ').toLowerCase();
}

function rankProjects(question, projects=[]) {
  if (!Array.isArray(projects)) return [];
  const q = tokens(question);
  const scored = projects.map(p => {
    const hay = projectHaystack(p);
    let score = 0;
    for (const word of q) if (hay.includes(word)) score += word.length >= 5 ? 3 : 1;
    if (/affordable|bmr/.test(question.toLowerCase()) && Number(p.bmr || p.affordableUnits || 0) > 0) score += 4;
    if (/largest|most|biggest/.test(question.toLowerCase()) && Number(p.units || 0) > 0) score += Math.min(Number(p.units)/200, 5);
    return {p,score};
  }).sort((a,b)=>b.score-a.score);

  const matched = scored.filter(x=>x.score>0).slice(0,24).map(x=>x.p);
  return matched.length ? matched : scored.slice(0,16).map(x=>x.p);
}

function cleanHistory(history=[]) {
  if (!Array.isArray(history)) return [];
  return history.slice(-8).filter(m => ['user','assistant'].includes(m?.role) && typeof m?.content === 'string').map(m => ({role:m.role, content:m.content.slice(0,6000)}));
}

const outputSchema = {
  type:'object',
  additionalProperties:false,
  required:['answer','resource_ids'],
  properties:{
    answer:{type:'string'},
    resource_ids:{type:'array',items:{type:'string'},maxItems:8}
  }
};

app.get('/api/health', (_req,res) => {
  res.json({ok:true, model, fileSearch:Boolean(vectorStoreId), webSearch:enableWebSearch, sourceCount:SOURCES.length});
});

app.get('/api/sources', (req,res) => {
  const city = String(req.query.city || '');
  res.json(city ? SOURCES.filter(s=>s.city===city) : SOURCES);
});

app.post('/api/ask', async (req,res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({error:'OPENAI_API_KEY is not configured on the server yet.'});
    }

    const question = String(req.body?.question || '').trim();
    const context = req.body?.context || {};
    if (!question) return res.status(400).json({error:'Question is required.'});
    if (question.length > 6000) return res.status(400).json({error:'Question is too long.'});

    const cityLabel = String(context.cityLabel || context.cityKey || '').trim();
    const candidateSources = rankSources(question, cityLabel);
    const candidateProjects = rankProjects(question, context.projects || []);
    const history = cleanHistory(req.body?.history || []);

    const sourceIndex = candidateSources.map(s => ({id:s.id,title:s.title,category:s.category,note:s.note,url:s.url}));
    const civicContext = {
      selected_city: cityLabel,
      relevant_dashboard_projects: candidateProjects,
      dashboard_participation: {
        deciders: Array.isArray(context.deciders) ? context.deciders.slice(0,12) : [],
        boards: Array.isArray(context.boards) ? context.boards.slice(0,12) : [],
        links: Array.isArray(context.links) ? context.links.slice(0,12) : []
      },
      candidate_official_sources: sourceIndex
    };

    const tools = [];
    if (vectorStoreId) tools.push({type:'file_search', vector_store_ids:[vectorStoreId], max_num_results:8});
    if (enableWebSearch) tools.push({type:'web_search'});

    const input = [
      ...history,
      {
        role:'user',
        content:`CURRENT CIVIC CONTEXT\n${JSON.stringify(civicContext)}\n\nQUESTION\n${question}\n\nReturn an answer plus only the IDs of the official candidate sources that are genuinely relevant. Do not invent source IDs.`
      }
    ];

    const response = await openai.responses.create({
      model,
      reasoning:{effort:'low'},
      max_output_tokens:600,
      instructions:SYSTEM_INSTRUCTIONS,
      input,
      tools,
      text:{
        format:{
          type:'json_schema',
          name:'south_bay_planning_answer',
          description:'A civic-planning answer with IDs of supporting official resources.',
          strict:true,
          schema:outputSchema
        }
      },
      store:false
    });

    let parsed;
    try { parsed = JSON.parse(response.output_text); }
    catch { parsed = {answer:response.output_text || 'No answer returned.', resource_ids:[]}; }

    const allowed = new Map(candidateSources.map(s=>[s.id,s]));
    const resources = (Array.isArray(parsed.resource_ids) ? parsed.resource_ids : [])
      .map(id=>allowed.get(id)).filter(Boolean).slice(0,8)
      .map(({id,title,url,note,category})=>({id,title,url,note,category}));

    // Ensure the pane is useful even if the model selects none.
    if (!resources.length) {
      candidateSources.slice(0,3).forEach(({id,title,url,note,category})=>resources.push({id,title,url,note,category}));
    }

    res.json({
      answer:String(parsed.answer || '').trim() || 'No answer returned.',
      resources,
      meta:{city:cityLabel, model, usedFileSearch:Boolean(vectorStoreId), usedWebSearch:enableWebSearch}
    });
  } catch (error) {
    console.error(error);
    const status = Number(error?.status) || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({error:error?.message || 'Unable to answer the question.'});
  }
});

app.listen(port, () => console.log(`South Bay Planning AI running at http://localhost:${port}`));
