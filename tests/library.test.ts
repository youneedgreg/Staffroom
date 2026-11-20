import { describe, expect, it } from 'vitest';
import {
  demoLibrary,
  FAILED_SHARE_TEXT,
  GROUNDED_SHARE_TEXT,
  OFFLINE_SHARE_TEXT,
  shareRefusal,
  sharePlan,
  sharedText,
  type PlanLibrary,
} from '../src/core/library';
import { ranText, summarise, type LedgerEntry } from '../src/core/ledger';
import { sampleClass } from '../src/core/sample';
import type { Plan } from '../src/core/types';

const data = sampleClass();
const guard = { learners: data.learners, extraTerms: [data.schoolName, data.teacherName] };
const first = data.learners[0]!;

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  packId: 'cbc-g5-maths',
  subStrandId: 'fractions',
  question: 'A group of learners in Grade 5 find Fractions hard. The difficulty they share: adding the tops and the bottoms.',
  answer: 'Activities\n1. Use fraction strips.\n2. Pair work.\n3. Exit questions.\nAt home\nCut a chapati into quarters.',
  sources: [],
  grounded: false,
  at: Date.UTC(2026, 10, 20, 9, 0),
  ...over,
});

function setup(library: PlanLibrary = demoLibrary()) {
  const entries: LedgerEntry[] = [];
  return { entries, ctx: { guard, record: (e: LedgerEntry) => void entries.push(e) }, library };
}

describe('shareRefusal', () => {
  it('refuses grounded plans, and plans saved before Route A existed', () => {
    expect(shareRefusal(plan({ grounded: true }), guard)).toBe(GROUNDED_SHARE_TEXT);
    expect(shareRefusal(plan({ grounded: undefined }), guard)).toBe(GROUNDED_SHARE_TEXT);
  });

  it('allows a plan asked without web sources', () => {
    expect(shareRefusal(plan(), guard)).toBeNull();
  });

  it("refuses an answer that names a learner in this class, or the school", () => {
    expect(shareRefusal(plan({ answer: `Pair ${first.name} with a partner.` }), guard)).toContain(first.name.split(' ')[0]);
    expect(shareRefusal(plan({ answer: `Ask ${data.schoolName} for strips.` }), guard)).not.toBeNull();
  });
});

describe('sharePlan', () => {
  it('shares a plan asked without web sources and writes the exact text to the ledger', async () => {
    const { entries, ctx, library } = setup();
    expect(await sharePlan(ctx, library, plan(), true)).toEqual({ status: 'ok' });
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(e).toMatchObject({ task: 'share', mode: 'library', outcome: 'ok', sentText: sharedText(plan()) });
    expect(e.sentChars).toBe(sharedText(plan()).length);
    expect(e.source).toBeUndefined();
    expect(ranText(e)).toBe('Saved to the shared plan library');
    const s = summarise(entries);
    expect(s.charsSent).toBe(e.sentChars);
    expect(s.learnerTasksInCloud).toBe(0);
    const listed = await library.list('cbc-g5-maths', 'fractions');
    expect(listed[0]).toMatchObject({ question: plan().question, mine: true });
    expect(listed.some((p) => !p.mine)).toBe(true);
  });

  it('never sends a grounded plan and writes nothing', async () => {
    let calls = 0;
    const { entries, ctx } = setup();
    const library: PlanLibrary = { share: async () => void (calls += 1), list: async () => [] };
    expect(await sharePlan(ctx, library, plan({ grounded: true }), true)).toEqual({ status: 'refused', message: GROUNDED_SHARE_TEXT });
    expect(calls).toBe(0);
    expect(entries).toHaveLength(0);
  });

  it('sends nothing offline', async () => {
    const { entries, ctx, library } = setup();
    expect(await sharePlan(ctx, library, plan(), false)).toEqual({ status: 'refused', message: OFFLINE_SHARE_TEXT });
    expect(entries).toHaveLength(0);
  });

  it('blocks a plan the name check stops, sends nothing and says so in the ledger', async () => {
    let calls = 0;
    const { entries, ctx } = setup();
    const library: PlanLibrary = { share: async () => void (calls += 1), list: async () => [] };
    const r = await sharePlan(ctx, library, plan({ answer: `Pair ${first.name} with a partner.` }), true);
    expect(r.status).toBe('refused');
    expect(calls).toBe(0);
    expect(entries[0]).toMatchObject({ task: 'share', outcome: 'blocked', sentChars: 0 });
    expect(entries[0]!.sentText).toBeUndefined();
    expect(ranText(entries[0])).toBe('Not sent');
  });

  it('counts a failed share as sent, since it may have reached the library', async () => {
    const { entries, ctx } = setup(demoLibrary(true));
    expect(await sharePlan(ctx, demoLibrary(true), plan(), true)).toEqual({ status: 'error', message: FAILED_SHARE_TEXT });
    expect(entries[0]).toMatchObject({ outcome: 'error', sentText: sharedText(plan()) });
    expect(ranText(entries[0])).toBe('Sent to the shared plan library, not saved');
    expect(summarise(entries).errors).toBe(1);
  });
});
