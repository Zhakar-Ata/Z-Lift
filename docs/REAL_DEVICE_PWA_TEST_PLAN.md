# Z Lift — Manual Android PWA Lifecycle Test Plan

Date: 2026-08-24

Do not mark this checklist as passed unless it is executed on a real Android device. Static/jsdom tests cannot fully verify OS-level PWA install, storage eviction, browser update, or offline lifecycle behavior.

## Test environment

- Device model:
- Android version:
- Browser/version:
- Z Lift URL:
- App version shown in Settings:
- Tester:
- Date/time:

## Checklist

| # | Step | Expected result | PASS/FAIL | Notes |
|---|---|---|---|---|
| 1 | Install Z Lift from the browser using Add to Home screen / Install app. | PWA installs with Z Lift icon and launches standalone. |  |  |
| 2 | Open Z Lift online. | App shell loads; login works; Settings shows expected version. |  |  |
| 3 | Create test data: at least two projects, one service, one inventory item, one note and one issue. | Data saves without network/server errors. |  |  |
| 4 | Close the application completely. | App exits normally. |  |  |
| 5 | Disable Internet: airplane mode or Wi-Fi/mobile data off. | Device is offline. |  |  |
| 6 | Reopen Z Lift from installed PWA icon. | App opens offline from cache. |  |  |
| 7 | Navigate through dashboard, projects, services, measurements, diagnostics, invoices, inventory, notes, issues and settings. | Pages render without generic network errors. |  |  |
| 8 | Open a project/elevator. | Existing project/elevator data is visible. |  |  |
| 9 | Create a service while offline. | Service saves locally. |  |  |
| 10 | Add a measurement to that project/service. | Measurement saves locally and appears in the list. |  |  |
| 11 | Reload the installed PWA while still offline. | App reloads and remains usable. |  |  |
| 12 | Verify all created data remains present after reload. | Projects, service, measurement, notes/issues/inventory remain intact. |  |  |
| 13 | Export backup while offline. | A JSON file downloads with a name like `Z-Lift-Backup-YYYY-MM-DD-HH-mm.json`. |  |  |
| 14 | Re-enable Internet. | Device is online again; app remains usable. |  |  |
| 15 | Update/reload the PWA after a deployment/cache bump. | New version loads without mixed old/new module failure. |  |  |
| 16 | Verify existing data remains intact after update/reload. | All pre-update local data is still present. |  |  |
| 17 | Optional restore drill: import the exported JSON into a clean browser profile/device. | Preview appears first; restore succeeds after confirmation; counts/relationships match. |  |  |

## Required reporting language

- Automated/static verification: report the `npm test` result separately.
- Manual real-device verification: report PASS/FAIL only for steps actually executed.
- If this checklist was not executed, state: **Manual real-device verification not executed; required before production field rollout claims.**
