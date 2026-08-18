import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pg from 'pg';
import { SOURCES } from './data/sources.js';
import { SYSTEM_INSTRUCTIONS } from './instructions.js';
import { PROJECTS } from './data/projects.js';
import { NEWS_ARTICLES } from './data/news.js';
import { BOARDS } from './data/boards.js';
import { buildBriefing, CITY_LABELS, cityLabel } from './digest.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
const vectorStoreId = (process.env.OPENAI_VECTOR_STORE_ID || '').trim();
const enableWebSearch = String(process.env.ENABLE_WEB_SEARCH || '').toLowerCase() === 'true';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'South Bay Area Planning Dashboard <onboarding@resend.dev>';
const CRON_SECRET = process.env.CRON_SECRET || '';
const SITE_URL = process.env.SITE_URL || 'https://southbaydashboard.com';

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. The site will load, but /api/ask will return a configuration error.');
}
if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. The site will load, but /api/register, /api/login, and /api/stars will return a configuration error.');
}
if (!RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set. The site will load, but email digests will not be sent.');
}
if (!CRON_SECRET) {
  console.warn('CRON_SECRET is not set. /api/cron/send-digests will refuse all requests until it is.');
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
  // Safe to run on an existing table - ADD COLUMN IF NOT EXISTS does nothing if already present.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_frequency TEXT NOT NULL DEFAULT 'off';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMPTZ;`);
  // The user's own city, so their local news leads the digest ahead of the rest of the South Bay.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS home_city TEXT;`);
  // Biweekly and monthly are the only cadences now - move anyone on daily/weekly to the closest
  // one still offered, rather than leaving them on a frequency the Account page can't display.
  await pool.query(`UPDATE users SET email_frequency = 'biweekly' WHERE email_frequency IN ('daily','weekly');`);
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
  // Tracks the last-known state of every project, so we can detect real changes between digest runs.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_snapshots (
      project_id TEXT PRIMARY KEY,
      stage TEXT,
      last_note TEXT,
      flag TEXT,
      addr TEXT,
      city TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // Tracks which news article URLs we've already seen, so we can detect genuinely new ones.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_seen (
      url TEXT PRIMARY KEY,
      title TEXT,
      first_seen_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // Tracks boards/get-involved entries so we can detect newly-added ones or changed meeting details.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS board_snapshots (
      board_id TEXT PRIMARY KEY,
      name TEXT,
      when_text TEXT,
      body TEXT,
      city TEXT,
      board_type TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
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

// ---------------- EMAIL DIGEST PREFERENCES ----------------
// Two cadences only. The underlying records are updated by hand, so anything more frequent would
// send the same briefing twice. daily/weekly are still honoured in FREQUENCY_DAYS so any row
// predating this is scheduled sensibly until the migration below converts it.
const VALID_FREQUENCIES = ['off', 'biweekly', 'monthly'];
const FREQUENCY_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
function validEmail(e) { return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

app.get('/api/account/preferences', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT email, email_frequency, home_city FROM users WHERE username = $1', [req.username]);
    if (!result.rows.length) return res.status(404).json({ error: 'Account not found.' });
    res.json({
      email: result.rows[0].email,
      emailFrequency: result.rows[0].email_frequency,
      homeCity: result.rows[0].home_city,
      cities: Object.entries(CITY_LABELS).map(([value, label]) => ({ value, label })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load preferences.' });
  }
});

app.patch('/api/account/preferences', authMiddleware, async (req, res) => {
  const { email, emailFrequency, homeCity } = req.body || {};
  if (email !== undefined && email !== null && email !== '' && !validEmail(email)) {
    return res.status(400).json({ error: 'That doesn\'t look like a valid email address.' });
  }
  if (emailFrequency !== undefined && !VALID_FREQUENCIES.includes(emailFrequency)) {
    return res.status(400).json({ error: 'Frequency must be off, biweekly, or monthly.' });
  }
  if (homeCity !== undefined && homeCity !== null && homeCity !== '' && !CITY_LABELS[homeCity]) {
    return res.status(400).json({ error: 'Unknown city.' });
  }
  try {
    const fields = [];
    const values = [];
    let i = 1;
    if (email !== undefined) { fields.push(`email = $${i++}`); values.push(email || null); }
    if (emailFrequency !== undefined) { fields.push(`email_frequency = $${i++}`); values.push(emailFrequency); }
    if (homeCity !== undefined) { fields.push(`home_city = $${i++}`); values.push(homeCity || null); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });
    values.push(req.username);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE username = $${i}`, values);

    // Saving a real address + a live frequency sends an immediate welcome recap, so the user sees
    // what they signed up for right away instead of waiting for the next scheduled run.
    const after = await pool.query('SELECT email, email_frequency, home_city FROM users WHERE username = $1', [req.username]);
    const u = after.rows[0];
    let welcomeSent = false;
    let welcomeError = null;
    if (!u.email) {
      welcomeError = 'No email address saved, so nothing was sent.';
    } else if (u.email_frequency === 'off') {
      welcomeError = 'Updates are set to Off, so nothing was sent.';
    } else if (!RESEND_API_KEY) {
      welcomeError = 'The server has no RESEND_API_KEY configured, so no email can be sent.';
    } else {
      try {
        await sendWelcomeRecap({ username: req.username, email: u.email, homeCity: u.home_city, frequency: u.email_frequency });
        welcomeSent = true;
      } catch (err) {
        // A failed welcome must not fail the save - preferences are already persisted. Surfacing
        // the reason matters though: silently showing "Saved" for a failed send makes a
        // misconfigured sender domain look like the feature simply doesn't work.
        console.error(`Welcome recap to ${req.username} failed:`, err.message);
        welcomeError = err.message;
      }
    }
    res.json({ ok: true, welcomeSent, welcomeError });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save preferences.' });
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

// ---------------- EMAIL DIGESTS ----------------
async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

// Compares the current PROJECTS/NEWS_ARTICLES (from the frontend-mirrored data files) against
// what's stored in the database. First-ever run just seeds the tables silently - it does not
// treat "every project" as a change, since that would blast every subscriber on day one.
async function syncSnapshotsAndGetChanges() {
  const existingCount = await pool.query('SELECT COUNT(*) FROM project_snapshots');
  const isFirstRun = Number(existingCount.rows[0].count) === 0;

  for (const p of PROJECTS) {
    const existing = await pool.query('SELECT stage, last_note, flag FROM project_snapshots WHERE project_id = $1', [p.id]);
    if (!existing.rows.length) {
      await pool.query(
        `INSERT INTO project_snapshots (project_id, stage, last_note, flag, addr, city, updated_at) VALUES ($1,$2,$3,$4,$5,$6, $7)`,
        [p.id, p.stage, p.lastNote, p.flag, p.addr, p.city, isFirstRun ? new Date(0) : new Date()]
      );
    } else {
      const row = existing.rows[0];
      const changed = row.stage !== p.stage || row.last_note !== p.lastNote || row.flag !== p.flag;
      if (changed) {
        await pool.query(
          `UPDATE project_snapshots SET stage=$1, last_note=$2, flag=$3, updated_at=now() WHERE project_id=$4`,
          [p.stage, p.lastNote, p.flag, p.id]
        );
      }
    }
  }

  const existingNewsCount = await pool.query('SELECT COUNT(*) FROM news_seen');
  const isFirstNewsRun = Number(existingNewsCount.rows[0].count) === 0;
  for (const a of NEWS_ARTICLES) {
    const existing = await pool.query('SELECT 1 FROM news_seen WHERE url = $1', [a.url]);
    if (!existing.rows.length) {
      await pool.query(
        `INSERT INTO news_seen (url, title, first_seen_at) VALUES ($1,$2,$3)`,
        [a.url, a.title, isFirstNewsRun ? new Date(0) : new Date()]
      );
    }
  }

  const existingBoardsCount = await pool.query('SELECT COUNT(*) FROM board_snapshots');
  const isFirstBoardsRun = Number(existingBoardsCount.rows[0].count) === 0;
  for (const b of BOARDS) {
    const existing = await pool.query('SELECT when_text, body FROM board_snapshots WHERE board_id = $1', [b.id]);
    if (!existing.rows.length) {
      await pool.query(
        `INSERT INTO board_snapshots (board_id, name, when_text, body, city, board_type, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [b.id, b.name, b.when, b.body, b.city, b.boardType, isFirstBoardsRun ? new Date(0) : new Date()]
      );
    } else {
      const row = existing.rows[0];
      const changed = row.when_text !== b.when || row.body !== b.body;
      if (changed) {
        await pool.query(
          `UPDATE board_snapshots SET when_text=$1, body=$2, updated_at=now() WHERE board_id=$3`,
          [b.when, b.body, b.id]
        );
      }
    }
  }
}

async function starIdsFor(username) {
  const starred = await pool.query('SELECT item_type, item_id FROM stars WHERE username = $1', [username]);
  return {
    projects: new Set(starred.rows.filter(r => r.item_type === 'project').map(r => r.item_id)),
    boards: new Set(starred.rows.filter(r => r.item_type === 'board').map(r => r.item_id)),
    news: new Set(starred.rows.filter(r => r.item_type === 'news').map(r => r.item_id)),
  };
}

// Sends the immediate "you're set up" recap. Rendering lives in digest.js; this only supplies
// the user's starred items and hands the result to Resend.
async function sendWelcomeRecap({ username, email, homeCity, frequency }) {
  const stars = await starIdsFor(username);
  const { subject, html } = buildBriefing({
    username, homeCity, frequency, stars,
    changed: null,   // nothing to compare against on the first send
    isFirst: true,
  });
  await sendEmail(email, subject, html);
}

// Protected by a shared secret so only your external scheduler (e.g. cron-job.org) can trigger it.
// Accepts GET as well as POST because most hosted schedulers send a plain GET by default.
// Checks EVERY user each time it runs, but only emails whoever is individually due - so it's meant
// to be called on a fixed daily schedule regardless of each user's chosen frequency.
async function runDigests(req, res) {
  // Secret first, so an unauthenticated caller learns nothing about how the server is configured.
  const provided = req.headers['x-cron-secret'] || req.query.secret;
  if (!CRON_SECRET || provided !== CRON_SECRET) return res.status(401).json({ error: 'Invalid or missing cron secret.' });
  if (!requireDb(res)) return;

  // Testing switches. All three are behind the same shared secret as the run itself, so only
  // whoever holds CRON_SECRET can use them. Without these there is no way to exercise a
  // biweekly/monthly briefing without waiting out the real interval.
  //   dryRun=1   - build every briefing and report what would go out, but send nothing
  //   force=1    - ignore the interval check, so a user who isn't due yet still gets one
  //   only=<user> - restrict the run to a single username
  const dryRun = ['1', 'true'].includes(String(req.query.dryRun || '').toLowerCase());
  const force = ['1', 'true'].includes(String(req.query.force || '').toLowerCase());
  const only = (req.query.only || '').trim();

  if (!RESEND_API_KEY && !dryRun) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not configured, so no email can be sent.' });
  }

  try {
    await syncSnapshotsAndGetChanges();

    // Interval differs per user's chosen frequency, so filter in JS rather than a single SQL interval.
    const params = [];
    let sql = `SELECT username, email, email_frequency, home_city, last_digest_sent_at, created_at FROM users
               WHERE email_frequency != 'off' AND email IS NOT NULL`;
    if (only) { params.push(only); sql += ` AND username = $${params.length}`; }
    const allCandidates = await pool.query(sql, params);

    const now = Date.now();
    const due = allCandidates.rows.filter(u => {
      if (force) return true;
      const days = FREQUENCY_DAYS[u.email_frequency] || 7;
      const last = u.last_digest_sent_at ? new Date(u.last_digest_sent_at).getTime() : new Date(u.created_at).getTime();
      return (now - last) >= days * 24 * 60 * 60 * 1000;
    });

    let sent = 0, failed = 0;
    const report = [];
    for (const u of due) {
      const since = u.last_digest_sent_at || u.created_at;
      const [projectsChanged, articlesNew, boardsChanged, stars] = await Promise.all([
        pool.query('SELECT project_id FROM project_snapshots WHERE updated_at > $1', [since]),
        pool.query('SELECT url FROM news_seen WHERE first_seen_at > $1', [since]),
        pool.query('SELECT board_id FROM board_snapshots WHERE updated_at > $1', [since]),
        starIdsFor(u.username),
      ]);

      // A quiet period still gets a briefing - these sets only control what's marked "Updated"
      // and what sorts to the top, not whether an email goes out at all.
      const changed = {
        projects: new Set(projectsChanged.rows.map(r => r.project_id)),
        boards: new Set(boardsChanged.rows.map(r => r.board_id)),
        news: new Set(articlesNew.rows.map(r => r.url)),
      };

      const briefing = buildBriefing({
        username: u.username,
        homeCity: u.home_city,
        frequency: u.email_frequency,
        stars,
        changed,
        sinceLabel: new Date(since).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        isFirst: !u.last_digest_sent_at,
      });

      if (dryRun) {
        // Everything above already ran, so this proves the briefing builds for this user - it
        // just stops short of Resend and leaves last_digest_sent_at alone.
        report.push({
          username: u.username,
          to: u.email.replace(/^(.).*(@.*)$/, '$1***$2'),
          frequency: u.email_frequency,
          city: u.home_city || null,
          subject: briefing.subject,
          htmlBytes: briefing.html.length,
          markedUpdated: changed.projects.size + changed.boards.size + changed.news.size,
        });
        continue;
      }

      try {
        await sendEmail(u.email, briefing.subject, briefing.html);
        await pool.query('UPDATE users SET last_digest_sent_at = now() WHERE username = $1', [u.username]);
        sent++;
        report.push({ username: u.username, to: u.email.replace(/^(.).*(@.*)$/, '$1***$2'), subject: briefing.subject, ok: true });
      } catch (err) {
        console.error(`Failed to send briefing to ${u.username}:`, err.message);
        failed++;
        report.push({ username: u.username, ok: false, error: err.message });
      }
    }

    res.json({ ok: true, dryRun, force, checked: allCandidates.rows.length, due: due.length, sent, failed, report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Digest run failed: ' + err.message });
  }
}

app.post('/api/cron/send-digests', runDigests);
app.get('/api/cron/send-digests', runDigests);

app.listen(port, () => console.log(`South Bay Planning AI running at http://localhost:${port}`));
