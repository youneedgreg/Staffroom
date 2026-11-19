import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { runBatch } from '../src/core/batch';
import { CBC_G5_MATHS as pack } from '../src/core/curriculum';
import { askPlan, draftRemark, needsRemark, summariseDifficulty, writeParentNote } from '../src/core/flows';
import { findNames } from '../src/core/guard';
import { strugglingGroups } from '../src/core/groups';
import { ranText, summarise, trim, type LedgerEntry } from '../src/core/ledger';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/policy';
import { lessonIdeaPrompt, plainWordsPrompt, planPrompt, remarkPrompt } from '../src/core/prompts';
import { runTask, type RunContext } from '../src/core/runner';
import { sampleClass } from '../src/core/sample';
import type { Remark } from '../src/core/types';
import { DemoEngine, type DemoOptions } from '../src/engine/demo';
import { CloudRefusedError, type Engine, type EngineRequest, type EngineResult } from '../src/engine/engine';
import { browserStore, memoryStore, Repo } from '../src/store/store';

const data = sampleClass();
const roster = data.learners;
const amani = roster[0]!;
const group = strugglingGroups(data, pack)[0]!;

function setup(options: Partial<DemoOptions> = {}, settings: Settings = DEFAULT_SETTINGS, engine?: Engine) {
  const demo = new DemoEngine(options);
  const ledger: LedgerEntry[] = [];
  const ctx: RunContext = {
    engine: engine ?? demo,
    settings,
    guard: { learners: roster, extraTerms: [data.schoolName, data.teacherName] },
    record: (e) => {
      ledger.push(e);
    },
  };
  return { ctx, demo, ledger };
}

const remarkSpec = () => remarkPrompt(pack, amani, data.assessments[amani.id]!, roster);

describe('runTask: learner data', () => {
  it('runs a remark on the device and sends nothing', async () => {
    const { ctx, demo, ledger } = setup();
    const r = await runTask(ctx, remarkSpec());
    expect(r.status).toBe('ok');
    expect(demo.calls[0]?.mode).toBe('only_on_device');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ task: 'remark', mode: 'only_on_device', source: 'on_device', outcome: 'ok', sentChars: 0 });
    expect(ledger[0]?.sentText).toBeUndefined();
  });

  it('ignores a setting that tries to move a remark to the cloud', async () => {
    for (const mode of ['only_in_cloud', 'prefer_in_cloud', 'prefer_on_device'] as const) {
      const { ctx, demo } = setup({}, { ...DEFAULT_SETTINGS, modes: { remark: mode } });
      const r = await runTask(ctx, remarkSpec());
      expect(r.status).toBe('ok');
      expect(demo.calls[0]?.mode).toBe('only_on_device');
    }
  });

  it('fails, and does not fall back, when the browser has no on-device model', async () => {
    const { ctx, demo, ledger } = setup({ device: 'unavailable', online: true });
    const r = await runTask(ctx, remarkSpec());
    expect(r).toMatchObject({ status: 'error', kind: 'no_device_model' });
    expect(demo.calls).toHaveLength(1);
    expect(demo.calls[0]?.mode).toBe('only_on_device');
    expect(ledger[0]).toMatchObject({ outcome: 'error', sentChars: 0 });
    expect(summarise(ledger).inCloud).toBe(0);
  });

  it('stops a lying engine that says a remark ran in the cloud', async () => {
    const liar: Engine = {
      name: 'liar',
      simulated: true,
      run: async (): Promise<EngineResult> => ({ text: 'leaked', source: 'in_cloud' }),
      deviceStatus: async () => 'available',
      prepareDevice: async () => undefined,
    };
    const { ctx, ledger } = setup({}, DEFAULT_SETTINGS, liar);
    const r = await runTask(ctx, remarkSpec());
    expect(r).toMatchObject({ status: 'error', kind: 'invariant' });
    expect(JSON.stringify(r)).not.toContain('leaked');
    expect(ledger[0]?.outcome).toBe('error');
  });

  it('logs a remark that reached the cloud anyway, so the headline number can never hide it', async () => {
    const { ctx, ledger } = setup({}, DEFAULT_SETTINGS, refusingEngine(500));
    const spec = remarkSpec();
    const r = await runTask(ctx, spec);
    expect(r).toMatchObject({ status: 'error', kind: 'invariant' });
    expect(ledger[0]).toMatchObject({ outcome: 'error', source: 'in_cloud', sentText: `${spec.system}\n\n${spec.prompt}` });
    expect(summarise(ledger).learnerTasksInCloud).toBe(1);
  });

  it('treats a learner request that reached the cloud before running on the device as a breach, and logs the text', async () => {
    const { ctx, ledger } = setup({}, DEFAULT_SETTINGS, fallbackEngine(429));
    const spec = remarkSpec();
    const r = await runTask(ctx, spec);
    expect(r).toMatchObject({ status: 'error', kind: 'invariant' });
    expect(ledger[0]).toMatchObject({ outcome: 'error', source: 'on_device', sentText: `${spec.system}\n\n${spec.prompt}` });
    expect(summarise(ledger).learnerTasksInCloud).toBe(1);
  });
});

