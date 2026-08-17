// Renders the briefing emails to HTML files so you can open them in a browser before sending
// anything for real. No database and no Resend key needed.
//
//   npm run digest:preview
//
// Writes three files into the project root, covering every case the cron can produce:
//   preview-welcome.html  - the first email a new subscriber gets
//   preview-update.html   - a regular briefing with things marked Updated
//   preview-quiet.html    - a regular briefing in a week where nothing changed
//
// Set PREVIEW_CITY to try a different home city, e.g. PREVIEW_CITY=cupertino npm run digest:preview

import { writeFileSync } from 'fs';
import { buildBriefing } from '../digest.js';
import { PROJECTS } from '../data/projects.js';
import { BOARDS } from '../data/boards.js';
import { NEWS_ARTICLES } from '../data/news.js';

const HOME_CITY = process.env.PREVIEW_CITY || 'sunnyvale';

// Pretend this reader starred a couple of things at home and one project elsewhere.
const starredProject = PROJECTS.find(p => p.city === HOME_CITY);
const starredElsewhere = PROJECTS.find(p => p.city !== HOME_CITY);
const starredBoard = BOARDS.find(b => b.city === HOME_CITY);
const starredArticle = NEWS_ARTICLES.find(a => a.city === HOME_CITY);

const stars = {
  projects: new Set([starredProject?.id, starredElsewhere?.id].filter(Boolean)),
  boards: new Set([starredBoard?.id].filter(Boolean)),
  news: new Set([starredArticle?.url].filter(Boolean)),
};

const base = { username: 'saumit', homeCity: HOME_CITY, frequency: 'monthly', stars };

writeFileSync('preview-welcome.html', buildBriefing({ ...base, changed: null, isFirst: true }).html);

// A plausible change set: one starred project moved, plus a few others in and outside the city.
const changed = {
  projects: new Set([
    starredProject?.id,
    ...PROJECTS.filter(p => p.city === HOME_CITY).slice(1, 3).map(p => p.id),
    ...PROJECTS.filter(p => p.city !== HOME_CITY).slice(0, 2).map(p => p.id),
  ].filter(Boolean)),
  boards: new Set([starredBoard?.id].filter(Boolean)),
  news: new Set(NEWS_ARTICLES.slice(0, 2).map(a => a.url)),
};

writeFileSync('preview-update.html', buildBriefing({
  ...base, changed, sinceLabel: 'August 9', isFirst: false,
}).html);

// The case that used to send nothing at all: a week where not one record moved.
const quiet = buildBriefing({
  ...base,
  changed: { projects: new Set(), boards: new Set(), news: new Set() },
  sinceLabel: 'August 9',
  isFirst: false,
});
writeFileSync('preview-quiet.html', quiet.html);

console.log('Wrote preview-welcome.html, preview-update.html, preview-quiet.html');
console.log('Quiet week still produces an email:', quiet.html.length > 2000);
