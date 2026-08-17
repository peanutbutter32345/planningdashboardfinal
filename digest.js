// Pure rendering for the email digests. No database and no network access here on purpose -
// everything takes plain data in and returns an HTML string, so the output can be previewed and
// tested without a Postgres instance or a Resend key (see scripts/preview-digest.js).

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

const BOARD_BY_ID = new Map(BOARDS.map(b => [b.id, b]));
const NEWS_BY_URL = new Map(NEWS_ARTICLES.map(a => [a.url, a]));

// The data files already contain HTML entities (e.g. "Housing &amp; Human Services"), so a blanket
// ampersand escape would double-encode them. This leaves existing entities intact.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&(?![a-zA-Z#0-9]+;)/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function projectUrl(id) { return `${SITE_URL}/?project=${encodeURIComponent(id)}`; }
function boardLinkFor(id) { const b = BOARD_BY_ID.get(id); return b && b.link ? b.link : null; }
function newsCityOf(url) { const a = NEWS_BY_URL.get(url); return a ? a.city : null; }

const STYLE = {
  h2: 'font-size:13px; letter-spacing:.05em; text-transform:uppercase; color:#3E4F24; border-bottom:2px solid #3E4F24; padding-bottom:6px; margin:30px 0 2px;',
  h3: 'font-size:12px; color:#6B6B6B; margin:18px 0 0; font-weight:700; letter-spacing:.04em; text-transform:uppercase;',
  link: 'color:#0056A0; font-weight:700; text-decoration:none;',
  meta: 'color:#8A8A8A; font-size:11px; margin-top:5px; text-transform:uppercase; letter-spacing:.03em;',
  note: 'color:#4A4A4A; font-size:13px; margin-top:4px; line-height:1.5;',
  row: 'padding:13px 0; border-bottom:1px solid #E3E7DB;',
};

function projectRows(items) {
  return items.map(p => {
    const flag = p.flag ? `<div style="${STYLE.note} color:#8A5A00;"><b>Worth knowing:</b> ${esc(p.flag)}</div>` : '';
    return `<tr><td style="${STYLE.row}">
      <a href="${projectUrl(p.project_id)}" style="${STYLE.link}">${esc(p.addr)}</a>
      <div style="${STYLE.note}">${esc(p.last_note)}</div>
      ${flag}
      <div style="${STYLE.meta}">${esc(cityLabel(p.city))} &middot; ${esc(p.stage)}</div>
    </td></tr>`;
  }).join('');
}

function boardRows(items) {
  return items.map(b => {
    const href = boardLinkFor(b.board_id);
    const name = href
      ? `<a href="${href}" style="${STYLE.link}">${esc(b.name)} &rarr;</a>`
      : `<span style="font-weight:700; color:#1A1A1A;">${esc(b.name)}</span>`;
    return `<tr><td style="${STYLE.row}">
      ${name}
      <div style="${STYLE.note}">${esc(b.when_text)}</div>
      <div style="${STYLE.note}">${esc(b.body)}</div>
      <div style="${STYLE.meta}">${esc(cityLabel(b.city))}</div>
    </td></tr>`;
  }).join('');
}

function newsRows(items) {
  return items.map(a => {
    const meta = NEWS_BY_URL.get(a.url);
    const source = meta && meta.source ? `${esc(meta.source)} &middot; ` : '';
    const snippet = meta && meta.snippet ? `<div style="${STYLE.note}">${esc(meta.snippet)}</div>` : '';
    return `<tr><td style="${STYLE.row}">
      <a href="${a.url}" style="${STYLE.link}">${esc(a.title)}</a>
      ${snippet}
      <div style="${STYLE.meta}">${source}${esc(cityLabel(meta && meta.city))}</div>
    </td></tr>`;
  }).join('');
}

function section(title, html) {
  return html ? `<h2 style="${STYLE.h2}">${esc(title)}</h2><table width="100%" cellspacing="0">${html}</table>` : '';
}
function heading(title) { return `<h2 style="${STYLE.h2}">${esc(title)}</h2>`; }
function subsection(title, html) {
  return html ? `<h3 style="${STYLE.h3}">${esc(title)}</h3><table width="100%" cellspacing="0">${html}</table>` : '';
}