/** An engine whose cloud refuses first and whose device then does the work (PREFER_IN_CLOUD falling back). */
function fallbackEngine(status: number): Engine {
  return {
    name: 'fallback',
    simulated: true,
    run: async (request: EngineRequest): Promise<EngineResult> => ({
      text: request.task === 'remark' ? '[NAME] did well.' : 'Count to ten together.',
      source: 'on_device',
      refusedBeforeFallback: { status },
    }),
    deviceStatus: async () => 'available',
    prepareDevice: async () => undefined,
  };
}

/** An engine whose cloud answers every request with an HTTP error. */
function refusingEngine(status: number): Engine {
  return {
    name: 'refusing',
    simulated: true,
    run: async (): Promise<EngineResult> => {
      throw new CloudRefusedError(status, 'You exceeded your current quota');
    },
    deviceStatus: async () => 'available',
    prepareDevice: async () => undefined,
  };
}

describe('runTask: the curriculum question', () => {
  it('sends the question to the cloud and logs exactly what left', async () => {
    const { ctx, demo, ledger } = setup();
    const spec = planPrompt(pack, group, 'adding the tops and the bottoms');
    const r = await runTask(ctx, spec);
    expect(r.status).toBe('ok');
    expect(demo.calls[0]).toMatchObject({ mode: 'only_in_cloud', search: true, cloudModel: 'gemini-3.5-flash-lite' });
    const entry = ledger[0]!;
    expect(entry).toMatchObject({ source: 'in_cloud', outcome: 'ok' });
    expect(entry.sentText).toBe(`${spec.system}\n\n${spec.prompt}`);
    expect(entry.sentChars).toBe(entry.sentText!.length);
    expect(findNames(entry.sentText!, roster)).toEqual([]);
  });

  it('is blocked before the engine is called when the difficulty holds a name', async () => {
    const { ctx, demo, ledger } = setup();
    const r = await runTask(ctx, planPrompt(pack, group, 'Felix and Sharon add the denominators'));
    expect(r.status).toBe('blocked');
    if (r.status === 'blocked') expect(r.hits.map((h) => h.match)).toEqual(['Felix', 'Sharon']);
    expect(demo.calls).toHaveLength(0);
    expect(ledger[0]).toMatchObject({ outcome: 'blocked', sentChars: 0 });
  });

  it('logs a question the cloud refused (HTTP 429) as sent, with the exact text', async () => {
    const { ctx, ledger } = setup({}, DEFAULT_SETTINGS, refusingEngine(429));
    const spec = planPrompt(pack, group, 'adding the tops and the bottoms');
    const r = await runTask(ctx, spec);
    expect(r).toMatchObject({ status: 'error', kind: 'refused' });
    const entry = ledger[0]!;
    expect(entry).toMatchObject({ outcome: 'error', source: 'in_cloud' });
    expect(entry.sentText).toBe(`${spec.system}\n\n${spec.prompt}`);
    expect(entry.sentChars).toBe(entry.sentText!.length);
    expect(entry.note).toContain('HTTP 429');
    expect(summarise(ledger)).toMatchObject({ charsSent: entry.sentChars, learnerTasksInCloud: 0 });
    expect(ranText(entry)).toBe('Sent to the cloud, refused');
  });

  it('logs a cloud-first request the cloud refused before the device took over as sent', async () => {
    const { ctx, ledger } = setup({}, DEFAULT_SETTINGS, fallbackEngine(429));
    const spec = lessonIdeaPrompt(pack, group.subStrand);
    const r = await runTask(ctx, spec);
    expect(r).toMatchObject({ status: 'ok', source: 'on_device' });
    const entry = ledger[0]!;
    expect(entry).toMatchObject({ outcome: 'ok', mode: 'prefer_in_cloud', source: 'on_device' });
    expect(entry.sentText).toBe(`${spec.system}\n\n${spec.prompt}`);
    expect(entry.sentChars).toBe(entry.sentText!.length);
    expect(entry.note).toContain('HTTP 429');
    expect(ranText(entry)).toBe('On this laptop, after the cloud refused');
    expect(summarise(ledger)).toMatchObject({
      onDevice: 1,
      inCloud: 0,
      charsSent: entry.sentChars,
      learnerTasksInCloud: 0,
    });
  });

  it('reports offline and sends nothing', async () => {
    const { ctx, ledger } = setup({ online: false });
    const r = await runTask(ctx, planPrompt(pack, group, ''));
    expect(r).toMatchObject({ status: 'error', kind: 'offline' });
    expect(summarise(ledger).charsSent).toBe(0);
  });

  it('is switched off under the strict policy', async () => {
    const { ctx, demo, ledger } = setup({}, { ...DEFAULT_SETTINGS, policy: 'strict' });
    const r = await runTask(ctx, planPrompt(pack, group, ''));
    expect(r.status).toBe('disabled');
    expect(demo.calls).toHaveLength(0);
    expect(ledger[0]?.outcome).toBe('disabled');
  });

  it('refuses a prompt that differs from the text the guard checked', async () => {
    const { ctx, demo } = setup();
    const spec = planPrompt(pack, group, '');
    const r = await runTask(ctx, { ...spec, prompt: spec.prompt + ' Also, Kevin Kiprop is behind.' });
    expect(r).toMatchObject({ status: 'error', kind: 'invariant' });
    expect(demo.calls).toHaveLength(0);
  });

  it('refuses a cloud-capable request with no outbound message or with an image', async () => {
    const { ctx, demo } = setup();
    const spec = planPrompt(pack, group, '');
    expect(await runTask(ctx, { ...spec, outbound: undefined })).toMatchObject({ kind: 'invariant' });
    expect(await runTask(ctx, { ...spec, image: { mimeType: 'image/png', base64: 'AA' } })).toMatchObject({ kind: 'invariant' });
    expect(demo.calls).toHaveLength(0);
  });

  it('uses the cloud model named in the settings', async () => {
    const { ctx, demo } = setup({}, { ...DEFAULT_SETTINGS, cloudModel: 'gemini-3.5-flash' });
    await runTask(ctx, planPrompt(pack, group, ''));
    expect(demo.calls[0]?.cloudModel).toBe('gemini-3.5-flash');
  });
});

