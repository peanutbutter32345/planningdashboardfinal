# Coverage and connection verification — October 25, 2026

The update extends the existing dashboard with CA-21 and CA-27 alongside CA-19, CA-20, CA-24 and CA-26. Los Angeles city coverage is refreshed and San Diego city is included explicitly. It does not add every city in Los Angeles or San Diego County. District selection uses the union of the 119th and 120th Congress boundaries, with the two memberships retained separately.

## Data and UI

- 395 locality profiles across the original directory and expansion, including 171 incorporated cities. The expansion contributes 70 cities and 223 Census-designated communities. Nine cities and 30 communities are new in this update.
- 60,029 expansion source records, with original source links, dates and separately counted verified coordinates. These are records, not a count of unique active developments.
- Los Angeles: 27,010 records, 20,479 with verified coordinates. San Diego: 3,951 records, 3,155 with verified coordinates.
- Every incorporated city in the research dataset has housing rows and environmental filings. Statistics retain missing values and source periods. Some community profiles rely on county records or official lookups.
- Browser checks covered San Diego loading and filing details, Los Angeles complete records and map counts, and Palmdale statistics and board/resource links. The existing site design and tabs remain in use.
- CEQAnet notices display their filing type rather than a construction status. Machine-coded titles use a readable source excerpt and retain the official title in details. Clicking or keyboard-activating a feed card opens the full record even if it lacks coordinates.
- Returning browsers revalidate the coverage manifest and city files. Large overview maps use canvas/optimized markers and defer popup markup until it is needed.

## Verification

`npm test`: **286 tests passed, zero failed**. Tests cover API validation, registration/session behavior, email scheduling safeguards, coverage consistency, missing/partial loads, coincident map points, new geography, and HTML base-link parsing. Production registration and email mutations were not invoked.

`public/cal/data/connection-audit.json`: **1,223 unique URLs**, **1,206 reachable**, **17 restricted**, no remaining failed or timed-out connections in the final pass. Scope: resources for the ten added/enriched cities, all expansion news links, named boards, agenda directories and connected zoning layers, every configured Legistar client, and three production API routes. It is not an exhaustive test of every historical Bay Area source URL. HTTP success does not establish document freshness or completeness.

- All 17 configured Legistar clients returned valid JSON arrays.
- All 13 distinct connected zoning services returned sample features.
- Ten HCD endpoint samples returned housing records.
- 531 news and official-update URLs responded.
- Production `/api/health`, `/api/sources?city=losangeles`, `/api/hearings`, `/api/ask` and `/api/meetings/summary` returned 200. Health reported database and guest-registration readiness. Los Angeles's meeting summary identified `websearch` as its source, not an official agenda feed.
- Local San Diego API checks: 3,155 map points, 53 official sources, a clearly labelled meeting directory, and ten zoning polygons from a small downtown bounding box. All returned 200.

## Limits

The 17 restricted URLs include Fowler, Buellton, some municipal-code hosts, and some city/county agenda pages. They returned HTTP access restrictions to automated checks and retain official directory links. They have not been certified reachable in every browser.

Most covered jurisdictions do not have a connected live agenda feed. The dashboard labels these as directories and does not invent dates, vacancies, attendance information, or live streams. Some places lack verified zoning polygons or specialized project/plan/capital-improvement sources. `public/cal/data/coverage-audit.json` exposes those locality-level gaps.

The existing Google Maps key rejects localhost:4017 with `RefererNotAllowedMapError`. The local preview's existing map fallback was tested. This check does not establish production Google Maps key eligibility, and no key restrictions were changed.
