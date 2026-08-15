import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pg from 'pg';
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
if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. The site will load, but /api/register, /api/login, and /api/stars will return a configuration error.');
}
 
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing-key' });
 
// ---------------- DATABASE (Render Postgres) ----------------
const { Pool } = pg;
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;
 
async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stars (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_data JSONB,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(username, item_type, item_id)
    );
  `);
  console.log('Database tables ready.');
}
initDb().catch(err => console.error('Failed to initialize database tables:', err));
 
app.use(express.json({ limit: '4mb' }));
app.use(express.static('public'));
 
// ---------------- AUTH HELPERS ----------------
function requireDb(res) {
  if (!pool) { res.status(503).json({ error: 'DATABASE_URL is not configured on the server yet.' }); return false; }
  return true;
}
 
async function authMiddleware(req, res, next) {
  if (!requireDb(res)) return;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });
  try {
    const result = await pool.query('SELECT username FROM sessions WHERE token = $1', [token]);
    if (!result.rows.length) return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    req.username = result.rows[0].username;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify session.' });
  }
}
 
function validUsername(u) { return typeof u === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(u); }
function validPassword(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 200; }
 
// ---------------- AUTH ROUTES ----------------
app.post('/api/register', async (req, res) => {
  if (!requireDb(res)) return;
  const { username, password } = req.body || {};
  if (!validUsername(username)) return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscore only.' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (existing.rows.length) return res.status(409).json({ error: 'That username is already taken.' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO sessions (token, username) VALUES ($1, $2)', [token, username]);
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create account. Please try again.' });
  }
});
 
app.post('/api/login', async (req, res) => {
  if (!requireDb(res)) return;
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE username = $1', [username]);
    if (!result.rows.length) return res.status(401).json({ error: 'Incorrect username or password.' });
    const ok = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect username or password.' });
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO sessions (token, username) VALUES ($1, $2)', [token, username]);
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log in. Please try again.' });
  }
});
 
app.post('/api/logout', authMiddleware, async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.slice(7);
  try {
    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log out.' });
  }
});
 
// ---------------- STARS ROUTES ----------------
app.get('/api/stars', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT item_type, item_id, item_data FROM stars WHERE username = $1 ORDER BY created_at DESC',
      [req.username]
    );
    res.json({ stars: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load your starred items.' });
  }
});
 
app.post('/api/stars', authMiddleware, async (req, res) => {
  const { itemType, itemId, itemData } = req.body || {};
  if (!itemType || !itemId) return res.status(400).json({ error: 'itemType and itemId are required.' });
  try {
    await pool.query(
      `INSERT INTO stars (username, item_type, item_id, item_data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (username, item_type, item_id) DO UPDATE SET item_data = $4`,
      [req.username, itemType, itemId, itemData || {}]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save star.' });
  }
});
 
app.delete('/api/stars/:itemType/:itemId', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM stars WHERE username = $1 AND item_type = $2 AND item_id = $3',
      [req.username, req.params.itemType, req.params.itemId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not remove star.' });
  }
});
 
// ---------------- EXISTING ASK / SOURCES / HEALTH ROUTES (unchanged) ----------------
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
  res.json({ok:true, model, fileSearch:Boolean(vectorStoreId), webSearch:enableWebSearch, sourceCount:SOURCES.length, database:Boolean(pool)});
});
 
app.get('/api/sources', (req,res) => {
  const city = String(req.query.city || '');
  res.json(city ? SOURCES.filter(s=>s.city===city) : SOURCES);
});
 
app.post('/api/ask', async (req, res) => {
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
