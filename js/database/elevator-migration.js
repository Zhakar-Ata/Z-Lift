/* ================= MULTI-ELEVATOR DATA MODEL + MIGRATION ENGINE =================
   Phase 2B.1 — Data-layer foundation for Multi-Elevator support.

   This module implements:
   1. The canonical Elevator model (fields, invariants)
   2. A deterministic, idempotent migration from 1:1 Project→Elevator
   3. Collection ownership definitions (elevator-owned vs project-level)
   4. Relationship validation (cross-project isolation)
   5. Migration state tracking (not-started / in-progress / completed / failed)

   DESIGN PRINCIPLES:
   - Data safety is paramount: no guessing, no silent deletion, no ID changes
   - Legacy elevator.id = project.id (deterministic, QR-compatible)
   - Migration is idempotent: running it N times produces the same result
   - Existing project-level elevator spec fields remain as compatibility mirror
   - Standalone records (projectId='') remain standalone (elevatorId='')

   MIGRATION ALGORITHM:
   FOR EACH project:
     1. Validate project record
     2. elevatorId = project.id (legacy identity preservation)
     3. Create elevator record from project spec fields
     4. Stamp elevatorId on elevator-owned child records
     5. Validate all relationships
     6. Record completion only after validation

   The migration uses a dedicated metadata key ('elevator-migration') so it
   does not interfere with the existing localStorage→IndexedDB migration
   (MIGRATION_VERSION remains unchanged). */

/* ---- ELEVATOR MODEL ---- */
/* The elevator specification fields that are copied from the project into
   the canonical elevator record. These mirror the project fields that the
   existing UI reads. The project keeps its copies for backward compatibility. */
var ELEVATOR_SPEC_FIELDS = [
  'elevatorType', 'capacityKg', 'persons', 'floors', 'stops', 'speed',
  'nominalVoltage', 'voltageTolerance', 'controller', 'motor', 'drive',
  'doorOperator', 'roping', 'encoder', 'brake', 'serviceIntervalDays'
];

/* Build a canonical Elevator record from a project. The elevator id equals
   the project id for legacy data (deterministic, QR-compatible, idempotent). */
function buildElevatorFromProject(project) {
  if (!project || typeof project !== 'object' || !project.id) return null;
  const elevator = {
    id: project.id,
    projectId: project.id,
    name: String(project.name || ''),
    number: 1,
    createdAt: +project.createdAt || Date.now(),
    updatedAt: +project.updatedAt || Date.now()
  };
  ELEVATOR_SPEC_FIELDS.forEach(f => {
    if (project[f] !== undefined) elevator[f] = project[f];
  });
  /* Archive status mirrors the project: an archived project produces an
     archived elevator. Do not invent a different archive policy. */
  if (project.archived) {
    elevator.archived = true;
    elevator.archivedAt = +project.archivedAt || +project.updatedAt || Date.now();
  } else {
    elevator.archived = false;
  }
  return elevator;
}

/* ---- COLLECTION OWNERSHIP ----
   Single source of truth for which collections are elevator-owned. This same
   definition drives migration, validation, and future deletion/backup logic.
   Never create separate lists in different modules — the drift that caused
   P2A BUG-4 and P2B.0 BUG-2.

   ELEVATOR_OWNED: collections where each record belongs to a specific elevator.
   After migration, records in these collections carry elevatorId.

   PROJECT_LEVEL: collections that remain project-scoped (no elevatorId needed).
   These may reference a project but not a specific elevator within it.

   GLOBAL: collections with no project/elevator ownership (e.g. inventory). */
var ELEVATOR_OWNED_COLLECTIONS = [
  'services', 'measurements', 'diagSessions', 'checklists', 'issues', 'safetyLogs'
];

var PROJECT_LEVEL_COLLECTIONS = [
  'contracts', 'invoices', 'reminders', 'photos', 'calcSaves', 'notes', 'tools'
];

/* Global collections have no project/elevator ownership */
var GLOBAL_COLLECTIONS = ['parts', 'users'];

/* ---- ELEVATOR MIGRATION ENGINE ---- */
var ELEVATOR_MIGRATION_KEY = 'elevator-migration';
var ELEVATOR_MIGRATION_VERSION = 1;

