# Cal Civic Dashboard

The Cal edition runs at `/cal/` alongside the existing Bay Dashboard. Set `DASHBOARD_EDITION=cal` on a second deployment to serve Cal at that deployment's root. Its assets and API still use `/cal/` and `/api/cal/`. `render-cal.yaml` is an optional standalone deployment blueprint. Creating a second Render service or registering a custom domain is a separate hosting action. The existing `render.yaml` and Bay homepage remain unchanged.

The standalone deployment can use its own Postgres database to keep its accounts and counts separate. In a shared deployment, both editions use the existing account server, with separate Cal browser preferences and saved-item namespaces. Accounts can sign in to either edition. No account schema or existing registration limits are changed. Cal's browser newsletter archive is separate from Bay's newsletter and email scheduler. Standalone Cal email delivery is paused by default.

## Coverage

CA-24 and the three geographically adjacent current congressional districts CA-19, CA-20 and CA-26. US Census TIGERweb supplies both 119th Congress boundaries (current through January 2, 2027) and 120th Congress boundaries (from January 3, 2027). Profiles include the union of intersecting incorporated places and Census-designated places under both maps, plus county profiles for unincorporated areas. Choosing a boundary set filters the directory. A place's intersecting district is not an address-level determination of representation. The House address lookup is linked throughout.

- 256 city/community profiles and 12 county profiles across current and incoming boundaries.
- 229 city/community profiles intersect the current four districts.
- 63 incorporated cities across the union of both boundary sets.
- Full usable latest-year housing-report rows for the covered reporting jurisdictions, not a limited per-city sample. Housing applications and milestones are separate rows, with unique IDs. They must not be added together as unique homes.
- Census ACS 2024 five-year estimates and margins of error, covering whole places/counties. North Ventura Avenue and Nyeland Acres do not have records in these 2024 place tables. Missing estimates are shown as unavailable.
- County views combine county-reported unincorporated records and the covered cities. Some counties have cities outside the four districts that are not imported. County-wide Census estimates are distinguished from these covered-jurisdiction permit totals.
- Community records are located county-report rows inside the CDP polygon, with no invented community permit totals. County profiles cover communities without separate Census places.
- Official planning, project, meeting, board, housing and transportation links. Machine-readable live meeting schedules are used only for verified Legistar clients. Other localities receive their official agenda portal, not an invented recurring schedule.
- Public publisher headlines have dates, publication names and source links. An empty feed remains empty. County reporting appears separately.
- Wikimedia photographs retain their credit, license and description-page link. A county/regional fallback is explicitly captioned with the actual photographed city.
- Caltrans/regional transport project links can cover territory beyond the selected congressional districts, which is noted in the interface.

## Data refresh

All inputs are public. Data refresh is an explicit operation, not part of page load or server startup. Python 3 with Shapely is needed for geography and housing processing. The other importers use the Python standard library. The Census table-based summary files do not require an API key.

Run in order from the repository root:

1. `python3 scripts/cal/build-geography.py`
2. `python3 scripts/cal/build-resources.py`
3. `python3 scripts/cal/import-statistics.py`
4. `python3 scripts/cal/import-housing.py`
5. `python3 scripts/cal/import-news.py`
6. `python3 scripts/cal/import-photos.py` (or the batched metadata alternative `import-photos-batch.py`)
7. `python3 scripts/cal/build-boards.py`
8. `python3 scripts/cal/build-newsletter.py`
9. `node --test tests/cal-dashboard.test.js`

Use `--fresh` to bypass import caches. Intermediate public-source caches live in `/tmp/cal-civic-cache`. Preserve the archived files in `public/cal/data/editions/`. The newsletter builder does not overwrite an existing dated edition. Each edition preserves its source dates and does not invent historical monthly coverage.

## Data handling

HCD coordinates need a match score of at least 90 and must lie in or very near the reporting city/county. Unverified locations stay in the list but never receive a substituted city-center pin. District classification uses the less-simplified Census input boundaries, while the displayed outlines are simplified. The map reports unlocated and outside-district counts. Housing-record source links filter on reporting jurisdiction, year, parcel and address instead of HCD's changeable row number.

The initial catalog does not contain project rows, resource inventories or article bodies. Project requests return 18 records per page, filtered on the server. Individual locality profiles, map points, meeting feeds and newsletter editions load on demand. Server record caching is bounded. The Cal AI endpoint supplies only the selected locality's known sources and records, rejects unknown localities, limits question length and rate, and retains the question when the provider fails.

The future map offers an arithmetic permit-rate scenario with user-selected years and multiplier, not a calibrated forecast. Housing policy links provide context and do not assign a causal effect or establish parcel eligibility. FEMA flood zones and California Energy Commission power plants are official external layers that can be enabled on demand. No household-energy, price or flood-damage values are fabricated.

## Locality feature parity and land-use records

`public/cal/data/coverage-audit.json` records the same evidence checklist for all 268 profiles. Rebuild with `node scripts/cal/audit-coverage.mjs`. The audit fails if an incorporated city lacks imported housing or environmental filings, and reports the remaining source gaps individually. A directory, connected service and imported record set are distinct states. The dashboard shows the same checklist in Coverage & sources and Resources.

`python3 scripts/cal/build-land-use.py` follows the responsible agency's published links for zoning, general plans, municipal codes, capital improvements, development files, contacts and housing policy. `land-use-seeds.json` contains manually verified official entry pages and services for sources missed by generic homepage discovery. A city cannot inherit a county zoning layer. Airport, inspection, hazard and historical zones are excluded. Third-party ArcGIS services require the GIS account associated with a city-labelled app linked by the city. Only a successful metadata and sample attribute query establishes a connected polygon layer. `--fresh` revisits successful cached pages. Failed responses remain retryable. Source checks and retrieval dates are retained.

Zoning outlines load only for the visible neighborhood area, using a fixed verified service registry, a maximum 1,000-feature response, bounded California coordinates, request limits and short server caches. Transfer limits, unavailable services and unconnected jurisdictions are disclosed. Users can switch among the authority's available land-use/zoning layers. The outlines and HCD geocodes do not establish a surveyed parcel or legal development entitlement.

`python3 scripts/cal/import-environmental.py` downloads CEQAnet's complete available county CSV exports over the preceding 12 months. The initial import has 8,338 distinct filings across 12 counties, with local matches for every covered incorporated city. Source descriptions, document types, SCH numbers, dates, parcel references, local actions and review windows are retained. Contact names, emails, phone numbers and mailing addresses are not imported. The public Cities field or an exact local lead-agency name determines locality attribution. Contact City is never used for project location. County-wide records appear only under the explicitly selected county scope. Multiple filings can describe one project. Transportation filings are selected by the published agency or transport-related title and retain their environmental-document label.

Run land-use discovery, then `python3 scripts/cal/build-boards.py`, environmental import, and the coverage audit when refreshing source coverage. The browser loads 12 environmental filings or 18 housing records per page. Maps and full record descriptions are separate requests. Broad source lists are grouped behind expandable category headings.

News & updates also lists a small, separately labelled selection of dated official environmental filings for the selected locality. This provides a path to a local public record when a newspaper feed is quiet without presenting an agency filing as independent reporting. Full documents remain in the paginated Developments register.

Guest saves remain on the device. Account saves use the existing star service with `cal:` item identifiers and an edition label. Creating an account carries existing guest filings and participation plans into account saves. Removing a synced account item deletes the server record before discarding its local copy, and failed removals remain retryable. The browser tests also cover out-of-order locality responses so a slow old request cannot replace the selected locality's context.
