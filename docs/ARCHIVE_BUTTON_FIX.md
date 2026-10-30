# ARCHIVE BUTTON FIX

Date: 2026-08-25 · Target: `main` @ `924cfd5` · Suite: `qa/archive.js` (part of `npm test`)

---

## 1. Reproduction steps

The only "بایگانی / Archive" button in the app lives inside the **permanently-delete
confirmation modal** of a project (`js/modules/projects.js`, `deleteProject()`), shown
when the project has linked history (services, measurements, invoices …):

1. Open any project's detail page (`/projects/:id`).
2. Click 🗑️ **حذف دائمی** (Delete) → the impact modal opens and shows
   📦 **بایگانی پروژه / Archive** next to the destructive action.
3. Click **Archive**.
4. Observed on a real device/browser: *nothing visibly happens.* The confirmation
   dialog ("بایگانی پروژه … ادامه؟") never becomes visible; the project stays in
   the active list. No error, no toast.

Reproduced and root-caused in jsdom by replaying the exact **real-browser history
event ordering** (a queued `history.back()` landing as `popstate` on the task after
the click — jsdom's own lenient timing hides this by default; see the replay script
technique preserved in `qa/archive.js` TEST 1c/1d).

## 2. Root cause

A close-then-reopen modal race between the UI layer's history bookkeeping
(`js/core/app-core.js`) and the Archive button's inline handler:

The button ran `closeModal();archiveProject(id)`:

1. `closeModal()` → `popTaggedLayer('modal')` → increments the compensating
   counter `_ignorePop = 1` and **queues an async `history.back()`** (per the HTML
   spec the traversal fires `popstate` on a later task).
2. `archiveProject()` → `confirmDialog()` → `openModal()` paints the confirmation
   dialog and calls `pushUiLayer('modal', …)`. Because the layer stack is
   momentarily empty, `pushUiLayer` executes its "stale counter" reset
   (`if (uiStack.length === 0) _ignorePop = 0;`) — **discarding the compensation
   from step 1** — and pushes a new history entry.
3. The pending `history.back()` traversal lands → `popstate` arrives with
   `_ignorePop === 0` → the popstate handler treats it as a hardware-back press,
   pops the freshly pushed modal layer and calls `layer.close()` →
   **the confirmation dialog is destroyed within milliseconds of being painted**
   (often inside the same frame, so the user literally never sees it).

Net user experience: click Archive → flash → nothing. The archive API is never
reached because the confirmation is killed before the user can accept it.

Proof replay (pre-fix, emulated real-browser ordering):

```
delete modal open: true
after closeModal: _ignorePop=1 back-queued, uiStack=0
after archiveProject: _ignorePop=0 uiStack=1 | confirm dialog painted: true
popstate (pending back) lands → {open:false, stack:0}   ← dialog killed
```

## 3. Broken layer

**UI event → modal/history layer**, not the data layer:

- Button binding: intact (inline `onclick`, correct project **id**, not an index).
- Handler `archiveProject()`: intact (calls the existing verified API
  `PUT /projects/:id {archived:true, archivedAt}`).
- Data layer / persistence: intact (previously verified in Phase 2B.0;
  re-verified here).
- **Broken: the `closeModal();` prefix on the button's `onclick`** which raced the
  queued `history.back()` popstate against the immediately reopened dialog.

## 4. Fix

Smallest possible change — remove the close-then-reopen anti-pattern so the
confirmation dialog **replaces the open modal in place** (`openModal()` already
supports this: when a modal is open it swaps the DOM without pushing a new UI-layer
or history entry, so no `back()` is ever queued and no `popstate` can arrive):

- `js/modules/projects.js` — Archive button: `onclick="closeModal();archiveProject(id)"`
  → `onclick="archiveProject(id)"`, plus a guard comment on `archiveProject()`
  documenting why callers must not precede it with `closeModal()`.
- `js/router.js` — the **only other occurrence of the identical pattern** in the
  codebase (backup-nag button `closeModal();openBackupModal()` → `openBackupModal()`),
  same root cause, same one-line remedy; matches the app's own convention already
  used at `js/modules/settings.js` (`onclick="openBackupModal()"`).

No changes to: `archiveProject()` logic, the archive API, the data layer, schema,
confirmations, or the modal system itself.

Post-fix proof replay:

