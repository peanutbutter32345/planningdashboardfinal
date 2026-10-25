# Five largest missing cities: coverage verification

Verified October 25, 2026. This expands the existing BayDashboard at `/`, preserving its layout, topic tabs and accounts. No separate site is introduced.

## Selection and geography

The [California Department of Finance January 2026 population ranking](https://dof.ca.gov/media/docs/forecasting/Demographics/estimates-e1/RankCities_2026.xlsx) identifies the five largest cities absent from the merged PR 83 directory. Existing cities are retained.

| City | California rank | January 2026 population | Imported records |
| --- | ---: | ---: | ---: |
| Sacramento | 6 | 539,765 | 2,405 |
| Long Beach | 7 | 462,193 | 1,542 |
| Anaheim | 10 | 340,433 | 869 |
| Stockton | 11 | 322,436 | 530 |
| Riverside | 12 | 321,884 | 937 |

Nearby places use Census boundaries touching or nearly touching the anchor (0.002-degree tolerance), plus the three nearest incorporated-city representative points within 40 km. Selected places can overlap between regions. Already-covered Los Angeles is retained, not counted as new. This does not claim whole-county coverage.

- **Sacramento:** West Sacramento, Elk Grove, Freeport, Fruitridge Pocket, Lemon Hill, La Riviera, Parkway, McClellan Park, Rosemont, Florin, North Highlands, Rio Linda, Arden-Arcade, Rancho Cordova.
- **Long Beach:** Hawaiian Gardens, Signal Hill, Los Alamitos, Paramount, Bellflower, Cypress, Compton, Lakewood, Seal Beach, Carson, Los Angeles, East Rancho Dominguez, Rossmoor.
- **Anaheim:** Stanton, Cypress, Placentia, Buena Park, Fullerton, Garden Grove, Yorba Linda, Orange.
- **Stockton:** Taft Mosswood, Lincoln Village, August, Kennedy, Country Club, Garden Acres, French Camp, Morada, Lathrop, Lodi, Manteca.
- **Riverside:** Colton, Norco, Jurupa Valley, Corona, Moreno Valley, Home Gardens, Highgrove, El Sobrante, Woodcrest, March ARB, Grand Terrace.

The resulting addition is 60 places: 34 incorporated cities and 26 Census-designated communities. The frontend contains 455 profiles: 205 incorporated cities/towns, 249 Census-designated communities and West San Jose. The source research directory contains 355 places plus 19 responsible county profiles. Communities use their county government and geographically filtered county records. No congressional-district membership is invented for places outside the original six districts.

## Records and sources

The 60 new places add 18,948 sourced records, bringing expansion records to 78,977 and the combined frontend index to 81,841. These are source records, not unique active construction projects. HCD application and milestone rows can refer to the same development, and CEQAnet can contain multiple filings for one proposal.

Every new incorporated city has imported HCD rows and environmental filings. HCD reports use 2024/2025 where published. Compton has 110 explicitly dated 2023 records because neither newer year returned rows. CEQAnet filings cover the preceding 12 months, retain document types and source links, and do not infer an active review or construction status. Only verified coordinates become map points. Unlocated records stay in the list.

ACS statistics are available for 372 of 374 research profiles. Two previously covered small communities have no usable estimates and remain unavailable. Population ranks use DOF January 2026 estimates while displayed socioeconomic statistics use ACS 2020–2024 estimates. Housing totals retain their annual reporting year. They are not mixed with Zillow indexes. Publisher headlines and official filing updates remain labelled separately. Historical Bay Area newsletter issues retain their original scope.

Official resources include planning, housing, boards, meeting agendas, transportation, zoning and municipal records where available. All five anchor cities have verified zoning polygon services. Source agency pages and GIS app metadata establish the provenance of those layers. Long Beach's historical 1989 general-plan layer is excluded from current zoning. Stockton's zoning comes from the city's About Your Address GIS application and GeoHub FeatureServer layer 7.

New current Legistar feeds are Sacramento, Stockton, Riverside, Signal Hill and Orange, giving 22 configured clients overall. Long Beach's queried legacy feed ended in 2023, so its current official meeting portal is used instead of presenting that archive as live. A directory link does not imply imported events. The coverage audit identifies imported data, live services, directories, lookup links and missing categories individually.

## Validation

- `npm test`: 291 passed, zero failures, skips or cancellations.
- `git diff --check`: clean.
- Coverage adapter, complete-record statistics, source index and coverage audit regenerated successfully.
- Browser checked all five city selections, record counts and ACS statistics in the existing dashboard. Final Stockton preview displays 530 records and 2025 totals of 716 permitted, 177 completed and 423 entitled homes, with source labels.
- Added regressions for all new locality contracts, preserved original city keys, named planning commissions, Compton's older reporting year, and map inclusion of explicit cities and county-reported community points.
- External audit: 1,997 URLs checked, 1,929 reachable, 57 access-restricted, 11 unavailable, zero confirmed HTTP failures. All 22 meeting feeds, 35 sampled HCD queries and 18 distinct zoning queries returned valid payloads. 773 of 774 news/source-update URLs responded, with one restricted.
- Production health, source and hearing GET endpoints responded. No production registrations, emails or scheduler mutations were performed. The local preview uses an isolated in-memory database with no AI or email credentials.

## Limits

The 11 unresolved URLs include Lathrop, West Sacramento's agenda portal, Corona's property viewer and several existing board/public-notice pages. The machine-readable connection audit records every URL and timestamp. Access restrictions and timeouts must not be described as confirmed working links. Successful HTTP checks do not validate every page's content or freshness.

Some communities have no exact local filings or publisher headlines, so official lookup links remain available without invented data. Coverage of dedicated capital-project and general-plan inventories varies by agency. Images identify regional context where no city-specific photograph is available. Locally, the existing Google Maps key rejects the localhost referrer, while the Leaflet fallback renders. Production key restrictions were not changed.

Complete records load on locality selection using the existing on-demand loader. The initial directory includes small previews and precomputed full totals, preventing rankings from being calculated from the preview rows. Existing account, guest-registration and admin-only advisor behavior is unchanged.
