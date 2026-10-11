#!/usr/bin/env node
// Reads every line of copy a visitor can see and reports the AI writing tells in it.
//
//   node scripts/check-copy.mjs            report, exit 1 if a strong tell is found
//   node scripts/check-copy.mjs --all      include the weak tells that need company
//   node scripts/check-copy.mjs --json     machine-readable, for the test
//
// Copy lives in three different shapes here, so there are three extractors: markup in the HTML
// files, string literals in the scripts that build the interface, and prose fields in the data
// files. Each one reports a file and line so a hit can be opened directly.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findTells } from './lib/copy-patterns.mjs';

const root = new URL('../', import.meta.url);
const rel = url => fileURLToPath(url).replace(fileURLToPath(root), '');

// ---------- what to read ----------
const HTML_FILES = ['public/index.html', 'public/photo-credits.html'];
const SCRIPT_FILES = [
  'public/index.html',          // the inline module that draws most of the interface
  'public/browse.js', 'public/guest.js', 'public/housing-data.js',
  'public/site-visuals.js', 'public/overview-map-utils.js',
  'public/futures/app.js', 'public/futures/model.js', 'public/futures/layers.js',
  'digest.js', 'server.js', 'hearings.js',
  'scripts/build-newsletter.mjs',
];
// Prose fields in the data files, by file and the keys whose values a reader sees.
//
// A headline or excerpt republished from a newspaper is a quotation. Editing one to sound less
// like a chatbot would misquote the publisher, which is a worse fault than the phrasing, so the
// news files are read for the separate structural checks in tests/copy.test.js and are not held
// to the tells. Everything else here is this site's own writing and is.
const DATA_FILES = [
  { path: 'data/projects.js', keys: ['lastNote', 'flag', 'desc', 'note'] },
  { path: 'data/boards.js', keys: ['name', 'body', 'when'] },
  { path: 'data/stats.js', keys: ['label', 'note', 'caption'] },
  { path: 'data/regional.js', keys: ['note', 'blurb', 'label'] },
  { path: 'public/data/newsletter.json', keys: ['text', 'title', 'lead', 'heading', 'body', 'summary'] },
];

// Line ranges inside a site file that hold quoted outside text, found by the name of the array
// that holds it rather than by line number so the ranges survive an edit above them.
const QUOTED_ARRAYS = { 'public/index.html': ['NEWS_ARTICLES'] };

// The lines of `source` that fall inside one of the named array literals.
function quotedLines(source, names) {
  const skip = new Set();
  for (const name of names) {
    const decl = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\[`);
    const at = source.search(decl);
    if (at < 0) continue;
    const openedAt = source.indexOf('[', at);
    let depth = 0, close = -1;
    for (let i = openedAt; i < source.length; i++) {
      const c = source[i];
      if (c === '[') depth++;
      else if (c === ']' && --depth === 0) { close = i; break; }
    }
    if (close < 0) continue;
    const first = source.slice(0, openedAt).split('\n').length;
    const last = source.slice(0, close).split('\n').length;
    for (let line = first; line <= last; line++) skip.add(line);
  }
  return skip;
}

// ---------- extractors ----------

// Markup, minus the parts that are not prose. Returns [{ line, text }].
function fromHtml(source) {
  const out = [];
  let inStyle = false, inScript = false;
  source.split('\n').forEach((raw, i) => {
    const line = i + 1;
    if (/<style[\s>]/i.test(raw)) inStyle = true;
    if (/<\/style>/i.test(raw)) { inStyle = false; return; }
    if (/<script[\s>]/i.test(raw)) inScript = true;
    if (/<\/script>/i.test(raw)) { inScript = false; return; }
    if (inStyle || inScript) return;

    // Attributes a reader actually reads, before the tags are stripped.
    for (const m of raw.matchAll(/\b(?:title|placeholder|aria-label|alt|content)="([^"]{4,})"/gi)) {
      out.push({ line, text: m[1] });
    }
    // Text between tags.
    const text = raw
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&[a-z]+;|&#\d+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (isProse(text)) out.push({ line, text });
  });
  return out;
}

// String literals that read as prose. A literal is prose when it has several words of letters and
// is not a selector, a path, a URL, an identifier or a style rule.
function fromScript(source, { inlineOnly = false } = {}) {
  const out = [];
  const lines = source.split('\n');
  let active = !inlineOnly;
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (inlineOnly) {
      // Only the inline <script> blocks of an HTML file.
      if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(raw)) { active = true; return; }
      if (/<\/script>/i.test(raw)) { active = false; return; }
      if (!active) return;
    }
    if (/^\s*(?:\/\/|\*|\/\*)/.test(raw)) return;        // comments are not shipped to the reader
    for (const m of raw.matchAll(/(['"`])((?:\\.|(?!\1)[^\\]){8,400})\1/g)) {
      const text = m[2]
        .replace(/\\n|\\t/g, ' ')
        .replace(/\$\{[^}]*\}/g, '…')   // an interpolation is a value, not prose
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (isProse(text)) out.push({ line, text });
    }
  });
  return out;
}