// Official city links, so every digest ends somewhere authoritative.
function officialLinksFor(homeCity) {
  if (!homeCity) return '';
  const label = cityLabel(homeCity);
  const picks = SOURCES.filter(s => s.city === label).slice(0, 6);
  if (!picks.length) return '';
  const links = picks.map(s => `<a href="${s.url}" style="${STYLE.link}">${esc(s.title)}</a>`).join(' &nbsp;&middot;&nbsp; ');
  return heading(`Official ${label} links`) + `<p style="${STYLE.note} margin-top:10px;">${links}</p>`;
}

// One plain-English opening line built from the real counts. Written by hand rather than generated,
// so it reads the same way every time and can never invent something that isn't in the data.
function openingLine({ isWelcome, homeCity, sinceLabel, starredCount, cityCount, elsewhereCount }) {
  const label = cityLabel(homeCity);
  if (isWelcome) {
    const bits = [];
    if (starredCount) bits.push(`the ${starredCount} thing${starredCount === 1 ? '' : 's'} you've starred`);
    if (homeCity && cityCount) bits.push(`what's moving in ${label}`);
    if (elsewhereCount) bits.push('a few headlines from the rest of the South Bay');
    if (!bits.length) return 'You\'re all set. Here\'s the shape of things right now.';
    const list = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(', ') + ', then ' + bits[bits.length - 1];
    return `You're all set. Here's where things stand right now &mdash; ${list}. After this you'll only hear from us when something actually changes.`;
  }
  const parts = [];
  if (starredCount) parts.push(`<b>${starredCount} thing${starredCount === 1 ? '' : 's'} you follow</b> changed`);
  if (cityCount) parts.push(`${label} had ${cityCount} update${cityCount === 1 ? '' : 's'}`);
  if (elsewhereCount) parts.push(`${elsewhereCount} more moved elsewhere in the South Bay`);
  if (!parts.length) return '';
  const list = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
  return `Since ${sinceLabel}, ${list}.`;
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

// Adapters, so the renderers can take either a database snapshot row or an in-memory record.
export const asProjectRow = (p) => ({ project_id: p.id, addr: p.addr, last_note: p.lastNote, flag: p.flag, city: p.city, stage: p.stage });
export const asBoardRow = (b) => ({ board_id: b.id, name: b.name, when_text: b.when, body: b.body, city: b.city });
export const asNewsRow = (a) => ({ url: a.url, title: a.title });

// Starred items lead, then the user's own city, then the rest of the South Bay grouped by city.
// Anything starred is removed from the later sections so nothing is ever listed twice.
// Returns null when there is genuinely nothing to say, so the caller can skip the send.
export function buildChangeDigest({ user, projectsChanged, boardsChanged, articlesNew, stars, sinceLabel }) {
  const starredProjects = projectsChanged.filter(r => stars.projects.has(r.project_id));
  const starredBoards = boardsChanged.filter(r => stars.boards.has(r.board_id));
  const starredNews = articlesNew.filter(r => stars.news.has(r.url));

  const restProjects = projectsChanged.filter(r => !stars.projects.has(r.project_id));
  const restBoards = boardsChanged.filter(r => !stars.boards.has(r.board_id));
  const restNews = articlesNew.filter(r => !stars.news.has(r.url));

  const home = user.home_city;
  const isHome = (city) => Boolean(home) && city === home;
  const cityProjects = restProjects.filter(r => isHome(r.city));
  const cityBoards = restBoards.filter(r => isHome(r.city));
  const cityNews = restNews.filter(r => isHome(newsCityOf(r.url)));

  const elsewhereProjects = restProjects.filter(r => !isHome(r.city));
  const elsewhereBoards = restBoards.filter(r => !isHome(r.city));
  const elsewhereNews = restNews.filter(r => !isHome(newsCityOf(r.url)));

  const starredCount = starredProjects.length + starredBoards.length + starredNews.length;
  const cityCount = cityProjects.length + cityBoards.length + cityNews.length;
  const elsewhereCount = elsewhereProjects.length + elsewhereBoards.length + elsewhereNews.length;
  if (!starredCount && !cityCount && !elsewhereCount) return null;

  let body = '';
  if (starredCount) {
    body += section("What you're following", projectRows(starredProjects) + boardRows(starredBoards) + newsRows(starredNews));
  }
  if (cityCount) {
    body += heading(`In ${cityLabel(home)}`)
      + subsection('Projects', projectRows(cityProjects))
      + subsection('Meetings and boards', boardRows(cityBoards))
      + subsection('In the news', newsRows(cityNews));
  }
  if (elsewhereCount) {
    body += heading(home ? 'Around the rest of the South Bay' : 'Around the South Bay');
    // Grouped by city so the tail of the email still reads as somewhere, not a jumble.
    const cities = [...new Set([
      ...elsewhereProjects.map(r => r.city),
      ...elsewhereBoards.map(r => r.city),
      ...elsewhereNews.map(r => newsCityOf(r.url)),
    ].filter(Boolean))].sort((a, b) => cityLabel(a).localeCompare(cityLabel(b)));
    for (const c of cities) {
      body += subsection(cityLabel(c),
        projectRows(elsewhereProjects.filter(r => r.city === c))
        + boardRows(elsewhereBoards.filter(r => r.city === c))
        + newsRows(elsewhereNews.filter(r => newsCityOf(r.url) === c)));
    }
  }
  body += officialLinksFor(home);

  return {
    subject: 'Your South Bay planning update',
    html: shell({
      title: 'Your South Bay planning update',
      username: user.username,
      opening: openingLine({ isWelcome: false, homeCity: home, sinceLabel, starredCount, cityCount, elsewhereCount }),
      body,
      footerNote: `You're getting this because your account is set to ${user.email_frequency} updates${home ? ` for ${cityLabel(home)}` : ''}. Change your city, your frequency, or turn this off anytime from your Account page.`,
    }),
  };
}

// The first email can't be a diff - there's no previous state to compare against, and the snapshot
// tables are seeded at epoch, so a change query returns nothing. This summarises where things
// currently stand instead.
export function buildWelcomeRecap({ username, homeCity, frequency, stars }) {
  const starredProjects = PROJECTS.filter(p => stars.projects.has(p.id));
  const starredBoards = BOARDS.filter(b => stars.boards.has(b.id));
  const starredNews = NEWS_ARTICLES.filter(a => stars.news.has(a.url));

  const byRecency = (a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || ''));
  const cityProjects = homeCity
    ? PROJECTS.filter(p => p.city === homeCity && !stars.projects.has(p.id)).sort(byRecency).slice(0, 6)
    : [];
  const cityBoards = homeCity
    ? BOARDS.filter(b => b.city === homeCity && b.boardType === 'decider' && !stars.boards.has(b.id)).slice(0, 4)
    : [];
  const recentNews = [...NEWS_ARTICLES].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const cityNews = homeCity ? recentNews.filter(a => a.city === homeCity && !stars.news.has(a.url)).slice(0, 4) : [];
  const elsewhereNews = recentNews.filter(a => a.city !== homeCity && !stars.news.has(a.url)).slice(0, 5);

  const starredCount = starredProjects.length + starredBoards.length + starredNews.length;
  const cityCount = cityProjects.length + cityBoards.length + cityNews.length;

  let body = '';
  if (starredCount) {
    body += section("What you're following",
      projectRows(starredProjects.map(asProjectRow))
      + boardRows(starredBoards.map(asBoardRow))
      + newsRows(starredNews.map(asNewsRow)));
  }
  if (cityCount) {
    body += heading(`In ${cityLabel(homeCity)}`)
      + subsection('Most recently active projects', projectRows(cityProjects.map(asProjectRow)))
      + subsection('Who decides, and when they meet', boardRows(cityBoards.map(asBoardRow)))
      + subsection('In the news', newsRows(cityNews.map(asNewsRow)));
  }
  if (elsewhereNews.length) {
    body += section(homeCity ? 'Elsewhere in the South Bay' : 'Around the South Bay', newsRows(elsewhereNews.map(asNewsRow)));
  }
  if (!starredCount) {
    body += `<p style="${STYLE.note} margin-top:20px;">Star a project, board, or article on the dashboard and it'll lead your next update.${homeCity ? '' : ' You can also set your city on the Account page so local news comes first.'}</p>`;
  }
  body += officialLinksFor(homeCity);

  return {
    subject: 'Your South Bay planning dashboard is set up',
    html: shell({
      title: 'Your dashboard is set up',
      username,
      opening: openingLine({ isWelcome: true, homeCity, starredCount, cityCount, elsewhereCount: elsewhereNews.length }),
      body,
      footerNote: `You'll get ${frequency} updates from here on, and only when something actually changes. Change your city, your frequency, or turn this off anytime from your Account page.`,
    }),
  };
}
