# PHASE 2B.0 — Multi-Elevator Pre-Migration Blocker Remediation

Date: 2026-08-24
Branch: `arena/01a03554-z-lift` (from `main` @ `6d642bc`)
Scope: BUG-1, BUG-2, BUG-3 only. **No Multi-Elevator implementation.**

> This phase deliberately does **not** add an elevator collection, an
> `elevatorId` migration, Project 1:N, an elevator UI/picker/route, a new QR
> architecture, a backup-format migration, or a new database schema.

---

## 1. Baseline test result

Measured before any source change, on `main` @ `6d642bc`:

```
$ npm install && npm test          # npm test == node qa/smoke.js at baseline
RESULT: 276 passed, 0 failed
```

Architecture confirmed by inspection (not assumed from the previous audit):

| Area | File | Confirmed state |
|---|---|---|
| Version constants | `js/core/app-core.js` | `APP_VERSION 29.1.2`, `DB_SCHEMA_VERSION 3`, `BACKUP_FORMAT_VERSION 8`, `CACHE_VERSION zlift-pwa-v36` |
| Structured migration | `js/database/structured-db.js` | `VERSION 3`, `MIGRATION_VERSION 1`, `PROJECT_OWNED` = 11 collections |
| Elevator projection | `js/database/structured-db.js` `writeAggregate` | `elevators` store written as a 1:1 copy of `projects` with `{ projectId: p.id, elevatorId: p.id }` |
| Checklist persistence | `js/database/api-local.js` `POST /checklists` | upsert keyed on `(projectId, templateId)` |
| Nested inventory refs | `js/database/api-local.js` | `parts.history[].projectId` written by 3 sites |
| Test suite | `qa/smoke.js` | single jsdom runner, 276 assertions |

Every audit finding below was re-derived from the code and reproduced with a
throwaway probe before any fix was written.

---

## 2. BUG-1 — root cause

**Confirmed, and worse than "a future problem".** Reproduced against real code:

```
POST /checklists {projectId:P1, elevatorId:'ELEV-A', templateId:'traction-install', checked:{a1:'pass'}}
POST /checklists {projectId:P1, elevatorId:'ELEV-B', templateId:'traction-install', checked:{a1:'fail'}}

→ 1 record, not 2. Same id. checked = {a1:'fail'}.
```

The logical identity of a checklist instance was `projectId + templateId`, in
**two independent places** that had to agree by convention:

| # | Operation | Location | Identity used |
|---|---|---|---|
| 1 | create / upsert | `api-local.js` `POST /checklists` | `find(x => x.projectId === b.projectId && x.templateId === b.templateId)` |
| 2 | load / edit | `checklists.js` `getInst()` | `state.checklists.find(x => x.projectId === selectedProject && x.templateId === tid)` |
| 3 | project view | `api-local.js` `GET /projects/:id`, `projects.js` | `filter(c => c.projectId === …)` (project-level, correct as-is) |
| 4 | delete/detach | `api-local.js` DELETE, `projects.js` `stampAll` | via `projectId` |
| 5 | backup export/import | `api-local.js` `/backup` GET+PUT | whole collection, no identity logic |
| 6 | validation | `backup.js` `auditBackupData`, `structured-db.js` `verifyAggregate`/`repairProjectRefs` | `projectId` existence only |
| 7 | delete of an instance | — | **no endpoint exists**; only project-level detach |

The upsert is destructive: `if (b.checked) c.checked = b.checked`. So a second
elevator context does not just collide — it **overwrites the first elevator's
answers**, and nothing in validation notices, because both writes produce a
perfectly well-formed record.

`elevatorId` in the request body was silently discarded.

---

## 3. BUG-1 — solution

Smallest safe change: **make the identity elevator-capable without writing a
new field for any current caller, and define it in exactly one place.**

New canonical seam in `js/data/checklist-data.js` (loaded before both the data
layer and the UI, so no new file, no `index.html`/`sw.js` change):

```js
checklistElevatorId(rec)                 // rec.elevatorId || rec.projectId  (1:1 fallback)
checklistKey(projectId, elevatorId, templateId)
checklistKeyOf(rec)
findChecklistInstance(list, projectId, templateId, elevatorId)
normalizeChecklistElevatorId(raw)
checklistIdentityConflicts(list)
detachChecklistElevatorRef(rec, deadProjectId)
```

Logical identity is now `(project, elevator, template)`.

