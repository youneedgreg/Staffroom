# Staffroom starter

A term-end desk for class teachers. Anything about a child stays on the laptop. Only curriculum questions reach the cloud.

This is the tested starting point for the #BuildHybridAI 2026 entry. The roadmap doc says what to build on top of it, day by day.

## What is done and tested

- `src/core/guard.ts`: the roster guard. Plain code that decides whether text may leave the laptop.
- `src/core/policy.ts`: which task may run in which inference mode. Learner-data tasks are locked to the device.
- `src/core/prompts.ts`: every prompt, every JSON schema and every parser.
- `src/core/runner.ts`: the one door every inference goes through. Rules, guard, engine, ledger.
- `src/core/flows.ts`: draft a remark, sum up a group's difficulty, ask for a plan, write a parent note.
- `src/core/ledger.ts`, `groups.ts`, `batch.ts`, `curriculum.ts`, `sample.ts`.
- `src/store/store.ts`: learner data in IndexedDB. No network code.
- `src/ui/`: the Class, Reports, Privacy ledger and Self-test screens, and the status bar.
- `scripts/postbuild.mjs`: writes the service worker, so the app opens with no connection.
- 88 unit tests and 25 browser checks, all with a simulated engine.

## What is written but has never run

- `src/engine/firebase.ts`: the real Firebase AI Logic engine.
- `src/firebase/services.ts`: App Check, Remote Config, anonymous sign-in, the shared plan library.

Both are type-checked against firebase 13.3.0. They need your Firebase project and a Chrome
with the on-device model, so the first real run is yours. The Day-1 checks in the roadmap cover it.

## What is left to write

- `src/ui/SupportScreen.tsx`: the outbound preview, the plan and the parent notes. The centrepiece.
- A mark-sheet photo button on the Class screen (prompt, schema and parser are done).
- The shared plan library on the Support screen.
- An About page, the README for the submission, and visual polish.

## Commands

```bash
npm install
npm run dev         # http://localhost:5173
npm test            # 88 unit tests
npm run typecheck
npm run build       # type-check, build, write sw.js
npm run e2e         # build, then 25 browser checks in headless Chrome
npm run preview     # serve dist/ on http://localhost:4173
```

`npm run e2e` uses the Chrome installed on your computer. If it cannot find it:

```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run e2e
```

## Two engines

With no `.env.local`, or with `?engine=demo` in the address, the app uses a simulated engine and says so
in a yellow banner. It calls no model. It exists so the screens and the routing can be tested anywhere.

- `?engine=demo&device=unavailable` pretends the browser has no on-device model.
- `?engine=demo&offline=1` pretends the cloud cannot be reached.
- `?engine=demo&policy=strict` turns on the strict school policy.

Copy `.env.example` to `.env.local` and fill it in to use the real engine.

## The rule, and where it is enforced

1. `policy.ts`, `resolveMode`: a task that touches learner data resolves to `only_on_device` under every setting.
2. `runner.ts`: a cloud-capable request must carry an outbound message, the prompt must equal the checked text,
   and the roster guard must pass, or the engine is never called.
3. `runner.ts`: if the engine reports a cloud run for an on-device-only request, the result is thrown away and logged.
4. `engine/firebase.ts`: an on-device-only model is created with no cloud settings at all.
5. `store/store.ts`: the only file that reads learner data has no network code.

## Data

`src/core/sample.ts` is an invented class of 30. Every name, number and note is made up.
Never put real learners into a demo, a screenshot or the video.

## AI assistance

This starter was written with Claude (Anthropic) on 16 Nov 2026, inside the hackathon's submission period.
Say so in the submission.

## Licence

Apache 2.0. See `LICENSE`.
