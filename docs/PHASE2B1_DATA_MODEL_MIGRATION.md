# Phase 2B.1: Multi-Elevator Data Model & Migration Engine

## Executive Summary

Phase 2B.1 implements the **data-layer foundation** for Multi-Elevator support in Z-Lift. This phase transforms the existing 1:1 Project-Elevator model into a 1:N Project-Elevators model while maintaining **100% backward compatibility** with existing data, UI, and workflows.

**Key Achievements:**
- ✅ All 340 tests passing (310 baseline + 30 new migration tests)
- ✅ Zero data loss, zero data corruption
- ✅ Deterministic, idempotent migration engine
- ✅ Cross-project isolation enforced
- ✅ Backup/restore compatibility maintained
- ✅ QR code compatibility preserved
- ✅ No UI changes (1:1 UI continues to work)
- ✅ measurement-engine.js untouched

---

## 1. Current Data Model (Pre-Phase 2B.1)

```
Project (id: P1)
├── elevatorType: 'traction'
├── capacityKg: 630
├── floors: 10
├── ... (elevator specs embedded in project)
│
├── Services[]
│   └── projectId: P1
├── Measurements[]
│   └── projectId: P1
└── ... (all child records reference project directly)
```

**Limitation:** Each project implicitly represents exactly one elevator. The elevator specification fields are embedded directly in the project record.

---

## 2. Target Data Model (Post-Phase 2B.1)

```
Project (id: P1)
├── name: 'Building A'
├── customer: 'Client X'
├── location: 'Tehran'
├── ... (project-level metadata)
│
├── Elevators[]
│   ├── Elevator (id: E1, projectId: P1)
│   │   ├── name: 'Main Elevator'
│   │   ├── elevatorType: 'traction'
│   │   ├── capacityKg: 630
│   │   ├── floors: 10
│   │   └── ... (elevator specs)
│   │
│   ├── Elevator (id: E2, projectId: P1)
│   │   └── ... (future: second elevator in same building)
│   │
│   └── ...
│
├── Services[]
│   └── projectId: P1, elevatorId: E1
├── Measurements[]
│   └── projectId: P1, elevatorId: E1
└── ... (child records now reference specific elevator)
```

**Key Design Decisions:**
1. **Elevator ID Strategy:** For existing 1:1 projects, `elevator.id = project.id` (deterministic, QR-compatible)
2. **Backward Compatibility:** Project-level elevator fields remain as a "compatibility mirror"
3. **Collection Ownership:** Not all collections get `elevatorId` (see Section 4)

---

## 3. Elevator Model

### 3.1 Elevator Record Structure

```javascript
{
  id: 'string',              // Primary key (legacy: equals projectId)
  projectId: 'string',       // Foreign key to Project
  
  // Elevator specifications (copied from project)
  name: 'string',
  number: 1,                 // Display order (future use)
  elevatorType: 'traction' | 'hydraulic',
  capacityKg: number,
  persons: number,
  floors: number,
  stops: number,
  speed: number,
  nominalVoltage: number,
  voltageTolerance: number,
  controller: 'string',
  motor: 'string',
  drive: 'string',
  doorOperator: 'string',
  roping: 'string',
  encoder: 'string',
  brake: 'string',
  serviceIntervalDays: number,
  
  // Status
  archived: boolean,
  archivedAt: number,
  
  // Timestamps
  createdAt: number,
  updatedAt: number
}
```

### 3.2 Elevator Invariants

1. **One-to-Many:** A Project can have multiple Elevators
2. **Ownership:** An Elevator belongs to exactly one Project
3. **Identity:** `elevator.id` is stable and never changes
4. **Legacy ID:** For migrated data, `elevator.id === project.id`
5. **Future ID:** New elevators use `_lsUid()` generator

---

## 4. Collection Ownership Matrix

### 4.1 Elevator-Owned Collections

These collections now include `elevatorId` on each record:

| Collection | Description | Example |
|------------|-------------|---------|
| `services` | Maintenance/repair records | Service report for Elevator A |
| `measurements` | Technical measurements | Voltage reading on Elevator B |
| `diagSessions` | Diagnostic sessions | Fault diagnosis for Elevator A |
| `checklists` | Inspection checklists | Safety checklist for Elevator B |
| `issues` | Reported issues | Door problem on Elevator A |
| `safetyLogs` | Safety incident logs | Emergency stop on Elevator B |

