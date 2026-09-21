# The Bay Civic Dashboard

This package contains the civic dashboard plus a server-side AI assistant for the cities it covers across all nine Bay Area counties.

## What is already wired

- `public/index.html` — dashboard + dedicated **Ask a Question** page.
- Left pane — conversational answer.
- Right pane — only official resources relevant to the answer.
- `/api/ask` — chat endpoint on any OpenAI-compatible API; defaults to Groq's free tier.
- Dashboard project records are sent as structured context automatically.
- `data/sources.js` — consolidated official planning, development, GIS, housing, permit, transportation, CIP, CEQA, hearing, and project links.
- Resource selection is constrained to known source IDs, so the model cannot invent source URLs.
- No paid API needed: the assistant runs on a free Groq key by default.

## 1. Install Node.js

Use Node 20+.

## 2. Install dependencies

```bash
npm install
```

## 3. Add a free API key

Create a free key at https://console.groq.com/keys, then create a file named `.env` in the project folder containing:

```text
LLM_API_KEY=your_groq_key_here
```

That is all that is required. Optional settings, shown with their defaults:

```text
LLM_MODEL=openai/gpt-oss-120b
LLM_BASE_URL=https://api.groq.com/openai/v1
```

Groq's free plan allows this model 30 requests and 8,000 tokens per minute, and 1,000 requests a day. The server trims each question's context to stay well inside that, and when the limit is reached the page shows "try again in a minute" instead of an error.

Any other OpenAI-compatible provider works by changing `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY` — for example Google Gemini, at `https://generativelanguage.googleapis.com/v1beta/openai/`. Google's terms say content sent on its free tier may be used to improve its products and read by human reviewers.

Never put the API key in `public/index.html`.

## 4. Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Open the **Ask a Question** tab and ask a civic-planning question.

## 5. What the assistant knows

It answers from the selected city's project records and the official source registry in `data/sources.js`, and it does not browse the web. The OpenAI File Search (vector store) and live web search options below relied on OpenAI's paid Responses API and no longer apply; `npm run vector:create` is unused.

### (Retired) document knowledge base

Put official source files into `knowledge/`, for example:

- Housing Elements
- General Plans
- Specific/Precise Plans
- development status reports
- CEQA/EIR documents
- transportation plans
- Vision Zero / roadway safety plans
- Capital Improvement Program documents
- meeting packets or staff reports

Then:

```bash
npm run vector:create
```

The script prints:

```text
OPENAI_VECTOR_STORE_ID=vs_...
```

Paste that into `.env` and restart the server. File Search is then enabled automatically.

### (Retired) live web search

Set:

```text
ENABLE_WEB_SEARCH=true
```

The system instructions tell the model to prefer official government/public-agency sources. Keep this off if you want the assistant limited to your dashboard data, source registry, and uploaded files.

## API response shape

`POST /api/ask` returns:

```json
{
  "answer": "Plain-English answer...",
  "resources": [
    {
      "id": "sv-development-reports",
      "title": "Development Reports",
      "url": "https://...",
      "note": "Development activity reports...",
      "category": "Development"
    }
  ]
}
```

The existing Ask page already renders `answer` on the left and `resources` on the right.

## Security

- API credentials stay on the server in `.env`.
- `.env` is gitignored.
- The browser never receives the API key.
- The assistant can only expose resource URLs that are already in the server's approved source registry.

## Email briefings

Every send is a **standing briefing, not a change alert**. A quiet week still produces a full
email — the point is to keep readers aware of housing, transportation, development, and the boards
that decide them, whether or not anything moved. Anything that *has* changed since the reader's
last email is marked **Updated** and sorts to the top of its section.

Each briefing is ordered the same way:

1. **What you're following** — every starred project, board, and article; changed ones first.
2. **In {your city}** — Housing · Transportation · Other development · In the news ·
   Who decides and when they meet · Ways to get involved.
3. **Around the rest of the Bay Area** — projects that moved, plus recent regional news.
4. **Official {your city} links** — the city's own planning, permit, and GIS pages.

Every project title links to `?project=<id>` on the dashboard, which switches to that city, filters
to that record, and highlights it. Board titles link to the city's own board page, and articles
link to the source.

Nothing here is model-generated. Status text is quoted verbatim from the data files, and the one
summary sentence is assembled from integer counts — a model in that position could hallucinate a
project's status, and people may act on this.

Rendering lives in `digest.js` as pure functions: no database, no network. Preview every variant
without sending anything:

```bash
npm run digest:preview
```

That writes `preview-welcome.html` (first send), `preview-update.html` (things changed), and
`preview-quiet.html` (nothing changed). Set `PREVIEW_CITY` to try a different home city, e.g.
`PREVIEW_CITY=cupertino npm run digest:preview`.

