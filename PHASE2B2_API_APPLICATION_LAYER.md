# Z Lift — Phase 2B.2: Elevator-Aware API & Application Layer

**Date:** 2026-08-25

**Branch:** `arena/01a035dc-z-lift`

**Starting revision:** `8983e8e4764a707055798ee0b3a0ead3703185b7` (`main`)

**Scope:** application/API behavior on top of the Phase 2B.1 data model

---

## 1. Executive summary and scope boundary

Phase 2B.2 makes the local REST-shaped API and its existing application callers enforce the canonical elevator ownership pair:

```text
projectId + elevatorId
```

For every elevator-owned record, the API now validates all three relationships:

1. `projectId` identifies a live project;
2. `elevatorId` identifies a live elevator;
3. that elevator's `projectId` equals the requested record `projectId`.

The implementation covers create, scoped read, item read, update, delete, search, report projection, backup/restore, archive regression, project deletion, and links between related records. It never chooses the first/default elevator. A project-only compatibility call resolves only when the project has exactly one real elevator; zero or multiple elevators fail.

This phase deliberately adds **no** multi-elevator UI, picker, management screen, project/elevator creation UX, dashboard/navigation/QR change, or visual redesign. It does not redesign the database, repeat the Phase 2B.1 migration, increment backup format v8, or modify `js/engineering/measurement-engine.js`.

---

## 2. Baseline, repository audit, and source of truth

Before implementation, the checkout, local `main`, and `origin/main` all pointed to:

```text
8983e8e4764a707055798ee0b3a0ead3703185b7
```

Dependencies were installed with `npm ci`, then the unmodified baseline passed:

| Suite | Passed | Failed |
|---|---:|---:|
| `qa/smoke.js` | 290 | 0 |
| `qa/perf.js` | 20 | 0 |
| `qa/migration.js` | 30 | 0 |
| `qa/archive.js` | 28 | 0 |
| **Baseline total** | **368** | **0** |

The audit traced the authoritative paths rather than inferring ownership from field names:

- local API and mutation boundaries: `js/database/api-local.js`;
- persistence, repair, relationship verification, and atomic aggregate writes: `js/database/structured-db.js`;
- Phase 2B.1 migration and relationship helpers: `js/database/elevator-migration.js`;
- backup audit/export/restore: `js/database/backup.js`;
- checklist logical identity: `js/data/checklist-data.js`;
- all application mutation callers under `js/modules/`;
- diagnostics, reports, global search, invoices, photos, contracts, and calculations in the existing engineering module;
- project deletion/archive, nested parts history, service links, and attachment cleanup;
- all existing QA suites.

`js/app.js` was confirmed to be boot/auth/settings orchestration, not the authoritative local API implementation.

---

## 3. Canonical ownership matrix

The Phase 2B.1 ownership model remains authoritative.

| Ownership | Collections | Phase 2B.2 rule |
|---|---|---|
| **Elevator-owned** | `services`, `measurements`, `diagSessions`, `checklists`, `issues`, `safetyLogs` | Live ownership is always the validated `projectId + elevatorId` pair. |
| **Project-owned** | `invoices`, `contracts`, `reminders`, `photos`, `calcSaves`, `notes`, `tools` | They do not acquire elevator ownership. Any supplied `elevatorId` is validation context only where accepted, and is not persisted. |
| **Global** | `parts`, `users` | No live project/elevator owner on the parent record. |
| **Nested historical reference** | `parts.history[]` | Remains project-level. A linked `serviceId`, when the service still exists, must refer to a service in the same project. |

Important distinctions:

- An invoice can reference a service, but the invoice remains project-owned.
- A photo can be attached to a measurement, but the photo remains project-owned; the two must share `projectId`.
- `parts.history[]` does not gain `elevatorId`. Its service link preserves the service's exact elevator context without duplicating ownership into the inventory row.
- A detached historical elevator-owned record has both live IDs cleared together. `projectInfo` and `elevatorInfo` retain display/audit context.

---

## 4. Canonical context resolution and validation contract

All elevator-owned endpoints use centralized context helpers in `js/database/api-local.js`.

### Explicit context

A full pair is accepted only if it is canonical:

```text
project exists
AND elevator exists
AND elevator.projectId === project.id
```

An `elevatorId` without `projectId` is always rejected. An arbitrary conceptual elevator label is not accepted as ownership; it must identify an actual Phase 2B.1 elevator row.

### Missing elevator context

A project-only call is the temporary legacy wrapper:

