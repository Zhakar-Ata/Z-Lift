# Z Lift post-refactor audit and Phase 1 hardening

Audit date: 2026-08-24

Release: **29.1.0** · IndexedDB schema **3** · backup format **7** · PWA cache **zlift-pwa-v34**

## Scope and method

The current modular application was audited in place. It was not rebuilt and no UI framework, database migration, formula change, standards-content change, or major feature was introduced.

Reviewed surfaces:

- `index.html`, all first-party JavaScript and `css/app.css`
- script order, global dependencies, routes and DOM handlers
- local API, IndexedDB aggregate store, photo store, localStorage fallback
- backup/export/restore validation and rollback paths
- measurements, safety checklist gate, invoices and inventory effects
- service worker core cache, manifest, version identifiers
- Persian/English, RTL/LTR, dark/light and print rules through the smoke suite
- vendored QR code implementation (identified, not modified)

Checks used:

- JavaScript syntax checks for every module
- complete jsdom + fake-indexeddb smoke suite
- static comparison of script files and service-worker core assets
- manual code-path review for atomic writes, relationship handling and async failures

## Architecture and dependency map

The app intentionally uses ordered classic scripts and a shared global namespace; it does not use ES-module imports.

1. **Data constants** — translations, checklists, diagnostics, knowledge, calculators, measurement definitions and VVVF data.
2. **Core** — Jalali utilities and `app-core.js` state/UI/error helpers.
3. **Persistence** — `structured-db.js`, `photo-store.js`, seed/fallback layer, local API.
4. **Components/auth/router** — date picker, QR vendor adapter, local authentication and hash routing.
5. **Feature modules** — dashboard, projects/elevator profiles, services, inventory, checklists, calculations, diagnostics, notes, issues, settings and related screens.
6. **Engineering/reporting** — measurement/invoice/photo engineering workflows, monthly reports and sharing.
7. **Bootstrap/PWA** — `app.js` initializes the application; `pwa.js` registers and updates the service worker.

The load order in `index.html` satisfies these dependencies. No broken script reference, undefined inline event handler, circular module loader dependency, or missing service-worker core file was found. Shared globals remain a coupling risk, but another broad refactor was not justified for Phase 1.

## Proven findings and fixes

### Fixed

1. **Structured measurement context was incomplete.** The record had project/point/value/range/status but the technician form did not separately capture service, location, mode, observation, unit, or a related photo. These optional fields are now stored without changing the schema; units come from the field catalogue rather than user input.
2. **Invoice number uniqueness was not enforced at the data boundary.** Explicit/import-adjacent duplicate numbers could be created, and an auto sequence could collide with existing records when sequence metadata was stale. Creation now checks existing numbers and skips occupied sequence values.
3. **Invoice numeric validation normalized invalid values silently.** Negative/non-finite quantities, prices, payments, dates and tax rates are now rejected before any inventory mutation.
4. **Backup domain validation was too structural.** Malformed version/schema values, duplicate invoice numbers, corrupt invoice numerics and invalid measurement values/statuses could pass import preview. They are now rejected before restore.
5. **Safety audit log used stale app version `27`.** It now records `APP_VERSION`. A failed log write is reported to the console and technician rather than silently ignored; acknowledgement alone is not represented as a persisted log.
6. **Service-worker install tolerated missing required modules.** That could activate an incomplete offline shell. Core precaching now uses one atomic `addAll(CORE)` operation, preserving the previous complete worker if any required asset is unavailable.
7. **Documentation/version drift.** README described the modular app as single-file and reported cache v32 while runtime used v33. Documentation and all release identifiers are aligned for 29.1.0/cache v34.

### Confirmed existing safeguards