### Required environment variables

```text
DATABASE_URL=postgres://...
RESEND_API_KEY=re_...
RESEND_FROM=The Bay Civic Dashboard <updates@your-verified-domain.com>
CRON_SECRET=<a long random string>
SITE_URL=https://your-site.com
ADMIN_USERNAMES=<your account username>
```

`RESEND_FROM` matters: the default `onboarding@resend.dev` only delivers to the email address on
your own Resend account, so real subscribers will silently receive nothing until you verify a
domain in Resend and set this.

### The newsletter

`node scripts/build-newsletter.mjs` writes `public/data/newsletter.json`: one issue a month, newest
first, read from the Newsletter tab. Re-run it after refreshing news, housing records or market
data.

Each issue is fixed at the end of its month and may contain only what had been **published** by
then - not everything that had happened by then. Every source carries its own availability date:

| Source | Available from |
| --- | --- |
| News article | its publication date |
| Curated city record | the date the city posted it |
| HCD annual report row | June of the year after its reporting year, once Table A2 is on data.ca.gov |
| Zillow ZHVI / ZORI | 20 August of each series year, since each point is that year's 31 July value |
| ACS 2020-2024 5-year | 11 December 2025, its release |
| RHNA 6th cycle progress | August 2026, the vintage of the file this site carries |
| RHNA allocation target | already public; allocations were adopted in 2021-2022 |

So the October 2025 issue quotes the 2025 Zillow index and no ACS, no RHNA progress and no 2025
annual reports, and it says so in its own "What this issue could not know" box. `tests/newsletter.test.js`
enforces all of it, including that no issue cites a source dated after itself.

### Seeing how many people use the site

Every unique visitor is a user: someone who signs up, and someone who only ever browses with the
guest profile their browser made. Both are rows in `users`, told apart by `kind`, and a guest who
later signs up keeps their original row rather than becoming a second person.

Set `ADMIN_USERNAMES` to your own account username (comma-separated for more than one) and the
total appears on your account page. Nobody else can read it - for any other reader the request
answers 404. From a terminal, the same figures come back with the cron secret:

```bash
curl -s "https://your-site.com/api/community" -H "x-cron-secret: YOUR_CRON_SECRET"
```

`/api/admin/stats`, behind the same secret, adds the breakdown by city, by email frequency, how
many were seen in the last 30 days, and when the first and latest signups were.

### Scheduling with cron-job.org

Render's own cron jobs are a paid service type, so on the free plan use an external scheduler.

