# BayDashboard coverage expansion

This work expands the existing BayDashboard at `/`. It uses the same HTML, CSS, Google Maps overview, topic tabs, profile and account system. There is no second site or deployment. Old `/cal/` preview links redirect to `/`.

## Coverage and provenance

The research covers CA-24, nearby CA-19, CA-20, CA-21, CA-26 and CA-27, and the city of San Diego using the union of the current 119th and incoming 120th Congress Census boundaries. Whole localities can extend outside those districts. Current and incoming district membership stays on each source profile. The BayDashboard directory retains all 101 original incorporated Bay Area cities and West San Jose, and adds 70 incorporated cities and 223 Census-designated communities. Community profiles use the responsible county government, not invented city departments.

Source snapshots remain under `public/cal/data/` and licensed photographs under `public/cal/img/`. These paths are data assets, not a separate interface. `public/data/coverage/` adapts those records to the existing dashboard contracts. The browser gets metadata and up to eight preview records per added locality, then loads all available records for a selected city or county. Statistics use precomputed complete-record totals so unloaded cities are not ranked using eight-row samples. Locality requests are deduplicated and failed requests can be retried. Existing account and guest registration code is unchanged.

The additions contain 60,029 source records. HCD annual rows preserve dates, source links and verified coordinates. Issued permits are shown as approved with an explicit note that construction is not established. CEQAnet documents remain labelled environmental filings, with no invented coordinates or housing-unit totals. Multiple documents can describe one project. Missing Census estimates and market indexes remain unavailable. Regional photo fallbacks name the place actually pictured.

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

## Connection checks (October 25, 2026)

Run `node scripts/cal/check-connections.mjs` to check the ten newly expanded/enriched city resource sets, plus all expansion news links, named boards, meeting directories, and connected zoning layers. It also checks every configured Legistar client and the production health, sources, and hearings endpoints. `--retry` reuses successful checks less than an hour old and retries blocked or failed connections. Every reused result retains its original check time. The JSON report identifies its precise scope. It does not claim to test every link in the original Bay Area inventory.

The final pass checked 1,223 unique URLs: 1,206 responded successfully and 17 returned access restrictions. No confirmed broken links or unresolved timeouts remained in that pass. The restricted links remain available to residents because automated HTTP 403 responses do not establish that a browser cannot open them. All 17 configured Legistar clients, 13 distinct zoning services, 10 sampled HCD endpoints and 531 news/source-update links responded. HTTP success does not certify every document's accuracy or freshness.

The production assistant and meeting-summary routes were also exercised with a Los Angeles public-record question. Both returned HTTP 200. The meeting summary explicitly identified its source as web search, not an official agenda feed. Production registration, email delivery and scheduler mutations were not invoked during this check. Their behavior is exercised in the isolated test suite.

Importers respect HTML base URLs, discard confirmed stale deep links recorded in `unavailable-links.json`, omit individual calendar events from permanent board lists, and remove expiring WordPress download refresh parameters. Coverage manifest and city files revalidate together to prevent mixed revisions in returning browsers.

Live coverage is not uniform: most agencies provide agenda directories rather than machine-readable meeting feeds. Some localities lack a connected zoning polygon layer, project inventory, or specialized source category. `coverage-audit.json` records these gaps; empty fields must not be represented as verified zeroes. HCD figures are annual reports, CEQAnet items are environmental filings, and neither establishes a current construction status.
