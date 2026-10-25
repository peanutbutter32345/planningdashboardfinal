# BayDashboard coverage expansion

This work expands the existing BayDashboard at `/`. It uses the same HTML, CSS, Google Maps overview, topic tabs, profile and account system. There is no second site or deployment. Old `/cal/` preview links redirect to `/`.

## Coverage and provenance

The research covers CA-24 and neighboring CA-19, CA-20 and CA-26 using the union of the current 119th and incoming 120th Congress Census boundaries. Whole localities can extend outside those districts. Current and incoming district membership stays on each source profile. The BayDashboard directory retains all 101 original incorporated Bay Area cities and West San Jose, and adds 61 incorporated cities and 193 Census-designated communities. Community profiles use the responsible county government, not invented city departments.

Source snapshots remain under `public/cal/data/` and licensed photographs under `public/cal/img/`. These paths are data assets, not a separate interface. `public/data/coverage/` adapts those records to the existing dashboard contracts. The browser gets metadata and up to eight preview records per added locality, then loads all available records for a selected city or county. Statistics use precomputed complete-record totals so unloaded cities are not ranked using eight-row samples. Locality requests are deduplicated and failed requests can be retried. Existing account and guest registration code is unchanged.

The additions contain 53,880 source records. HCD annual rows preserve dates, source links and verified coordinates. Issued permits are shown as approved with an explicit note that construction is not established. CEQAnet documents remain labelled environmental filings, with no invented coordinates or housing-unit totals. Multiple documents can describe one project. Missing Census estimates and market indexes remain unavailable. Regional photo fallbacks name the place actually pictured.

Official resource links cover planning, project files, housing, zoning, general plans, municipal codes, boards, meetings, environmental review and transportation wherever published. Verified zoning services feed the existing project's zoning lookup. Census outlines extend the existing overview and local maps. Live hearing feeds are enabled only for verified agency clients, with agenda-directory fallbacks.

## Refresh

Run the public-source importers in `scripts/cal/` as needed: `build-geography.py`, `build-resources.py`, `import-statistics.py`, `import-housing.py`, `import-news.py`, `import-photos-batch.py`, `build-land-use.py`, `build-boards.py`, and `import-environmental.py`. Geography and housing imports require Python with Shapely. Other importers use standard Python. Public-source caches are in `/tmp/cal-civic-cache`.

After source changes:

1. `python3 scripts/cal/integrate-bay-coverage.py`
2. `node scripts/cal/build-bay-coverage-facts.mjs`
3. `node scripts/sync-projects.js`
4. `node scripts/cal/audit-coverage.mjs`
5. `npm test`

`coverage-audit.json` distinguishes imported records, live connections, directories, lookup links and missing sources. Every incorporated city has HCD rows and environmental filings. Some communities have no exact local records and some agencies do not publish a usable zoning layer. The dashboard retains official lookup links without fabricating data. Historical Bay newsletter issues keep their original geographic scope and dates.
