/* A self-driving walkthrough, for recording the kind of thirty second tour that sits on a landing
   page. Open /?tour=1, press record, and leave it alone: the page drives itself through the same
   sequence every time, so a retake is identical to the one before and nothing depends on hitting
   a button at the right moment.

   It is loaded only when ?tour=1 is present, so it costs an ordinary reader nothing.

   Captions carry the narration. A tour video on a landing page plays muted - confide.help's does,
   and most do - so anything the voice would have said has to be on screen or it is not said at
   all. Each caption states what the viewer is looking at, not what is about to be clicked.

   Nothing here is a mock. It drives the real site against real records, so whatever the tour shows
   is what a visitor gets. If a step finds nothing to show it says so and moves on rather than
   pretending; a tour that quietly skips an empty screen is how a demo starts lying. */
(function () {
  const params = new URLSearchParams(location.search);
  if (params.get('tour') !== '1') return;

  // Each step: what the viewer should understand, and how long to leave it on screen.
  const TOUR = [
    { say: 'Every project near you, from the public record', ms: 3200, run: start },
    { say: 'Explore 101 Bay Area cities', ms: 3400, run: pickCity },
    { say: 'What is being built, and how far along it is', ms: 4200, run: showRegister },
    { say: 'Open one for the whole record', ms: 4200, run: openRecord },
    { say: 'Filed, decided, who is building it, the file number', ms: 3600, run: showFacts },
    { say: 'The zoning, read live from the city itself', ms: 4200, run: showRules },
    { say: 'And where it actually is', ms: 5200, run: showMap },
    { say: 'baydashboard.com', ms: 3000, run: finish },
  ];

  // Fixed scenes for an edited video: /?tour=1&scene=housing. They use the real UI.
  const captureScene=params.get('scene');
  if(captureScene){
    const valid=new Set(['intro','yourarea','housing','developments','transportation','statistics','futures','newsletter','meetingSummary','planner','bank','timeline','ask','account','finish']);
    if(!valid.has(captureScene))return;
    const capture=()=>{
      const css=document.createElement('style');
      css.textContent='#onboardOverlay,#frontAdmin,#navMenu{display:none!important;}html,body{scroll-behavior:auto!important;}';
      document.head.appendChild(css);
      if(typeof setNavMenu==='function')setNavMenu(false);
      if(typeof switchCity==='function')switchCity(params.get('city')||'sunnyvale');
      const screen=['intro','finish'].includes(captureScene)?'dashboard':captureScene;
      if(typeof showScreen==='function')showScreen(screen);
      setTimeout(()=>{
        if(['intro','finish'].includes(captureScene))window.scrollTo({top:0,behavior:'instant'});
        else if(typeof scrollToScreen==='function')scrollToScreen(screen);
        document.body.dataset.tourScene=captureScene;
      },1000);
    };
    if(document.readyState==='complete')capture();else window.addEventListener('load',capture,{once:true});
    return;
  }

  const CITY = params.get('city') || 'sunnyvale';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ease = () => wait(650);

  function caption(text) {
    let el = document.getElementById('tourCaption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tourCaption';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth;        // restart the fade rather than letting it stay put
    el.classList.add('on');
  }

  function style() {
    const css = document.createElement('style');
    css.textContent = `
      #tourCaption{position:fixed; left:50%; bottom:34px; transform:translateX(-50%) translateY(8px);
        z-index:4000; background:rgba(20,24,16,.93); color:#fff; font-family:'Open Sans',sans-serif;
        font-size:19px; font-weight:600; letter-spacing:.01em; padding:14px 26px; border-radius:3px;
        box-shadow:0 6px 26px rgba(0,0,0,.4); opacity:0; transition:opacity .45s ease, transform .45s ease;
        max-width:min(78vw,760px); text-align:center; pointer-events:none;}
      #tourCaption.on{opacity:1; transform:translateX(-50%) translateY(0);}
      /* The cursor is not in the recording, so anything that only appears on hover never would. */
      html.tour-running, html.tour-running body{scroll-behavior:smooth;}
      html.tour-running #onboardOverlay{display:none !important;}`;
    document.head.appendChild(css);
  }

  async function start() {
    document.documentElement.classList.add('tour-running');
    const overlay = document.getElementById('onboardOverlay');
    if (overlay) overlay.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function pickCity() {
    if (typeof switchCity === 'function') switchCity(CITY);
    await ease();
  }

  async function showRegister() {
    if (typeof showScreen === 'function') showScreen('dashboard');
    await ease();
    const grid = document.getElementById('registerGrid');
    if (grid) grid.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // The record the tour opens is chosen for being complete, not for being first: a tour that opens
  // a record with no size, no date and no coordinates shows the site at its thinnest.
  function bestRecord() {
    const all = typeof DATA === 'function' ? DATA() : [];
    const scored = all
      .filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lng))
      .map(d => ({ d, score: (d.units ? 2 : 0) + (d.desc ? 1 : 0) + (d.applicant ? 1 : 0) + (d.lastNote ? 1 : 0) + (d.filed ? 1 : 0) }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.d || null;
  }

  let chosen = null;
  async function openRecord() {
    chosen = bestRecord();
    if (!chosen) { caption('No located records in this city'); return; }
    if (typeof openProjectSheet === 'function') openProjectSheet(chosen.id);
    await wait(900);
    const body = document.getElementById('projSheetBody');
    if (body) body.scrollTop = 0;
  }

  const scrollSheetTo = selector => {
    const el = document.querySelector(selector);
    const back = document.getElementById('projSheet');
    if (el && back) back.scrollTo({ top: Math.max(0, el.offsetTop - 90), behavior: 'smooth' });
  };

  async function showFacts() { scrollSheetTo('.ps-facts'); }
  async function showRules() { scrollSheetTo('#psRules'); }

  async function showMap() {
    scrollSheetTo('.ps-map-wrap');
    await wait(900);
    const play = document.getElementById('psMapPlay');
    if (play && !play.disabled) play.click();     // out to the city and back to the address
  }

  async function finish() {
    if (typeof closeProjectSheet === 'function') closeProjectSheet();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function run() {
    style();
    // A beat before anything moves, so a recording started by hand does not miss the first step.
    await wait(1200);
    for (const step of TOUR) {
      caption(step.say);
      try { await step.run(); } catch (err) { console.warn('tour step failed:', err); }
      await wait(step.ms);
    }
    const el = document.getElementById('tourCaption');
    if (el) el.classList.remove('on');
    console.log('Tour finished. Total ' + (TOUR.reduce((n, s) => n + s.ms, 0) / 1000 + 1.2).toFixed(1) + 's');
  }

  if (document.readyState === 'complete') setTimeout(run, 2200);
  else window.addEventListener('load', () => setTimeout(run, 2200));
})();
