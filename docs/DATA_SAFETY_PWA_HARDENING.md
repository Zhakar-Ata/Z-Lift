# Z Lift — External Backup + PWA Hardening Audit

Date: 2026-08-24

## Scope

Incremental production hardening only. This update did **not** rebuild the app, redesign UI, change the 1:1 Project → Elevator model, split `measurement-engine.js`, add cloud sync, or add multi-user/server authentication.

## Architecture inspected

- Local data API: `js/database/api-local.js`
- Structured persistence and local snapshots: `js/database/structured-db.js`
- Photo payload storage: `js/database/photo-store.js`
- External/local backup UI and validation: `js/database/backup.js`
- PWA lifecycle/cache: `sw.js`, `manifest.json`, `index.html`, `js/pwa.js`
- Version constants: `js/core/app-core.js`, `package.json`, `sw.js`, README
- Regression suite: `qa/smoke.js`

## External JSON backup

The backup export path is explicit and does not serialize arbitrary browser keys. Exported user-owned categories are:

- projects (current Project → Elevator 1:1 model)
- archivedProjects
- services / service history
- measurements
- diagnostics (`diagSessions`)
- checklists
- invoices and invoice items/payments
- inventory (`parts`) and part history
- notes
- issues
- tools
- reminders
- contracts
- photos, hydrated from IndexedDB into the JSON when needed
- calculator saves (`calcSaves`)
- safety logs
- safe settings only: company, phone, address, defaultTech, taxRate, invoiceSeq, autoBackup, notify

Authentication users, sessions, passwords and local auth secrets are **not** exported.

## Backup metadata and integrity

Backup format version: 8
Database schema version: 3
Application version: 29.1.1

Each generated JSON backup now includes:

- app name
- application version
- database schema version
- backup format version
- creation timestamp / exportedAt
- UI language
- backup ID
- storage mode metadata
- relationship policy metadata
- record counts, including derived elevator count and invoice-item count
- stable JSON checksum (`fnv1a32-stable-json`)

The export button validates the backup before download. If validation fails, no misleading success backup is generated.

## Restore safety flow

Restore flow is now:

1. Select JSON file
2. Read file
3. Parse JSON
4. Validate format, version, schema and checksum when present
5. Validate data categories and relationships
6. Show restore preview without modifying data
7. Ask for confirmation
8. Create a pre-restore local safety backup of current data
9. Restore through the staged local API path
10. Verify restored counts for key categories
11. Report success or attempt rollback from the safety backup

Unsupported newer backups and corrupted backups are rejected safely. Unknown top-level fields are rejected instead of being silently discarded.

## Data integrity checks

Validation checks include:

- required backup/application/version metadata
- collection structure and record object shape
- unique non-empty IDs per collection
- invalid dates/timestamps
- project relationships for services, invoices, contracts, checklists, measurements, reminders, photos, diagnostic sessions and issues
- service references from invoices and measurements
- photo references from measurements
- part references from invoices
- duplicate invoice numbers
- invoice item/payment numeric validity
- measurement type/value/status validity
- portable photo payload validation
- prototype-pollution keys
- checksum mismatch

Orphan or invalid data is reported/rejected; the validator does not delete user records.

## PWA/offline hardening

- Cache version bumped to `zlift-pwa-v35`.
- `APP_VERSION`, `CACHE_VERSION`, service-worker cache name, package version and backup format references were made consistent.
- Service worker still precaches a complete atomic CORE list; install fails instead of activating a partial shell.
- Same-origin static assets now use network-first with cached fallback to reduce old HTML/new JS and new HTML/old JS mismatch risk after deploy.
- External CDN/font resources are no longer cached by the service worker.
- CORE precache coverage is tested against all local scripts/styles/manifest/icons referenced from `index.html`.

## Automated/static verification

Executed with `npm test`:

- 264 passed
- 0 failed

Coverage includes auth, projects, services/elevators through current 1:1 project model, diagnostics, measurements, checklists, calculators, Alpha Angle, invoices, inventory, notes, issues, backup validation, restore verification, Persian RTL strings, English strings, theme checks, local storage fallback, PWA cache/version checks and the new backup/restore round-trip dataset.

## Manual real-device verification required

Real Android PWA lifecycle testing was **not executed** in this environment. Use `docs/REAL_DEVICE_PWA_TEST_PLAN.md` before claiming real-device install/update/offline behavior has passed.

## Known limitations

- Project/Elevator remains intentionally 1:1. Multi-elevator project modeling remains a Phase 2 architectural task.
- Local authentication is intended for device-local application access and is not a server-grade multi-user security boundary.
- `measurement-engine.js` remains unchanged in this task. Future refactor: split responsibilities only under a separate controlled task.
- Local snapshots are not a phone-loss/browser-data-deletion backup. Technicians must export the JSON and store it outside the device/browser.
- Real-device PWA lifecycle verification remains manual until executed on actual target devices.
