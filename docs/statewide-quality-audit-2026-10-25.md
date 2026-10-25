# Shared city reliability audit — October 25, 2026

The logo update was merged in PR #88. This follow-up keeps the existing layout and fixes shared loading, map and search behavior across the covered communities.

## Reproduced issues fixed

- Project-register requests could stall indefinitely. They now time out after 15 seconds, reject incomplete or duplicate-ID responses, preserve previews on failure and allow retries.
- Failed zoning requests could become permanent empty results. Directory failures remain retryable, ArcGIS error payloads are distinguished from valid empty results, and late responses cannot overwrite a different project's details.
- Project-map animation timers could affect the next record. Opening or closing a sheet cancels its timers and disposes of the old map.
- Large Overview maps blocked interactions while drawing. Drawing now yields every 250 locations, cancels superseded builds and waits while Overview is hidden. It retains all mapped locations. Topic maps use canvas rendering.
- County views could repeat their own projects in the additional-record section. Padding now excludes visible IDs and prioritizes the selected county.
- Unlocated records had ineffective map buttons. They now state that their location is unverified.
- Late photo responses could restore the previous city's image. Photo updates reject stale responses and follow the city or county selection.
- Resource Bank kept its initial index after additional registers loaded. It now invalidates that index, loads a selected city's register and provides an explicit option to load all project records.
- Shared copy still described statewide coverage as Bay Area-only, repeated project notes and made unsupported claims about accuracy or missing city data. These passages now describe the actual source and coverage limits.
- Updated body-parser to 2.4.0 and qs to 6.16.1 in the lockfile to resolve the reported high-severity request-parser advisory.

## Verification

- `npm test`: **320 passed, 0 failed**. Includes registration and account tests plus regression cases for the fixes above.
- `npm audit --omit=dev`: **0 vulnerabilities** reported.
- `npm run check:copy`: no strong-pattern matches. This is a narrow prose check, not a guarantee about writing quality.
- `node scripts/check-area-data.mjs --base=http://127.0.0.1:4017 --live-zoning`: **455 source-directory responses, 353 register files, 353 place profiles and 21 distinct zoning services passed**.
- Browser checks covered Housing, Transportation and Statistics for Los Angeles, San Diego, Sacramento and Riverside, plus selected news and participation views for Cupertino, Santa Barbara, San Luis Obispo and Centerville.
- San Luis Obispo project details returned zoning district BP-SP from the connected service. Selecting that city in Resource Bank loaded its register and refreshed the index, yielding 486 local matches.
- Production read-only checks returned HTTP 200 for the homepage, health endpoint and hearings endpoint. The hearings response contained 86 meetings and no reported feed errors. No production accounts or email settings were changed during testing.

## Limits

The endpoint audit checks response shape, expected register counts and usable zoning responses. It does not certify that every external link remains valid, that all agency records are current, or that every locality has a complete inventory. The 21 connected zoning services are not statewide parcel coverage. Existing directory-only coverage and missing-coordinate records remain explicitly labeled.

Local Google Maps requests reported a referrer restriction; the existing Leaflet fallback worked. These changes have been tested locally. Deployment must be checked separately after release.
