# CA-24 coverage and loading audit

Checked October 25, 2026. This changes the existing dashboard at `/`, preserving its layout and account system. No separate California interface was added.

## Scope and corrections

The current CA-24 directory contains 55 localities: 16 incorporated cities and 39 Census-designated communities. All 5,543 imported records load through the existing city loader, including simultaneous requests for the same locality. These are source records, not 5,543 distinct construction projects.

- Environmental records now appear under housing, transportation, commercial/industrial development or public/environmental projects according to the source category and title. Their filing status remains separate from construction status.
- The CEQAnet importer now preserves published coordinates. Parsing and locality-polygon checks recovered 83 CA-24 map points, including 15 transportation records. Missing or out-of-bound coordinates remain unlocated, and topic maps state that count.
- News imports search both civic and transportation subjects, strip publisher names before locality matching, exclude city/county name confusion, and reject social reposts and isolated incident stories. The selected localities have 244 distinct reporting, official-filing or source-update URLs. County fallback reports are explicitly labelled and do not claim to concern the selected community.
- Replaced county planning shortcuts with city departments where available. Zoning discovery also rejects county-government links when finding incorporated-city zoning. Shared source pages retain each applicable resource category instead of losing their zoning classification during deduplication.
- Added verified Oxnard and Ventura zoning services and city planning, zoning, capital-project and transportation sources. Removed four confirmed dead links from source discovery.
- Added an on-demand zoning checkbox to the existing topic maps. Requests cover the visible area, zoom to the API's permitted extent, abort superseded requests, and report service errors or truncation. Changing city clears the old overlay.
- Get Involved defaults to the selected city's boards. Board and calendar filters respect city/county scope, and missing imported schedules link to official calendars without implying that no meetings exist.
- Added a small California outline beside the title using a simplified Census mainland boundary. This is a decorative SVG, not a survey map. Updated remaining scenario-map area labels.

The shared import fixes also regenerate affected records outside CA-24. Geographic coverage and the overall count of 78,977 imported expansion records are unchanged.

## Verification

- `npm test`: **300 passed, 0 failed**. Includes all 55 complete city loads, concurrent-load deduplication, detail endpoints, first/last pagination, maps, source classifications, coordinate validation, zoning cancellation, jurisdiction filters and existing account tests.
- `git diff --check`: clean.
- Real local API requests to all **22 connected CA-24 locality zoning endpoints** returned valid polygon collections. Empty collections in a small sampled area are valid. Responses capped at 1,000 polygons tell users to zoom in.
- `node scripts/cal/check-connections.mjs --district=24 --retry`: **833 distinct URLs**, with **803 reachable, 29 access-restricted, 1 unavailable, 0 confirmed HTTP failures**. Individual timestamps and results are recorded in `public/cal/data/ca24-connection-audit.json`. Reachability is not a guarantee of current or complete content.
- Production read-only health, Santa Barbara source lookup and hearings endpoints responded successfully. Goleta's Legistar endpoint returned a current event.
- Browser checks covered city switching, Santa Barbara overview pins, housing/development/transportation tabs, topic news, statistics, boards, live hearings, and zoning in Santa Barbara, Oxnard and Ventura. Goleta's live panel returned the October 26 Planning Commission and October 27 Design Review Board meetings with official agenda links.
- Local preview uses an isolated database. Google Maps rejects the localhost referrer, so the existing Leaflet fallback was exercised successfully. No production accounts, emails or registrations were altered by this audit.

## Remaining source limitations

Connected zoning covers 22 localities, including county services for unincorporated areas. Other places retain official zoning maps/code links. Santa Barbara County's polygon service requires a token, San Luis Obispo's GIS restricts access, and the discovered Solvang ArcGIS app has a disabled subscription. Those services are not advertised as working live overlays.

Only Goleta has a configured live Legistar feed among these CA-24 places. Other cities and communities have official agenda/board directories. No meeting dates are invented from those directories. The older Pismo Beach Laserfiche archive remains unavailable during this check, while its main agenda directory is available.

Eight communities have no exactly assigned imported project records: California Polytechnic State University, Casmalia, Cuyama, Garey, New Cuyama, Sisquoc, University of California-Santa Barbara and Vandenberg AFB. They retain responsible-county resources and labelled regional coverage. A zero imported count does not mean no local activity.

HCD rows are dated annual milestones, CEQAnet entries are environmental filings, Census figures are survey estimates, and news is a dated snapshot. These sources do not establish current construction status. Existing historical newsletters keep their original scope. LLM responses, email delivery and paid geocoding were not production-tested in this audit.

## Refresh

Use `scripts/cal/README.md` for the import pipeline. CA-24 news and board refreshes support `--district=24`. After imports, run the integration, facts, project sync and coverage audit scripts, then tests. Coordinate parsing and polygon screening use standard Python and retain the original CEQAnet source URL.