**Migration Behavior:**
- Records with `projectId` → stamped with `elevatorId = projectId`
- Standalone records (`projectId: ''`) → remain standalone (`elevatorId: ''`)
- Dangling references → `elevatorId: ''` (no guessing)

### 4.2 Project-Level Collections

These collections remain project-scoped (no `elevatorId`):

| Collection | Description | Rationale |
|------------|-------------|-----------|
| `invoices` | Billing documents | Invoice covers entire project |
| `contracts` | Service contracts | Contract covers all elevators |
| `reminders` | Scheduled reminders | Reminder for project, not specific elevator |
| `photos` | Photo gallery | Photos may show multiple elevators |
| `calcSaves` | Saved calculations | Calculations often span elevators |
| `notes` | Project notes | Notes about building/project |
| `tools` | Tool inventory | Tools not elevator-specific |

### 4.3 Global Collections

These collections have no project/elevator ownership:

| Collection | Description |
|------------|-------------|
| `parts` | Parts inventory (global) |
| `users` | User accounts (global) |

**Special Case:** `parts.history[]` contains nested `projectId` references. These remain project-level (no `elevatorId` on nested refs) per Phase 2B.0 BUG-2 fix.

---

## 5. Migration Algorithm

### 5.1 High-Level Flow

```
FOR EACH project in database:
  1. Validate project record
  2. Determine elevator ID:
     - Legacy: elevator.id = project.id
     - Future: elevator.id = generateUid()
  3. Check if elevator already exists:
     - YES: Verify projectId matches, skip creation
     - NO: Create elevator record from project specs
  4. Stamp elevatorId on elevator-owned child records:
     - FOR EACH record in elevator-owned collections:
       - IF record.projectId exists AND matches project:
         - Set record.elevatorId = elevator.id
       - ELSE:
         - Leave elevatorId empty (standalone/dangling)
  5. Validate all relationships
  6. Record migration completion
```

### 5.2 Idempotency Strategy

The migration is **fully idempotent**:

```javascript
// First run: creates elevators, stamps records
migrateElevatorsInAggregate(db);  // changed: true

// Second run: recognizes existing elevators, skips already-stamped records
migrateElevatorsInAggregate(db);  // changed: false

// Result: identical database state
```

**Idempotency Guarantees:**
- Existing elevators are recognized (not duplicated)
- Already-stamped records are skipped (no double-stamping)
- Timestamps are never modified
- Record IDs are never changed

### 5.3 Recovery Strategy

**Scenario 1: Migration interrupted mid-way**
- Next boot detects incomplete migration (via `elevator-migration` metadata)
- Migration resumes from where it left off
- Idempotency ensures no duplicate work

**Scenario 2: IndexedDB transaction failure**
- Phase 2B.0 BUG-3 fix ensures atomic rollback
- Previous database state is preserved
- Migration can be retried safely

**Scenario 3: Corrupted project record**
- Migration skips invalid projects (logged in report)
- Valid projects are migrated normally
- User is notified of skipped projects

---

## 6. Relationship Invariants

### 6.1 Elevator → Project

```
elevator.projectId MUST reference an existing project
```

**Validation:** `verifyAggregate()` throws `structured-relation:elevator-dangling:{id}` if violated.

### 6.2 Record → Elevator (Elevator-Owned Collections)

```
record.projectId MUST reference an existing project
record.elevatorId MUST reference an existing elevator
elevator.projectId MUST equal record.projectId
```

**Cross-Project Violation Example:**
```javascript
// INVALID: Service in Project A references Elevator from Project B
{
  id: 'svc-123',
  projectId: 'P1',        // Project A
  elevatorId: 'E2'        // Elevator in Project B
}
```

**Validation:** `verifyAggregate()` throws `structured-relation:cross-project:{collection}:{id}` if violated.

### 6.3 Standalone Records

```
IF record.projectId === '' THEN record.elevatorId === ''
```

**Rationale:** Standalone records (no project) cannot belong to an elevator. Migration never assigns standalone records to a project's only elevator.

---

## 7. Backup Behavior

### 7.1 Backup Format (v8)

