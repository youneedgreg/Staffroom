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
