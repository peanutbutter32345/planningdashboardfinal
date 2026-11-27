# Project participation and accessibility changes

## Records and coverage

Every stored project now uses a shared details panel with approval discretion, a documented timeline, participation instructions, deadlines, source checks, conflicting records and error reporting. Missing facts stay explicitly unknown. A source link alone does not certify every fact or make an inventory complete.

The November 27, 2026 Los Gatos SB 330 tracker was imported in full: 26 current and historical application rows, including 11 previously missing records. Expired alternatives remain separate and are excluded from housing-unit totals. Los Gatos Lodge now has 155 townhomes, 26 affordable homes, SummerHill Homes, the school adjacency, February 12 Planning Commission recommendation and March 4, 2025 Council approval. Staff reports, renderings and the March 4 video archive are linked. Current construction and permits are not verified. The city-discretion explanation is based on the staff report and does not describe SB 330 as ministerial approval.

Scofield shows both the January 2025 expiration letter and the city's undated “In Review” table with their distinct dates. Six CEQAnet notices represented by ten inventory records across nine cities have independently checked public-review end dates. Date-only deadlines do not invent cutoff times. Agency contact emails are distinguished from verified comment submission addresses.

## Maps and keyboard access

The default map uses self-hosted Leaflet and key-free basemap tiles. Optional Google Maps is loaded only when configured and falls back after failure. No Google Cloud credentials or domain restrictions were changed. To enable that optional provider, configure GOOGLE_MAPS_API_KEY and allow https://calcivicdashboard.com/* and https://www.calcivicdashboard.com/* in the Cloud console, with only required APIs enabled. Test both hosts in fresh private sessions after deployment. Tile providers still require network access.

Project markers are keyboard buttons with descriptive names, Enter/Space activation and Escape dismissal. The overview has a paginated text list drawn from the same filtered, located records. Unlocated records remain in the register. Modal focus is trapped and restored, results announce changes, and mobile styles preserve participation content. The automated audit does not substitute for VoiceOver on Mac/iPhone or NVDA on Windows. Those device checks remain pending.

## Alerts and corrections

Corrections are stored with project ID and note in an owner-only inbox. Public submissions are rate limited. Hearing alerts require an account email and a separate, explicit per-project opt-in. Monthly subscribers are not opted in automatically. Alerts require an exact project match in a live agenda feed and an agenda link, within eight days of the hearing. Cities with directory-only meeting links cannot subscribe until a feed is connected.

The server checks every six hours while awake. For reliable delivery on hosts that sleep, configure an external authenticated scheduler to POST /api/cron/hearing-alerts with x-cron-secret and {"dryRun":false}. No production scheduler was provisioned. Dry runs are the default. The delivery ledger and provider idempotency prevent normal repeat delivery. If the provider accepts a message but the sent-state update fails, the sending claim is retained for operator review instead of automatically resending it.

The Ask assistant uses server-held records, requires valid inline document references, rejects missing/invalid references and states uncertainty. It includes a legal-advice notice. Citations are a guardrail, not proof that a generated interpretation is correct.

## Validation

Run npm test for account, data, API and interaction regressions. Run node scripts/audit-accessibility.mjs against the isolated local preview to produce Lighthouse and axe reports. The script uses a fresh private browser context and tests setup, the map/list, Lodge participation, Scofield conflicts and 390px mobile participation. The public accessibility statement records the final measured results and remaining manual tests. Production accounts and outbound email were not used for testing.

Final automated audit: all five snapshots scored Lighthouse accessibility 100/100 with zero axe violations. The map snapshot includes its filter toolbar and matching list. Focusable controls have scroll margins to reduce sticky-header overlap. The tested states do not cover every scroll position, browser or assistive technology.

Validation: 360 tests passed. Production dependency audit reported zero vulnerabilities. Three inline scripts and the new modules parsed successfully. Optional live GIS popups escape upstream strings and accept only HTTP(S) source links.
