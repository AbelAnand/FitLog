# SplitLog: marketing and growth plan

Written 2026-10-08, one day after launch. Companion to [SPLITLOG.md](SPLITLOG.md), which holds every fact about the app. This file holds what to do about it. Update the checklists as things get done; add dates.

## The honest starting position

- The app is good and the story is unusual: free, no account, no server, no ads, built by one person who uses it daily, source public. That story is the marketing. Nobody else in the category can say all of it.
- There is no budget, no audience yet, and one person's spare time. Everything below is chosen to fit that.
- There are no in-app analytics and there never will be ("Data Not Collected" is the promise). The only numbers available are App Store Connect's: impressions, product page views, downloads, deletions, conversion rate. That is enough to learn what works, as long as every push outside the app uses a link you can tell apart (see "Measure" below).
- "Free forever" rules out some standard tactics (paid tiers, referral credits, affiliate deals inside the app) and makes others easier (nothing to upsell, so people trust the recommendation).

## Positioning

**Category:** workout log / lifting tracker.
**Against:** Strong, Hevy, Fitbod, JEFIT, Apple Fitness, the Notes app, a paper notebook.
**Line:** *A workout log that stays on your iPhone. Free, no account, no ads.*
**Proof points, in the order that lands best in a 15-second clip:**

1. Open the app. There is no sign-up screen. Start logging. (Show it.)
2. Type a weight that beats your best; the PR badge pops. (Show it.)
3. Airplane mode on; everything still works. (Show it.)
4. Settings: Save a backup, it is one file, you own it. (Show it.)
5. The App Store privacy label: Data Not Collected. (Screenshot.)

The audience that converts first is people who are already annoyed: at a subscription, at a login wall, at an app that got worse. Speak to them directly.

## Phase 0: before any post goes out (this week)

Fixes that make every later effort count. None takes more than an hour.

- [ ] **Put the App Store link on the site.** `site/index.html` has no download button. Add an official "Download on the App Store" badge above the fold, linking to https://apps.apple.com/us/app/splitlog-workout-tracker/id6820002186. Add the same link to the footer of guide, privacy and support.
- [ ] **Merge pull request #3 and upload 1.0.1 (build 2)** so the links inside the app and the live site agree. Version 1.0, the one people are downloading today, has Settings links that point at the dead /FitLog/ address.
- [ ] **Reserve the handles** now, even before posting: `splitlogapp` (or `splitlog.app`) on Instagram, TikTok, YouTube, X, Threads. Same name everywhere.
- [ ] **A brand email.** Support currently goes to a tester address. Set up something like splitlog@ (any domain you own, or a Gmail named for the app) and move the support form and App Store contact to it.
- [ ] **Campaign links.** Make a short link per channel (a free redirect: Bitly, or a path on the site such as `/ig`, `/li`, `/yt` that meta-refreshes to the App Store). App Store Connect shows product page views by referrer only roughly, so the redirect counts are your real channel numbers.
- [ ] **A press kit folder on the site**: `site/press/` with the icon at 1024, the five screenshots, a one-paragraph description and a two-line bio, all from SPLITLOG.md. Journalists and gym owners will ask; have it ready.
- [ ] **Ask for ratings in the app at the right moment.** `SKStoreReviewController` through Capacitor, prompted once, after the user's third finished workout, never at launch. Ratings move App Store ranking more than anything else you control. (This is a code change; it adds no network calls of your own.)
- [ ] **Screenshots with captions.** The current listing screenshots are clean captures. Add a short caption strip to each ("No account. No ads.", "PRs flagged as you lift", "Works without signal"). Most downloads come from the first two screenshots, not the description.

## Phase 1: launch posts (weeks 1 and 2)

### LinkedIn (your own account)

One post, written as a maker's story, not an advert. LinkedIn rewards a first-person build story with a point of view; it ignores "excited to announce".

Structure that works:

1. Hook, one line: the decision. "I deleted the server from my fitness app and it became the product."
2. Three short paragraphs: what you wanted (log lifts, no subscription), what you found (every tracker is a login screen and a paywall), what you did (built it, used it daily for months, removed the backend after a security review).
3. One honest limitation (iPhone only for now).
4. The link in the first comment, and once in the post body (LinkedIn down-ranks external links less than it used to; test both).
5. One image: the three-barbell icon beside a single screenshot, or a 20-second screen recording.

