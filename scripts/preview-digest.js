// Renders both digest emails to HTML files so you can open them in a browser before sending
// anything for real. No database and no Resend key needed.
//
//   npm run digest:preview
//
// Writes preview-welcome.html and preview-update.html into the project root.

import { writeFileSync } from 'fs';
import { buildWelcomeRecap, buildChangeDigest, asProjectRow, asBoardRow, asNewsRow } from '../digest.js';
import { PROJECTS } from '../data/projects.js';
import { BOARDS } from '../data/boards.js';
import { NEWS_ARTICLES } from '../data/news.js';

const HOME_CITY = process.env.PREVIEW_CITY || 'sunnyvale';

// Pretend this user starred a couple of things in their own city and one board elsewhere.
const starredProject = PROJECTS.find(p => p.city === HOME_CITY);
const starredElsewhere = PROJECTS.find(p => p.city !== HOME_CITY);
const starredBoard = BOARDS.find(b => b.city === HOME_CITY);
const starredArticle = NEWS_ARTICLES.find(a => a.city === HOME_CITY);

const stars = {
  projects: new Set([starredProject?.id, starredElsewhere?.id].filter(Boolean)),
  boards: new Set([starredBoard?.id].filter(Boolean)),
  news: new Set([starredArticle?.url].filter(Boolean)),
};

const welcome = buildWelcomeRecap({
  username: 'saumit',
  homeCity: HOME_CITY,
  frequency: 'weekly',
  stars,
});
writeFileSync('preview-welcome.html', welcome.html);

// A plausible change set: the two starred projects moved, plus activity in and outside the
// home city, so every section of the layout is exercised at once.
const changedProjects = [
  starredProject, starredElsewhere,
  ...PROJECTS.filter(p => p.city === HOME_CITY).slice(1, 4),
  ...PROJECTS.filter(p => p.city !== HOME_CITY).slice(1, 5),
].filter(Boolean).map(asProjectRow);

const changedBoards = [
  starredBoard,
  ...BOARDS.filter(b => b.city !== HOME_CITY).slice(0, 2),
].filter(Boolean).map(asBoardRow);

const newArticles = [
  starredArticle,
  ...NEWS_ARTICLES.filter(a => a.city === HOME_CITY).slice(1, 3),
  ...NEWS_ARTICLES.filter(a => a.city !== HOME_CITY).slice(0, 3),
].filter(Boolean).map(asNewsRow);

const update = buildChangeDigest({
  user: { username: 'saumit', home_city: HOME_CITY, email_frequency: 'weekly' },
  projectsChanged: changedProjects,
  boardsChanged: changedBoards,
  articlesNew: newArticles,
  stars,
  sinceLabel: 'August 9',
});
writeFileSync('preview-update.html', update.html);

// The empty case must return null so the cron run skips the send entirely.
const empty = buildChangeDigest({
  user: { username: 'saumit', home_city: HOME_CITY, email_frequency: 'weekly' },
  projectsChanged: [], boardsChanged: [], articlesNew: [],
  stars, sinceLabel: 'August 9',
});

console.log('Wrote preview-welcome.html and preview-update.html');
console.log('Empty change set returns null (no email sent):', empty === null);