**Why the project stays in the key.** Elevator id alone would be sufficient
*if* elevator ids were globally unique — and nothing in this build can
guarantee that, because the elevator collection does not exist yet. This was
not hypothetical: the first version of this fix keyed on
`(elevator, template)` only, and a regression test immediately caught two
*different* projects using the same elevator label resolving to one record.
Keeping the project in the key makes isolation strictly stronger — a collision
now requires project **and** elevator **and** template to all agree.

**Backward compatibility.** The elevator dimension falls back to `projectId`,
which is exactly the existing 1:1 projection the `elevators` store already
writes. Consequences, each asserted by a test:

* existing records have no `elevatorId` field → their identity is unchanged;
* no current UI or API caller passes `elevatorId` → no new field is written,
  so records produced by this build are byte-identical to before;
* therefore **no migration, no id regeneration, no timestamp churn, no
  schema/version change**;
* a record carrying `elevatorId` is never matched by a request that omits it,
  and vice versa — isolation in both directions.

Callers updated to the canonical helper (no parallel system created):
`api-local.js POST /checklists` (authoritative) and `checklists.js getInst()`.
Project deletion and `repairProjectRefs` also clear an `elevatorId` equal to
the dead project id, so the future dimension cannot become a dangling
reference of the kind Phase 2A removed for `projectId`. Both are no-ops on all
present data.

Duplicate logical identity (two rows, same key) is **reported, never merged and
never deleted** — `checklistIdentityConflicts()` plus a non-blocking
`checklists:duplicate-identity:…` backup warning. Guessing which technician's
answers win would be data loss.

---

## 4. BUG-1 — tests

Added to `qa/smoke.js` (prefix `P2B0 BUG-1`):

| Test | Proves |
|---|---|
| identity resolves the elevator dimension with a 1:1 fallback | key semantics; same label in another project ≠ same instance |
| legacy record ↔ legacy request still match | existing data stays readable with no migration |
| malformed inbound `elevatorId` cannot poison the identity | non-strings, blanks, 500-char input → `''` |
| **CASE A** single existing elevator context | upsert (1 row), same id, `id !== 'tmp'`, latest answers, **no `elevatorId` field added**, `updatedAt` monotonic |
| **CASE B** two elevator contexts, one project, one template | 2 rows, distinct ids, independent `checked` maps, **repeated save/update/load stays at 2 rows** |
| same elevator label in two different projects | cross-project isolation; deleting one project leaves the other's instance attached and unstamped |
| backup → restore → project delete | both contexts survive, answers preserved, detached + stamped, dead id not left as the elevator dimension |
| duplicate identity reported | `checklistIdentityConflicts` finds it, backup audit warns, lookup stays deterministic, **both rows survive** |

---

## 5. BUG-2 — root cause

**Confirmed.** `parts.history[].projectId` was completely unmanaged. Measured
before the fix:

```
history before delete: [{projectId:'<B>', qty:-3}, {projectId:'<A>', qty:-2}]
DELETE /projects/<A>
history after delete:  [{projectId:'<B>', qty:-3}, {projectId:'<A>', qty:-2}]   ← A no longer exists
backup audit warnings: []                    ← not even reported
verifyAggregate:       verify-ok            ← not detected
repairProjectRefs:     false                ← not repaired
```

It is **not merely metadata**. Creation and use sites:

| Created by | Value source | Validated? (before) |
|---|---|---|
| `applyInvoiceInventory()` (invoice consume/return) | `invoice.projectId` | no |
| `POST /parts-consume` | request body `projectId` | **no — any string accepted** |
| `PUT /parts/:id` (manual adjustment) | literal `''` | n/a |
| Consumed by | `measurement-engine.js:174` renders `projName(h.projectId)` in the inventory history panel | — |

`PROJECT_OWNED` covers only *top-level* `projectId` fields, so nested
references were invisible to `repairProjectRefs`, to `verifyAggregate`, to the
project-delete detach loop, and to `auditBackupData`. Because
`POST /parts-consume` accepted an arbitrary string, a device could accumulate
references that never pointed at a real project at all.

---

## 6. BUG-2 — solution

**Policy chosen: (B) participate in project-deletion detach-and-stamp, and
(A) participate in relationship verification** — the same canonical policy the
rest of the model already documents
(`relationships.serviceHistoryPolicy: 'detach-and-stamp-on-project-delete'`).
Option (C), leaving it outside validation, was rejected: it is precisely how
the reference became invisible, and the inventory panel renders the id, so a
dead reference silently loses "which building did this stock go to".

One declaration drives everything (no second relationship system):