describe('runTask: the two open tasks', () => {
  const idea = () => lessonIdeaPrompt(pack, group.subStrand);
  const plain = () => plainWordsPrompt(pack, 'AE', group.subStrand);

  it('prefers the cloud for a starter activity and falls back to the device offline', async () => {
    const online = setup();
    expect(await runTask(online.ctx, idea())).toMatchObject({ status: 'ok', source: 'in_cloud' });
    const offline = setup({ online: false });
    expect(await runTask(offline.ctx, idea())).toMatchObject({ status: 'ok', source: 'on_device' });
    expect(offline.ledger[0]?.sentChars).toBe(0);
  });

  it('prefers the device for plain words and falls back to the cloud without a model', async () => {
    const withModel = setup();
    expect(await runTask(withModel.ctx, plain())).toMatchObject({ status: 'ok', source: 'on_device' });
    const noModel = setup({ device: 'unavailable' });
    expect(await runTask(noModel.ctx, plain())).toMatchObject({ status: 'ok', source: 'in_cloud' });
    expect(noModel.ledger[0]?.sentText).toContain('Approaching Expectation');
  });
});

describe('flows', () => {
  it('drafts a remark with the first name filled in', async () => {
    const { ctx } = setup();
    const r = await draftRemark(ctx, pack, data, amani);
    expect('remark' in r && r.remark).toMatchObject({ learnerId: 'l01', source: 'on_device', status: 'draft' });
    if ('remark' in r) {
      expect(r.remark.text.startsWith('Amani has worked well in')).toBe(true);
      expect(r.remark.text).not.toContain('[NAME]');
    }
  });

  it('drafts the whole class on the device, then skips everyone on a second run', async () => {
    const { ctx, demo, ledger } = setup();
    const remarks: Record<string, Remark> = {};
    const work = async (learner: (typeof roster)[number]) => {
      if (!needsRemark(pack, data, learner, remarks[learner.id])) return 'skipped' as const;
      const r = await draftRemark(ctx, pack, data, learner);
      if ('failure' in r) return 'failed' as const;
      remarks[learner.id] = r.remark;
      return 'ok' as const;
    };
    const seen: number[] = [];
    const first = await runBatch(roster, work, { onProgress: (p) => seen.push(p.done) });
    expect(first).toMatchObject({ done: 30, ok: 30, skipped: 0, failed: 0, stopped: false });
    expect(seen).toHaveLength(30);
    expect(summarise(ledger)).toMatchObject({ total: 30, onDevice: 30, inCloud: 0, charsSent: 0, learnerTasksInCloud: 0 });
    expect(demo.calls.every((c) => c.mode === 'only_on_device')).toBe(true);
    for (const learner of roster) expect(remarks[learner.id]?.text).toContain(learner.name.split(' ')[0]);

    const second = await runBatch(roster, work);
    expect(second).toMatchObject({ ok: 0, skipped: 30 });
    expect(demo.calls).toHaveLength(30);
  });

  it('redrafts only the learner whose note changed, and never an edited remark', async () => {
    const { ctx } = setup();
    const mine = sampleClass();
    const a = mine.learners[0]!;
    const b = mine.learners[1]!;
    const ra = await draftRemark(ctx, pack, mine, a);
    const rb = await draftRemark(ctx, pack, mine, b);
    if (!('remark' in ra) || !('remark' in rb)) throw new Error('draft failed');
    expect(needsRemark(pack, mine, a, ra.remark)).toBe(false);
    mine.assessments[a.id]!.note = 'now shows all working';
    expect(needsRemark(pack, mine, a, ra.remark)).toBe(true);
    expect(needsRemark(pack, mine, b, rb.remark)).toBe(false);
    expect(needsRemark(pack, mine, a, { ...ra.remark, status: 'edited' })).toBe(false);
    expect(needsRemark(pack, mine, a, { ...ra.remark, status: 'approved' })).toBe(false);
  });

  it('does not ask for a remark when no level is recorded', () => {
    const mine = sampleClass();
    const a = mine.learners[0]!;
    mine.assessments[a.id]!.levels = {};
    expect(needsRemark(pack, mine, a)).toBe(false);
  });

  it('runs the whole support loop: device, cloud, device', async () => {
    const { ctx, demo, ledger } = setup();
    const d = await summariseDifficulty(ctx, pack, data, group);
    if (!('difficulty' in d)) throw new Error('difficulty failed');
    expect(d.difficulty).toBe('mixing up the steps when working with fractions');

    const p = await askPlan(ctx, pack, group, d.difficulty);
    if (!('plan' in p)) throw new Error('plan failed');
    expect(p.parsed.activities).toHaveLength(3);
    expect(p.plan.question).toContain('The difficulty they share: mixing up the steps when working with fractions.');
    expect(p.plan.sources).toHaveLength(1);

    const felix = roster.find((l) => l.name === 'Felix Musyoka')!;
    const n = await writeParentNote(ctx, pack, data, group, felix, p.parsed.home);
    if (!('note' in n)) throw new Error('note failed');
    expect(n.note.startsWith('Felix is still finding')).toBe(true);

    expect(demo.calls.map((c) => [c.task, c.mode])).toEqual([
      ['difficulty', 'only_on_device'],
      ['plan', 'only_in_cloud'],
      ['personalise', 'only_on_device'],
    ]);
    const s = summarise(ledger);
    expect(s).toMatchObject({ onDevice: 2, inCloud: 1, learnerTasksInCloud: 0 });
    // The only text that left: the fixed system line and the curriculum question.
    const sent = ledger.filter((e) => e.sentText).map((e) => e.sentText!);
    expect(sent).toHaveLength(1);
    expect(findNames(sent[0]!, roster)).toEqual([]);
  });

  it('skips the model when a group has no notes', async () => {
    const mine = sampleClass();
    for (const a of Object.values(mine.assessments)) a.note = '';
    const { ctx, demo } = setup();
    const d = await summariseDifficulty(ctx, pack, mine, strugglingGroups(mine, pack)[0]!);
    expect(d).toEqual({ difficulty: '' });
    expect(demo.calls).toHaveLength(0);
  });
});