Follow-ups, one a week for a month: how the PR badge works; the backup-file design (why a JSON file beats a cloud account); the motion rules (every animation under half a second, nothing loops); what you deliberately left out. Each is a real engineering or product decision, which is what your LinkedIn audience will read.

Ask five people you know to comment in the first hour. Early comments decide reach.

### Instagram and TikTok (the app's account)

Same content on both; TikTok reaches strangers, Instagram keeps them. Post the vertical video first on TikTok and Reels, then a carousel of the same points on Instagram.

Account setup: bio = the one-line pitch + the campaign link; highlights = "How it works", "Privacy", "PRs"; profile picture = the icon.

What to post, in this order:

1. **The no-sign-up clip** (7 to 10 seconds). Thumb opens the app, taps Push, adds Bench, types 185 × 5. Text on screen: "No account. No ads. Free." Nothing else.
2. **The PR clip**. A real set, a real number, the badge pops, the haptic (fake the sound with a tap). "It tells you the moment you beat your best."
3. **Airplane mode clip**. Toggle it on in Control Center, log a set. "Works in a basement gym."
4. **The backup clip**. Settings, Save a backup, Files, one JSON. "Your data is a file you own. Not an account you rent."
5. **Six themes** in a fast cut.
6. **Repeat last** and ghost numbers: the design reasoning (rows always equal sets done) is a good caption.
7. **Year view**: a full year of training days lit up. People love this one; it is a screenshot they will want of their own.
8. **"What I left out"**: rest timer, social feed, programs. Caption explains why.

Record on your own phone with iOS screen recording, crop to 9:16, add captions (most people watch muted). Keep every clip under 15 seconds; make the first frame the app, never a title card. Post three a week for the first month, then two.

Hashtags that match the audience: #workoutlog #liftingapp #pushpulllegs #gymprogress #strengthtraining #iosapp #indiedev #privacy. Keep it to five or six.

### Reddit and forums (one post each, no repeats)

These bring the most downloads per hour spent for an app like this, and they punish anything that smells like an advert. Post once per community, be present in the comments for a day, and link the source code when asked.

- r/iosapps, r/apple (the weekly self-promo thread), r/iphone
- r/privacy and r/degoogle (the "no server, no account" story is exactly their thing)
- r/Fitness (only in the weekly "app" or "gear" threads; the main sub removes app posts), r/GYM, r/naturalbodybuilding, r/StrongCurves
- r/SideProject, r/reactnative is not right (it is Capacitor), but r/webdev and r/ionic will care how it was built
- Hacker News "Show HN: SplitLog, a workout log with no server" is a good fit. Post at 8 to 9 am ET on a weekday. Have the technical answers ready (why Capacitor, why SQLite through a Swift plugin, how restore avoids duplicates).

### Product Hunt

Worth one launch, and the privacy story gives it a hook. Prepare: tagline, five screenshots, a 30-second video, a first comment with the story, and ten people lined up to upvote and comment in the first hour. Launch on a Tuesday or Wednesday, 12:01 am PT.

### Directories and lists

Free listings that bring a slow trickle for years: AlternativeTo (add SplitLog as an alternative to Strong and Hevy), Privacy-focused app lists (PrivacyTools, the r/privacy wiki), GitHub awesome lists for open-source iOS apps and for fitness. Ask to be included in roundups of "no-subscription" fitness apps on sites like MacStories, 9to5Mac and iMore; send the press kit and one sentence.

## Phase 2: content that compounds (months 1 to 3)

The launch burst fades in two weeks. What keeps bringing people after that is content that answers a question people search.

- **A changelog on the site.** Every release gets a short entry. It shows the app is alive, which is the first thing people check.
- **Guide pages that rank.** The guide is already thorough. Split out pages that match searches: "how to log a drop set", "push pull legs log template", "workout tracker without account", "move workout data to a new iPhone". Plain HTML, same site.
- **Weekly "what I lifted" post** from your own log. Honest, small, consistent. Over months it becomes the proof that the maker uses the thing.
- **Reply to every review** on the App Store. It is public and future readers see it.
- **Collect quotes.** Every nice review or DM goes into `docs/marketing/quotes.md` with permission to use it. Three good quotes on the site landing page do more than any feature list.

## Phase 3: gyms (from month 2)

Important: with no server, SplitLog cannot offer a gym a dashboard, member counts, or a branded account. That is a strength in the pitch (nothing for the gym to administer or be liable for) but it limits what a "partnership" is. What a gym can realistically get:

