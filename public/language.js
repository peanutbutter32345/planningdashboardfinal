// Local interface translations. No page text, account data or records leave the browser.
export const LANGUAGES = [
  ['en', 'English'], ['es', 'Español'], ['zh-Hans', '中文（简体）'],
  ['tl', 'Tagalog'], ['vi', 'Tiếng Việt'], ['ar', 'العربية'], ['hi', 'हिन्दी'],
];
export const STORAGE_KEY = 'civic-dashboard-language';
const CODES = LANGUAGES.map(([code]) => code);
const ATTRIBUTES = ['placeholder', 'aria-label', 'title'];
const TEMPLATES = [
  [/^Selected: (.+)$/, 'Selected: {city}', 'city'],
  [/^Ready to explore (.+)\. Your choices are remembered on this device\.$/, 'Ready to explore {city}. Your choices are remembered on this device.', 'city'],
  [/^Load (.+) project records$/, 'Load {city} project records', 'city'],
  [/^([\d,]+) loaded records indexed$/, '{count} loaded records indexed', 'count'],
];
const SKIP = 'script,style,textarea,option:not([value]),code,pre,svg,canvas,video,[contenteditable], [translate="no"],.leaflet-container,.gm-style,.nav-identity,#utilAccount,#accountUsername,#frontAdmin,#nlIssue,#askMessages';
export function validLanguage(value) { return CODES.includes(value) ? value : 'en'; }
export function translateText(value, language, catalog) {
  if (language === 'en') return value;
  const key = value.trim();
  const index = CODES.indexOf(language) - 1;
  let translated = catalog[key]?.[index];
  if (typeof translated !== 'string') {
    for (const [pattern, template, parameter] of TEMPLATES) {
      const match = key.match(pattern);
      const localized = catalog[template]?.[index];
      if (match && localized) { translated = localized.replace('{'+parameter+'}', () => match[1]); break; }
    }
  }
  return typeof translated === 'string' ? value.replace(key, () => translated) : value;
}
export function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) || !Object.keys(catalog).length) throw Error('Invalid translations');
  for (const row of Object.values(catalog)) {
    if (!Array.isArray(row) || row.length !== CODES.length - 1 || row.some(text => typeof text !== 'string' || !text.trim())) throw Error('Incomplete translations');
  }
  return catalog;
}
// Keep the original separately: switching languages never translates a translation.
export function translatedValue(current, previous, language, catalog) {
  const original = previous && current === previous.rendered ? previous.original : current;
  return {original, rendered: translateText(original, language, catalog)};
}

export function initLanguage(document, storage, fetcher) {
  const selects = [...document.querySelectorAll('[data-language-select]')];
  if (!selects.length) return;
  const textState = new WeakMap(), attributeState = new WeakMap();
  let language = 'en', catalog = {}, catalogPromise, request = 0, scheduled = false;
  const roots = new Set();
  const notes = [...document.querySelectorAll('[data-language-note]')];
  const statuses = [...document.querySelectorAll('[data-language-status]')];
  function skip(element) { return !element || Boolean(element.closest(SKIP)); }
  function text(node) {
    if (skip(node.parentElement) || !node.nodeValue.trim()) return;
    const state = translatedValue(node.nodeValue, textState.get(node), language, catalog);
    if (state.rendered !== node.nodeValue) node.nodeValue = state.rendered;
    textState.set(node, state);
    // Untranslated public records inherit English. Mark only translated text containers.
    if (node.parentElement.childNodes.length === 1 && state.rendered !== state.original) node.parentElement.lang = language;
    else if (node.parentElement.lang && CODES.includes(node.parentElement.lang)) node.parentElement.removeAttribute('lang');
  }
  function attributes(element) {
    if (skip(element)) return;
    const states = attributeState.get(element) || {};
    for (const name of ATTRIBUTES) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      states[name] = translatedValue(current, states[name], language, catalog);
      if (states[name].rendered !== current) element.setAttribute(name, states[name].rendered);
    }
    attributeState.set(element, states);
  }
  function apply(root) {
    if (!root.isConnected) return;
    if (root.nodeType === 3) { text(root); return; }
    if (root.nodeType !== 1 || skip(root)) return;
    attributes(root);
    const walker = document.createTreeWalker(root, 5); // Elements and text nodes.
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) text(node); else attributes(node);
    }
  }
  const observer = new MutationObserver(records => {
    if (language === 'en') return;
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(node => roots.add(node));
      else roots.add(record.target);
    }
    if (scheduled || !roots.size) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      observer.disconnect();
      const batch = [...roots]; roots.clear();
      // Parents subsume their children, avoiding repeated walks of re-rendered sections.
      for (const root of batch) if (!batch.some(other => other !== root && other.contains?.(root))) apply(root);
      observe();
    });
  });
  function observe() {
    observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:ATTRIBUTES});
  }
  function load() {
    if (!catalogPromise) catalogPromise = fetcher('/locales/interface.json', {signal:AbortSignal.timeout(8000)})
      .then(response => { if (!response.ok) throw Error('Translations unavailable'); return response.json(); })
      .then(validateCatalog).catch(error => { catalogPromise = undefined; throw error; });
    return catalogPromise;
  }
  async function select(value) {
    const next = validLanguage(value), version = ++request;
    statuses.forEach(status => { status.textContent = next === 'en' ? '' : 'Loading language…'; });
    try {
      const loaded = next === 'en' ? catalog : await load();
      if (version !== request) return;
      catalog = loaded; language = next;
      observer.disconnect(); roots.clear();
      document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.dataset.language = next;
      selects.forEach(select => { select.value = next; });
      notes.forEach(note => { note.hidden = next === 'en'; });
      statuses.forEach(status => { status.textContent = ''; });
      apply(document.body);
      observe();
      try { storage?.setItem(STORAGE_KEY, next); } catch { /* Private browsing may block storage. */ }
      document.dispatchEvent(new CustomEvent('dashboard:language', {detail:next}));
    } catch {
      if (version !== request) return;
      selects.forEach(select => { select.value = language; });
      statuses.forEach(status => { status.textContent = 'Language could not load. Please try again.'; });
    }
  }
  selects.forEach(control => control.addEventListener('change', () => void select(control.value)));
  observe();
  let saved = 'en';
  try { saved = validLanguage(storage?.getItem(STORAGE_KEY)); } catch { /* Default to English. */ }
  if (saved !== 'en') void select(saved);
  return {select, get language() { return language; }};
}
if (typeof document !== 'undefined') {
  let storage;
  try { storage = window.localStorage; } catch { /* Storage is optional. */ }
  initLanguage(document, storage, window.fetch.bind(window));
}
