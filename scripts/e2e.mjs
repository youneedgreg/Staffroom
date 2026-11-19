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

try {
  // 1. The whole loop on a laptop with an on-device model.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/?engine=demo`);
    await page.click('text=Load the invented sample class');
    check('sample class loads with 30 learners', (await page.locator('tbody tr').count()) === 30);
    check('status bar shows the model as ready', (await text(page, 'device-status')) === 'ready');

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
    check('ledger after the self-test: 2 cloud runs with text sent',
      (await text(page, 'tile-in-cloud')) === '2' && Number(await text(page, 'tile-chars')) > 500);
    check('ledger after the self-test: 0 requests refused by the cloud', (await text(page, 'tile-refused')) === '0');

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
    await context.close();
  }
} finally {
  await browser.close();
  preview.kill();
}

console.log(failed === 0 ? '\nAll browser checks passed.' : `\n${failed} browser check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
