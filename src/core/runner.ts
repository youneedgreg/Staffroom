/**
 * The one door every inference goes through.
 *
 * It applies the mode rules, runs the roster guard on anything that can reach the cloud,
 * calls the engine, checks where the work really ran, and writes the ledger.
 */
import type { Engine } from '../engine/engine';
import { CloudRefusedError, CloudTimeoutError, NoDeviceModelError, OfflineError } from '../engine/engine';
import { checkOutbound, outboundText, type GuardContext, type GuardHit } from './guard';
import { newEntry, type LedgerEntry } from './ledger';
import { canReachCloud, resolveMode, TASKS, type Settings } from './policy';
import type { PromptSpec } from './prompts';
import type { InferenceSource, WebSource } from './types';

export interface RunContext {
  engine: Engine;
  settings: Settings;
  guard: GuardContext;
  /** Called once per run, whatever the outcome. */
  record: (entry: LedgerEntry) => void | Promise<void>;
}

export type ErrorKind = 'no_device_model' | 'offline' | 'refused' | 'timeout' | 'invariant' | 'other';

export type RunResult =
  | { status: 'ok'; text: string; source: InferenceSource; sources: WebSource[]; searchHtml?: string; entry: LedgerEntry }
  | { status: 'blocked'; hits: GuardHit[]; entry: LedgerEntry }
  | { status: 'disabled'; reason: string; entry: LedgerEntry }
  | { status: 'error'; kind: ErrorKind; message: string; entry: LedgerEntry };

export const ERROR_TEXT: Record<ErrorKind, string> = {
  no_device_model:
    'This browser has no on-device model, so this cannot run here. Learner data is never sent to the cloud instead.',
  offline: 'This needs the internet and it could not be reached. Nothing was sent.',
  refused:
    'The cloud service turned this request down, often because its free limit was reached. The question did leave this laptop: the Privacy ledger shows exactly what was sent.',
  timeout:
    "The cloud didn't answer within 30 seconds, so Staffroom stopped waiting. The question did leave this laptop: the Privacy ledger shows exactly what was sent.",
  invariant: 'Staffroom stopped this request because it broke a privacy rule. Please report it.',
  other: 'The model returned an error. Try again.',
};

export async function runTask(ctx: RunContext, spec: PromptSpec): Promise<RunResult> {
  const started = Date.now();
  const task = TASKS[spec.task];
  const resolved = resolveMode(spec.task, ctx.settings);
  const finish = async (fields: Omit<LedgerEntry, 'id' | 'at' | 'task' | 'mode' | 'ms'>): Promise<LedgerEntry> => {
    const entry = newEntry({ task: spec.task, mode: resolved.mode, ms: Date.now() - started, ...fields });
    await ctx.record(entry);
    return entry;
  };
  const invariant = async (note: string): Promise<RunResult> => {
    const entry = await finish({ outcome: 'error', sentChars: 0, note });
    return { status: 'error', kind: 'invariant', message: ERROR_TEXT.invariant, entry };
  };

  if (resolved.mode === 'disabled') {
    const entry = await finish({ outcome: 'disabled', sentChars: 0, note: resolved.reason });
    return { status: 'disabled', reason: resolved.reason, entry };
  }

  if (canReachCloud(resolved.mode)) {
    // These three checks cannot fail unless the code is changed carelessly. They are here for that day.
    if (task.touchesLearnerData) return invariant('A learner-data task resolved to a cloud-capable mode.');
    if (!spec.outbound) return invariant('A cloud-capable request had no outbound message to check.');
    if (spec.prompt !== outboundText(spec.outbound)) return invariant('The prompt differs from the text that was checked.');
    if (spec.image) return invariant('An image was attached to a cloud-capable request.');

    const verdict = checkOutbound(spec.outbound, ctx.guard);
    if (!verdict.ok) {
      const entry = await finish({
        outcome: 'blocked',
        sentChars: 0,
        note: `Blocked by the roster guard: ${verdict.hits.map((h) => h.kind).join(', ')}`,
      });
      return { status: 'blocked', hits: verdict.hits, entry };
    }
  }

  try {
    const result = await ctx.engine.run({
      task: spec.task,
      mode: resolved.mode,
      system: spec.system,
      prompt: spec.prompt,
      schema: spec.schema,
      image: spec.image,
      cloudModel: ctx.settings.cloudModel,
      search: spec.search,
    });

    const learnerOnly = task.touchesLearnerData || resolved.mode === 'only_on_device';
    const refused = result.refusedBeforeFallback;
    if (refused && learnerOnly) {
      // Cannot happen with the SDK's ONLY_ON_DEVICE mode. If it ever does, the ledger must show what left.
      const sent = `${spec.system}\n\n${spec.prompt}`;
      const entry = await finish({
        outcome: 'error',
        source: result.source,
        sentChars: sent.length,
        sentText: sent,
        note: `A learner-data request reached the cloud (HTTP ${refused.status}) before running on this laptop.`,
      });
      return { status: 'error', kind: 'invariant', message: ERROR_TEXT.invariant, entry };
    }
    if (result.source === 'in_cloud' && learnerOnly) {
      return invariant('The engine reported a cloud run for an on-device-only request.');
    }

    const sent = result.source === 'in_cloud' || refused ? `${spec.system}\n\n${spec.prompt}` : undefined;
    const entry = await finish({
      outcome: 'ok',
      source: result.source,
      sentChars: sent?.length ?? 0,
      sentText: sent,
      note: refused
        ? `The cloud refused it first (HTTP ${refused.status}), so it ran on this laptop. The text was still sent.`
        : undefined,
    });
    return {
      status: 'ok',
      text: result.text,
      source: result.source,
      sources: result.sources ?? [],
      searchHtml: result.searchHtml,
      entry,
    };
  } catch (error) {
    if (error instanceof CloudRefusedError || error instanceof CloudTimeoutError) {
      // The text was sent: the cloud either answered with an error or never answered in time.
      // Either way it left the laptop, so log exactly what was sent.
      const timedOut = error instanceof CloudTimeoutError;
      const sent = `${spec.system}\n\n${spec.prompt}`;
      const breach = task.touchesLearnerData || resolved.mode === 'only_on_device';
      const entry = await finish({
        outcome: 'error',
        source: 'in_cloud',
        sentChars: sent.length,
        sentText: sent,
        note: (breach
          ? `A learner-data request reached the cloud. ${error.message}`
          : `${timedOut ? 'timeout' : 'refused'}: ${error.message}`
        ).slice(0, 300),
      });
      if (breach) return { status: 'error', kind: 'invariant', message: ERROR_TEXT.invariant, entry };
      const kind = timedOut ? 'timeout' : 'refused';
      return { status: 'error', kind, message: ERROR_TEXT[kind], entry };
    }
    const kind: ErrorKind =
      error instanceof NoDeviceModelError ? 'no_device_model' : error instanceof OfflineError ? 'offline' : 'other';
    const detail = error instanceof Error ? error.message : String(error);
    const entry = await finish({ outcome: 'error', sentChars: 0, note: `${kind}: ${detail}`.slice(0, 300) });
    return { status: 'error', kind, message: ERROR_TEXT[kind], entry };
  }
}
