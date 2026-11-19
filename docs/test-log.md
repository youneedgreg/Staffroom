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
