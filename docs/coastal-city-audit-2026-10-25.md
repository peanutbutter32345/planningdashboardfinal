# Santa Barbara and San Luis Obispo audit

This follow-up updates the existing dashboard and supersedes the meeting and San Luis Obispo zoning limitations in the earlier CA-24 audit. Geographic coverage and the 78,977 imported expansion records are unchanged.

## Corrections

- Santa Barbara's public calendar now supplies dated upcoming meetings. The board importer follows the directory's pagination, removes duplicate City Council entries, and retains 43 named bodies. Applications, Council agendas, Planning Commission records and the calendar have separate official links.
- San Luis Obispo now uses the actual advisory-body directory instead of pointing every board link at the Planning Commission. Its directory contains 18 named bodies, with application, vacancy and public-comment links. Added SLO Transit and regional transit rider information.
- The San Luis Obispo eScribe calendar supplies upcoming dates, including meetings without published agendas. Cancellation notices attached to otherwise unchanged meeting titles exclude those entries. Dates and times stay in the city's local calendar time.
- San Luis Obispo's official city zoning layer is connected using `specificZone`. Both focus cities draw their boundaries on topic maps. Multipart boundaries retain detached pieces, including Santa Barbara's airport area.
- The homepage loads the live calendar without requiring a prior visit to Get Involved. A different filter or starred-only selection in Get Involved cannot hide the homepage's meetings.
- Switching cities cancels pending summary requests and clears stale results. The summary page starts with useful official links and accurately distinguishes connected agenda summaries from optional news search.
- Long filing badges and card footers wrap. Map popups decode imported entities once before escaping them. Local section photographs follow the selected city with matching credits.
- Resource labels lose duplicated navigation text. Coded amendment titles use the published project title where available. Vacation-rental reports count as housing, pathways as transportation, and isolated fire incidents no longer fill transportation news.
- Multi-jurisdiction environmental filings remain in the register with explicit scope labels. They no longer supply city-specific featured filing news. Annual housing milestones are not advertised as a current active pipeline.
- Masthead says “California communities” and uses a multicolor map pin over the California outline.

## Verification

- Full suite: **309 passed, 0 failed**. Final targeted run after source/copy refinements: **21 passed, 0 failed**.
- Copy lint: no strong-pattern matches. `git diff --check`: clean.
- Live local API: Santa Barbara returned 28 published upcoming meetings, San Luis Obispo returned 2. The cancelled October 28 SLO Planning Commission entry was excluded. The calendar pages may publish fewer dates than the API's 45-day horizon.
- Local zoning API: SLO returned 694 polygons in a downtown test extent, Santa Barbara returned 40. Browser testing also exercised the 1,000-polygon limit and its zoom-in message.
- SLO resource/body link audit: all 21 distinct URLs tested returned HTTP 200 through the application runtime. Some city pages restrict other automated clients, so reachability can vary by client.
- Browser checks: both focus-city calendars, SLO housing and zoning, Santa Barbara transportation, meeting summary source state, Cupertino housing and Los Angeles development cards. No browser errors were recorded in the final shared-layout check. Localhost uses the existing Leaflet fallback because Google Maps does not authorize the local referrer.
- SLO has 416 source records, 256 with verified coordinates. Santa Barbara has 496, with 445 mapped. Unlocated records remain accessible and are counted separately. Source records are not distinct construction projects.

## Limits

Automatic official-minutes summaries are still not connected for these two cities. The new calendar adapters import dates and source links, not agenda item text or vote outcomes. Optional news summaries depend on the server's search/model configuration and remain labelled as reporting.

The zoning service caps each response at 1,000 polygons and asks users to zoom in if truncated. Zoning codes are informational and link to the agency. HCD milestones, Census estimates, environmental filings and news each retain their own dates and limitations. CEQAnet's locality field can include nearby unincorporated areas, now explained on the records.

The local preview used an isolated database. No production accounts were modified. These changes require merging and deployment before they appear on the live site.

## Sources

- [Santa Barbara public meeting calendar](https://santabarbaraca.gov/government/boards-commissions/public-meeting-calendar)
- [Santa Barbara board directory](https://santabarbaraca.gov/government/boards-commissions)
- [San Luis Obispo eScribe calendar](https://pub-slocity.escribemeetings.com/)
- [San Luis Obispo advisory bodies](https://www.slocity.org/government/advisory-bodies)
- [San Luis Obispo zoning layer](https://mapsa.slocity.org/hosting/rest/services/sloGISlayers/slogisLandManagement/MapServer/5)

Refresh generated files in order: `python3 scripts/cal/integrate-bay-coverage.py`, `node scripts/cal/build-bay-coverage-facts.mjs`, then `node scripts/sync-projects.js`. The facts step is required after every integration run.