**No changes to backup format.** The backup file does NOT include the `elevators` collection because:
1. Elevators are derived from projects (deterministic)
2. Reduces backup file size
3. Simplifies restore logic

### 7.2 Export Process

```javascript
// api-local.js /backup GET
const backup = {
  app: 'zlift',
  version: BACKUP_FORMAT_VERSION,  // 8
  projects: db.projects,
  services: db.services,
  measurements: db.measurements,
  // ... (all collections except elevators)
};
```

### 7.3 Restore Process

```javascript
// api-local.js /backup PUT
const candidate = JSON.parse(JSON.stringify(backup));
candidate.elevators = [];  // Clear any stale elevators
// ... (stage other collections)
await _lsSave(candidate);  // writeAggregate auto-derives elevators from projects
await runElevatorMigration();  // Stamps elevatorId on child records
```

### 7.4 Round-Trip Verification

**Test Case 18:** Pre-migration backup (no elevators in backup)
- Restore → Migration runs → Elevators created → Records stamped ✅

**Test Case 19:** Post-migration backup (elevators not in backup format)
- Export → Restore → Migration runs → Elevators recreated → Records stamped ✅

**Result:** Backup/restore is fully compatible with Phase 2B.1.

---

## 8. Archive Behavior

### 8.1 Archived Projects

When a project is archived (`project.archived = true`):
- Migration creates an **archived elevator** (`elevator.archived = true`)
- `elevator.archivedAt` is copied from `project.archivedAt`
- Child records remain attached (not archived separately)

### 8.2 Unarchiving

When a project is unarchived:
- Project `archived = false`
- Elevator `archived = false` (via project edit API)
- Child records remain attached

### 8.3 Invariant

```
project.archived === elevator.archived (for 1:1 legacy elevators)
```

---

## 9. Delete Behavior

### 9.1 Project Deletion

When a project is deleted:

1. **Detach child records** (stamp with `projectInfo`, clear `projectId`)
2. **Clear elevatorId** on elevator-owned records for this project
3. **Delete elevator records** where `elevator.projectId === project.id`
4. **Remove project** from `projects` collection

### 9.2 Cross-Project Isolation

**CRITICAL:** Deleting Project A must NEVER affect Project B.

**Test Case:**
```javascript
// Setup: Project A and Project B, each with services/measurements
// Action: Delete Project A
// Verify:
//   - Project B exists ✅
//   - Project B's elevator exists ✅
//   - Project B's services have projectId: 'pB', elevatorId: 'pB' ✅
//   - Project A's services have projectId: '', elevatorId: '' ✅
```

### 9.3 Elevator Deletion (Future)

When a specific elevator is deleted (future Phase 2B.2+):
- Detach child records for that elevator
- Clear `elevatorId` on those records
- Remove elevator record
- Project and other elevators remain intact

---

## 10. Compatibility Strategy

### 10.1 UI Compatibility (1:1 Mode)

**Current State:** The UI continues to operate in 1:1 mode.

