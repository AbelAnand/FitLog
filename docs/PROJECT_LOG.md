# FitLog project log

A record of what was done between 28 and 29 September 2026 to take FitLog from a personal online
app to an App Store candidate, why each decision was made, what has been verified, and what is
still open. Written so that someone starting fresh can continue without the conversation it came from.

For day-to-day rules of the codebase see [`CLAUDE.md`](../CLAUDE.md). For submission steps see
[`docs/app-store/README.md`](app-store/README.md).

## Where things stand

| Area | State |
|---|---|
| App | Stores everything on the iPhone. No server, no accounts, no network requests. |
| Owner's phone | Running this build, holding the owner's real log. |
| Tests | 67 unit tests pass. `tsc` and `oxlint` report no errors. iOS release build succeeds. |
| Public site | Written in `site/`. **Not live** until this work is merged into `main`. |
| Privacy policy | A draft exists at `site/privacy.html`. The owner intends to have it written properly in a separate session. See "For whoever writes the privacy policy" below. |
| App Store | Not submitted. No App Store Connect record exists yet. |
| Old server | Supabase project still running on purpose, still holding the owner's data as a safety net. |

## Decisions, in order

1. **Publish to the App Store, free forever.** No ads, no subscription. Making money is not a goal.
2. **Treat it as a professional product.** Problems found in review are fixed and tested in the same pass, not listed and left.
3. **Remove the server entirely.** Data lives on the phone; export and import cover switching phones. This followed a security review: with no backend there is nothing to attack, nothing to pay for, and nothing to collect.
4. **Drop the web app.** The GitHub Pages address becomes plain pages: overview, how-to guide, privacy policy, support.
5. **Add motion.** Every action should have a transition, without costing much battery or processing.
6. **Declined:** a rest timer. **Undecided:** a Face ID lock on opening the app.

## What was done

### 1. Responsiveness

The original complaint was that taps often did nothing and had to be repeated.

- **Cause of the lost taps.** A global handler dismissed the keyboard the moment a finger touched anything that was not a text field. Dismissing the keyboard resizes the web view, so by the time the finger lifted, the button had moved and the tap landed elsewhere. A second handler did the same on the slightest finger movement inside a sheet.
- **Fix.** A press on a control leaves the keyboard alone until the click has been delivered. Dragging more than a short distance still puts the keyboard away. (`src/main.tsx`)
- **Cause of the lag.** Adding an exercise waited for up to four network requests before showing anything, and every logged set re-downloaded the whole history.
- **Fix.** Every change is applied to the screen first and saved afterwards, in order. (`src/api/mutations.ts`, `src/api/optimistic.ts`, `src/api/queue.ts`)
- **Confirmed by the owner on his phone:** taps register and the app "feels much more responsive".

### 2. Visual fixes

- **PR badge.** It was first clipped by the swipe-to-delete wrapper, then, once unclipped, hung over the edge of the field with the border showing through. It is now a solid tab in the top-right corner inside the weight field, with a gold outline on the field. Beside a long number it shows only the crown. Checked at the widest and narrowest iPhone widths. (`PrBadge` in `src/components/ui.tsx`)
- **Status bar.** Scrolled content showed through behind the clock on tab screens. A fixed backdrop now covers that strip. (`TabLayout` in `src/App.tsx`)

### 3. On-device storage

- **Database.** `LocalDb` holds the log in memory and mirrors it to storage. Reads are instant. A failed save reloads memory from storage so the screen never shows something that was not kept. (`src/db/db.ts`)
- **iPhone storage.** A small Swift plugin writes a SQLite file at `Library/Application Support/FitLog/fitlog.sqlite`. Each batch of changes is one transaction, with write-ahead logging and full sync, so a saved change survives a crash or a dead battery. The location is included in iPhone backups. (`ios/App/App/LocalStorePlugin.swift`)
- **Input cleaning.** Every record is checked and clamped on the way in, whether it comes from storage, the app, or a restored file. A restored file is treated as untrusted. (`src/db/clean.ts`)
- **Removed:** sign-in, sign-up, password reset, email confirmation, account deletion, and the Supabase client.

### 4. Backup, restore, erase

In Settings, under "Your data":

- **Save a backup** writes a JSON file holding everything and hands it to the share sheet.
- **Restore from a file** reads a backup or a spreadsheet export, shows what is in it, and adds it to what is on the phone. Nothing is removed and nothing is added twice.
- **Export to CSV** makes a spreadsheet with one row per set. Text that a spreadsheet would run as a formula is neutralised.
- **Erase everything** removes the whole log after typing a confirmation word.
- **Home** shows a reminder when there is something to lose and the last backup is over a month old.

