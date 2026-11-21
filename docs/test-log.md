# Test log

Measured numbers only. Each entry says what ran, on what, and what came out.
Every run uses the invented sample class; no real learner data.

## Thu 19 Nov 2026 — remark prompt v2 on the on-device model (check 7)

**Setup:** MacBook Air M2, 8 GB RAM, macOS 27.0. Chrome 157.0.8103.79 (stable).
Prompt API model `nano_v3_gpu_low_tier_model` (GPU route). Dev server, real Firebase engine,
`PROMPT_VERSION` 2 (code picks the strength and next step; third person; never praise a mistake in the note).

**Draft all 30 remarks** (one batch, one after another):

| Measure | Result |
|---|---|
| Remarks drafted | 30 of 30, all "On this laptop", 0 characters sent |
| Time per remark, median | 4.1 s |
| Fastest / slowest | 2.1 s / 38.0 s (the first call, cold) |
| Under 10 s | 28 of 30 (the cold first call at 38.0 s, one at 10.6 s) |
| Whole batch | about 2 min 50 s |
| Usable without editing (my reading) | 27 of 30 |
| Second person ("you", "your") | 0 of 30 |
| Operation swapped (e.g. "addition" for division) | 0 of 30 |

**The three not usable:**
- A learner whose best levels were Approaching Expectation was praised for "strong understanding". The strength wording doesn't yet allow for a best level below Meeting Expectation.
- One remark built on a mistake from the teacher's note ("building upon their ability to add the tops and bottoms of fractions").
- One contradicted the note ("working effectively both independently and collaboratively" for "slow alone").

**Weaknesses that still count as usable:** learners at the same level in every topic all get "Whole Numbers and Multiplication" and "harder problems in Whole Numbers"; positive notes are often ignored ("asks good questions", "improved a lot"); a few phrases are invented ("upcoming assessment period").

**Self-test, same session, one run each (not measurements):**

| Task | Ran | Time | Output |
|---|---|---|---|
| Report remark | On this laptop | 53.5 s | Usable |
| Group difficulty | On this laptop | 2.8 s | A complete sentence (16 words); no longer cut off mid-word |
| Remedial plan | Sent to the cloud, refused | 1.7 s | HTTP 429, grounding not on the free tier (check 9) |
| Parent note | On this laptop | 2.8 s | Opens "Dear Mr. & Mrs. Faith": the name was put in the greeting |
| Starter activity | In the cloud | 1.2 s | Usable |
| Plain-words level | On this laptop | 1.7 s | Usable |

**Check 7 (at least 24 of 30 usable, under 10 s each):** usable passes (27 of 30); speed passes when the model is warm, not for the first call or the self-test remark.

## Thu 19 Nov 2026 — no cloud fallback, offline, and no requests while remarks are written (checks 10–12)

### Check 10: a browser with no on-device model

**Setup:** Safari on the same Mac, dev server, real Firebase engine, invented sample class, self-test.

| Task | Mode | Ran | Sent |
|---|---|---|---|
| Report remark | ONLY_ON_DEVICE | Did not run: "Learner data is never sent to the cloud instead" | Nothing |
| Group difficulty | ONLY_ON_DEVICE | Did not run (same message) | Nothing |
| Parent note | ONLY_ON_DEVICE | Did not run (same message) | Nothing |
| Remedial plan | ONLY_IN_CLOUD | Sent to the cloud, refused (HTTP 429, check 9) | 758 characters |
| Starter activity | PREFER_IN_CLOUD | In the cloud | 275 characters |
| Plain-words level | PREFER_ON_DEVICE | In the cloud (no model, so the cloud was used) | 242 characters |

Ledger: **learner tasks sent to the cloud 0**, ran in the cloud 2, sent and refused 1, characters sent 1,275. App Check worked in Safari on localhost. **Pass.**

### Check 11: offline

**Setup:** Chrome, built app (`npm run build`, `npm run preview`), loaded once online, wifi off, reload.

The app opened with wifi off and a remark was written on the laptop. **Pass.**

### Check 12: no requests while remarks are written

**Setup:** Chrome, built app, wifi on, invented sample class. A `PerformanceObserver` for resource entries ran in the page for 1,235 s before "Draft all remarks" and through the batch.