/* Check if the elevator migration has already completed. */
async function elevatorMigrationStatus() {
  try {
    if (typeof STRUCTURED_DB === 'undefined' || STRUCTURED_DB.status().mode !== 'indexedDB') {
      return { status: 'not-started', mode: 'non-indexeddb' };
    }
    const meta = await STRUCTURED_DB.readMeta(ELEVATOR_MIGRATION_KEY);
    if (!meta) return { status: 'not-started' };
    return meta;
  } catch (e) {
    return { status: 'unknown', error: String(e && e.message || e) };
  }
}

/* Core migration logic applied to an in-memory aggregate. Pure function:
   takes a db aggregate, returns { db, changed, report }.
   Idempotent: running on an already-migrated aggregate produces changed=false.

   IMPORTANT: This function NEVER deletes records, NEVER changes record IDs,
   NEVER modifies historical timestamps. It only ADDS elevatorId fields and
   creates elevator records. */
function migrateElevatorsInAggregate(db) {
  if (!db || typeof db !== 'object') return { db, changed: false, report: { error: 'invalid-db' } };
  const report = {
    projectsProcessed: 0,
    elevatorsCreated: 0,
    elevatorsExisting: 0,
    recordsStamped: {},
    recordsSkippedStandalone: {},
    validationErrors: [],
    projectsWithIssues: []
  };
  let changed = false;
  const projects = Array.isArray(db.projects) ? db.projects : [];
  if (!Array.isArray(db.elevators)) { db.elevators = []; changed = true; }

  /* Phase 1: Create elevator records for each project */
  const elevatorMap = new Map();
  db.elevators.forEach(e => { if (e && e.id) elevatorMap.set(e.id, e); });

  projects.forEach(project => {
    if (!project || !project.id) {
      report.projectsWithIssues.push({ id: null, issue: 'invalid-project' });
      return;
    }
    report.projectsProcessed++;

    if (elevatorMap.has(project.id)) {
      /* Elevator already exists with id = projectId. Verify it's correct.
         Idempotent: don't recreate, don't overwrite. */
      report.elevatorsExisting++;
      const existing = elevatorMap.get(project.id);
      if (existing.projectId !== project.id) {
        report.validationErrors.push('elevator-projectId-mismatch:' + existing.id);
      }
    } else {
      /* Create new elevator record from project */
      const elevator = buildElevatorFromProject(project);
      if (!elevator) {
        report.projectsWithIssues.push({ id: project.id, issue: 'build-failed' });
        return;
      }
      db.elevators.push(elevator);
      elevatorMap.set(elevator.id, elevator);
      report.elevatorsCreated++;
      changed = true;
    }
  });

  /* Phase 2: Stamp elevatorId on elevator-owned child records */
  ELEVATOR_OWNED_COLLECTIONS.forEach(collName => {
    const coll = Array.isArray(db[collName]) ? db[collName] : [];
    let stamped = 0, skipped = 0;
    coll.forEach(rec => {
      if (!rec || typeof rec !== 'object') return;
      /* STANDALONE records (projectId = '') MUST remain standalone.
         Do not assign them to the project's only elevator merely because
         there is currently only one. Historical ownership must be based
         on evidence, not assumption. */
      if (!rec.projectId || rec.projectId === '') {
        /* Ensure elevatorId is also empty for standalone records */
        if (rec.elevatorId === undefined) { rec.elevatorId = ''; changed = true; }
        skipped++;
        return;
      }
      /* Record has a projectId. Check if an elevator exists for it. */
      const elevatorId = rec.projectId; // legacy: elevatorId = projectId
      if (!elevatorMap.has(elevatorId)) {
        /* Dangling project reference — record points to a project that no
           longer exists. Do NOT assign to a different elevator. Leave as-is
           with empty elevatorId. The existing repairProjectRefs should have
           already handled this by detaching projectId. */
        if (rec.elevatorId === undefined) { rec.elevatorId = ''; changed = true; }
        skipped++;
        return;
      }
      /* Valid project reference. Stamp elevatorId if not already present. */
      if (!rec.elevatorId || rec.elevatorId === '') {
        rec.elevatorId = elevatorId;
        changed = true;
        stamped++;
      } else if (rec.elevatorId !== elevatorId) {
        /* Cross-project conflict: record's elevatorId doesn't match its
           projectId's elevator. This is invalid state — report but don't
           silently "fix" it. */
        report.validationErrors.push('cross-project:' + collName + ':' + rec.id +
          ':projectId=' + rec.projectId + ',elevatorId=' + rec.elevatorId);
      }
      /* If rec.elevatorId already equals elevatorId — idempotent, no change needed */
    });
    report.recordsStamped[collName] = stamped;
    report.recordsSkippedStandalone[collName] = skipped;
  });

  return { db, changed, report };
}