**Same workout, two files.** A workout restored from a spreadsheet and the same workout in a backup have different ids. The restore recognises them as the same by day, title and sets. A backup replaces the spreadsheet copy with its fuller one; a spreadsheet leaves a fuller copy alone. This was found when the owner restored from his spreadsheet export and the full backup would have doubled his workouts.

### 5. Motion

| Action | Response |
|---|---|
| Pressing a control | It gives slightly |
| Opening a workout | Slides in from the right |
| Switching tabs | Eases up and fades in; the tab icon bounces |
| Going back | A quick fade |
| Adding a set or exercise | Eases into place |
| Deleting a set or exercise | Closes up, then is removed |
| A new personal record | The badge pops in, with a success vibration |
| Opening Home | The weekly progress bar fills |

Rules that keep it cheap, enforced by `src/__tests__/motion.test.ts`: only `transform` and `opacity` are animated, nothing loops, nothing exceeds about half a second, no animation library, and everything is switched off by Reduce Motion. Sheets are drawn at the top of the document so a screen that is still moving cannot drag them.

### 6. Public site

`site/` holds five plain pages and replaces the old web app at the same address:

| Page | Address once live |
|---|---|
| Overview | https://abelanand.github.io/FitLog/ |
| How to use | https://abelanand.github.io/FitLog/guide.html |
| Privacy policy | https://abelanand.github.io/FitLog/privacy.html |
| Support | https://abelanand.github.io/FitLog/support.html |

`site/sw.js` removes the service worker the old web app installed in visitors' browsers. The workflow in `.github/workflows/deploy.yml` runs the tests and a build, then publishes `site/`.

### 7. App Store preparation

- Privacy manifests for the app and the widget, declaring no tracking and no collected data.
- Listing text, reviewer notes, privacy answers and a phone checklist in `docs/app-store/README.md`.
- Five screenshots at 1320 × 2868 in `docs/app-store/screenshots/`, showing example data only.
- Project settings already correct: version 1.0, build 1, iPhone only, portrait, no export-compliance prompt.
- Simulator test hooks compile into debug builds only.

### 8. Work on the old server, now retired

Done on 28 September before the decision to remove the server. It remains applied to the Supabase project and recorded in `supabase/`, but the app no longer uses any of it.

- Ownership enforced by the database, per-account limits, size limits, tighter permissions, and a repeatable attack script (`supabase/tests/security.sql`).
- An account deletion function.
- `scripts/export-from-server.mjs` (`npm run export:server`) downloads an account's data from that server as a backup file the app can restore.

## What has been verified, and how

| Claim | How it was checked |
|---|---|
| Logic for records, streaks, units, saving, backup and restore | 67 unit tests |
| A hostile backup file cannot inject oversized or malformed values | Unit test with a deliberately malicious file |
| Data survives quitting and reopening | iOS simulator, reading the SQLite file directly |
| Data survives installing an update | Simulator, and on the owner's phone by fingerprint before and after |
| The owner's full backup restores completely | Fingerprint match against the server, in tests and in the simulator |
| The app makes no network requests | Counted in a browser session; release bundle scanned for hosts, keys and server code |
| The release build contains no test tools | Bundle scanned before every install |
| Works in the scaled window on iPad | iPad simulator |
| Motion runs only where intended | Browser, reading the running animations |

## Not yet verified

These need a real phone and have not been confirmed:

- Saving a backup through the share sheet.
- Choosing a file through the iOS file picker.
- The Home Screen widget after the rewrite.
- Reminder permission prompts after the rewrite.

## Open items

| Item | Who |
|---|---|
| Finalise the privacy policy | Next session |
| Decide whether a contact email is published, and which | Owner |
| Merge into `main`, which publishes the site | Owner, after the policy is final |
| Run the phone checklist in `docs/app-store/README.md` section 6 | Owner |
| Create the App Store Connect record, archive, upload | Owner |
| Check the name "FitLog" is available on the App Store | Owner |
| Pause or delete the Supabase project | Owner, only once his log is safely in the app and backed up from there |
| Face ID lock on opening the app | Undecided |

## For whoever writes the privacy policy

A draft is at `site/privacy.html`, dated 29 September 2026. Whatever replaces it must stay true to
what the app does. These are the facts, each checked against the code and the release build.

**Collection**