1. **A recommended app for their members**, with a poster and a QR code by the squat rack. Gyms get asked "what app should I use" constantly and most have no answer. You give them one that is free and has no catch, so recommending it costs them nothing and risks nothing.
2. **Plan files.** A gym or a coach builds a workout plan in SplitLog, saves a backup file containing only plans, and hands it to members (link, QR, AirDrop). Restore merges it in. This works today with no code change. A small code change could make it cleaner: "Share this plan" exporting a plan-only file, and a `fitlog://` link that opens a shared file directly.
3. **Custom exercise libraries** for a gym's machines, the same way.
4. **A theme named for the gym** is cheap and memorable if a gym is keen.

Who to approach first: independent gyms and powerlifting / strength clubs, not chains. The owner answers the email, the members already log their lifts, and "no account" matters to people who lift in a garage-style gym. Start with the gym you train at.

The ask, in one email: "Free app, nothing to sign, no data collected from your members, here is a poster and a QR code, would you put it up?" Offer to build their standard beginner plan as a file.

Materials to make: an A4 and a letter-size poster (icon, one line, QR), a one-page PDF for owners, a plan-file how-to.

## Phase 4: brands and coaches (from month 3, only once there are numbers)

The same constraint applies: nothing inside the app can carry a brand, a link, or an offer. "No ads, ever" has to stay literally true or the whole story collapses. So partnerships live outside the app:

- **Coaches and online trainers**: the plan-file idea again. A coach sends clients a SplitLog plan file instead of a spreadsheet. The coach's value is the programming; SplitLog is the logbook. This is the most natural fit and costs nothing.
- **Equipment and apparel brands**: co-marketing only. They post the app, you post their product in your own training clips. No money needs to change hands. Approach small barbell, belt and chalk brands whose customers are exactly your users.
- **Privacy-minded brands** (VPNs, password managers, privacy phones) sometimes feature apps that match their values. Worth a cold email with the press kit once there are a few thousand downloads.
- **YouTube lifters with 10k to 100k subscribers.** A free app with no affiliate deal is an easy mention for them because there is nothing to disclose. Send the app, ask for nothing, and tell them the backup-file story.

Do not accept: paid placement inside the app, data-sharing of any kind, bundles with a subscription product, "Pro" features sponsored by a brand.

## Measure

Check App Store Connect every Monday and write the numbers into `docs/marketing/numbers.md`: impressions, product page views, downloads, conversion rate, deletions, ratings count and average, by country. Beside them, the redirect counts per channel. After a month you will know which channel is worth the time; after three, you will know whether the app grows on its own (word of mouth shows as downloads with no matching channel spike).

Targets for the first 90 days, chosen to be humbling rather than impressive: 1,000 downloads, 30 ratings at 4.5 or better, one gym poster up, one coach sending plan files.

## Do we need a database and accounts to scale?

Asked 2026-10-08. No. More users cost nothing: every phone stores and computes its own log. A server is the thing that makes growth cost money. Add one only for a feature that needs it, and take the cheapest step that gives that feature.

| Step | Gives | Costs | Privacy story |
|---|---|---|---|
| **Local only** (today) | Nothing to run, works offline, free at any scale | Lost phone with no backup file = lost log | "Data Not Collected" |
| **iCloud sync (CloudKit)**, opt-in, off by default | Two iPhones in sync; recovery after a lost phone; no login screen; Abel cannot read anyone's data | Apple only; a few weeks of work; policy must say data goes to the user's iCloud when enabled | Still nothing collected by Abel |
| **Own backend with auth** (Supabase or similar) | Cross-platform sync, web access, coach and social features | Monthly bill, account deletion rules, Sign in with Apple, GDPR duties, breach liability, support load; the "no server" sentence is gone | Label becomes data linked to you, unless end-to-end encrypted with a device-held key |

Rule: the device stays the source of truth and sync is always opt-in. Nobody is migrated. Turning sync on uploads the local log once and merges by id, the way restore already does.

Before any sync layer, add three things to the data model (and bump the backup format): `updated_at` on every row, deletion markers, and a conflict rule (last write wins per row).

Decision: no backend for growth. CloudKit if reviews ask for sync. Own backend only if Android ships and people want both, or if coach features become the product.

## Voice, cloud costs, and selling things