```text
0 elevators  -> ELEVATOR_NOT_FOUND
1 elevator   -> resolve that exact row
2+ elevators -> ELEVATOR_CONTEXT_AMBIGUOUS
```

The implementation never uses `array[0]`, never derives a custom elevator from display order, and never fabricates `elevatorId = projectId` at runtime unless that exact legacy elevator actually exists.

### Stored records

A live stored record is authorized using its stored pair. A pre-2B.2 row with `projectId` but no `elevatorId` is readable/mutable only through the same exact-one compatibility rule. A half-owned row such as `{ projectId:'', elevatorId:'E1' }` is invalid and is normalized by the repair path rather than silently re-owned.

### Reassignment

For mutation paths, the current pair authorizes access. A distinct target pair is accepted only after canonical validation. A failed target or related-record validation occurs before persistence; it cannot partially move the record.

---

## 5. Elevator-owned endpoint behavior

The six owned collections have a consistent API boundary.

| Operation | Canonical form | Behavior |
|---|---|---|
| Scoped list | `GET /<collection>?projectId=P&elevatorId=E` | Returns only records whose pair exactly equals `P + E`. |
| Create | `POST /<collection>` with pair in body | Validates and persists both owner IDs. |
| Item read | `GET /<collection>/:id?projectId=P&elevatorId=E` | Rejects a sibling elevator or different project. |
| Update | `PUT /<collection>/:id` | Authorizes the current pair, validates any target pair, preserves immutable identity fields, then saves. |
| Delete | `DELETE /<collection>/:id?projectId=P&elevatorId=E` | Deletes only after exact record-context authorization. |

Response compatibility is retained:

- services use `service` / `services`;
- checklists use `checklist` / `checklists`;
- measurements, diagnostics, issues, and safety logs use `item` / `items` where they did previously.

An unscoped collection `GET` is retained solely for the app's internal `loadAll()` aggregate synchronization. It does not claim to be a tenant-scoped query. All context-bearing reads use exact-pair filtering, and item mutations do not use this aggregate-sync exception.

Project detail is also context-aware:

```text
GET /projects/:id?elevatorId=E
```

It returns the requested elevator and only that elevator's six owned collections. A project-only detail call is accepted only for an exact 1:1 project.

---

## 6. Authorization, isolation, and error vocabulary

The API distinguishes missing context, invalid relationships, unauthorized record access, and invalid related links.

| Error code | Meaning |
|---|---|
| `ELEVATOR_CONTEXT_REQUIRED` | A required ownership context is absent/incomplete. |
| `PROJECT_CONTEXT_REQUIRED` | A project-owned operation supplied elevator context without a project. |
| `PROJECT_NOT_FOUND` | The requested project does not exist. |
| `ELEVATOR_NOT_FOUND` | The elevator does not exist, or a project has no resolvable elevator. |
| `ELEVATOR_PROJECT_MISMATCH` | The elevator belongs to another project. |
| `ELEVATOR_CONTEXT_AMBIGUOUS` | A project-only wrapper was used for a project with multiple elevators. |
| `RECORD_CONTEXT_INVALID` | A stored live record has an incomplete pair. |
| `RECORD_CONTEXT_MISMATCH` | The requested pair does not own the record. |
| `RELATED_RECORD_NOT_FOUND` | A linked service/diagnostic/photo does not exist. |
| `RELATED_RECORD_CONTEXT_MISMATCH` | A related record belongs to a different project or elevator. |
| `CHECKLIST_IDENTITY_CONFLICT` | An update would collide with another `(project,elevator,template)` instance. |

The isolation matrix covers:

- one project / one elevator;
- one project / multiple elevators;
- multiple projects / one elevator each;
- multiple projects / multiple elevators;
- sibling-elevator access attempts;
- a cross-project elevator pair;
- missing project context;
- cross-context update and delete attempts;
- cross-context related-record links;
- malicious backup ownership and link combinations.

Rejected measurement updates and invoice/parts mutations are staged or rolled back so authorization failures are non-mutating.

---

## 7. Temporary compatibility and standalone history

### Exact-1:1 wrapper

Existing project-only callers are preserved only when the project has exactly one real elevator. This wrapper applies consistently to all six elevator-owned collections and to project detail/report context. Its purpose is temporary compatibility with the current no-picker UI, not implicit elevator selection.

### Multi-elevator behavior

For a project with multiple elevators, a project-only create/read/update/delete/report call fails clearly with `ELEVATOR_CONTEXT_AMBIGUOUS`. The caller must provide the exact elevator. The current UI is intentionally not extended to do that in Phase 2B.2.

### Narrow standalone compatibility

