# Phase 2A — Final Verification: Data / History / Context Consistency

**Scope:** focused verification of the existing Phase 2A implementation (BUG-1 archive
persistence, BUG-2 project delete/detach, OBS-2 `archivedProjects` cleanup).
**Multi-Elevator was NOT implemented in this task.**

**Result:** two real defects were found on the **recovery** path and fixed minimally.
Six regression tests were added. Suite: **276 passed, 0 failed** (baseline 270).

---

## 1 — All detach paths found

Every code path that removes or repairs a project reference:

| # | Path | File | Policy applied |
|---|------|------|----------------|
| 1 | `DELETE /projects/:id` (canonical delete) | `js/database/api-local.js:314-337` | **detach-and-stamp** — `projectInfo = "name — customer — location"`, `projectId = ''` |
| 2 | `_doDeleteProject()` (client mirror of the above) | `js/modules/projects.js:234-256` | same stamp mirrored into in-memory `state` |
| 3 | `repairProjectRefs()` (boot / legacy recovery) | `js/database/structured-db.js:177-204` | **detach-and-stamp** *(fixed — see §11)* |
| 4 | `foldArchivedProjects()` (legacy `archivedProjects`) | `js/database/structured-db.js` | folds into `projects` as `archived:true`; never deletes |
| 5 | `sweepLegacyArchivedStore()` (vestigial IDB store) | `js/database/structured-db.js` | folds rows, clears store only when fully consumed |
| 6 | Boot pipeline `ready()` | `js/database/structured-db.js:~300` | `fold → repair → writeAggregate → verifyAggregate` |
| 7 | Legacy localStorage load `_lsLoad()` | `js/database/api-local.js:28-34` | fold + repair, idempotent, no deletes |
| 8 | `_lsMigrateServices()` | `js/database/api-local.js:54-90` | detaches dead `projectId`/`serviceId`/`photoId`, backfills `customer`/`elevatorInfo` |
| 9 | Restore `PUT /backup` | `js/database/api-local.js:740-750` | fold + repair on the **staged candidate** before the atomic commit |
| 10 | `auditBackupData()` | `js/database/backup.js:79-86` | dangling `calcSaves`/`safetyLogs` → **warnings**, not blocking |
| 11 | Restore count verification | `js/database/backup.js:366-370` | `projects + archivedProjects` compared combined |

**Writes are funnelled through `_lsSave()` → `STRUCTURED_DB.save()`.** No code path
deletes a project-owned record when its project is removed.

## 2 — Collections affected & 3 — historical context retained

| Collection | Detached on delete | Context retained after detach |
|---|---|---|
| `services` | ✅ | `projectInfo` + `customer` + `elevatorInfo` (backfilled from the project) |
| `measurements` | ✅ | `projectInfo` (+ own `location`, `component`, `technician`, `ts`) |
| `photos` | ✅ | `projectInfo` (+ own `cat`, `note`) |
| `invoices` | ✅ | `projectInfo` (+ own `customer`, `number`) |
| `diagSessions` | ✅ | `projectInfo` (+ own `flowId`, `evidence`) |
| `issues` | ✅ | `projectInfo` (+ own `title`, `status`) |
| `contracts` | ✅ | `projectInfo` (+ own `building`, `amount`) |
| `reminders` | ✅ | `projectInfo` (+ own `title`, `due`) |
| `checklists` | ✅ | `projectInfo` (+ own `templateId`, `checked`) |
| `calcSaves` | ✅ | `projectInfo` (+ own `name`, `inputs`, `results`) |
| `safetyLogs` | ✅ | `projectInfo` (+ own `checklistId`, `technician`, `ts`) |

Only the **existing** `projectInfo` field is used. **No new schema, no duplicate fields.**

## 4 — Is `repairProjectRefs()` equivalent to normal delete?

**Before this verification: NO — two defects.** Now: **YES.**

### BUG-3 — recovery produced strictly poorer history *(real bug, fixed)*

`repairProjectRefs()` blanked `projectId` **without writing any stamp**. Measured
side-by-side on the real API:

```
SCENARIO A (delete):  projectId:''  projectInfo:'SCEN-A — Cust-SCEN-A — Loc-SCEN-A'  ✅
SCENARIO B (repair):  projectId:''  projectInfo: null                                ❌ orphan
```

A technician recovering an old device lost the last trace of which elevator the record
belonged to. This directly violates the Final Principle.