/* Validate elevator relationships in an aggregate. Returns { ok, errors, warnings }.
   This is the canonical relationship validator for the multi-elevator model. */
function validateElevatorRelationships(db) {
  const errors = [];
  const warnings = [];
  if (!db || typeof db !== 'object') return { ok: false, errors: ['invalid-db'], warnings };

  const projectIds = new Set((Array.isArray(db.projects) ? db.projects : []).map(p => p && p.id).filter(Boolean));
  const elevators = Array.isArray(db.elevators) ? db.elevators : [];
  const elevatorMap = new Map();

  /* Validate elevators */
  elevators.forEach(e => {
    if (!e || !e.id) { errors.push('elevator:missing-id'); return; }
    if (elevatorMap.has(e.id)) { errors.push('elevator:duplicate-id:' + e.id); return; }
    elevatorMap.set(e.id, e);
    if (!e.projectId) { errors.push('elevator:missing-projectId:' + e.id); return; }
    if (!projectIds.has(e.projectId)) { errors.push('elevator:dangling-projectId:' + e.id); }
  });

  /* Validate elevator-owned records */
  ELEVATOR_OWNED_COLLECTIONS.forEach(collName => {
    const coll = Array.isArray(db[collName]) ? db[collName] : [];
    coll.forEach(rec => {
      if (!rec || typeof rec !== 'object' || !rec.id) return;
      /* If record has elevatorId, it must reference a valid elevator
         whose projectId matches the record's projectId */
      if (rec.elevatorId && rec.elevatorId !== '') {
        const elevator = elevatorMap.get(rec.elevatorId);
        if (!elevator) {
          warnings.push(collName + ':dangling-elevatorId:' + rec.id);
        } else if (rec.projectId && rec.projectId !== elevator.projectId) {
          /* CROSS-PROJECT VIOLATION: record's projectId doesn't match
             its elevator's projectId. This is invalid state. */
          errors.push('cross-project:' + collName + ':' + rec.id +
            ':projectId=' + rec.projectId + ',elevator.projectId=' + elevator.projectId);
        }
      }
      /* If record has projectId but no elevatorId, it may be a pre-migration
         record or a standalone record. Warn but don't error. */
      if (rec.projectId && rec.projectId !== '' && (!rec.elevatorId || rec.elevatorId === '')) {
        /* Check if project exists — if so, migration should have stamped elevatorId */
        if (projectIds.has(rec.projectId) && elevatorMap.has(rec.projectId)) {
          warnings.push(collName + ':missing-elevatorId:' + rec.id);
        }
      }
    });
  });

  return { ok: errors.length === 0, errors, warnings };
}

/* Run the full elevator migration on the live aggregate. This is the main
   entry point called during boot or manually.
   
   SAFETY: The migration:
   - Never deletes any record
   - Never changes any record ID
   - Never modifies historical timestamps
   - Is fully idempotent
   - Validates before marking complete
   - Uses IndexedDB transactions for atomicity where possible */