- The developer collects nothing. The app has no server and makes no network requests.
- There are no accounts, no analytics, no advertising, no tracking, and no third-party SDKs that send data anywhere.
- The App Store privacy answer is "Data Not Collected". `PrivacyInfo.xcprivacy` declares the same.

**What is stored, all of it on the device**

| Data | Where | In a backup file |
|---|---|---|
| Workouts, exercises, sets, notes, plans, session timing | SQLite file in the app's private storage | Yes |
| Units and weekly goal | Same file | Yes |
| Theme and reminder settings | iOS preferences for the app | No |
| Streak summary for the widget | App group shared by the app and its widget | No |

**Permissions and device features**

- Notifications: asked for only when the user switches a reminder on. Reminders are local.
- Not used: Apple Health, location, contacts, photos, camera, microphone, advertising identifier.
- Required-reason API: user defaults, for the app's own settings and the widget's app group.

**Copies outside the app, all made by the user**

- iPhone backups to iCloud or a computer include the log. Apple makes and protects those.
- Backup and spreadsheet files go wherever the user sends them through the share sheet. They are not encrypted by the app.

**Deletion and retention**

- One item: swipe to delete. Everything: Settings, Erase everything. Deleting the app deletes the log.
- The developer holds no copy, so there is nothing for the developer to delete or hand over.

**The website**

- Plain pages, no cookies, forms or scripts that collect anything. Hosted by GitHub Pages, which receives visitors' IP addresses like any host.
- Support is through the public GitHub issue tracker.

**Things to decide before it is final**

- Whether to publish a contact email. None is published at present. The draft points to the issue tracker.
- The developer's name as it should appear. The draft says "Abel Anand". The App Store will show the legal name on the Apple Developer account.
- Apple requires the policy to say what is collected, how it is used, who it is shared with, how long it is kept, and how a user can have it deleted. With nothing collected, each answer is short, but each should still be stated.

**If the app ever changes** so that data leaves the device, the policy, the privacy manifest, the App Store answers and `site/guide.html` must all change with it.

## How to continue

```bash
npm install
npm test               # 67 tests
npm run dev            # the app in a browser, storing to the browser
npm run build:ios      # production bundle into ios/
```

The pages in `site/` are plain HTML and can be opened directly in a browser.

## 2026-10-05 and 2026-10-06

- Fixed: a long last-session hint (drop sets) widened the exercise card past the screen; iOS shrank the page and zoomed on every focused field. The card list grid now allows shrinking (`minmax(0, 1fr)`), and `shrink-to-fit=no` is in the viewport meta.
- Repeat last / Base it on last now copy the exercises only, one empty set each, with last time's matching set as ghost text in empty fields. Abel's reason: rows must always equal sets done.
- Finished workouts and plans open for editing with an explicit Save; leaving asks Save or Discard (`src/api/hold.ts`, `BackGesturePlugin.swift` turns the edge swipe off while unsaved). Live sessions still save as they go.
- Pre-release test pass (simulator, driven through the web view; results written to Documents): home, start, repeat, add exercise, sets of every type, drop rows, duplicate, copy down, delete, quick fill, use last session, notes, title and date edits, remove exercise, finish, resume, pause, session sheet, delete workout, plans and check-off, history, progress (strength and cardio), units and conversions, goal, themes, backup and CSV restore, hostile files, erase, relaunch persistence, long-press menus, custom exercise delete, empty-workout cleanup, backup reminder. Findings fixed: the exercise picker showed raw dates ("Last: 2026-10-06"); gym reminders defaulted to on, so the first workout start asked for notification permission; the daily-reminder sync touched the notifications plugin at every launch.
- Simulator gotcha: an unanswered notification permission dialog survives uninstall and reappears on every install of the bundle id; erase the simulator to clear it.
- Not testable in the simulator, left for the phone: swipe gestures (rows, sheets, calendar), keyboard with real taps, share sheet for backup and CSV, notification permission and delivery, widget, edge swipe-back while unsaved.
- 2026-10-06, from Abel's phone test: dragging a sheet down to dismiss made it jump back to the top before sliding out (the slide-out keyframe started from zero). Closing now transitions from the current position. The widget drew edge to edge with system margins disabled and was clipped; margins are back. New: a Start workout widget (Home Screen tile, Lock Screen circular and rectangular) and, on iOS 18+, a Start workout control for the Lock Screen corners and Control Center (`StartWorkoutIntent` opens `fitlog://start`). The widget target is now a `WidgetBundle`; the streak widget keeps its kind so placed widgets survive.