- **URL** — `https://your-site.com/api/cron/send-digests?secret=YOUR_CRON_SECRET`
- **Method** — GET or POST; both work. (Passing the secret as the `x-cron-secret` header instead of
  a query parameter keeps it out of the scheduler's logs, if your scheduler supports headers.)
- **Schedule** — once a day. Run it daily no matter what frequencies your users pick: the endpoint
  checks everyone on each run and only emails whoever is actually due.

A successful run returns JSON like `{"ok":true,"checked":4,"due":2,"sent":1,"skipped":1,"failed":0}`.
`skipped` means the user was due but nothing had changed, so no email was sent and their clock was
left alone — the next run still compares against their last real email.

A `401` means the secret is missing or wrong. A `503` means `DATABASE_URL` isn't set.

Free Render web services spin down when idle and take a few seconds to wake, so allow a generous
timeout in the scheduler, or hit `/api/health` on a separate schedule to keep the service warm.

## Deploy on Render

1. Push this repository to GitHub. Do not commit `.env`.
2. In Render, create a new Blueprint or Web Service from the repository.
3. If using the included `render.yaml`, Render will use `npm install` and `npm start` automatically.
4. Add `LLM_API_KEY` (your free Groq key) as a private environment variable in Render.
5. Deploy. The same server serves the website and `/api/ask`, so no frontend API URL change is required.

Default production model: `openai/gpt-oss-120b` on Groq's free tier, low reasoning effort, at most 900 completion tokens.

## Future housing map

Open the **Future Map** dashboard tab, or visit `/?view=futures`. It uses the existing dashboard city records and preserves the site's original styling. No API key or database is required for scenarios.

- Choose an area and a year (2027–2040), then change financing, cost growth, delivery delay and policy uptake assumptions.
- Explore housing heatmaps, individual projects, city price scenarios and flood exposure. Expand the map, switch to satellite imagery, or play through the years with the map's timeline.
- Overlay FEMA flood zones, NOAA sea-level scenarios (1–6 feet, selected independently of the year), and California Energy Commission power plants and battery facilities. Facility capacity is not live generation or available grid capacity.
- Adjust price growth, supply sensitivity, a hypothetical exposed-location discount, household electricity use and grid delays. Price outputs are city-level sensitivity scenarios; the exposed-location example is separate from the city price index. Estimated annual electricity demand is based on modeled homes and the chosen household usage.
- Compare the reference and scenario on the map, timeline and searchable project table. The affordable layer retains unknown affordability as unknown.
- The bill watchlist distinguishes enacted laws from the November 2026 bond decision. Official sources and a review date accompany each entry; this is a curated snapshot, not a live legislative feed.
- Copy a scenario link to reproduce the settings, or export the full selected area's modeled records and assumptions to CSV. Search only filters the displayed table, not the area totals or CSV.

`public/futures/model.js` contains the pure delivery model, policy metadata and approximate station centers. `spatial.js` handles flood screening, price sensitivity and electricity demand; `layers.js` loads public map layers. `app.js` connects them to the dashboard; `futures.css` styles only the new feature. The on-page methodology documents the coefficients and limitations.

**Interpretation:** these are illustrative sensitivity estimates of reported gross project units, not a calibrated forecast, a count of net new homes, a rent forecast or a legal parcel-eligibility determination. The project sample includes stale records, built phases and potentially overlapping master plans. Station buffers cover a hand-curated subset of Caltrain/BART, not every qualifying transit stop. Policy acceleration assumptions are not estimates published by the legislature or HCD.

### Public spatial data

The checked-in snapshots in `public/futures/data/` let the simulator load without credentials:

- FEMA NFHL: 2,786 high-hazard and 0.2% annual-chance polygons for Santa Clara and San Mateo counties, retrieved September 18, 2026. Geometries are generalized for display. Point screening uses project coordinates, not parcel boundaries; an unmatched point is not a finding of safety. [Official source](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28).
- CEC: 56 facility records, with 44 not flagged retired displayed. The source was updated June 12, 2026. [Official source](https://services3.arcgis.com/bWPjFyq029ChCGur/arcgis/rest/services/Power_Plant/FeatureServer/0).
- MTC/ABAG: Census 2020 housing-unit totals for the 33 dashboard areas, used as stock denominators. West San Jose uses the citywide San Jose denominator. Existing dashboard July 2026 Zillow city values provide price anchors where available. [Housing-stock source](https://census.bayareametro.gov/housing-units).

NOAA sea-level tiles are loaded from the public service at runtime. They show water-level scenarios, not year-specific predictions or storm forecasts. [NOAA viewer and limitations](https://coast.noaa.gov/slr).

Refresh the snapshots deliberately, inspect the changed metadata and counts, then run tests:

```bash
node scripts/fetch-spatial-data.js energy
node scripts/fetch-spatial-data.js flood
node scripts/fetch-spatial-data.js housing
npm test
```

Public services can be unavailable; layer status and errors appear in the simulator. The server compresses the larger map snapshots in transit. Updating spatial snapshots does not refresh the curated bill watchlist, project records or price anchors.

### Keep project data consistent

The embedded city datasets in `public/index.html` currently own the project facts. After changing them, run:

```bash
npm run sync:projects
npm test
```

This regenerates `data/projects.js` so server-side answers, hearing matching and email briefings use the same facts as the dashboard. The consistency test fails if the copies diverge. Tests also cover scenario bounds, URL settings, spatial screening, unknown affordability, policy timing, concurrent hearing refreshes and partial upstream failures.

### Local validation

`npm test` does not require credentials. Browsing, the free map, scenarios and the bill watchlist work locally without credentials. End-to-end account, email and AI testing requires the corresponding `DATABASE_URL`, `RESEND_API_KEY` and `LLM_API_KEY` environment variables; do not commit them.

## Regional coverage and guest profiles

The dashboard covers all **101 incorporated cities and towns in the nine Bay Area counties**, plus the existing West San Jose neighborhood profile. The visible name is **The Bay Civic Dashboard**; the domain remains `southbaydashboard.com`.

- `public/data/municipalities.json` records official MTC/ABAG coverage and Census geography identifiers. All 102 profiles have locally served photography, official resources and meeting links. `public/data/regions.json` supplies the 69 expanded profiles and their 2020–2024 ACS estimates; existing profiles retain their labeled Census vintage.
- `public/data/housing-records.json` imports city-reported HCD APR Tables A and A2, updated September 18, 2026. Every municipality has a housing sample with map points. Up to 25 distinct addresses per municipality emphasize larger records, with completed examples retained. The combined dashboard has 2,833 records after matching-address duplicates are removed. Annual permit, entitlement and completion totals use **all** source rows, separately from the map sample. Most reports cover 2025; Clayton's latest available report in the import is 2024. Issued permits are approvals, not assumed construction starts. Coordinates require a high source match score and proximity to the city; unresolved addresses remain explicitly unlocated.
- `public/housing-data.js` merges the supplemental records while preserving existing researched records at matching addresses. `npm run sync:projects` produces the backend project and official-source copies, keeping Ask, hearings and email briefings consistent with the browser. Source lookup accepts both city keys and display names.
- `public/data/city-news.json` adds publisher headlines and official city updates for every municipality, linking to the source. Headlines obtained through public Google News RSS link through to the publisher; full articles are not copied. HCD annual activity updates are labeled separately as city-reported data updates. Resources are not presented as freshly published journalism.
- `public/data/market-data.json` adds exact city-and-county Zillow index matches for the established July 2026 baseline. Values cover 100 municipalities and rents cover 84; West San Jose additionally uses the San Jose citywide proxy. Missing series remain unavailable. Census owner values are shown as a separate measure.
- `public/data/meetings.json` supplies official agenda/recording directories for 102 profiles. Fourteen public Legistar feeds populate upcoming meetings, with per-city failures and official-link fallbacks. West San Jose shares San Jose's feed. These are published schedules, not a claim that hearings are streaming live now.
- All 102 city photos have attribution in `public/data/city-photos.json` and `/photo-credits.html`. Shared photo headers extend the established olive-and-paper design to all sections; statistic cards use distinct regional images. Photographs provide place context, not project renderings.
- Overview retains Google Maps as its primary map. If the key/referrer or network blocks Google, the fallback preserves **all located projects**. Shared coordinates open every record at that location; unknown addresses open a separate search without replacing the map. Counts and a Fit all points action make coverage explicit. Project cards load in batches of 60 while all filtered points remain mapped.
- Spatial snapshots query all nine counties. The September 19 refresh returned 13,603 FEMA polygons across eight counties (no matching San Francisco polygons), 255 CEC facilities, and 2020 housing stock for all 102 profiles. No matching flood polygon does not establish low risk. Heatmap rendering pauses safely when its tab is hidden.

Refresh the public snapshots:

```sh
node scripts/expand-bay-area.js
node scripts/build-regional-data.js --census
node scripts/import-hcd-housing.js
node scripts/refresh-city-news.js
python3 scripts/refresh-market-data.py
node scripts/refresh-city-photos.js
node scripts/build-photo-credits.js
node scripts/fetch-spatial-data.js flood
node scripts/fetch-spatial-data.js energy
node scripts/fetch-spatial-data.js housing
npm run sync:projects
npm test
```

The import scripts retain source URLs and reporting periods. HCD years and the market baseline are explicit snapshot choices in their respective scripts. Review those choices before advancing to a new reporting cycle.

Visitors without a signed-in session automatically receive a device-only guest profile with a persistent random noun plus four digits, such as `cookie0736`. Custom usernames are preserved. `public/guest.js` stores their display name, stars, timeline, reminders, saved answers and preferences in `localStorage` under `sbpd_guest_v1`. No database or email configuration is required for guest features. An optional password uses a salted PBKDF2 verifier and a tab-session unlock flag; this is a convenience browser lock, not encryption or server authentication. Clearing browser storage removes the profile. Private browsing may discard it when the session ends.

Full accounts continue to use the existing server authentication. Creating a new full account imports unlocked guest stars, timeline progress, reminders and city/topic preferences; a failed import leaves the original guest copy intact. Email delivery and synchronization between devices require a full account and the existing database/email environment variables. Guest data is not automatically imported when logging into an existing account.


### County browsing and first visits

First-time visitors receive a device-local guest profile immediately, with a noun and four-digit username. Username edits save automatically. Guided setup requires one of the nine counties; a city search, street address and interests are optional. Explore without setup preserves the automatic guest profile and defaults to Santa Clara County when no county is selected. County-only views filter the project register, map, topic news and city comparisons. The county directory previews city names on hover or keyboard focus and expands the selectable list on click/tap. Existing profiles and saved items are preserved.

Housing, Developments and Transportation use separate Projects, News, Map & sources and Field guide views. Collections render three records per page on desktop and one on narrow screens, with arrow buttons, keyboard navigation and touch swipes. Topic maps initialize only when opened, the overview map waits until needed, and offscreen hero rotations pause.

County-only visitors see a county-wide local map with selectable city markers and rotating official city resources. The navigation menu starts open and can be dismissed. Future Map separates Map, Results, Bills & policies, and Project details into accessible tabs; advanced assumptions collapse, mobile scenario controls open on demand, and hidden results are rendered only when selected.
