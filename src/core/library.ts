/**
 * The shared plan library: plans other teachers using Staffroom asked for, by curriculum topic.
 *
 * A shared plan is the curriculum question and the cloud's answer, nothing else. Only plans asked
 * without web sources can be shared: the grounding terms let a grounded answer be shown only to
 * the person who asked for it. Every share is checked by the roster guard again and written to
 * the Privacy ledger with the exact text that left the laptop.
 */
import { checkOutbound, describeHit, type GuardContext } from './guard';
import { newEntry, type LedgerEntry } from './ledger';
import type { Plan } from './types';

export interface SharedPlan {
  id: string;
  packId: string;
  subStrandId: string;
  question: string;
  answer: string;
  at: number;
  /** True when this browser's anonymous account shared it. */
  mine: boolean;
}

export interface PlanLibrary {
  /** Share a plan with teachers using Staffroom. Sends the question and the answer, nothing else. */
  share(plan: Plan): Promise<void>;
  /** Up to ten plans for one topic, newest first. Rejects when the library can't be reached. */
  list(packId: string, subStrandId: string): Promise<SharedPlan[]>;
}

export const GROUNDED_SHARE_TEXT =
  "Plans with web sources can only be shown to you, under Google's terms, so this one can't be shared.";
export const OFFLINE_SHARE_TEXT = 'Sharing needs the internet. Nothing was sent.';
export const FAILED_SHARE_TEXT =
  'The plan library did not confirm this plan was saved. The text may have reached it, or may still be sent when the connection returns: the Privacy ledger shows what was sent.';

/** How long a share may take before Staffroom stops waiting, as for cloud requests. */
export const SHARE_TIMEOUT_MS = 30_000;

/** The exact text a share sends. The ledger shows this. */
export function sharedText(plan: Plan): string {
  return `${plan.question}\n\n${plan.answer}`;
}

/** Why a plan can't be shared, or null when it can. Grounded plans never can. */
export function shareRefusal(plan: Plan, guard: GuardContext): string | null {
  if (plan.grounded !== false) return GROUNDED_SHARE_TEXT;
  // The question passed the guard when it was asked; the answer was written by the cloud.
  // Both are checked again here against the class as it is now.
  const verdict = checkOutbound({ fixed: plan.question, free: plan.answer }, guard);
  return verdict.ok ? null : verdict.hits.map(describeHit).join(' ');
}

export type ShareResult = { status: 'ok' } | { status: 'refused' | 'error'; message: string };

export async function sharePlan(
  ctx: { guard: GuardContext; record: (entry: LedgerEntry) => void | Promise<void> },
  library: PlanLibrary,
  plan: Plan,
  online: boolean,
): Promise<ShareResult> {
  // A grounded plan never reaches the library and isn't a request, so it isn't written down.
  if (plan.grounded !== false) return { status: 'refused', message: GROUNDED_SHARE_TEXT };
  if (!online) return { status: 'refused', message: OFFLINE_SHARE_TEXT };
  const started = Date.now();
  const refusal = shareRefusal(plan, ctx.guard);
  if (refusal) {
    await ctx.record(newEntry({ task: 'share', mode: 'library', outcome: 'blocked', sentChars: 0, ms: 0, note: refusal }));
    return { status: 'refused', message: refusal };
  }
  const text = sharedText(plan);
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      library.share(plan),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), SHARE_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
    await ctx.record(
      newEntry({ task: 'share', mode: 'library', outcome: 'ok', sentChars: text.length, sentText: text, ms: Date.now() - started }),
    );
    return { status: 'ok' };
  } catch (e) {
    // The write may have reached the server before it was turned down, so it counts as sent.
    await ctx.record(
      newEntry({
        task: 'share',
        mode: 'library',
        outcome: 'error',
        sentChars: text.length,
        sentText: text,
        ms: Date.now() - started,
        note: `share_failed: ${e instanceof Error ? e.message : String(e)}`,
      }),
    );
    return { status: 'error', message: FAILED_SHARE_TEXT };
  }
}

/**
 * An in-memory library for the browser test (`&library=demo`, or `&library=down` to fail).
 * Seeded with one invented plan from a colleague for every topic.
 */
export function demoLibrary(down = false): PlanLibrary {
  const shared: SharedPlan[] = [];
  const colleague = (packId: string, subStrandId: string): SharedPlan => ({
    id: `colleague-${subStrandId}`,
    packId,
    subStrandId,
    question: 'A colleague asked: how can I help a small group that finds this topic hard?',
    answer:
      'Activities\n1. Start with objects the learners can hold and move.\n2. Work in pairs, one explaining to the other.\n3. Finish with three short questions on the board.\nCheck after two weeks\nAsk five short questions on the topic.\nAt home\nAsk the child to show a family member one example.',
    at: Date.UTC(2026, 10, 18, 9, 0),
    mine: false,
  });
  return {
    async share(plan) {
      if (down) throw new Error('unavailable');
      shared.push({ ...plan, id: `shared-${shared.length + 1}`, mine: true });
    },
    async list(packId, subStrandId) {
      // Like the real library, which reads from the server only.
      if (down || (typeof navigator !== 'undefined' && navigator.onLine === false)) throw new Error('unavailable');
      return [...shared.filter((p) => p.packId === packId && p.subStrandId === subStrandId), colleague(packId, subStrandId)]
        .sort((a, b) => b.at - a.at)
        .slice(0, 10);
    },
  };
}