```
button onclick attr: archiveProject('…')
history.back() calls during click: 0
after click: confirm dialog painted: true
one task later: {open:true, stack:1, backCalls:0}       ← dialog survives
hardware-back popstate → {open:false, stack:0}          ← back button still works
```

## 5. Files changed

| File | Change |
|---|---|
| `js/modules/projects.js` | remove `closeModal();` prefix on Archive button; add guard comment |
| `js/router.js` | remove identical `closeModal();` prefix on backup-nag button |
| `qa/archive.js` | NEW — 28-check archive regression suite |
| `package.json` | wire `qa/archive.js` into `npm test` (+ `npm run test:archive`) |

## 6. Tests added

`qa/archive.js` drives the **real UI** (jsdom): real route navigation, real button
clicks from the rendered DOM, real API → IndexedDB path (fake-indexeddb), plus a
fresh second app instance sharing the same database for the reload test.

- TEST 1a–1e — click Archive → handler runs, confirm dialog appears;
  **root-cause regression: zero `history.back()` queued during the click**;
  dialog survives the task tick (real-browser popstate ordering); hardware-back
  still closes the dialog.
- TEST 2a–2d — API succeeds → `archived === true` + `archivedAt` persisted
  (verified on a **cloned** aggregate read — durable, not a shared reference),
  in-memory state follows, success toast visible.
- TEST 3a — UI refresh without reload: project disappears from the active list.
- TEST 4a–4d — **reload** (fresh app boot on the same DB): still archived,
  timestamp preserved, sibling untouched.
- TEST 5 — archived project appears in the archived view (status filter).
- TEST 6 — forced API failure → visible error toast, no false success, no state change.
- TEST 7a–7b — cancel confirmation → project completely unchanged.
- TEST 8a–8d — rapid/double clicks → one dialog, one record, no duplicates,
  no timestamp corruption, ui-layer bookkeeping balanced.
- TEST 9 — historical data (service + issue) still linked and intact.
- TEST 10 — archiving project A leaves project B completely unchanged.
- STEP 12 checks — data-layer unarchive/re-archive still behave (no UI added).
- window/jsdom error guards.

## 7. Test results

| Suite | Before | After |
|---|---|---|
| `qa/smoke.js` | 290 passed / 0 failed | 290 passed / 0 failed |
| `qa/perf.js` | 20 passed / 0 failed | 20 passed / 0 failed |
| `qa/migration.js` | 30 passed / 0 failed | 30 passed / 0 failed |
| `qa/archive.js` (new) | — | **28 passed / 0 failed** |
| **TOTAL (`npm test`)** | **340 / 0** | **368 / 0** |

## 8. Persistence verification

`archived: true` + `archivedAt` verified through the real API → structured layer →
IndexedDB path on a **cloned aggregate** (`STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)))`),
i.e. the flag lives in the database itself, not in a shared object reference.
A second app instance booted on the same IndexedDB (true reload simulation)
still reads the project as archived, with the identical `archivedAt`.
Phase 2B.0 invariants re-pass in the untouched suites (archive persistence,
clone-independence, edit-does-not-clear-flags, repeat-archive, backup round-trip).

## 9. UI verification

Through real clicks: active project list no longer shows the archived project
**without a reload**; the archived filter shows it there; success toast appears;
cancel leaves everything unchanged; failure shows an error toast (SUCCESS /
ERROR / CANCELLED are visibly distinct); hardware back button still closes the
dialog.

## 10. Remaining limitations

- `pushUiLayer()`'s `_ignorePop` reset remains a footgun if anyone reintroduces a
  `closeModal();open…()` sequence elsewhere. The guard comment on
  `archiveProject()` documents this; `qa/archive.js` TEST 1c would catch a
  regression on the Archive path.
- Unarchive still has **no UI button** (pre-existing, documented in Phase 2A);
  the data-layer behavior is verified intact.
- The jsdom environment cannot execute a real Chromium history engine; the race is
  covered by replaying the spec-mandated event ordering (queued `back()` →
  `popstate` on the next task) rather than by a real browser.
- Version constants untouched: `APP_VERSION 29.1.2`, `DB_SCHEMA_VERSION 3`,
  `BACKUP_FORMAT_VERSION 8`, `CACHE_VERSION zlift-pwa-v36`.
- Multi-Elevator (Phase 2B.2) work intentionally **not** touched.
