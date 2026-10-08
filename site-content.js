import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SITE_CONTENT_SEED} from './data/site-content-seed.js';

const types = new Set(['advisors', 'featured']);
const assets = new Set(['emily-gnecco.png','erik.png','brisbane.png','south-bay-today.png','civic-tech-guide.png']);
const assetPrefix = '/api/admin/site-content/assets/';
export async function initSiteContent(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS site_content (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, data JSONB NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT false,
    position INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  for (const {id, kind, position, ...data} of SITE_CONTENT_SEED) {
    await pool.query('INSERT INTO site_content(id,kind,position,data) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
      [id,kind,position,JSON.stringify(data)]);
  }
}
function validate(kind, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Enter the entry details.');
  const data = {};
  const fields = kind === 'advisors'
    ? {name:100, role:120, organization:160, description:600, image:2000, url:2000}
    : {name:100, title:200, description:600, image:2000, url:2000};
  for (const [key, limit] of Object.entries(fields)) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.length > limit) throw Error(`${key} must be text under ${limit + 1} characters.`);
    data[key] = value.trim();
  }
  if (!data.name) throw Error(kind === 'advisors' ? 'Add the advisor’s name.' : 'Add the publication or organization name.');
  for (const key of ['image', 'url']) {
    if (!data[key]) continue;
    if (key === 'image' && data[key].startsWith(assetPrefix) && assets.has(data[key].slice(assetPrefix.length))) continue;
    let url;
    try { url = new URL(data[key]); } catch { throw Error(`Use a complete https:// address for ${key}.`); }
    if (url.protocol !== 'https:' || url.username || url.password) throw Error(`Use a public https:// address for ${key}.`);
    data[key] = url.href;
  }
  if (kind === 'featured' && !data.url) throw Error('Add a link to the feature.');
  for (const key of ['archived']) if (body[key] !== undefined && typeof body[key] !== 'boolean') throw Error(`Invalid ${key} value.`);
  const position = body.position ?? 0;
  if (!Number.isInteger(position) || position < 0 || position > 9999) throw Error('Display order must be a whole number from 0 to 9999.');
  return {data, position, archived:body.archived === true};
}
export function registerSiteContent(app, {pool, isAdminRequest}) {
  app.use('/api/admin/site-content', async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!await isAdminRequest(req)) return res.status(404).json({error:'API route not found.'});
    if (!pool) return res.status(503).json({error:'Content storage is unavailable.'});
    next();
  });
  app.get('/api/admin/site-content/assets/:asset', (req, res) => {
    if (!assets.has(req.params.asset)) return res.status(404).json({error:'Image not found.'});
    res.sendFile(req.params.asset, {root:fileURLToPath(new URL('./data/site-profile-assets/', import.meta.url)),cacheControl:false}, err => {
      if (err && !res.headersSent) res.status(404).json({error:'Image not found.'});
    });
  });
  app.get('/api/admin/site-content/:kind', async (req, res) => {
    if (!types.has(req.params.kind)) return res.status(404).json({error:'Unknown content section.'});
    try {
      const {rows} = await pool.query('SELECT * FROM site_content WHERE kind = $1 ORDER BY position, id', [req.params.kind]);
      res.json({entries:rows.map(({data, ...row}) => ({...row, ...data}))});
    } catch { res.status(503).json({error:'Could not load entries. Please retry.'}); }
  });
  async function save(req, res) {
    const kind = req.params.kind;
    if (!types.has(kind)) return res.status(404).json({error:'Unknown content section.'});
    let entry;
    try { entry = validate(kind, req.body); } catch (err) { return res.status(400).json({error:err.message}); }
    if (req.params.id && !Number.isInteger(req.body.version)) return res.status(400).json({error:'Reload this entry before saving.'});
    try {
      let rows;
      if (req.params.id) {
        ({rows} = await pool.query(`UPDATE site_content SET data=$1, archived=$2, position=$3, version=version+1, updated_at=now()
          WHERE id=$4 AND kind=$5 AND version=$6 RETURNING *`,
        [JSON.stringify(entry.data), entry.archived, entry.position, req.params.id, kind, req.body.version]));
        if (!rows.length) return res.status(409).json({error:'This entry changed in another tab. Reload the list and open it again before saving.'});
      } else {
        ({rows} = await pool.query(`INSERT INTO site_content(id, kind, data, archived, position)
          VALUES($1,$2,$3,$4,$5) RETURNING *`, [crypto.randomUUID(),kind,JSON.stringify(entry.data),entry.archived,entry.position]));
      }
      const {data, ...row} = rows[0];
      res.status(req.params.id ? 200 : 201).json({entry:{...row, ...data}});
    } catch { res.status(503).json({error:'Could not save this entry. Your form is still here. Please retry.'}); }
  }
  app.post('/api/admin/site-content/:kind', save);
  app.put('/api/admin/site-content/:kind/:id', save);
}