```js
const PROJECT_NESTED_REFS = [{ collection: 'parts', field: 'history' }];
function eachNestedProjectRef(db, fn)   // shared iterator
```

Applied from four places, all through that one definition:

1. **`repairProjectRefs()`** — dangling nested ref → `projectId = ''` +
   `projectInfo = 'projectId:<dead id>'` (same stamp convention as top-level).
2. **project DELETE** (`api-local.js`) — same iterator, richer stamp
   (`name — customer — location`), mirrored in `projects.js` for on-screen state.
3. **`verifyAggregate()`** — rejects a dangling nested ref, via the *same*
   iterator the repair uses, so the two cannot drift (the drift that made
   P2A BUG-4 an unrecoverable boot loop).
4. **`auditBackupData()`** — dangling nested refs are **warnings**, never
   blocking errors, so pre-2B.0 backups stay restorable.

Plus the creation seam: `resolveProjectRef(db, projectId)` now resolves an id
against live projects and writes `''` for an unknown one, so no *new* dangling
nested reference can be created.

**History preservation.** The entry itself is never removed. `qty`, `date`,
`note`, `prevQty`, `newQty`, `shortQty`, `invoiceId`, `serviceId` and `id` are
untouched; only the dead link is replaced by surviving context. Malformed
entries (`history` not an array, `null` rows, non-string `projectId`) are
**skipped and reported, never deleted and never coerced** — the app may not
guess. No relationship is fabricated and no history is reassigned to another
project.

**Idempotent.** Once `projectId` is `''` the entry is no longer visited, so a
second and third pass report no change, re-stamp nothing, rewrite no
timestamp, duplicate nothing and regenerate no id (asserted).

---

## 7. BUG-2 — tests

Added to `qa/smoke.js` (prefix `P2B0 BUG-2`), covering all ten required cases:

| # | Required case | Test |
|---|---|---|
| 1 | valid nested reference | repair pass returns `false`; both live refs intact |
| 2 | project deletion | entry detached + stamped with `name — customer — location` |
| 3 | historical data preservation | `id`, `qty`, `date`, `prevQty`, `newQty` byte-identical; array length unchanged |
| 4 | project isolation | Project B's entry keeps `projectId === B` and gains no `projectInfo` |
| 5 | backup | export still validates; `parts:history-project-relation:…` warning surfaced |
| 6 | restore | legacy backup with a dangling ref imports and is repaired |
| 7 | malformed nested history | `history-not-array`, `history-record`, `history-project-type` → **warnings, `errors.length === 0`, nothing deleted** |
| 8 | repeated repair | 2nd and 3rd pass `false`; `JSON.stringify(history)` unchanged |
| 9 | old/legacy backup compatibility | pre-2B.0-shaped export round-trips; `formatVersion` still 8; all counts equal |
| 10 | verify/repair parity | injected dangling ref throws `structured-relation:parts.history:<part>:<entry>`, canonical repair clears it, entry preserved |
| + | creation seam | `parts-consume` and invoice with `projectId:'no-such-project'` write `''`, never the bogus id |

---

## 8. BUG-3 — audit findings

Each question answered against the actual code, with measurements.