| Measure | Result |
|---|---|
| Requests seen before the batch, page idle | 18: reCAPTCHA Enterprise `clr` pings (App Check), about one a minute, and the Remote Config realtime stream |
| Last idle request before the batch | about 5 min before |
| Remarks drafted | 30 of 30, about 130 s |
| Requests seen during the batch | **0** (0 to any AI endpoint) |
| Learner tasks sent to the cloud | 0 |

**Pass**, with limits: the observer doesn't see fetches made inside the service worker, Chrome's own traffic, or data on an already-open connection. A DevTools Network recording is still to be made for the video. Background pings from App Check and Remote Config happen while the app is idle, so the claim is "nothing is sent while remarks are written", not "no network at all".

## Thu 19 Nov 2026 — Day-3 gate: the nine-step loop on the real engine

**Setup:** MacBook Air M2, 8 GB RAM, Chrome 157 (stable), `nano_v3_gpu_low_tier_model`. Dev server, real Firebase engine, branch `feat/support-plan-panel`. Data wiped first, then the invented sample class loaded.
"Wifi off" was done as **DevTools → Network → Offline for the Staffroom tab only** (turning off the Mac's wifi would also cut off the tool driving the run). A test request to the AI endpoint failed while it was set.

| Step | Result |
|---|---|
| 1. Load the sample class | 30 learners |
| 3. Draft all remarks, tab offline | "Done. 30 drafted.", 30 cards "Written on this laptop", batch finished within 99 s |
| 4. Sum up, tab offline | Fractions first, 10 learners; one phrase in 3.5 s; 0 learner names, 0 numbers, 0 school words |
| 5. Tab online, "Ask the cloud" | Outbound preview showed the full question; the grounded request was refused by the cloud in 1.5 s (check 9) |
| 6. Route A | The refusal box offered "Ask without web sources"; nothing was resent until it was clicked. The plan came back with 3 activities, "Check after two weeks" and "At home", marked "No web sources", 0 sources |
| 7. Write the parent notes | 10 of 10, each "Written on this laptop", about 44 s for the batch; all 10 open "Dear parent or guardian of <first name>," |
| 8. "Kevin" in the phrase | "1 learner name"; "Ask the cloud" off with the reason |
| 9. Privacy ledger | **42** on this laptop, 1 in the cloud, 1 sent and refused, **learner tasks sent to the cloud 0**, 1,852 characters sent; both sends carry the same text, with no learner name |

**Pass**, with these differences from the spec: 42 on the laptop, not 41, because the difficulty was summed up twice (the panel lost the phrase when the tab was left, a known limit); no web sources, because grounding isn't on the free tier (Route A).

**Seen in the run (not measurements):**
- With the tab offline in DevTools, `navigator.onLine` stayed true, so the status bar said "online" and "Ask the cloud" stayed on. Turning off real wifi does change it (check 11).
- The first difficulty phrase read "Fractions often struggle with …" (the topic as the subject). The second was fine.
- Parent notes, my reading: 7 of 10 usable as written. One garbled sentence ("You are doing excellent by helping Faith practice; their work is neat!"), one dangling phrase from the teacher's note ("Often missing in class, …"), one vague ("the digits on the tops and bottoms don't match up").

## Thu 19 Nov 2026 — function 12 on the real engine (first half of the Day-4 gate)

**Setup:** same Mac and Chrome as the Day-3 gate, dev server, real Firebase engine, branch `feat/support-quick-help`, invented sample class, Fractions group. "Offline" is DevTools → Network → Offline for the tab; a test request to the AI endpoint failed while it was set. One run each, so the times are not measurements.

| Button | Mode | Tab | Ran | Time | Sent |
|---|---|---|---|---|---|
| Starter activity | PREFER_IN_CLOUD | online | In the cloud | 2.6 s | 275 characters |
| What does Approaching Expectation mean here? | PREFER_ON_DEVICE | online | On this laptop | 15.1 s (probably a cold start) | Nothing |
| Starter activity | PREFER_IN_CLOUD | offline | On this laptop | 4.6 s | Nothing |

All three answers were usable. **Gate half passes:** with no connection, "Starter activity" still answers and says "On this laptop". The other half (the strict policy published from the Remote Config console) is still to do.

## Fri 20 Nov 2026 — Remote Config school policy, changed live (second half of the Day-4 gate)

**Setup:** same Mac and Chrome as the Day-3 gate, dev server, real Firebase engine, `main` at `caa6332`, invented sample class, Support screen with the Fractions panel and "Which task runs where" open. The page was loaded once (about 06:12:43) and not reloaded during the check. `school_policy` was changed in the Firebase console and published.

| Published | Seen in the app | Status bar | Task map | "Ask the cloud" |
|---|---|---|---|---|
| Version 2, `school_policy` = `strict` | 06:18:54 | "nothing leaves this laptop" | plan "switched off"; the other six tasks `ONLY_ON_DEVICE` | off, with "Your school allows nothing to leave the laptop, so this is switched off." |
| Version 3, `school_policy` = `standard` | between 06:25:21 and 06:26:14 (the watcher timed out, so no exact second) | "curriculum questions may use the cloud" | four learner tasks `ONLY_ON_DEVICE`, plan `ONLY_IN_CLOUD`, starter `PREFER_IN_CLOUD`, plain words `PREFER_ON_DEVICE` | on |

The cloud model in the task-map caption was `gemini-3.5-flash-lite` throughout.

**Pass:** both policy changes reached the open app through Remote Config's live updates, with no reload, and the learner tasks stayed `ONLY_ON_DEVICE` under both. The delay from publishing to the app changing wasn't timed, so there is no number for it.

**Seen in the run:** under the strict policy the disabled "Ask the cloud" button still looks bright, so it reads as clickable (for the Day-7 design pass).

## Fri 20 Nov 2026 — a browser with no on-device model, on the real engine (Day-4 polish)

**Setup:** dev server, real Firebase engine, `feat/no-model-polish` (merged as PR #12), invented sample class. The browser was the Claude desktop app's built-in browser pane: Chromium 156, which has the `LanguageModel` API, but `LanguageModel.availability()` returned `unavailable`. That makes it a real browser with no model, not the simulated engine. One run each, so the times aren't measurements.

| Screen | Action | Seen |
|---|---|---|
| Status bar | Page load | "not available in this browser", plus the new line: what stops, that nothing about a child is sent instead, and that the plan, the starter activity and plain words still work through the cloud |
| Reports | Draft all remarks | "Stopped. 0 drafted." and "This browser has no on-device model, so this cannot run here. Learner data is never sent to the cloud instead." |
| Support | Sum up the difficulty | The same sentence under step 1, plus "You can type the difficulty yourself in step 2."; nothing under "Ask the cloud" |
| Support | What does Approaching Expectation mean here? (`PREFER_ON_DEVICE`) | Answered in 3.0 s; "In the cloud (this browser has no on-device model)" |
| Self-test | Run the self-test | Remark, group summary and parent note: "Did not run", "Stopped, as designed", with the sentence under the table. Starter (`PREFER_IN_CLOUD`) and plain words (`PREFER_ON_DEVICE`): in the cloud, about 1.3 s each. Plan with web sources: sent and refused (HTTP 429, the free-tier grounding limit; Route A handles this on the Support screen) |
| Privacy ledger | After all of the above | Learner tasks sent to the cloud **0**, ran on this laptop 0, ran in the cloud 3, sent and refused 1, characters sent 1,517, stopped (no on-device model) 5, failed 1 (the 429). No-model rows read "Stopped: this browser has no on-device model. Nothing was sent." |

**Pass:** with no model, all 5 learner-task runs (remarks, the group summary, a parent note) stopped and sent nothing, and the curriculum tasks still worked through the cloud.

**Not checked:** Safari and Firefox, which have no `LanguageModel` at all (Claude can only view Safari, not click in it). The engine reports `unavailable` for a missing API too, so they should look the same.

## Fri 20 Nov 2026 — Remote Config `cloud_model`, changed live (last Day-4 item)

**Setup:** my Chrome, dev server, real Firebase engine, `main` at `c392574`, invented sample class, Support screen open. The page was loaded at about 07:22:46 and not reloaded during the check. The model's name appears in each request's address (`…/models/<name>:generateContent`), which is how the model was confirmed. The ledger doesn't record the model.

| Published | Caption in "Which task runs where" | Starter activity (`PREFER_IN_CLOUD`) |
|---|---|---|
| Version 4, `cloud_model` = `gemini-3.5-flash` | Changed between 07:24:45 and 07:24:51, no reload | Request to `models/gemini-3.5-flash`, HTTP 200, answered "In the cloud" after **151.6 s**; the button showed "Working…" the whole time |
| Version 5, back to `gemini-3.5-flash-lite` | Back by 07:29:58, no reload | (the next starter, after a reload: "In the cloud", 1.8 s) |

**Pass:** a model published in Remote Config reaches the open app live, and the next cloud request uses it.

**Found:**
- One run each, so not a measurement, but the gap is large: `gemini-3.5-flash` took 151.6 s where `gemini-3.5-flash-lite` took 1.8–2.6 s. Staffroom stays on `gemini-3.5-flash-lite`.
- The app had no time limit of its own, and the SDK waits up to 180 s. Had the SDK given up, the ledger would have logged the request as "nothing sent", which is false. Fixed on `fix/cloud-timeout`: Staffroom stops waiting after 30 seconds, says so, and logs the request as sent with its exact text. Checked with the simulated engine (`&cloud=slow`) and unit tests. A real timeout on the real engine wasn't reproduced.

## Fri 20 Nov 2026 — plan library: Firestore rules on the live project, and the Day-5 gate

**Setup:** rules from PR #20 deployed to the live project (`staffroom-88e70`). Each check was a real request to Firestore as an anonymous user, or signed out where the check says so. The test document was deleted afterwards (reading it again returns 404).

| Check | Expected | Got |
|---|---|---|
| Create a correct plan (exactly the 6 allowed fields) | allowed | allowed |
| Read it while signed in | allowed | allowed |
| Read it while signed out | refused | refused (403) |
| Create while signed out | refused | refused (403) |
| Create with someone else's `uid` | refused | refused (403) |
| Create with an extra `sources` field | refused | refused (403) |
| Create with the answer missing | refused | refused (403) |
| Create with an empty question | refused | refused (403) |
| Create with a 9,000-character answer | refused | refused (403) |
| Create with `at` sent as text | refused | refused (403) |
| Update the plan | refused | refused (403) |
| Delete the plan | refused | refused (403) |
| Write to another collection | refused | refused (403) |

**Pass:** 13 of 13.

**Day-5 gate, passed:** a plan shared from my Chrome showed up in the Claude app's built-in browser, which was signed in as a different anonymous user. That plan (the sample class's Fractions plan, asked without web sources) stays in the live library as the demo example.

## Fri 20 Nov 2026 — the first deploy to `https://staffroom-88e70.web.app` (Day 6)

**Setup:** Firebase Hosting, built from `main` at `19ed1a0`. App Check uses the real reCAPTCHA Enterprise key on the live address; the debug token is for localhost only. Before deploying, the production build was checked for the debug token. It was there (fixed in PR #21, and the build now fails if it's ever found in `dist/`). After deploying, every live file was fetched: the token is in none of them.

**The Claude app's built-in browser (no on-device model), run by Claude:**
- A remark was refused because there is no on-device model, and nothing was sent.
- The starter activity ran in the cloud, so App Check with the real key works.
- The shared plan was listed, and the service worker was active.
- Learner tasks sent to the cloud: **0**. No console errors.

**My Chrome 157 (with the Claude extension, wifi on), run by Claude:**
- The model was `available` on the live address, with no download or flag prompt.
- Remarks: 30 of 30 written on the laptop. The batch took about 90 s, timed by polling the page.
- Fractions was the first group (10 learners). The difficulty phrase came out as "treating a decimal point like a remainder", which is about decimals (fixed later the same day, below).
- The preview held 0 names. The plan with web sources was refused (HTTP 429, the free-tier grounding limit). Route A gave a plan of 3 activities without web sources.
- Parent notes: 10 of 10, in about 20 s.
- Typing "Faith" into the phrase switched "Ask the cloud" off with the reason.
- Ledger: 43 rows. 41 on the laptop, 1 in the cloud, 1 refused, 1,656 characters sent, **0 learner tasks in the cloud**.
- The only console error came from a Chrome extension.

## Fri 20 Nov 2026 — the Day-6 checks I ran myself on the live site

**1. The judge's loop in Chrome incognito, wifi off for the on-device steps: passed.**
- Model ready. Remarks: 30 of 30 "Written on this laptop".
- Support, offline: Fractions first (10 learners). The phrase came out as "adding the top and bottom when adding fractions" on the first run, and "treating a decimal point like a remainder when adding fractions" on the second (the drift fixed below).
- Wifi back on: the preview held 0 names. The plan with web sources was refused, then Route A gave a plan of 3 activities marked "No web sources".
- Parent notes: 10 of 10.
- Typing "like Faith" found 1 learner name, greyed out "Ask the cloud" and said "Nothing is sent while the check fails".
- Ledger: learner tasks sent to the cloud **0**, on the laptop 41, in the cloud 1, not answered 1, 1,700 characters sent, failed 1 (the refusal).
- **Limit:** the Claude extension's icon still showed in the incognito toolbar, so this run doesn't prove "no extensions". A final run with the extension switched off is still to do.

**2. Reloading offline: passed.** Normal Chrome, wifi off, page reloaded. The app opened and said "Connection offline". The class and its 30 remarks were there. No new remark was drafted offline in this run; the incognito run covers that.

**3. Safari (no on-device model): passed.**
- The status bar said the model is not available in this browser.
- In the self-test, the 3 learner rows said "Did not run" ("Stopped, as designed").
- The plan with web sources was refused (866 ms). The starter activity ran in the cloud (1,309 ms), and so did plain words (1,084 ms).
- Learner tasks sent to the cloud: **0**.

**4. A screen recording of the Network tab while 30 remarks were written.** Recorded, but not reviewed yet, so no result here.

## Fri 20 Nov 2026 — three problems the live runs found, fixed and redeployed

**a. Shared plans opened offline (PR #22).** With wifi off, the Fractions group said "No one has shared a plan for this topic yet", though one was shared, and it still said so after wifi came back. Firestore's offline cache answered with an empty list instead of failing. The list now reads from the server only. Offline it says "Shared plans need the internet. They load when the connection comes back." and it loads on its own once the connection returns. Checked with the browser tests and against the real project online. Not yet re-run offline on the live site.

**b. A returning browser kept the old build (PR #23).** After redeploying (a), a browser that had already opened the site kept running the old script. Two causes: Hosting sent `index.html` with a one-hour cache, and the new service worker filled its cache through the browser's HTTP cache, so it stored the old page. `/` and `/index.html` are now sent as `no-cache`, and the service worker fetches its files fresh from the server. Checked live after redeploying `6893dc8`:
- both headers are `no-cache`;
- the built-in browser, stuck on the old build, switched to the new one on the 2nd reload with nothing cleared (the 1st reload installs the new service worker, as normal);
- no console errors.

My Chrome was still on the build from before (a), with the old service worker, and took 3 reloads. Browsers that already have this fix need 2.

**c. The difficulty phrase drifted to another topic (PR #24).** Each note covers the learner, not one topic. Three notes in the Fractions group also hold a decimal mistake, and the on-device model picked it in 2 of 3 live runs. The drift then carried into the plan and every parent note. Code now keeps only the sentences of each note that name the group's topic, using a short word list for each topic in the curriculum pack. Results on the real on-device model, in my Chrome:

| Where | Group | Runs | On topic | Phrases |
|---|---|---|---|---|
| Dev server | Fractions | 5 | 5 | all about adding the tops and bottoms or common denominators, for example "adding the tops and bottoms when adding fractions" |
| Dev server | Decimals | 3 | 3 | "treating a/the decimal point like/as a remainder" |
| Dev server | Multiplication | 1 | — | "nothing to sum up": its 3 notes are all about division or sharing, so the teacher types the difficulty |
| Live, after redeploying `ad5823f` | Fractions | 3 | 3 | "adding the tops and denominators, without employing a common denominator"; "adds the tops and bottoms when adding fractions"; "adding the tops and bottoms when adding fractions" |

Each phrase took about 1.3 s after the first run of a session (the first took 3.3–3.8 s). Learner tasks sent to the cloud stayed at 0, and there were no console errors. Two phrases start with "add"/"adds" rather than "adding"; the teacher can edit the phrase before it's sent.

## Fri 20 Nov 2026 — the README screenshot run

**Setup:** the live site, built from `main` at `14ed110`, in my Chrome 157 (with the Claude extension, wifi on), run by Claude. Staffroom's stored data was cleared first, then the invented sample class loaded.

- Remarks: 30 of 30 "Written on this laptop". The first 4 took about 25 s, including the cold start.
- Fractions was the first group (10 learners). The difficulty phrase: "adding the numerator and denominator without considering a common denominator", on topic, in about 4 s.
- The preview held 0 names. Adding ", like Faith" found 1 learner name and switched "Ask the cloud" off with the reason.
- The plan with web sources was refused (the free-tier grounding limit). Route A gave a plan marked "No web sources" in about 18 s.
- Parent notes: 10 of 10, in about 14 s.
- Ledger: 41 on the laptop, 1 in the cloud, 1 not answered, 1,728 characters sent, failed 1 (the refusal), **0 learner tasks in the cloud**.

## Fri 20 Nov 2026 — remarks that use the teacher's positive notes

**Why:** on the live site (prompt v3), only 6 of the 19 learners whose note holds praise ("steady, asks good questions", "neat work") had it in their remark. The model saw the whole note and mostly used the levels.

**Setup:** the dev server with the real engine, in my Chrome 157, run by Claude, the invented sample class. Each version redrafted all 30 remarks; I read every remark against its note.

| Prompt | Positive notes in the remark (of 19) | A mistake praised | "you"/"your" |
|---|---|---|---|
| v3 (live) | 6 | — | 0 |
| v4: the praise is picked out of the note by code | 14 | Faith ("adding tops and bottoms with admirable neatness") | 0 |
| v5: code also separates out the mistakes ("Something to work on (never praise it)") | **19** | none | 0 |

- v5: 30 of 30 "Written on this laptop", about 80 s for all 30. Every remark is two sentences, 43 words at most.
- Still wrong in v5, from the model: Ruth is called "he" (the prompt only says `[NAME]`, so the model guesses); Joy's remark says "numerator" where her note means the denominator; Ian's says "correct answers", which his note ("careless") contradicts. A teacher would edit these three.

## Sat 21 Nov 2026 — the nine-step loop in a Chrome Guest window

**Why:** in the 20 Nov incognito run the Claude extension's icon still showed, so a run with no extensions wasn't proven. A Guest window starts with none.

**Setup:** the live site, built from `main` at `7c9b554` (remark prompt v5), in a Chrome 157 Guest window on my MacBook Air M2. I clicked through the steps myself; Claude watched the window (view only) and read the screen after steps 1, 7, 8 and 9. The Guest toolbar showed no extension icons.

- Step 1: the invented sample class loaded (30 learners). The status bar said "On-device model: ready" at once: the Guest profile needed no model download.
- Steps 2–3: wifi off (the status bar said offline); all 30 remarks drafted on the laptop. I didn't time the batch.
- Steps 4–5: Fractions, 10 learners. The difficulty phrase: "adding the tops and denominators of fractions, not finding a common denominator", on topic. The preview held 0 learner names, 0 numbers, 0 school words.
- Step 6: the plan with web sources was refused (the free-tier grounding limit); "Ask without web sources" gave a plan with three activities, marked "No web sources".
- Step 7: 10 of 10 parent notes "Written on this laptop". Faith's note carried her positive note ("neat work").
- Step 8: ", like Faith" turned the check red ("1 learner name"), and "Ask the cloud" was greyed out. Nothing was sent.
- Step 9, the ledger: 41 on the laptop, 1 in the cloud, 1 sent and not answered, 1,732 characters sent, 0 blocked, 0 stopped, 1 failed (the refusal), **0 learner tasks in the cloud**.

## Sat 21 Nov 2026 — teachers' feedback and the layout fix

**Teachers:** four primary school teachers in Kenya tried Staffroom on the live site, on my laptop, with the invented sample class only. Three of the four got to a parent note without my help. All four said the screens were hard to use: small boxes to scroll inside, and boxes side by side that didn't line up. No quotes were taken.

**Layout check** (local script, simulated engine, 1440 px and 1280 px; Class, Reports, Support at each step, Ledger, Self-test, About). Before: 24 of 30 class notes cut off and the table scrolling sideways; 7 of 30 remark boxes and 10 of 10 parent-note boxes cut off; the three Support columns ending at 252, 771 and 958 px. After [#36](https://github.com/youneedgreg/Staffroom/pull/36): 0 cut off, 0 scrolling inside, 0 uneven rows. The Day-7 audit (92 views, light and dark, 1280 px and 640 px): 0 problems.

**Live, with real-model remarks** (my Chrome 157, the 30 remarks already stored there, nothing redrafted): on the old build (`index-DW3xHWP6.js`) 30 of 30 remark boxes cut off their text; on the new build (`index-BzkY4Hhj.js`, from `main` at `68f1ac4`) 0 of 30, and 0 uneven rows of cards.