Existing workshop/bench workflows are preserved for:

- `services`;
- `measurements`;
- `diagSessions`.

When **both** ownership IDs are absent, these may create a genuinely standalone row with `projectId:''` and `elevatorId:''`. Once either ownership field is supplied, canonical pair validation applies.

New standalone creation is rejected for:

- `checklists`;
- `issues`;
- `safetyLogs`.

Detached historical rows in all six collections remain addressable and editable as detached history; they are never assigned to a guessed project/elevator.

---

## 8. Application-caller audit

Existing mutation callers now retain exact ownership whenever a stored record already has it.

| Application path | Existing-record behavior | New-record behavior without a picker |
|---|---|---|
| Services | Update body carries stored `elevatorId`; delete URL carries the stored pair. | Keeps project-only call; succeeds only for exact 1:1, otherwise fails clearly. |
| Measurements | Update body carries stored `elevatorId`; delete URL carries the stored pair. | Keeps project-only call; exact-1:1 only. |
| Issues/faults | Edit and closed-state toggle carry both IDs; delete carries the pair. | Project-only current UI; exact-1:1 only. |
| Checklists | Save of an existing instance carries that instance's stored `elevatorId`. | The no-picker UI exposes only its legacy exact-1:1 instance; it does not pick a custom elevator. |
| Diagnostics | API persists exact explicit context and supports all CRUD operations. | Existing project selector remains unchanged; project-only save is exact-1:1 only. |
| Safety acknowledgement | API requires canonical ownership. | Existing project-only flow is exact-1:1 only; a logging failure remains visible and cannot create a mis-owned log. |
| Project deletion | In-memory application mirror clears both IDs for all six owned collections and removes cached elevator rows for the deleted project. | No picker or new deletion UI added. |

`js/engineering/measurement-engine.js` was intentionally left untouched. This means current diagnostic, report, photo, invoice, and global-search UI remains visually and structurally unchanged; the new exact data adapters and API rules are available to the future multi-elevator UI phase.

---

## 9. Diagnostics, service history, issues/faults, and safety logs

`diagSessions`, `issues`, and `safetyLogs` now use the same generic owned CRUD boundary as the other elevator-owned collections:

- explicit create stamps the validated pair;
- scoped lists isolate sibling and cross-project elevators;
- item GET/PUT/DELETE authorizes the stored pair;
- updates preserve technician payload and timestamps/identity as applicable;
- detached history can remain detached without fabricating new ownership.

Service history has dedicated behavior because it participates in invoice, measurement, and parts links. Service create/update/delete is pair-aware. Deleting a service:

- removes the service itself only after exact authorization;
- clears live `measurement.serviceId` and `invoice.serviceId` links;
- does not delete measurements or invoices;
- does not destructively rewrite immutable `parts.history[]` evidence.

A missing service target in old parts history is therefore a backup warning, while an extant service linked across projects is a blocking error.

---

## 10. Checklist identity and technician-answer preservation

Checklist logical identity remains the Phase 2B.0 fix:

```text
projectId + elevatorId + templateId
```

Phase 2B.2 now validates that the identity's elevator is real and belongs to the project. POST upserts only the exact identity. PUT checks the prospective identity before mutation and throws `CHECKLIST_IDENTITY_CONFLICT` rather than merging two technicians' answer maps.

Consequences:

- two elevators in one project can hold the same template independently;
- repeated saves of one elevator update only that row;
- a sibling elevator cannot read, update, or delete the row;
- deletion/repair detaches ownership without deleting `checked` answers;
- backup/restore preserves explicit custom elevator contexts and answer maps;
- the no-picker checklist UI never exposes a custom context by choosing one implicitly.

---

## 11. Measurements and related-record adapters

Measurement create/read/update/delete now enforce exact ownership. The API validates related data before committing:

| Link | Required relationship |
|---|---|
| `measurement.serviceId` | Service exists and has the exact same `projectId + elevatorId`. |
| `measurement.diagSessionId` | Diagnostic session exists and has the exact same pair. |
| `measurement.photoId` | Photo exists and has the same `projectId`; photos remain project-owned. |

PUT builds a staged copy, applies the proposed fields/context, validates service/diagnostic/photo links, evaluates the measurement, and only then replaces the live row and persists. A rejected link cannot leave partial field changes in `_lsDB`.

The existing evaluator and UI engine were not refactored: `js/engineering/measurement-engine.js` remains byte-for-byte untouched. Phase 2B.2 changes only ownership and adapter behavior around it.

Photo deletion continues to clear live measurement attachment links instead of deleting the measurement. Backup audit independently rechecks photo existence and project equality before restore activation.