**1. Is `writeAggregate()` truly atomic?**
Yes at the IndexedDB level *after this fix*. `transaction()` opens one
read-write transaction over all 16 stores and queues `clear()` + `put()` for
every collection synchronously — no `await` inside the work callback, so no
request escapes the transaction. **But the atomicity was broken for one class
of failure** (see #3).

**2. Does a failed transaction leave the previous state intact?**
It did not, in one case. Measured before the fix:

```
mid-tx failure: {"err":"function(){} could not be cloned.","projects":[]}     ← aggregate WIPED
after fix:      {"err":"function(){} could not be cloned.","projects":["atom-good"]}
```

**3. Is rollback behaviour real or assumed?**
**Assumed — and wrong.** `transaction()` did `catch (e) { reject(e); return; }`.
`writeAggregate` queues `store.clear()` for every store *before* the puts. A
synchronous throw out of the work callback therefore left those clears queued,
and IndexedDB commits a transaction as soon as control returns to the event
loop with nothing pending — so the clears **committed**. A rejected save
emptied the database instead of failing. Realistic triggers: a value that
cannot be structured-cloned, or any exception raised while queueing requests.

**4. Does every mutation depend on a full aggregate rewrite?**
Yes. `_lsSave()` → `STRUCTURED_DB.save()` → `writeAggregate()` clears and
rewrites all 16 stores on every mutation, including a single checklist tick
(the UI debounces it at 500 ms). There is no partial-write path.

**5. What is the actual complexity?**
`O(total records)` per save, in both directions — and the `elevators` store is
a 1:1 projection of `projects`, so every project is written **twice** per save
(verified: `elevators count === projects count` at every scale).
`verifyAggregate()` is the same order and in practice **more expensive than the
write**, because it re-reads the aggregate and computes two stable-JSON
fingerprints (sort + `stableValue` + `JSON.stringify`). The previous audit did
not measure it; it is the dominant cost at scale.

**6. Are photos/blobs outside the aggregate transaction?**
Yes, and this is by design. `IDB_PHOTOS` is a **separate database**
(`zlift-photos`) with its own transactions. Proven empirically in
`qa/perf.js`: after a real `POST /photos`, `indexedDB.databases()` returns both
`zlift-photos` and `zlift-data`, the payload reads back from the photo store,
and the aggregate record carries `inIdb: true, data: ''`. Consequence: photo
bytes are **not** covered by the aggregate rollback. The restore path already
accounts for this (photo payloads stay inline until the structured commit is
verified, and `_migratePhotosToIdb` only strips inline data after every copy
verifies).

**7. Does Multi-Elevator eventually make the aggregate too big?**
Not through elevators as such. Under 1:N the `elevators` rows are small and
already written today as a 1:1 projection, so the projection stops being a
duplicate write — a slight *improvement*. The real driver is total record count
(services, measurements, invoices), which Multi-Elevator does not change by
itself. The concern is therefore unchanged by this migration and belongs to a
storage-layer decision, not to Phase 2B.

**8. What happens around 1000 / 5000 / 10000 projects?**
See §9. 1000 is comfortable; 5000 is a visible pause; 10000 is over a second
per save with ~393 MB heap in the test environment and would be materially
worse on a phone.

---

## 9. BUG-3 — performance results

`qa/perf.js`, jsdom + fake-indexeddb, record shapes modelled on the real seed
data (Persian name/customer/location/notes fields) so byte sizes are
representative. `write` = `STRUCTURED_DB.save()`; `verify` =
`STRUCTURED_DB.verifyAggregate()`; `raw read` = direct `getAll()` on four
stores, bypassing the app.

| projects | JSON size | write | verify | raw read | elevators | heap |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.19 MB | 10 ms | 12 ms | 3 ms | 100 | 61.8 MB |
| 500 | 0.95 MB | 39 ms | 58 ms | 13 ms | 500 | 62.3 MB |
| 1000 | 1.89 MB | 67 ms | 115 ms | 24 ms | 1000 | 96.1 MB |
| 5000 | 9.49 MB | 449 ms | 628 ms | 177 ms | 5000 | 141.2 MB |
| 10000 | 19.00 MB | 1199 ms | 1440 ms | 284 ms | 10000 | 393.0 MB |

10000 was measured once, off-suite, because it is too heavy to run on every
`npm test`.

### TEST ENVIRONMENT vs REAL ANDROID DEVICE

Every number above comes from **jsdom + fake-indexeddb**: an in-memory
IndexedDB on the test host's CPU and RAM. It measures the *algorithmic* cost of
the storage path and the *transaction semantics*. It does **not** measure a
device. A real Android phone has slower flash and CPU, and Chrome-on-Android
enforces a storage quota that fake-indexeddb does not. Treat the timings as
relative scaling evidence only. The transaction/rollback assertions are
semantic and do transfer.

### Comparison with the previous audit

The audit reported ~30 / 117 / 188 / ~1000 ms for 100 / 500 / 1000 / 5000
projects. **Those exact figures were not reproducible here** — this run measures
10 / 39 / 67 / 449 ms. The difference is fixture shape, host and measurement
path (the audit's numbers are 2–4× higher). The *conclusion* is the same and is
confirmed: cost is linear in total record count and acceptable at current
scale. `verifyAggregate` — unmeasured by the audit — is consistently the larger
of the two costs.

---

## 10. Did BUG-3 require code changes?

**Yes — one line, for correctness (not performance).** The performance side
needs no change and got none.

```js
// js/database/structured-db.js — transaction()
- catch (e) { reject(e); return; }
+ catch (e) {
+   try { if (tx) tx.abort(); } catch (e2) { /* already finished */ }
+   reject(e);
+   return;
+ }
```

Aborting hands the transaction to IndexedDB's rollback, so a failed write now
leaves the previously committed state byte-identical — the guarantee the rest
of the data layer already assumed.

The fix is **load-bearing and regression-tested**. Reverting it makes
`qa/perf.js` fail with `projects after failed write: []`; restoring it passes.
The other two fixes were verified the same way (revert → named test fails →
restore → passes).

**Deliberately not changed:** no caching layer, no partial writes, no
collection-per-store save path, no debounce changes, no storage redesign. The
scalability concern at 5000–10000 records is **documented, not optimized**.

---

## 11. Backup verification

* `BACKUP_FORMAT_VERSION` unchanged at **8**; `dbSchemaVersion` in exports still **3**.
* `export → delete/repair → restore` round-trips: asserted by
  `P2B0 BACKUP: export → delete/repair → restore round-trips with
  BACKUP_FORMAT_VERSION still 8 and every count intact`.
* Legacy backups still import: a pre-2B.0-shaped backup (no `integrity`,
  `metadata`, `recordCounts`, `relationships`) re-validates, restores, and
  reproduces every count.
* A legacy backup carrying **dangling and malformed** `parts.history` imports
  successfully, keeps **all four** entries (including a `null` row and a
  numeric `projectId`), and repairs only the dead reference.
* New warnings are non-blocking by construction, so no previously-restorable
  backup became unrestorable.
* No Multi-Elevator backup structure was introduced.

## 12. Schema / version verification

| Constant | Before | After |
|---|---|---|
| `DB_SCHEMA_VERSION` | 3 | **3** |
| `STRUCTURED_DB` IndexedDB `VERSION` | 3 | **3** |
| `STRUCTURED_DB.MIGRATION_VERSION` | 1 | **1** |
| `BACKUP_FORMAT_VERSION` | 8 | **8** |
| `APP_VERSION` / `CACHE_VERSION` | 29.1.2 / zlift-pwa-v36 | **unchanged** |

Asserted in `qa/perf.js`. **No version change was required.** Adding an
*optional* field that no current code path writes is not a schema change: no
object store, index, key path or record shape changes, and no migration runs.
`APP_VERSION`/`CACHE_VERSION` were left alone because the service worker uses
network-first for same-origin assets, so clients pick up the new JS without a
cache bump.

---

## 13. Files changed

| File | Change |
|---|---|
| `js/data/checklist-data.js` | + canonical checklist logical identity (BUG-1) |
| `js/database/api-local.js` | identity-aware `POST /checklists`; nested detach + checklist elevator detach on project delete; `resolveProjectRef()` at both `parts.history` creation seams (BUG-1, BUG-2) |
| `js/database/structured-db.js` | `PROJECT_NESTED_REFS` + `eachNestedProjectRef`; nested pass in `repairProjectRefs`; nested check in `verifyAggregate`; **`tx.abort()` rollback fix** (BUG-2, BUG-3) |
| `js/database/backup.js` | nested-history warnings; duplicate-checklist-identity warning (BUG-1, BUG-2) |
| `js/modules/checklists.js` | `getInst()` uses the canonical lookup (BUG-1) |
| `js/modules/projects.js` | mirrors the nested detach and elevator detach in on-screen state (BUG-1, BUG-2) |
| `qa/smoke.js` | +14 `P2B0` regression tests (276 → 290) |
| `qa/perf.js` | **new** BUG-3 runner: transaction semantics + scalability |
| `package.json` | `npm test` now runs smoke **and** perf; added `test:smoke`, `test:perf` |

## 14. Files intentionally untouched

* `js/engineering/measurement-engine.js` — explicitly out of scope. Consequence:
  the inventory history panel still renders `projName(h.projectId)`, which now
  shows nothing for a detached entry instead of `—`. The surviving context is
  preserved in `projectInfo`; surfacing it in that panel is a UI task for the
  Multi-Elevator phase (see §16).
* `sw.js`, `index.html`, `manifest.json` — no new files, so the precache list is
  unchanged and the existing precache-completeness test still passes.
* `js/database/photo-store.js`, `js/database/offline-layer.js`,
  `js/core/app-core.js`, `js/auth/auth.js`, `js/router.js` and all other
  modules — no behavioural change needed.
* No refactoring, no renaming, no unrelated cleanup. `package-lock.json` was
  left as committed even though `npm install` wants to sync its stale
  `29.1.1` version field to `29.1.2`; that is unrelated to this task.

---

## 15. Full test result

```
$ npm test

> node qa/smoke.js
RESULT: 290 passed, 0 failed

> node qa/perf.js
=== PHASE 2B.0 BUG-3: writeAggregate() transaction + scalability ===
RESULT: 20 passed, 0 failed
```

**310 passed, 0 failed.** Baseline was 276 passed, 0 failed; 34 assertions were
added and **none were deleted, skipped or weakened**. All pre-existing
categories still pass unchanged: backup/restore, backup validation,
migration/recovery (`copying` marker, count preservation, legacy source
untouched), project deletion (detach-and-stamp, six record kinds), archive,
isolation, invoice atomicity/rollback/idempotency, inventory shortage, photo
IDB offload, storage fallback, versioning and PWA precache.

Verification method: each of the three fixes was temporarily reverted to
confirm its tests actually fail (BUG-1 → 2 failures, BUG-2 → 2 failures,
BUG-3 → 1 failure with the aggregate wiped), then restored.

No lint or typecheck runner exists in this repository (`package.json` defines
only test scripts). Syntax was checked with `node --check` on every modified
file, and the jsdom suite loads and executes all of them.

---

## 16. Remaining limitations

1. **In-memory divergence on a failed save is not rolled back.** API handlers
   mutate `_lsDB` *before* `_lsSave()`. If the write fails, IndexedDB now rolls
   back correctly, but the in-memory aggregate keeps the mutation and persists
   it on the next successful write. Measured: memory 8 projects, storage 7.
   This is *delayed persistence, not data loss*, but the caller's error is not
   fully truthful, and `window._lsSaveFailed` is never set on the IndexedDB
   path (it is only written in the localStorage fallback branch, and nothing
   reads it today). Fixing it means giving every handler a rollback discipline
   like the invoice path already has — a larger change, deliberately out of
   scope here.
2. **Photo bytes are outside the aggregate transaction** (separate database).
   By design, and already handled by the restore path, but it means a photo
   write and the record that references it are not one atomic unit.
3. **Full aggregate rewrite per mutation.** Unchanged. Fine at 1000 records,
   a visible pause at 5000, over a second at 10000 with ~393 MB heap in the
   test environment. Documented, not optimized.
4. **The inventory UI does not yet render the `projectInfo` stamp**, because
   `measurement-engine.js` is out of scope. The context is preserved in data.
5. **Duplicate checklist identity is reported, not resolved.** Correct for data
   safety, but if a duplicate ever exists the UI edits the first match. No
   code path in this build can create one.
6. **Performance numbers are jsdom-only.** No real Android device measurement
   was taken in this phase.
7. **Non-string `parts.history[].projectId` values are preserved, not
   coerced.** They are warned about in the backup audit and skipped by
   repair/verify, because normalizing `99` → `'99'` or `''` would be guessing.

---

## 17. Readiness for Multi-Elevator

| Gate | Status |
|---|---|
| BUG-1 fixed and regression-tested | ✅ 8 tests, incl. CASE A / CASE B / cross-project / backup / delete |
| BUG-2 fixed and regression-tested | ✅ 6 tests covering all 10 required cases |
| BUG-3 verified safe / safely corrected | ✅ rollback corrected (1 line) + 12 semantic and scaling assertions |
| All existing tests pass | ✅ 276 → 276 still passing |
| All new tests pass | ✅ +34 (290 smoke, 20 perf) |
| Backup/restore passes | ✅ incl. legacy and malformed-history backups |
| No unexpected schema/version change | ✅ 3 / 3 / 1 / 8 all unchanged |
| Current 1:1 behaviour intact | ✅ CASE A asserts the legacy record shape is byte-identical |
| No Multi-Elevator production code | ✅ no elevator collection, migration, UI, picker, route or QR change |
| PR created | ✅ see repository |

What Phase 2B now inherits, concretely:

* a **single canonical checklist identity** that already carries the elevator
  dimension — the migration becomes "start passing `elevatorId`", not a
  re-architecture;
* **one nested-reference declaration** (`PROJECT_NESTED_REFS`) that repair,
  verification, deletion and backup audit all read from, so adding the next
  nested reference is a one-line change;
* a **write path whose rollback actually works**, which is the precondition for
  trusting any future multi-record elevator migration.

What Phase 2B must still decide (not blockers for starting, but real work):

1. The elevator collection, its ids, and the `projectId → elevatorId` migration
   for the 11 `PROJECT_OWNED` collections.
2. Whether `elevatorId` becomes required on new checklist writes (today it is
   optional by design).
3. Rendering `projectInfo` in the inventory history panel.
4. A storage strategy if record counts are expected to exceed ~5000.

---

## Final decision

**READY FOR MULTI-ELEVATOR IMPLEMENTATION**