Asked 2026-10-08.

**Voice logging.** Build the on-device version first: Apple's Speech framework transcribes on the phone, a small parser handles "bench 185 for 5" / "add set" / "next exercise", and the on-device Foundation Models framework (iOS 26) covers odd phrasings. No server, no cost per use, no abuse surface, every promise intact. A cloud model is only worth it for conversation ("how did my squat go this month"), not dictation.

**If a cloud model is ever used, in this order:**

1. Prepaid API credits with auto-reload off or capped; a monthly spend limit on the workspace; a budget alert with automatic shutdown on the proxy host. The balance is the worst case.
2. The API key lives only on a small proxy server, never in the app bundle.
3. App Attest on every request so only the genuine app on a real device gets through.
4. Quotas: per attested device per day, per IP, global daily cap, a kill switch.
5. Cheap and bounded requests: transcribe on the device, send short text, cap input and output tokens, use a small model.

This adds a server, a bill and a privacy-policy change ("voice text leaves the phone"), so it must be paid for by the people using it (see below).

**Selling things.** "No ads, ever" and "free forever" are in SPLITLOG.md and in this plan because that was the September decision. Decide before publishing that sentence. Options, cleanest first:

| Option | Keeps "free, no ads"? | Apple rules |
|---|---|---|
| Brand deals outside the app (sponsored posts, gear in training clips) | Yes | None |
| Tip jar: one-time "Support SplitLog" purchase | Yes | In-App Purchase |
| Paid add-on that covers its own server cost (cloud voice) | Yes for everything else | In-App Purchase subscription |
| Shop or affiliate links inside the app | No; becomes "no ads in your log" with a separate tab | Physical goods: outside checkout allowed, no cut. Digital goods (programs): must be In-App Purchase |

Recommendation: the first two now; the third only if cloud voice ships; the fourth not in the first year.

## Scaling the product

These are the changes that widen who can use SplitLog, roughly in the order of downloads they would bring per week of work. Abel is keeping his own list of ideas; merge it in here.

| Change | What it unlocks | Fits the promise? | Effort |
|---|---|---|---|
| **Rating prompt** after the third workout | App Store ranking | Yes | Hours |
| **Share a workout as a file + text** | Done 2026-10-09 (1.1.0) | Yes | Done |
| **Share a PR or a year as an image** (a card drawn by the app, handed to the share sheet) | The only growth loop that works with no server: every share is a screenshot with the app's name on it | Yes: the file leaves through the share sheet, nothing is sent by the app | Days |
| **Plan-file sharing** ("Share this plan", open a shared file by link) | Gyms, coaches | Yes | Days |
| **Android** | Doubles the market. Done 2026-10-09 on the emulator (see docs/android/README.md); remaining: real device test, widget, Play Console account, keystore | Yes | Days left |
| **iPad** | Small, but App Store "iPad" filter and a bigger History view | Yes | Days |
| **Apple Watch** | Logging without taking the phone out; large demand in the category | Yes, data stays on the user's devices | Weeks |
| **Apple Health** | Writes workouts to Health; many users expect it | Yes if write-only and off by default; the privacy page must change | Days |
| **iCloud sync (CloudKit)** | Same log on two devices, survives a lost phone without a backup file | Partly: data still never reaches Abel, but it leaves the device to Apple's servers; needs a clear toggle, off by default, and a privacy-policy change | Weeks |
| **Localisation** | Most downloads outside English-speaking countries come from a localised listing; start with Spanish, German, Portuguese | Yes | Days per language |
| **Programs / templates built in** | Beginners who do not know what to do on day one | Yes | Days |
| **Face ID lock** | Asked for by privacy-minded users; undecided | Yes | Hours |
| **Rest timer** | Most-requested feature in the category; declined so far | Yes; reconsider if reviews ask | Days |
| **1RM estimate and volume charts** | Deferred earlier; lifters ask for them | Yes | Days |
| **Widget: today's plan / last workout** | More reasons to place the widget | Yes | Days |

Order I would do them in: rating prompt, share-as-image, plan-file sharing, then localisation, then Android. The first three are a week's work and each feeds the marketing above directly. Android is the big one and should wait until the iPhone numbers say people want this app.

## The one rule

Every channel, partner and feature has to be able to sit under the sentence "Your log stays on your iPhone. No account, no ads, free." If a plan needs that sentence to bend, the plan is wrong, not the sentence.