**How it works:**
1. User opens Project A
2. UI reads `project.elevatorType`, `project.capacityKg`, etc. (compatibility mirror)
3. UI queries services with `projectId: A`
4. Services have `elevatorId: A` (stamped by migration)
5. UI displays services normally (doesn't filter by elevatorId yet)

**Future State (Phase 2B.2+):**
1. User opens Project A
2. UI shows elevator selector (if multiple elevators)
3. User selects Elevator A1
4. UI queries services with `projectId: A, elevatorId: A1`
5. UI displays only Elevator A1's services

### 10.2 API Compatibility

**Existing API endpoints continue to work:**

```javascript
// GET /projects/:id
// Returns: project + services (filtered by projectId)
// Note: services now have elevatorId, but API doesn't filter by it yet

// POST /services
// Body: { projectId: 'P1', ... }
// Note: API doesn't set elevatorId yet (future: will set to default elevator)
```

### 10.3 QR Code Compatibility

**Legacy QR codes** encode `project.id`.

**Migration:** `elevator.id = project.id` for legacy data.

**Result:** QR code for Project P1 resolves to Elevator P1 (same ID) ✅

**Future QR codes** (Phase 2B.2+) may encode `elevator.id` directly.

---

## 11. Test Matrix

### 11.1 Migration Test Cases

| Case | Scenario | Result |
|------|----------|--------|
| 1 | Empty database | ✅ No changes |
| 2 | Single normal project | ✅ Elevator created |
| 3 | Multiple projects | ✅ Multiple elevators created |
| 4 | Archived project | ✅ Archived elevator created |
| 5 | Project with services | ✅ Services stamped |
| 6 | Project with measurements | ✅ Measurements stamped |
| 7 | Project with diagnostics | ✅ Diagnostics stamped |
| 8 | Project with checklists | ✅ Checklists stamped |
| 9 | Project with safety logs | ✅ Safety logs stamped |
| 10 | Project with invoices | ✅ Invoices remain project-level |
| 11 | Project with contracts | ✅ Contracts remain project-level |
| 12 | Standalone service | ✅ Remains standalone |
| 13 | Nested parts history | ✅ Remains project-level |
| 14 | Dangling project reference | ✅ Empty elevatorId (no guessing) |
| 15 | Existing elevator present | ✅ Recognized, not duplicated |
| 16 | Migration executed twice | ✅ Idempotent (no changes on 2nd run) |
| 17 | Migration after partial progress | ✅ Completes missing work |
| 18 | Backup restored before migration | ✅ Migration runs after restore |
| 19 | Backup exported after migration | ✅ Round-trip successful |
| 20 | Cross-project isolation | ✅ A records → A elevator, B records → B elevator |

### 11.2 Relationship Validation Tests

| Test | Scenario | Result |
|------|----------|--------|
| Valid relationships | All refs valid | ✅ Passes validation |
| Cross-project violation | Service in P1 refs elevator in P2 | ✅ Rejected |
| Dangling elevator | Elevator refs non-existent project | ✅ Rejected |

### 11.3 Performance Tests

| Projects | Migration Time | Validation Time |
|----------|----------------|-----------------|
| 100 | 0 ms | 0 ms |
| 500 | 1 ms | 1 ms |
| 1000 | 2 ms | 1 ms |

**Environment:** jsdom + fake-indexeddb (NOT real Android device)

**Conclusion:** Migration is O(n) and completes in milliseconds for typical datasets.

---

## 12. Files Changed

### 12.1 New Files

| File | Purpose | Lines |
|------|---------|-------|
| `js/database/elevator-migration.js` | Migration engine + validation | ~400 |
| `qa/migration.js` | Migration test suite | ~500 |
| `PHASE2B1_DATA_MODEL_MIGRATION.md` | This document | ~1000 |

### 12.2 Modified Files

| File | Changes |
|------|---------|
| `js/database/structured-db.js` | Added `elevators` to ARRAY_STORES, updated writeAggregate/verifyAggregate, exported readMeta/writeMeta |
| `js/database/api-local.js` | Updated project delete to clean up elevators, updated restore to reset elevators |
| `index.html` | Added `<script src="js/database/elevator-migration.js">` |
| `package.json` | Added `test:migration` script, updated `test` to include migration tests |

### 12.3 Untouched Files (Intentional)

| File | Reason |
|------|--------|
| `js/engineering/measurement-engine.js` | Out of scope (Phase 2B.1 is data-layer only) |
| `js/modules/*.js` | UI modules unchanged (1:1 UI continues to work) |
| `js/data/*.js` | Data constants unchanged |
| `js/core/*.js` | Core utilities unchanged |
| `js/components/*.js` | UI components unchanged |

---

## 13. Schema & Version Changes

### 13.1 Database Schema Version

```javascript
DB_SCHEMA_VERSION = 3  // UNCHANGED
```

**Rationale:** No schema changes required. The `elevators` store already exists in IndexedDB (created in Phase 2B.0).

### 13.2 Migration Version

```javascript
MIGRATION_VERSION = 1  // UNCHANGED
```

**Rationale:** This is the localStorage → IndexedDB migration version. The Multi-Elevator migration uses a separate metadata key (`elevator-migration`).

### 13.3 Backup Format Version

```javascript
BACKUP_FORMAT_VERSION = 8  // UNCHANGED
```

**Rationale:** Backup format does not include elevators (derived from projects). No format changes needed.

### 13.4 App Version

```javascript
APP_VERSION = '29.1.2'  // UNCHANGED (this is a patch-level data migration)
```

---

## 14. Remaining Limitations

### 14.1 UI Limitations (To Be Addressed in Phase 2B.2+)

1. **No Elevator Selector:** UI cannot switch between multiple elevators in a project
2. **No Elevator Management:** UI cannot create/edit/delete individual elevators
3. **No Elevator Filtering:** Services/measurements show all elevators' data (not filtered by elevatorId)
4. **No Elevator Dashboard:** Dashboard shows project-level aggregates, not per-elevator

### 14.2 API Limitations (To Be Addressed in Phase 2B.2+)

1. **Service Creation:** `POST /services` doesn't set `elevatorId` (relies on migration or future UI)
2. **Elevator CRUD:** No API endpoints for elevator management
3. **Query Filtering:** No query parameter to filter by `elevatorId`

### 14.3 Migration Limitations

1. **Single Elevator Assumption:** Migration creates exactly one elevator per project (legacy 1:1 model)
2. **No Elevator Splitting:** Cannot split a project's records across multiple elevators (future manual process)
3. **No Historical Context:** Migration doesn't know which elevator a historical service belongs to (all assigned to the single legacy elevator)

### 14.4 Performance Considerations

1. **Scalability:** Migration is O(n) where n = number of projects + child records
2. **Memory:** Migration loads entire database into memory (acceptable for typical datasets)
3. **Transaction Size:** Large migrations may exceed IndexedDB transaction limits (mitigated by idempotency)

---

## 15. Future Work (Phase 2B.2+)

### 15.1 Phase 2B.2: Elevator Management UI

- Elevator selector on project detail page
- Elevator CRUD (create, edit, delete)
- Elevator-specific dashboards
- Query filtering by `elevatorId`

### 15.2 Phase 2B.3: Multi-Elevator Workflows

- Elevator-specific service reports
- Elevator-specific measurements
- Elevator-specific checklists
- Elevator-specific analytics

### 15.3 Phase 2B.4: Advanced Features

- Elevator comparison (side-by-side)
- Elevator history timeline
- Elevator transfer (move to different project)
- Elevator archival (independent of project)

---

## 16. Test Results

### 16.1 Baseline (Pre-Phase 2B.1)

```
smoke.js:  290 passed, 0 failed
perf.js:    20 passed, 0 failed
TOTAL:     310 passed, 0 failed
```

### 16.2 Final (Post-Phase 2B.1)

```
smoke.js:      290 passed, 0 failed
perf.js:        20 passed, 0 failed
migration.js:   30 passed, 0 failed
TOTAL:         340 passed, 0 failed
```

### 16.3 New Tests Added

| Category | Count |
|----------|-------|
| Migration test cases | 20 |
| Relationship validation | 2 |
| Performance tests | 3 |
| Backup compatibility | 2 |
| Data integrity | 2 |
| QR compatibility | 1 |
| **Total** | **30** |

### 16.4 Test Coverage

- ✅ Empty database
- ✅ Single project
- ✅ Multiple projects
- ✅ Archived projects
- ✅ All elevator-owned collections
- ✅ Project-level collections
- ✅ Standalone records
- ✅ Dangling references
- ✅ Idempotency
- ✅ Partial migration recovery
- ✅ Cross-project isolation
- ✅ Backup/restore round-trip
- ✅ Data count preservation
- ✅ Record ID preservation
- ✅ Timestamp preservation
- ✅ QR compatibility
- ✅ Archive behavior
- ✅ Delete safety
- ✅ Performance at scale (100, 500, 1000 projects)

---

## 17. Conclusion

Phase 2B.1 successfully implements the **data-layer foundation** for Multi-Elevator support in Z-Lift. The migration engine is:

- ✅ **Deterministic:** Same input → same output
- ✅ **Idempotent:** Safe to run multiple times
- ✅ **Recoverable:** Resumes from interruption
- ✅ **Validated:** All relationships verified
- ✅ **Compatible:** Backup/restore works
- ✅ **Safe:** Zero data loss, zero corruption
- ✅ **Tested:** 340 tests passing

The UI continues to operate in 1:1 mode, but the data model now supports 1:N Project-Elevators relationships. Phase 2B.2+ will build the UI layer on top of this solid foundation.

**Status:** ✅ **READY FOR PHASE 2B.2**