### BUG-4 — repair coverage ≠ verification coverage *(real bug, fixed)*

`verifyAggregate()` rejected a dangling `projectId` in **11** collections, but
`repairProjectRefs()` only normalized **2** (`calcSaves`, `safetyLogs`). The other **9**
were verified-but-unrepairable:

```
still dangling after repair:
  services, invoices, contracts, checklists, measurements,
  reminders, photos, diagSessions, issues
boot verification → THROWS: structured-relation:issues:dang-issue
```

Because `ready()` verifies on **every** boot, one stranded ref (e.g. from an interrupted
write) threw forever and pushed the device permanently into `localStorage-fallback`
with no route back to IndexedDB — a silent, unrecoverable data-safety regression.

**Fix (minimal):** a single shared `PROJECT_OWNED` constant now drives *both*
`repairProjectRefs()` and `verifyAggregate()`, so the two lists can never drift apart
again; and the repair pass stamps `projectInfo` using the app's existing field.

Since the project row is already gone when recovery runs, the richest surviving fact is
the dead identifier, preserved as `projectInfo = "projectId:<lost-id>"`. Records from the
same lost project keep a shared, greppable stamp resolvable against any older backup.
An existing richer stamp from the delete path is **never overwritten** (`if (!r.projectInfo)`).

## 5 — Backup / restore

- Delete → detach/stamp → export → import → verified re-read: **`projectInfo` survives intact.**
- Export is self-contained (IDB photo payloads re-hydrated).
- Restore stages a full candidate, applies fold+repair, commits atomically, then
  verifies counts/relationships/fingerprint; failure rolls back to a pre-restore safety backup.
- Legacy backups with dangling `calcSaves`/`safetyLogs` remain **restorable** (warnings, not errors).

## 6 — `archivedProjects` legacy result

Legacy entries fold into `projects` as `archived:true` (`archivedAt` preserved from
`archivedAt`/`updatedAt`). Duplicates yield to the live record. **Malformed/unknown rows
are kept, never deleted.** Export carries the empty collection for format compatibility.
Ordering is **fold-before-repair**, so a legitimately archived project never has its
records falsely detached — now covered by an explicit regression test.

## 7 — Project isolation

Projects A and B each seeded with service, measurement, diagnostic, checklist,
calculation and safety log. Deleting A: **all six B records untouched** (`projectId` intact,
B still present); **all six A records survive**, detached and stamped with `P2A-Iso-A`.

## 8 — Archive persistence

Archive → reload → reinitialize → backup → restore keeps `archived:true` and a valid
`archivedAt`. Normal field edits do **not** clear archive state (whitelist semantics).
Data-layer unarchive works; **no UI feature was invented.**

## 9-11 — Tests, build, changes

- **Existing:** 270/270 pass, unmodified. `qa/smoke.js` changes are **purely additive**
  (`git diff` shows zero removed lines) — no test weakened or deleted.
- **New:** 6 regression tests (BUG-3 parity, BUG-4 coverage/no-downgrade/ordering,
  isolation, history-through-backup). **276 passed, 0 failed**, deterministic over 3 runs.
- **Build/lint:** no build step or lint config exists; `npm test` is the full gate.

**Files changed:** `js/database/structured-db.js` (+34/−8), `qa/smoke.js` (+138/−0),
this document.

**Intentionally untouched:** `measurement-engine.js`, `projects.js`, `api-local.js`,
`backup.js`, `offline-layer.js`, all UI modules, `sw.js`, `manifest.json`, `package.json`,
`package-lock.json`.

**Not changed (per constraints):** `DB_SCHEMA_VERSION` = 3, `MIGRATION_VERSION` = 1,
`BACKUP_FORMAT_VERSION` = 8. No Multi-Elevator, no `elevatorId`, no 1:N, no picker,
no QR rework, no schema change.

---

## Final decision

### READY FOR MULTI-ELEVATOR

History preservation is now consistent across **all** paths that remove a project
reference. Normal delete and recovery/repair produce equivalent, understandable
historical outcomes; repair coverage provably matches verification coverage, closing an
unrecoverable-boot failure mode. Every project-owned record survives deletion with
context, project isolation holds, archive state persists across restore, and legacy
`archivedProjects` data is never lost.

The `PROJECT_OWNED` constant is also the natural seam for the upcoming migration: it is
the single authoritative list of collections that will need an `elevatorId` alongside
`projectId`.