async function runElevatorMigration() {
  /* Check if already completed */
  const status = await elevatorMigrationStatus();
  if (status.status === 'completed' && +status.version === ELEVATOR_MIGRATION_VERSION) {
    return { alreadyComplete: true, status };
  }

  /* Read the current aggregate */
  if (typeof _lsDB === 'undefined' || !_lsDB) {
    if (typeof _lsLoad === 'function') _lsLoad();
    if (typeof _lsDB === 'undefined' || !_lsDB) {
      return { error: 'no-aggregate', status };
    }
  }

  const db = _lsDB;
  const startedAt = Date.now();

  /* Record in-progress state */
  const migrationRecord = {
    key: ELEVATOR_MIGRATION_KEY,
    version: ELEVATOR_MIGRATION_VERSION,
    status: 'in-progress',
    startedAt,
    completedAt: null,
    verifiedAt: null
  };

  try {
    if (typeof STRUCTURED_DB !== 'undefined' && STRUCTURED_DB.status().mode === 'indexedDB') {
      await STRUCTURED_DB.writeMeta(migrationRecord);
    }

    /* Run the migration */
    const result = migrateElevatorsInAggregate(db);

    if (result.report.validationErrors.length > 0) {
      /* Critical validation errors — stop and report */
      migrationRecord.status = 'failed';
      migrationRecord.errors = result.report.validationErrors;
      migrationRecord.completedAt = Date.now();
      if (typeof STRUCTURED_DB !== 'undefined' && STRUCTURED_DB.status().mode === 'indexedDB') {
        await STRUCTURED_DB.writeMeta(migrationRecord);
      }
      return { error: 'validation-failed', report: result.report, status: migrationRecord };
    }

    /* Save the modified aggregate */
    if (result.changed) {
      if (typeof _lsSave === 'function') {
        await _lsSave(db);
      }
    }

    /* Validate relationships after migration */
    const validation = validateElevatorRelationships(db);
    if (!validation.ok) {
      migrationRecord.status = 'failed';
      migrationRecord.errors = validation.errors;
      migrationRecord.warnings = validation.warnings;
      migrationRecord.completedAt = Date.now();
      if (typeof STRUCTURED_DB !== 'undefined' && STRUCTURED_DB.status().mode === 'indexedDB') {
        await STRUCTURED_DB.writeMeta(migrationRecord);
      }
      return { error: 'post-migration-validation-failed', validation, status: migrationRecord };
    }

    /* Mark complete */
    migrationRecord.status = 'completed';
    migrationRecord.completedAt = Date.now();
    migrationRecord.verifiedAt = Date.now();
    migrationRecord.report = result.report;
    migrationRecord.warnings = validation.warnings;
    if (typeof STRUCTURED_DB !== 'undefined' && STRUCTURED_DB.status().mode === 'indexedDB') {
      await STRUCTURED_DB.writeMeta(migrationRecord);
    }

    return { success: true, report: result.report, validation, status: migrationRecord };
  } catch (e) {
    migrationRecord.status = 'failed';
    migrationRecord.error = String(e && e.message || e);
    migrationRecord.completedAt = Date.now();
    try {
      if (typeof STRUCTURED_DB !== 'undefined' && STRUCTURED_DB.status().mode === 'indexedDB') {
        await STRUCTURED_DB.writeMeta(migrationRecord);
      }
    } catch (e2) { /* best effort */ }
    return { error: 'migration-exception', exception: String(e && e.message || e), status: migrationRecord };
  }
}

/* ---- RELATIONSHIP HELPERS ---- */

/* Resolve an elevatorId for a given project. For legacy data, elevatorId = projectId.
   For future multi-elevator, this would look up the appropriate elevator. */
function resolveElevatorId(db, projectId, elevatorId) {
  if (elevatorId && typeof elevatorId === 'string' && elevatorId !== '') {
    /* Explicit elevatorId provided — validate it belongs to the project */
    if (Array.isArray(db.elevators)) {
      const elevator = db.elevators.find(e => e && e.id === elevatorId);
      if (elevator && elevator.projectId === projectId) return elevatorId;
    }
    /* Invalid: elevator doesn't exist or belongs to different project */
    return '';
  }
  /* No explicit elevatorId — for legacy data, use projectId as elevatorId */
  if (projectId && typeof projectId === 'string' && projectId !== '') {
    if (Array.isArray(db.elevators)) {
      const elevator = db.elevators.find(e => e && e.id === projectId && e.projectId === projectId);
      if (elevator) return projectId;
    }
    /* No elevator record yet — still return projectId for 1:1 compatibility */
    return projectId;
  }
  return '';
}

/* Get all elevators for a project */
function getProjectElevators(db, projectId) {
  if (!Array.isArray(db.elevators)) return [];
  return db.elevators.filter(e => e && e.projectId === projectId);
}

/* Get elevator by id */
function getElevator(db, elevatorId) {
  if (!Array.isArray(db.elevators) || !elevatorId) return null;
  return db.elevators.find(e => e && e.id === elevatorId) || null;
}