---

## 12. Search, project detail, and reports

### Global/scoped search API

`GET /search?q=...` provides an unscoped global data search. Every elevator-owned result includes:

```js
{
  collection,
  id,
  scope: 'elevator' | 'standalone',
  projectId,
  elevatorId,
  context: { projectId, elevatorId },
  record
}
```

`GET /search?q=...&projectId=P&elevatorId=E` validates the pair and excludes sibling elevators and other projects. Project-owned results are included only when their project matches the scoped project. Results are capped at 500.

### Elevator report adapter

`GET /reports/elevator?projectId=P&elevatorId=E` returns:

- the validated project and elevator;
- the six exact-pair owned collections;
- same-project shared/project-owned collections;
- optional `from` / `to` range filtering;
- per-owned-collection counts.

Project-only report calls follow the exact-1:1 wrapper and reject ambiguous projects.

### Existing UI

The existing global-search/report UI remains unchanged because Phase 2B.2 excludes UI redesign and forbids modification of the engineering module. Future picker-aware UI can consume these context-preserving adapters without redefining ownership.

---

## 13. Invoices, photos/attachments, parts history, archive, and deletion

### Invoices

Invoices stay project-owned and never persist `elevatorId`. If `serviceId` is present:

- the service must exist;
- `invoice.projectId` must equal `service.projectId`;
- a rejected create/update cannot consume or return inventory;
- a duplicate `clientMutationId` cannot be reused across projects.

The established compatibility behavior for an unlinked stale invoice project reference is retained: it normalizes to detached project context rather than writing a dangling ownership string.

### Parts history

`POST /parts-consume` validates any linked service before changing stock. The history row remains project-level and must use the service's project. No `elevatorId` is added to `parts.history[]`.

### Archive

Archiving remains project-level and non-destructive. The complete archive suite passes unchanged in count. Phase 2B.2 does not invent elevator archive UI or alter the archive contract.

### Project deletion and repair

Deleting a project:

1. preserves all six owned historical records;
2. stamps `projectInfo` and `elevatorInfo` where absent;
3. clears `projectId` and `elevatorId` as one pair;
4. removes every elevator row belonging to only that project;
5. detaches project-owned records independently;
6. detaches/stamps nested `parts.history[].projectId` through the canonical iterator;
7. leaves other projects/elevators and their records unchanged.

`STRUCTURED_DB.repairProjectRefs()` applies the same complete-pair rule to dangling or half-detached historical rows.

---

## 14. Backup/restore v8 and activation safety

`BACKUP_FORMAT_VERSION` remains **8**. The v8 payload still omits the derived `elevators` collection.

### Export

Metadata now describes the canonical pair model and counts elevator contexts from:

- each project's deterministic legacy context; and
- every distinct explicit `projectId + elevatorId` pair represented by an elevator-owned child.

It does not serialize derived elevator rows merely to preserve an empty/unrepresented elevator.

### Audit

Before activation, backup validation checks:

- no `elevatorId` without `projectId`;
- no elevator ID claimed by two projects;
- project-owned records do not retain elevator ownership;
- measurement/service exact-pair equality;
- measurement/diagnostic exact-pair equality;
- measurement/photo project equality;
- invoice/service project equality;
- parts-history/service project equality when the linked service exists;
- all established ID, count, invoice, parts, photo, and integrity rules.

Missing old parts-history service targets are warnings because service deletion can legitimately leave immutable inventory evidence. Cross-project links to an extant service are blocking errors.

### Restore

Restore stages a complete candidate, folds/repairs legacy project references, then reconstructs elevator contexts without reading stale live elevator rows:

- an owned row with an explicit pair reconstructs that exact context;
- a legacy row with project but no elevator derives only the deterministic project-ID elevator context;
- a detached row remains detached;
- one elevator ID associated with multiple projects aborts activation;
- project-owned records have unexpected `elevatorId` removed;
- canonical relationship validation runs before verified atomic activation.

Rejected candidates do not replace live data. Photo offload still occurs only after verified activation, preserving the existing inline fallback.

A v8 limitation remains explicit: because the format does not serialize derived/custom elevator metadata, a reconstructed custom context can retain its stable ID and ownership represented by child records, but unrepresented elevator display/specification data is outside this backup payload. No ownership or technician child record is guessed or dropped to hide that limitation.

---

## 15. Test matrix, regression totals, and performance measurements

### New Phase 2B.2 suite

`qa/phase2b2.js` adds **101** checks:

