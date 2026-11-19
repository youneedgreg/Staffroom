// Browser check with the simulated engine. It proves the routing, the screens, storage and
// offline start-up. It does NOT prove anything about a real model: no model runs here.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 4318;
const BASE = `http://localhost:${PORT}`;
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

// Uses the Chrome installed on this computer. Set CHROME_PATH if it is somewhere unusual.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' },
);

const text = (page, id) => page.textContent(`[data-testid="${id}"]`);
// Function 12: click one of the two quick-help buttons and return where it ran.
const quick = async (page, id) => {
  await page.click(`[data-testid="quick-${id}-run"]`);
  await page.waitForSelector(`[data-testid="quick-${id}-ran"]`);
  return text(page, `quick-${id}-ran`);
};

try {
  // 1. The whole loop on a laptop with an on-device model.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/?engine=demo`);
    await page.click('text=Load the invented sample class');
    check('sample class loads with 30 learners', (await page.locator('main tbody tr').count()) === 30);
    check('status bar shows the model as ready', (await text(page, 'device-status')) === 'ready');
    // The live mode table: closed until opened, one row per task.
    const modesOf = (p) => p.evaluate(() =>
      Object.fromEntries([...document.querySelectorAll('[data-testid^="task-"][data-testid$="-mode"]')]
        .map((e) => [e.dataset.testid.slice(5, -5), e.textContent])));
    check('task map: closed until opened', (await page.getAttribute('[data-testid="task-map"]', 'open')) === null);
    await page.click('[data-testid="task-map"] summary');
    check('task map: seven tasks', (await page.locator('[data-testid="task-map"] tbody tr').count()) === 7);
    const standard = await modesOf(page);
    check('task map, standard policy: the four learner tasks are ONLY_ON_DEVICE',
      ['remark', 'difficulty', 'marksheet', 'personalise'].every((t) => standard[t] === 'ONLY_ON_DEVICE'), JSON.stringify(standard));
    check('task map, standard policy: plan, starter and plain words use their own modes',
      standard.plan === 'ONLY_IN_CLOUD' && standard.lessonIdea === 'PREFER_IN_CLOUD' && standard.plainWords === 'PREFER_ON_DEVICE');
    check('task map: names the cloud model', (await text(page, 'cloud-model')).length > 0);
    await page.click('[data-testid="task-map"] summary');

    await page.click('a[href="#/reports"]');
    await page.click('text=Draft all remarks');
    await page.waitForSelector('[data-testid="batch-message"]');
    check('batch reports 30 drafted', (await text(page, 'batch-message')) === 'Done. 30 drafted.');
    check('30 of 30 written', (await text(page, 'written-count')).startsWith('30 of 30'));
    const first = await page.inputValue('textarea >> nth=0');
    check('first remark has the first name filled in', first.startsWith('Amani has worked well in'), first);
    check('every card says it was written on this laptop', (await page.locator('.badge:has-text("Written on this laptop")').count()) === 30);

    await page.click('text=Draft all remarks');
    await page.waitForFunction(() => document.querySelector('[data-testid="batch-message"]')?.textContent?.includes('up to date'));
    check('second run skips all 30', (await text(page, 'batch-message')) === 'Done. 0 drafted, 30 already up to date.');

    await page.fill('textarea >> nth=1', 'Faith is careful and neat. Next term we will work on adding fractions.');
    await page.click('a[href="#/ledger"]');
    await page.waitForSelector('[data-testid="tile-on-device"]');
    check('ledger: 30 on-device runs', (await text(page, 'tile-on-device')) === '30');
    check('ledger: 0 cloud runs', (await text(page, 'tile-in-cloud')) === '0');
    check('ledger: 0 characters sent', (await text(page, 'tile-chars')) === '0');
    check('ledger: 0 learner tasks in the cloud', (await text(page, 'tile-learner-cloud')) === '0');

    await page.click('a[href="#/support"]');
    await page.waitForSelector('[data-testid="groups"] li');
    const groups = await page.locator('[data-testid="groups"] li').allTextContents();
    check('support lists the fractions group first', groups[0]?.startsWith('Fractions: 10 learners (about a third'), groups[0]);

    // The Day-2 gate: a name in the phrase switches "Ask the cloud" off; a clean phrase sends and is logged.
    await page.click('[data-testid="groups"] li >> nth=0 >> text=Plan support');
    await page.waitForSelector('[data-testid="outbound"]');
    check('outbound preview shows the fixed question',
      (await text(page, 'outbound-fixed')).includes('sub-strand "Fractions"'));
    await page.click('text=Sum up the difficulty');
    await page.waitForFunction(() => document.querySelector('[data-testid="outbound-free"]')?.value !== '');
    const phrase = await page.inputValue('[data-testid="outbound-free"]');
    check('sum up fills the phrase on this laptop', phrase === 'mixing up the steps when working with fractions', phrase);
    check('a clean phrase passes the check', (await text(page, 'verdict')).startsWith('Checked against your class list: 0 learner names'));
    check('"Ask the cloud" is on for a clean phrase', await page.isEnabled('[data-testid="ask"]'));
    await page.fill('[data-testid="outbound-free"]', `${phrase}, like Kevin`);
    check('a name in the phrase fails the check', (await text(page, 'verdict')).includes(`"Kevin" is a learner's name in this class`));
    check('a name in the phrase switches "Ask the cloud" off', await page.isDisabled('[data-testid="ask"]'));
    check('the reason is shown', (await text(page, 'ask-reason')).startsWith('Fix what is listed above first'));
    await page.fill('[data-testid="outbound-free"]', phrase);
    check('removing the name switches it back on', await page.isEnabled('[data-testid="ask"]'));
    await page.click('[data-testid="ask"]');
    await page.waitForSelector('[data-testid="plan-activities"] li');
    check('the plan comes back with three activities', (await page.locator('[data-testid="plan-activities"] li').count()) === 3);
    await page.click('a[href="#/ledger"]');
    await page.waitForSelector('main tbody tr');
    check('ledger: the plan ran in the cloud', (await page.textContent('main tbody tr >> nth=0 >> td:nth-child(4)')) === 'In the cloud');
    const sentText = await page.textContent('main tbody tr >> nth=0 >> pre');
    check('ledger: the exact text sent includes the phrase', sentText.includes(`The difficulty they share: ${phrase}.`));
    check('ledger: the exact text sent has no learner name', !/Kevin|Amani|Faith/.test(sentText));

    // Day 3: the group stays open and the plan is kept after leaving the tab, then ten parent notes are written on the laptop.
    await page.click('a[href="#/support"]');
    await page.waitForSelector('[data-testid="plan"]');
    check('back on Support after the ledger: the group is still open', (await page.textContent('[data-testid="groups"] li >> nth=0 >> button')) === 'Close');
    check('plan panel: three activities after coming back to the tab', (await page.locator('[data-testid="plan-activities"] li').count()) === 3);
    check('plan panel: "Check after two weeks" is shown', (await text(page, 'plan-check')).startsWith('Give five short questions'));
    check('plan panel: "At home" is shown', (await text(page, 'plan-home')).startsWith('Ask the child to share'));
    check('plan panel: the cloud badge is shown',
      (await page.locator('[data-testid="plan"] .badge').first().textContent()) === 'Answered in the cloud from a question with no learner in it');
    check('plan panel: no "No web sources" badge on a grounded plan', (await page.locator('[data-testid="no-sources-badge"]').count()) === 0);
    const link = page.locator('[data-testid="plan-sources"] a');
    check('plan panel: one source link that opens in a new tab',
      (await link.count()) === 1 && (await link.getAttribute('target')) === '_blank' && (await link.getAttribute('rel')).includes('noopener'));
    await page.click('[data-testid="write-notes"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="notes-progress"]')?.textContent?.includes('10 of 10 notes written'));
    check('parent notes: ten written', (await page.locator('[data-testid="notes"] li').count()) === 10);
    check('parent notes: each says it was written on this laptop',
      (await page.locator('[data-testid="notes"] .badge:has-text("Written on this laptop")').count()) === 10);
    const firstNote = await page.inputValue('[data-testid="notes"] li >> nth=0 >> textarea');
    check('parent notes: the greeting is written by Staffroom, not the model',
      firstNote.startsWith('Dear parent or guardian of ') && !/Mrs\.|regards|\[Teacher\]/i.test(firstNote), firstNote.split('\n')[0]);
    await page.click('a[href="#/ledger"]');
    await page.waitForSelector('[data-testid="tile-learner-cloud"]');
    check('ledger after the notes: still 1 cloud run and 0 learner tasks in the cloud',
      (await text(page, 'tile-in-cloud')) === '1' && (await text(page, 'tile-learner-cloud')) === '0');
    // Coming back to Support keeps the open group, the phrase and the notes.
    await page.click('a[href="#/support"]');
    await page.waitForSelector('[data-testid="group-panel"]');
    check('back on Support: the same group is still open', (await page.locator('[data-testid="group-panel"]').count()) === 1);
    check('back on Support: the phrase is kept', (await page.inputValue('[data-testid="outbound-free"]')) === phrase);
    check('back on Support: the ten notes are kept', (await page.locator('[data-testid="notes"] li').count()) === 10);
    check('back on Support: the first note is unchanged', (await page.inputValue('[data-testid="notes"] li >> nth=0 >> textarea')) === firstNote);

    await page.click('a[href="#/selftest"]');
    await page.click('text=Run the self-test');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="selftest"] tbody tr').length === 6);
    const ran = await page.locator('[data-testid="selftest"] tbody tr td:nth-child(3)').allTextContents();
    check('self-test: four tasks on the laptop, two in the cloud',
      ran.join('|') === 'On this laptop|On this laptop|In the cloud|On this laptop|In the cloud|On this laptop', ran.join('|'));
    const modes = await page.locator('[data-testid="selftest"] tbody tr td:nth-child(2)').allTextContents();
    check('self-test: all four inference modes are used', new Set(modes).size === 4, [...new Set(modes)].join(', '));
    await page.click('a[href="#/ledger"]');
    await page.waitForSelector('[data-testid="tile-learner-cloud"]');
    check('ledger after the self-test: still 0 learner tasks in the cloud', (await text(page, 'tile-learner-cloud')) === '0');
    check('ledger after the self-test: 3 cloud runs with text sent (the Support plan and two self-test rows)',
      (await text(page, 'tile-in-cloud')) === '3' && Number(await text(page, 'tile-chars')) > 500);
    check('ledger after the self-test: 0 requests refused by the cloud', (await text(page, 'tile-refused')) === '0');

    // Function 12, online with a model: the starter prefers the cloud, the plain-words line prefers the laptop.
    await page.click('a[href="#/support"]');
    await page.waitForSelector('[data-testid="quick-help"]');
    check('starter activity, online: in the cloud', (await quick(page, 'lessonIdea')) === 'In the cloud');
    check('starter activity: the answer is shown', (await text(page, 'quick-lessonIdea-text')).startsWith('Call out a number'));
    check('plain words, with a model: on this laptop', (await quick(page, 'plainWords')) === 'On this laptop');
    check('quick help shows the exact text it would send',
      (await page.textContent('[data-testid="quick-lessonIdea"] pre')).includes('sub-strand "Fractions"'));

    // 2. Everything survives a reload, and the app starts with no connection.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
    await context.setOffline(true);
    await page.goto(`${BASE}/?engine=demo#/reports`);
    await page.waitForSelector('textarea');
    check('offline: the app opens and the remarks are still there', (await page.locator('textarea').count()) === 30);
    check('offline: the teacher\'s edit was kept', (await page.inputValue('textarea >> nth=1')).startsWith('Faith is careful'));
    await page.click('text=Draft all remarks');
    await page.waitForFunction(() => document.querySelector('[data-testid="batch-message"]')?.textContent?.startsWith('Done.'));
    check('offline: an edited remark is never overwritten', (await page.inputValue('textarea >> nth=1')).startsWith('Faith is careful'));
    check('no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 3. A laptop with no on-device model: remarks must fail, not fall back to the cloud.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/?engine=demo&device=unavailable`);
    await page.click('text=Load the invented sample class');
    check('status bar says the model is not available', (await text(page, 'device-status')) === 'not available in this browser');
    await page.click('a[href="#/reports"]');
    await page.click('text=Draft all remarks');
    await page.waitForSelector('[data-testid="batch-problem"]');
    check('the screen says it will not use the cloud instead', (await text(page, 'batch-problem')).includes('never sent to the cloud instead'));
    check('the batch stopped after the first learner', (await text(page, 'batch-message')) === 'Stopped. 0 drafted.');
    check('nothing was written', (await text(page, 'written-count')).startsWith('0 of 30'));
    await page.click('a[href="#/ledger"]');
    await page.waitForSelector('[data-testid="tile-errors"]');
    check('ledger: 1 failure, 0 cloud runs, 0 characters sent',
      (await text(page, 'tile-errors')) === '1' && (await text(page, 'tile-in-cloud')) === '0' && (await text(page, 'tile-chars')) === '0');
    await page.click('a[href="#/support"]');
    await page.click('[data-testid="groups"] li >> nth=0 >> text=Plan support');
    await page.click('text=Sum up the difficulty');
    await page.waitForSelector('[data-testid="support-problem"]');
    check('support: sum up refuses with no on-device model', (await text(page, 'support-problem')).includes('never sent to the cloud instead'));
    await page.fill('[data-testid="outbound-free"]', 'adding the tops and the bottoms');
    await page.click('[data-testid="ask"]');
    await page.waitForSelector('[data-testid="write-notes"]');
    await page.click('[data-testid="write-notes"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="notes-progress"]')?.textContent?.includes('notes written'));
    check('parent notes: refused with no on-device model, not sent to the cloud',
      (await text(page, 'support-problem')).includes('never sent to the cloud instead') && (await text(page, 'notes-progress')).startsWith('0 of 10'));
    check('parent notes: none shown', (await page.locator('[data-testid="notes"] li').count()) === 0);
    check('plain words, no model: falls back to the cloud', (await quick(page, 'plainWords')) === 'In the cloud');
    await context.close();
  }

  // 4. The other two reasons "Ask the cloud" is switched off: a strict school policy, and no connection.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/?engine=demo&policy=strict`);
    await page.click('text=Load the invented sample class');
    await page.click('a[href="#/support"]');
    await page.click('[data-testid="groups"] li >> nth=0 >> text=Plan support');
    await page.waitForSelector('[data-testid="outbound"]');
    check('strict policy: "Ask the cloud" is off', await page.isDisabled('[data-testid="ask"]'));
    check('strict policy: the school\'s reason is shown', (await text(page, 'ask-reason')).includes('Your school allows nothing to leave the laptop'));
    check('strict policy: the starter activity runs on this laptop', (await quick(page, 'lessonIdea')) === 'On this laptop');
    await page.click('[data-testid="task-map"] summary');
    const strict = await page.evaluate(() =>
      Object.fromEntries([...document.querySelectorAll('[data-testid^="task-"][data-testid$="-mode"]')]
        .map((e) => [e.dataset.testid.slice(5, -5), e.textContent])));
    check('task map, strict policy: the plan is switched off', strict.plan === 'switched off', strict.plan);
    check('task map, strict policy: everything else is ONLY_ON_DEVICE',
      Object.entries(strict).filter(([t]) => t !== 'plan').every(([, m]) => m === 'ONLY_ON_DEVICE'), JSON.stringify(strict));
    await context.close();

    // The Day-4 gate in the simulated engine: with no connection the starter still answers, on the laptop.
    const context3 = await browser.newContext();
    const page3 = await context3.newPage();
    await page3.goto(`${BASE}/?engine=demo&offline=1`);
    await page3.click('text=Load the invented sample class');
    await page3.click('a[href="#/support"]');
    await page3.click('[data-testid="groups"] li >> nth=0 >> text=Plan support');
    check('no connection: the starter activity still answers', (await quick(page3, 'lessonIdea')) === 'On this laptop'
      && (await text(page3, 'quick-lessonIdea-text')).length > 0);
    check('no connection: plain words on this laptop', (await quick(page3, 'plainWords')) === 'On this laptop');
    await page3.click('a[href="#/ledger"]');
    await page3.waitForSelector('[data-testid="tile-chars"]');
    check('no connection: 0 characters sent', (await text(page3, 'tile-chars')) === '0' && (await text(page3, 'tile-on-device')) === '2');
    await context3.close();

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(`${BASE}/?engine=demo`);
    await page2.click('text=Load the invented sample class');
    await page2.click('a[href="#/support"]');
    await page2.click('[data-testid="groups"] li >> nth=0 >> text=Plan support');
    await page2.waitForSelector('[data-testid="outbound"]');
    await context2.setOffline(true);
    await page2.waitForFunction(() => !navigator.onLine);
    await page2.waitForSelector('[data-testid="ask-reason"]');
    check('offline: "Ask the cloud" is off', await page2.isDisabled('[data-testid="ask"]'));
    check('offline: the reason is shown', (await text(page2, 'ask-reason')).startsWith('You are offline'));
    await context2.close();
  }

  // 5. Route A: the grounded plan is refused (as on the free tier). Nothing is retried until the teacher says yes.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/?engine=demo&grounding=refused`);
    await page.click('text=Load the invented sample class');
    await page.click('a[href="#/support"]');
    await page.click('[data-testid="groups"] li >> nth=0 >> text=Plan support');
    await page.fill('[data-testid="outbound-free"]', 'adding the tops and the bottoms');
    await page.click('[data-testid="ask"]');
    await page.waitForSelector('[data-testid="route-a"]');
    const offer = await text(page, 'route-a');
    check('Route A: the refusal says the question did leave the laptop', offer.includes('The question did leave this laptop'));
    check('Route A: it offers to ask without web sources', offer.includes('Ask the cloud for a plan without web sources?'));
    check('Route A: no plan is shown before the teacher says yes', (await page.locator('[data-testid="plan"]').count()) === 0);
    await page.click('a[href="#/ledger"]');
    await page.waitForSelector('[data-testid="tile-refused"]');
    check('Route A: one send so far, refused, nothing retried on its own',
      (await text(page, 'tile-refused')) === '1' && (await text(page, 'tile-in-cloud')) === '0' && (await page.locator('main tbody tr').count()) === 1);
    await page.click('a[href="#/support"]');
    // The offer survives the trip to the ledger; nothing was sent while away.
    await page.waitForSelector('[data-testid="ask-plain"]');
    check('Route A: the offer is still there after leaving the tab', (await page.locator('[data-testid="route-a"]').count()) === 1);
    check('Route A: the phrase is kept too', (await page.inputValue('[data-testid="outbound-free"]')) === 'adding the tops and the bottoms');
    await page.click('[data-testid="ask-plain"]');
    await page.waitForSelector('[data-testid="plan"]');
    check('Route A: the plain plan has three activities', (await page.locator('[data-testid="plan-activities"] li').count()) === 3);
    check('Route A: it is marked "No web sources"', (await text(page, 'no-sources-badge')) === 'No web sources');
    check('Route A: it says there are no sources to check', (await text(page, 'plan-no-sources')).includes('without web sources'));
    check('Route A: the offer is gone', (await page.locator('[data-testid="route-a"]').count()) === 0);
    await page.click('a[href="#/ledger"]');
    await page.waitForSelector('main tbody tr');
    check('Route A ledger: one refused, one answered, 0 learner tasks in the cloud',
      (await text(page, 'tile-refused')) === '1' && (await text(page, 'tile-in-cloud')) === '1' && (await text(page, 'tile-learner-cloud')) === '0');
    const sent = await page.locator('main tbody tr pre').allTextContents();
    check('Route A ledger: both sends carry the same text', sent.length === 2 && new Set(sent).size === 1, `${sent.length} rows`);
    await context.close();
  }
} finally {
  await browser.close();
  preview.kill();
}

console.log(failed === 0 ? '\nAll browser checks passed.' : `\n${failed} browser check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
