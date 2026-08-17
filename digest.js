// Pure rendering for the email briefings. No database and no network access here on purpose -
// everything takes plain data in and returns an HTML string, so the output can be previewed and
// tested without a Postgres instance or a Resend key (see scripts/preview-digest.js).
//
// Every briefing is a full picture of what's happening, not a change alert: housing,
// transportation, other development, and the boards that decide them. Anything that changed since
// the reader's last email is marked "Updated" and pulled to the top, but a quiet week still gets a
// useful email. Nothing here is model-generated - civic status text is quoted verbatim from the
// data files, and the one summary sentence is assembled from integer counts.

import { SOURCES } from './data/sources.js';
import { PROJECTS } from './data/projects.js';
import { NEWS_ARTICLES } from './data/news.js';
import { BOARDS } from './data/boards.js';

const SITE_URL = process.env.SITE_URL || 'https://southbaydashboard.com';

export const CITY_LABELS = {
  sunnyvale: 'Sunnyvale',
  cupertino: 'Cupertino',
  mountainview: 'Mountain View',
  milpitas: 'Milpitas',
  losaltos: 'Los Altos',
  saratoga: 'Saratoga',
  westsanjose: 'West San Jose',
};
export function cityLabel(key) { return CITY_LABELS[key] || 'the South Bay'; }

// Phrases rather than adjectives, so the footer reads as a sentence instead of "biweekly updates".
const FREQUENCY_PHRASES = { biweekly: 'every two weeks', monthly: 'once a month' };
function frequencyPhrase(f) { return FREQUENCY_PHRASES[f] || 'on a schedule you chose'; }

const NEWS_BY_URL = new Map(NEWS_ARTICLES.map(a => [a.url, a]));

// How many of each thing a single city section carries. Enough to feel like a briefing,
// few enough to stay readable on a phone.
const CAPS = { housing: 5, transportation: 3, other: 3, deciders: 3, join: 3, news: 4, elsewhere: 5 };

// Which bucket a project belongs to. Deliberately coarse - these are the three things readers
// said they care about, so anything that isn't housing or transportation is "other development".
function topicOfProject(p) {
  if (p.type === 'Transportation') return 'transportation';
  if (p.type === 'Residential' || p.type === 'Mixed Use') return 'housing';
  return 'other';
}

// The data files already contain HTML entities (e.g. "Housing &amp; Human Services"), so a blanket
// ampersand escape would double-encode them. This leaves existing entities intact.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&(?![a-zA-Z#0-9]+;)/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function projectUrl(id) { return `${SITE_URL}/?project=${encodeURIComponent(id)}`; }
function cityUrl(city) { return `${SITE_URL}/?city=${encodeURIComponent(city)}`; }

const STYLE = {
  h2: 'font-size:13px; letter-spacing:.05em; text-transform:uppercase; color:#3E4F24; border-bottom:2px solid #3E4F24; padding-bottom:6px; margin:30px 0 2px;',
  h3: 'font-size:12px; color:#6B6B6B; margin:20px 0 0; font-weight:700; letter-spacing:.04em; text-transform:uppercase;',
  link: 'color:#0056A0; font-weight:700; text-decoration:none;',
  meta: 'color:#8A8A8A; font-size:11px; margin-top:5px; text-transform:uppercase; letter-spacing:.03em;',
  note: 'color:#4A4A4A; font-size:13px; margin-top:4px; line-height:1.5;',
  row: 'padding:13px 0; border-bottom:1px solid #E3E7DB;',
  badge: 'display:inline-block; background:#3E4F24; color:#fff; font-size:10px; font-weight:700; letter-spacing:.06em; padding:2px 6px; border-radius:3px; margin-left:6px; vertical-align:2px;',
};

const updatedBadge = (on) => on ? `<span style="${STYLE.badge}">UPDATED</span>` : '';

function projectRows(items, changed = new Set()) {
  return items.map(p => {
    const flag = p.flag ? `<div style="${STYLE.note} color:#8A5A00;"><b>Worth knowing:</b> ${esc(p.flag)}</div>` : '';
    const units = p.units ? `${p.units.toLocaleString()} units &middot; ` : '';
    return `<tr><td style="${STYLE.row}">
      <a href="${projectUrl(p.id)}" style="${STYLE.link}">${esc(p.addr)}</a>${updatedBadge(changed.has(p.id))}
      <div style="${STYLE.note}">${esc(p.lastNote)}</div>
      ${flag}
      <div style="${STYLE.meta}">${units}${esc(cityLabel(p.city))} &middot; ${esc(p.stage)}</div>
    </td></tr>`;
  }).join('');
}