| Group | Checks |
|---|---:|
| Explicit ownership creation for all six collections | 6 |
| 1:N / N:N list and authorization isolation | 24 |
| Exact-1:1 compatibility and ambiguous-call rejection | 12 |
| Narrow standalone compatibility | 6 |
| Update/delete isolation and non-mutation | 18 |
| Checklist identity, search, report, project detail | 7 |
| Measurements, invoices, attachments, parts links | 11 |
| Multi-elevator project deletion/history preservation | 3 |
| Backup/restore v8 and negative activation | 10 |
| 100/500/1000 representative scaling checks | 3 |
| Uncaught jsdom error gate | 1 |
| **Total** | **101** |

No existing test was deleted, skipped, disabled, or reduced in count. Existing smoke fixtures that used conceptual non-existent elevator labels were updated to create real Phase 2B.1 elevator rows, and the legacy checklist expectation was updated from an omitted field to the now-required canonical pair.

### Final full regression

Final `npm test` result:

| Suite | Baseline | Final | Failed |
|---|---:|---:|---:|
| Smoke | 290 | 290 | 0 |
| Performance/transactions | 20 | 20 | 0 |
| Phase 2B.1 migration | 30 | 30 | 0 |
| Archive | 28 | 28 | 0 |
| Phase 2B.2 (new) | — | 101 | 0 |
| **Total** | **368** | **469** | **0** |

The final full command completed in approximately **22.85 seconds** in this sandbox.

### Representative scaling timings

Measured operation bundle: exact scoped service list + scoped search + exact elevator report.

| Elevator rows in one project | Elapsed |
|---:|---:|
| 100 | 0 ms (below `Date.now()` resolution) |
| 500 | 1 ms |
| 1000 | 1 ms |

These numbers are from **jsdom + fake-indexeddb in Node**, not a physical Android device, browser WebView, or production storage profile. They demonstrate bounded functional behavior and no accidental cross-context result growth; they must not be presented as real-device performance. Real Android profiling remains deferred.

Syntax checks for all modified JavaScript files and `git diff --check` also passed.

---

## 16. Changed files, deferred work, acceptance decision

### Changed files

| File | Purpose |
|---|---|
| `js/database/api-local.js` | Canonical context/authorization helpers; pair-aware owned CRUD; search/report/project adapters; linked-record validation; restore reconstruction; complete-pair delete behavior. |
| `js/database/backup.js` | v8 ownership metadata/counts and link/context audits. |
| `js/database/elevator-migration.js` | Relationship helper no longer fabricates/selects an elevator; exact-one compatibility only. |
| `js/database/structured-db.js` | Complete-pair detach/repair for all six elevator-owned collections. |
| `js/modules/services.js` | Existing update/delete calls retain exact context. |
| `js/modules/measurements.js` | Existing update/delete calls retain exact context. |
| `js/modules/issues.js` | Existing edit/toggle/delete calls retain exact context. |
| `js/modules/checklists.js` | Existing checklist saves retain the stored elevator identity. |
| `js/modules/projects.js` | Application deletion mirror detaches complete pairs and removes cached elevator rows. |
| `qa/smoke.js` | Existing fixtures aligned with real canonical elevator relationships; assertion count retained. |
| `qa/phase2b2.js` | Dedicated 101-check Phase 2B.2 matrix. |
| `package.json` | Adds the Phase 2B.2 suite to the mandatory full test gate. |
| `PHASE2B2_API_APPLICATION_LAYER.md` | This audit, contract, verification, and handoff record. |

### Intentionally unchanged

- `js/engineering/measurement-engine.js`;
- backup format version 8;
- database schema and Phase 2B.1 migration version;
- service worker/cache, manifest, QR architecture;
- all multi-elevator UI/navigation/dashboard/picker/management flows.

### Deferred to a later UI/device phase

- an explicit elevator picker and management UX;
- picker-aware diagnostic, safety, checklist, measurement, search, and report screens;
- real Android/WebView performance and storage profiling;
- any future backup format that chooses to serialize elevator metadata directly.

### Acceptance decision

All Phase 2B.2 acceptance gates are satisfied:

- canonical pair enforced for all six owned collections;
- cross-project and cross-elevator isolation tested;
- no silent/default/first elevator selection;
- exact-1:1 compatibility explicit and ambiguity-safe;
- checklist identity and technician data preserved;
- measurement, diagnostic, attachment, invoice, parts, search, report, backup, archive, restore, update, and delete paths audited/tested;
- backup remains v8;
- existing regression count preserved;
- final result **469 passed, 0 failed**.

# READY FOR PHASE 2B.3