- Measurement rules default to `UNKNOWN` without an applicable configured or verified range.
- Configured ranges produce evidence-based status/reason/next-action output; no automatic replacement instruction is generated.
- The safety-critical EN 81 audit checklist requires explicit acknowledgement and does not claim equipment is safe.
- Invoice create/edit/delete and linked stock deltas are committed as one logical mutation with rollback and retry keys.
- Restore validates and previews before confirmation, records a pre-restore safety backup, stages a complete candidate, commits atomically in IndexedDB, verifies content/counts/relationships, and attempts rollback on failure.
- Legacy localStorage data is retained as migration evidence; IndexedDB migration is detect → validate → copy → verify → mark-complete.
- Photo payloads are exported self-contained and remain inline if photo-store offload fails.
- Standards and manufacturer-dependent values remain explicitly unverified/model-dependent where source evidence is absent.

## Storage authority map

| Data type | Primary storage | Fallback / secondary | Backup method |
| --- | --- | --- | --- |
| Projects/elevator profiles, services, measurements, diagnostics, checklists, invoices, contracts, inventory, notes, issues, reminders, calculations, tools, safety logs, users/settings | IndexedDB `zlift-data`, schema 3 | `localStorage.zlift_db` only when IndexedDB is unavailable/failed; legacy copy is not an active second source after migration | Self-contained JSON format 7; rotating snapshots in IndexedDB `backups` |
| Photo metadata | IndexedDB `zlift-data` aggregate | Same localStorage fallback as structured records | JSON export with hydrated payload |
| Photo binary payload | IndexedDB `zlift-photos` | Inline `data` in structured record | Hydrated into JSON before validation/export |
| Login token, language, theme, analytics period, backup timestamps/snooze and migration status | localStorage | Browser defaults / no durable fallback | Token and UI preferences are device-local and intentionally not restored as domain data |
| Safety acknowledgement for current checklist session | sessionStorage | None | Durable acknowledgement event is separately written to `safetyLogs` |
| Static application shell | Cache Storage `zlift-pwa-v34` | Network; prior complete service worker remains if install fails | Release deployment, not user backup |

There is one authoritative structured-data source per browser mode. The REST-shaped `api()` seam always delegates to the local persistence layer; no application-data network API exists.

## Version policy

| Identifier | Value | Reason |
| --- | --- | --- |
| App/package | 29.1.0 | Phase 1 hardening and additive measurement fields |
| DB schema | 3 | Unchanged; new fields are optional record properties and need no store migration |
| Backup format | 7 | Unchanged; format remains backward-compatible and validation was hardened |
| PWA cache | zlift-pwa-v34 | Bumped because runtime JS and documentation changed |
| Build date | 2026-08-24 | Current hardening build |

## Regression result

Automated suite: **257 passed, 0 failed**.

Passed areas include authentication/session persistence; all routes; projects/elevator profiles; services; diagnostics and evidence trail; structured measurements and conservative status logic; safety gate/log; all 26 calculators including Alpha Angle constraints; invoices, VAT configuration, payments, printing and atomic inventory effects; inventory; backup export/import/restore rollback; photos; Persian/English; RTL/LTR; dark/light/print CSS; IndexedDB migration and localStorage fallback; PWA version/core-cache checks.

All JavaScript files also pass `node --check`.

## Known limitations / blocked checks

- A real-device install prompt, OS standalone launch, browser DevTools offline reload, and live service-worker update lifecycle require a real secure browser/device and are not simulated by jsdom. The complete precache list and update/version logic are covered statically; these real-browser checks remain release-gate manual tests.
- The current domain deliberately models one project as one elevator profile (1:1). This was preserved.
- Authentication is local/offline and is not a server-grade multi-user security boundary.
- Local snapshots cannot protect against phone loss, browser data deletion or device failure; technicians must keep external JSON exports.
- `measurement-engine.js` still contains measurement panel, photos, invoices, contracts and search workflows. Existing global dependencies make extraction risky; no broad architecture rewrite was performed in this hardening phase.
- Vendor `js/components/qrcode.js` remains unmodified.