function fromData(source, keys) {
  const out = [];
  const keyRe = new RegExp(`\\b(?:${keys.join('|')})\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`, 'g');
  const jsonRe = new RegExp(`"(?:${keys.join('|')})"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'g');
  source.split('\n').forEach((raw, i) => {
    const line = i + 1;
    for (const m of raw.matchAll(keyRe)) {
      const text = unescape_(m[2]);
      if (isProse(text)) out.push({ line, text });
    }
    for (const m of raw.matchAll(jsonRe)) {
      const text = unescape_(m[1]);
      if (isProse(text)) out.push({ line, text });
    }
  });
  return out;
}

const unescape_ = s => s.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, ' ').replace(/\\\\/g, '\\');

// Prose has at least three words, mostly letters, and no shape that marks it as code.
function isProse(text) {
  if (!text || text.length < 12) return false;
  if (/^[\s…]*$/.test(text)) return false;
  if (/^(?:https?:|\/|\.|#|data:|mailto:)/.test(text)) return false;
  if (/[{}<>]|=>|\)\s*\./.test(text)) return false;
  if (/^[a-z]+(?:[-_][a-z0-9]+)+$/i.test(text)) return false;      // kebab or snake identifier
  if (/^[A-Za-z]+(?:[A-Z][a-z]+)+$/.test(text)) return false;       // camelCase identifier
  if (/:\s*-?\d|px\b|rem\b|rgba?\(|#[0-9a-f]{3,8}\b/i.test(text)) return false;  // style values
  const words = text.split(/\s+/).filter(w => /[A-Za-z]{2,}/.test(w));
  if (words.length < 3) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return letters / text.length > 0.6;
}

// ---------- run ----------
function collect() {
  const units = [];
  const seen = new Set();
  const push = (file, items) => {
    for (const { line, text } of items) {
      const dedupe = `${file}:${line}:${text}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      units.push({ file, line, text });
    }
  };

  for (const path of HTML_FILES) {
    const url = new URL(path, root);
    if (!existsSync(url)) continue;
    push(path, fromHtml(readFileSync(url, 'utf8')));
  }
  for (const path of SCRIPT_FILES) {
    const url = new URL(path, root);
    if (!existsSync(url)) continue;
    const source = readFileSync(url, 'utf8');
    const skip = QUOTED_ARRAYS[path] ? quotedLines(source, QUOTED_ARRAYS[path]) : null;
    const items = fromScript(source, { inlineOnly: path.endsWith('.html') });
    push(path, skip ? items.filter(i => !skip.has(i.line)) : items);
  }
  for (const { path, keys } of DATA_FILES) {
    const url = new URL(path, root);
    if (!existsSync(url)) continue;
    push(path, fromData(readFileSync(url, 'utf8'), keys));
  }
  return units;
}

export function scan({ includeWeak = false } = {}) {
  const findings = [];
  for (const unit of collect()) {
    for (const tell of findTells(unit.text)) {
      if (!includeWeak && tell.strength === 'weak') continue;
      findings.push({ ...unit, ...tell });
    }
  }
  return findings;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const includeWeak = process.argv.includes('--all');
  const findings = scan({ includeWeak });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    const byPattern = new Map();
    for (const f of findings) {
      if (!byPattern.has(f.id)) byPattern.set(f.id, []);
      byPattern.get(f.id).push(f);
    }
    const total = findings.length;
    for (const id of [...byPattern.keys()].sort((a, b) => a - b)) {
      const group = byPattern.get(id);
      const { name, strength, fix } = group[0];
      console.log(`\n§${id} ${name}  (${group.length} ${strength})`);
      console.log(`   ${fix}`);
      for (const f of group.slice(0, 25)) {
        const quote = f.text.length > 120 ? f.text.slice(0, 117) + '…' : f.text;
        console.log(`   ${f.file}:${f.line}  "${quote}"   [${f.match}]`);
      }
      if (group.length > 25) console.log(`   …and ${group.length - 25} more`);
    }
    const scanned = collect().length;
    console.log(`\n${total} tell${total === 1 ? '' : 's'} across ${byPattern.size} pattern${byPattern.size === 1 ? '' : 's'}, from ${scanned} lines of copy.`);
    if (!includeWeak) console.log('Weak tells are hidden. Run with --all to see them.');
  }
  process.exit(findings.some(f => f.strength === 'strong') ? 1 : 0);
}
