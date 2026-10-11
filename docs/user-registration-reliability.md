# Profile registration and recovery

A guest gets a generated name and a persistent browser ID as soon as the page initializes. Registration starts before rendering maps or completing onboarding. The normal setup and Explore buttons both send updated profile metadata. Guests' saved projects, timeline, reminders, and chat history remain in their browser.

The server identifies guests by `guest_id`, not by their display name or IP address. Duplicate requests and returning browsers reuse the same row. When a guest adds a password, the account and session writes happen in one transaction and retain the guest ID. Repeating a signup after a lost response requires the same username and password. A late guest request cannot rename an upgraded account or overwrite its home city.

## Failed requests

The browser acknowledges only the metadata snapshot the server accepted. If the name or city changes during a request, the next request sends that change. Requests have a 15-second timeout, retry transient failures with backoff, and respect the server's Retry-After header. Page focus, restored connectivity, and a return visit trigger another check. Permanent validation errors stay unsynced until corrected and do not loop indefinitely.

Cloudflare's visitor header is accepted only when the upstream address belongs to a published Cloudflare range. The existing limit of 30 new guest IDs per actual client address per hour remains, while returning IDs are exempt. Shared public networks can still reach that limit. A pending profile remains saved locally for another attempt.

## What can be recovered

A browser profile missed by the server can be registered on its next visit if that browser still has its guest ID. Existing server records can be located with the owner's name/email search and cursor pagination, including records beyond the former 500-row display limit.

Profiles that never reached the database and whose browser storage was cleared cannot be reconstructed from their names or IP addresses. Blocked storage permits registration for the current visit, but cannot retain the same guest identity after the page closes. Counts represent browser profiles and password accounts, not independently verified unique people. Cross-device identity requires logging into the same account. Do not merge profiles solely because they share an IP address.

## Verification

`npm test` includes:

- Both real onboarding handlers across all nine counties, with generated/chosen names and city/county-only views (72 combinations).
- First arrival, recovery on return, reloads, blocked storage, and browsers without `crypto.randomUUID`.
- Offline requests, 408/429/500/503 responses, timeouts, lost responses, concurrent triggers, and name/city changes while a request is pending.
- Duplicate tabs and display names, Cloudflare IPv4/IPv6 handling, and actual shared-address limits.
- Guest/account request ordering, repeat signup authentication, injected transaction failures, rollback, and late guest updates.
- Complete cursor paging past 500 profiles, concurrent insertion, search, owner access controls, and count totals checked against stored rows.

The recovery HTTP tests use embedded PostgreSQL (PGlite) for real constraint, aggregate, and transaction behavior. It provides one serialized database connection and does not reproduce the production pool's multi-connection locking behavior. Browser checks use an isolated local dashboard with disposable data. No synthetic users are added to production during testing.

After deployment, verify `/api/health` reports both `databaseReady` and `guestRegistrationReady`, then use a separate browser's normal setup and Explore paths and refresh the owner's counts/list. Confirm that reloading each browser keeps one profile. Historical Cloudflare addresses are left unchanged because the original visitor address was not recorded.