function boardRows(items, changed = new Set()) {
  return items.map(b => {
    const name = b.link
      ? `<a href="${b.link}" style="${STYLE.link}">${esc(b.name)} &rarr;</a>`
      : `<span style="font-weight:700; color:#1A1A1A;">${esc(b.name)}</span>`;
    return `<tr><td style="${STYLE.row}">
      ${name}${updatedBadge(changed.has(b.id))}
      <div style="${STYLE.note}">${esc(b.when)}</div>
      <div style="${STYLE.note}">${esc(b.body)}</div>
      <div style="${STYLE.meta}">${esc(cityLabel(b.city))}</div>
    </td></tr>`;
  }).join('');
}

function newsRows(items, changed = new Set()) {
  return items.map(a => `<tr><td style="${STYLE.row}">
      <a href="${a.url}" style="${STYLE.link}">${esc(a.title)}</a>${updatedBadge(changed.has(a.url))}
      ${a.snippet ? `<div style="${STYLE.note}">${esc(a.snippet)}</div>` : ''}
      <div style="${STYLE.meta}">${a.source ? esc(a.source) + ' &middot; ' : ''}${esc(cityLabel(a.city))}</div>
    </td></tr>`).join('');
}

function heading(title) { return `<h2 style="${STYLE.h2}">${esc(title)}</h2>`; }
function section(title, html) { return html ? heading(title) + `<table width="100%" cellspacing="0">${html}</table>` : ''; }
function subsection(title, html) {
  return html ? `<h3 style="${STYLE.h3}">${esc(title)}</h3><table width="100%" cellspacing="0">${html}</table>` : '';
}

// Official city links, so every briefing ends somewhere authoritative.
function officialLinksFor(homeCity) {
  if (!homeCity) return '';
  const label = cityLabel(homeCity);
  const picks = SOURCES.filter(s => s.city === label).slice(0, 6);
  if (!picks.length) return '';
  const links = picks.map(s => `<a href="${s.url}" style="${STYLE.link}">${esc(s.title)}</a>`).join(' &nbsp;&middot;&nbsp; ');
  return heading(`Official ${label} links`) + `<p style="${STYLE.note} margin-top:10px;">${links}</p>`;
}

// One plain-English opening line, assembled from real counts. Written by hand rather than
// generated, so it reads the same way every time and can never invent something.
function openingLine({ isFirst, homeCity, sinceLabel, changeCount, starredChangeCount, frequency }) {
  const label = cityLabel(homeCity);
  const where = homeCity ? label : 'the South Bay';
  if (isFirst) {
    return `You're all set. Here's the current picture for ${where} &mdash; housing, transportation, ` +
      `new development, and the boards that decide them. You'll get this ${frequencyPhrase(frequency)}, ` +
      `with anything that's moved marked <b>Updated</b>.`;
  }
  if (!changeCount) {
    return `Nothing major moved since ${sinceLabel}. Here's where ${where} stands anyway &mdash; ` +
      `what's in the pipeline, and what's coming up.`;
  }
  const starredBit = starredChangeCount
    ? `<b>${starredChangeCount} of them ${starredChangeCount === 1 ? 'is' : 'are'} something you follow</b>. `
    : '';
  return `${changeCount} update${changeCount === 1 ? '' : 's'} since ${sinceLabel}. ${starredBit}` +
    `Everything that moved is marked <b>Updated</b> below.`;
}