describe('runBatch', () => {
  it('stops early on "stop" and counts failures', async () => {
    const r = await runBatch([1, 2, 3, 4, 5], async (n) => (n === 2 ? 'failed' : n === 4 ? 'stop' : 'ok'));
    expect(r).toMatchObject({ done: 3, ok: 2, failed: 1, stopped: true });
  });

  it('treats a thrown error as a failure and carries on', async () => {
    const r = await runBatch([1, 2], async (n) => {
      if (n === 1) throw new Error('boom');
      return 'ok';
    });
    expect(r).toMatchObject({ done: 2, ok: 1, failed: 1, stopped: false });
  });

  it('stops when the signal is aborted', async () => {
    const controller = new AbortController();
    const r = await runBatch(
      [1, 2, 3],
      async (n) => {
        if (n === 2) controller.abort();
        return 'ok';
      },
      { signal: controller.signal },
    );
    expect(r).toMatchObject({ done: 2, stopped: true });
  });
});

describe('ledger', () => {
  it('counts a learner task in the cloud, so the headline number can never hide one', () => {
    const fake = (task: LedgerEntry['task'], source: LedgerEntry['source'], sentChars = 0): LedgerEntry => ({
      id: 'x', at: 0, task, mode: 'only_on_device', source, outcome: 'ok', sentChars, ms: 1,
    });
    const s = summarise([fake('remark', 'on_device'), fake('plan', 'in_cloud', 400), fake('remark', 'in_cloud', 90)]);
    expect(s).toMatchObject({ onDevice: 1, inCloud: 2, charsSent: 490, learnerTasksInCloud: 1 });
  });

  it('keeps the newest entries when trimmed', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }) as LedgerEntry);
    expect(trim(entries, 3).map((e) => e.id)).toEqual(['2', '3', '4']);
  });
});

describe('storage', () => {
  it('round-trips class data, remarks, ledger and plans, and wipes them', async () => {
    for (const kv of [memoryStore(), browserStore()]) {
      const repo = new Repo(kv);
      expect(await repo.load()).toEqual({ classData: null, remarks: {}, ledger: [], plans: [] });
      await repo.saveClass(data);
      await repo.saveRemarks({ l01: { learnerId: 'l01', text: 't', inputHash: 'h', source: 'on_device', status: 'draft', at: 1 } });
      const loaded = await repo.load();
      expect(loaded.classData?.learners).toHaveLength(30);
      expect(loaded.remarks.l01?.text).toBe('t');
      await repo.wipe();
      expect((await repo.load()).classData).toBeNull();
    }
  });
});

describe('the engine request never carries more than the prompt', () => {
  it('passes only the fields the runner was given', async () => {
    const { ctx, demo } = setup();
    await runTask(ctx, remarkSpec());
    const call: EngineRequest = demo.calls[0]!;
    expect(Object.keys(call).sort()).toEqual(['cloudModel', 'image', 'mode', 'prompt', 'schema', 'search', 'system', 'task']);
  });
});