function shell({ title, username, opening, body, footerNote }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif; max-width:600px; margin:0 auto; color:#222; background:#fff;">
    <div style="background:#3E4F24; padding:20px; color:#fff;">
      <h1 style="margin:0; font-size:19px; font-weight:700;">${esc(title)}</h1>
    </div>
    <div style="padding:6px 20px 24px;">
      <p style="font-size:15px;">Hi ${esc(username)},</p>
      ${opening ? `<p style="font-size:15px; line-height:1.6;">${opening}</p>` : ''}
      ${body}
      <p style="margin-top:30px;"><a href="${SITE_URL}" style="${STYLE.link}">Open the full dashboard &rarr;</a></p>
      <p style="color:#8A8A8A; font-size:11px; margin-top:22px; line-height:1.55;">${esc(footerNote)}</p>
    </div>
  </div>`;
}

const byRecency = (a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || ''));
const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

/**
 * Builds one briefing. Always returns HTML - a quiet period still produces a useful email.
 *
 * changed: { projects:Set<id>, boards:Set<id>, news:Set<url> } - what moved since the reader's
 * last email. Pass empty sets for the first-ever send.
 */
export function buildBriefing({ username, homeCity, frequency, stars, changed, sinceLabel, isFirst }) {
  const ch = {
    projects: changed?.projects || new Set(),
    boards: changed?.boards || new Set(),
    news: changed?.news || new Set(),
  };

  const starredProjects = PROJECTS.filter(p => stars.projects.has(p.id));
  const starredBoards = BOARDS.filter(b => stars.boards.has(b.id));
  const starredNews = NEWS_ARTICLES.filter(a => stars.news.has(a.url));

  const changeCount = ch.projects.size + ch.boards.size + ch.news.size;
  const starredChangeCount =
    starredProjects.filter(p => ch.projects.has(p.id)).length +
    starredBoards.filter(b => ch.boards.has(b.id)).length +
    starredNews.filter(a => ch.news.has(a.url)).length;

  let body = '';

  // 1. Anything the reader follows leads, whether or not it moved - changed ones sort first.
  if (starredProjects.length || starredBoards.length || starredNews.length) {
    const changedFirst = (set, key) => (a, b) =>
      Number(set.has(b[key])) - Number(set.has(a[key]));
    body += section("What you're following",
      projectRows([...starredProjects].sort(changedFirst(ch.projects, 'id')), ch.projects)
      + boardRows([...starredBoards].sort(changedFirst(ch.boards, 'id')), ch.boards)
      + newsRows([...starredNews].sort(changedFirst(ch.news, 'url')), ch.news));
  }

  // 2. The reader's own city, broken out by the things they actually care about.
  if (homeCity) {
    const notStarred = (p) => !stars.projects.has(p.id);
    const cityProjects = PROJECTS.filter(p => p.city === homeCity && notStarred(p)).sort(byRecency);
    const pick = (topic, n) => cityProjects.filter(p => topicOfProject(p) === topic).slice(0, n);

    const housing = pick('housing', CAPS.housing);
    const transport = pick('transportation', CAPS.transportation);
    const other = pick('other', CAPS.other);
    const deciders = BOARDS.filter(b => b.city === homeCity && b.boardType === 'decider' && !stars.boards.has(b.id)).slice(0, CAPS.deciders);
    const join = BOARDS.filter(b => b.city === homeCity && b.boardType === 'join' && !stars.boards.has(b.id)).slice(0, CAPS.join);
    const cityNews = NEWS_ARTICLES.filter(a => a.city === homeCity && !stars.news.has(a.url)).sort(byDate).slice(0, CAPS.news);

    body += heading(`In ${cityLabel(homeCity)}`)
      + subsection('Housing', projectRows(housing, ch.projects))
      + subsection('Transportation', projectRows(transport, ch.projects))
      + subsection('Other development', projectRows(other, ch.projects))
      + subsection('In the news', newsRows(cityNews, ch.news))
      + subsection('Who decides, and when they meet', boardRows(deciders, ch.boards))
      + subsection('Ways to get involved', boardRows(join, ch.boards));
  }

  // 3. The rest of the region, lighter - recent news plus anything that actually moved.
  const elsewhereChanged = PROJECTS.filter(p =>
    p.city !== homeCity && ch.projects.has(p.id) && !stars.projects.has(p.id)).sort(byRecency);
  const elsewhereNews = NEWS_ARTICLES.filter(a =>
    a.city !== homeCity && !stars.news.has(a.url)).sort(byDate).slice(0, CAPS.elsewhere);

  if (elsewhereChanged.length || elsewhereNews.length) {
    body += heading(homeCity ? 'Around the rest of the South Bay' : 'Around the South Bay')
      + subsection(elsewhereChanged.length ? 'Projects that moved' : '', projectRows(elsewhereChanged, ch.projects))
      + subsection(elsewhereNews.length ? 'In the news' : '', newsRows(elsewhereNews, ch.news));
  }

  if (!homeCity) {
    body += `<p style="${STYLE.note} margin-top:20px;">Set your city on the Account page and this ` +
      `briefing will lead with local housing, transportation, and meetings instead.</p>`;
  }

  body += officialLinksFor(homeCity);

  const title = isFirst ? 'Your dashboard is set up' : `Your ${cityLabel(homeCity)} planning briefing`;
  return {
    subject: isFirst
      ? 'Your South Bay planning dashboard is set up'
      : `Your ${cityLabel(homeCity)} planning briefing`,
    html: shell({
      title,
      username,
      opening: openingLine({ isFirst, homeCity, sinceLabel, changeCount, starredChangeCount, frequency }),
      body,
      footerNote: `You're getting this ${frequencyPhrase(frequency)}`
        + `${homeCity ? ` for ${cityLabel(homeCity)}` : ''}. Change your city, how often it arrives, or turn it off anytime from your Account page.`,
    }),
  };
}
