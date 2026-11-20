/**
 * The privacy ledger: one entry for every inference the app runs.
 * It is the evidence behind the claim that learner data never leaves the laptop.
 * The ledger itself stays on the laptop.
 */
import { uid } from './hash';
import { TASKS, type Mode, type TaskId } from './policy';
import type { InferenceSource } from './types';

export type Outcome = 'ok' | 'blocked' | 'disabled' | 'error';

/** A model task, or `share`: a plan sent to the shared plan library. No model runs for a share. */
export type LedgerTask = TaskId | 'share';
/** The mode for a model task. `library` for a share. */
export type LedgerMode = Mode | 'disabled' | 'library';

export interface LedgerEntry {
  id: string;
  at: number;
  task: LedgerTask;
  /** The mode the request was made in, after the rules were applied. */
  mode: LedgerMode;
  /** Where it really ran. Absent when nothing ran. */
  source?: InferenceSource;
  outcome: Outcome;
  /** Characters sent to the cloud. Zero for on-device runs. */
  sentChars: number;
  /** The exact text sent to the cloud. Absent for on-device runs: that text never left. */
  sentText?: string;
  ms: number;
  note?: string;
}

export function newEntry(fields: Omit<LedgerEntry, 'id' | 'at'>): LedgerEntry {
  return { id: uid('led'), at: Date.now(), ...fields };
}

/** True when the entry's text left the laptop, whether or not the cloud did the work. */
export function leftLaptop(e: LedgerEntry): boolean {
  return e.source === 'in_cloud' || e.sentChars > 0;
}

/** True when the text was sent to the cloud and no answer came back in time. */
export function timedOutInCloud(e: LedgerEntry): boolean {
  return e.source === 'in_cloud' && e.outcome === 'error' && (e.note ?? '').startsWith('timeout:');
}

/**
 * True when the text was sent and the cloud did not answer it: turned down, or no answer in time
 * (whatever ran afterwards).
 */
export function refusedByCloud(e: LedgerEntry): boolean {
  return (e.source === 'in_cloud' && e.outcome === 'error') || (e.source === 'on_device' && e.sentChars > 0);
}

/**
 * True when a task stopped because this browser has no on-device model.
 * That is the privacy rule working, not an error, so it is counted apart from failures.
 */
export function stoppedNoModel(e: LedgerEntry): boolean {
  return e.outcome === 'error' && !e.source && (e.note ?? '').startsWith('no_device_model:');
}

/** The "Ran" wording used on the ledger and self-test screens. */
export function ranText(e: LedgerEntry | null | undefined): string {
  if (e?.task === 'share') {
    if (e.outcome === 'ok') return 'Saved to the shared plan library';
    return e.sentChars > 0 ? 'Sent to the shared plan library, not saved' : 'Not sent';
  }
  if (!e?.source) return 'Did not run';
  if (e.source === 'in_cloud') {
    if (e.outcome !== 'error') return 'In the cloud';
    return timedOutInCloud(e) ? 'Sent to the cloud, no answer in time' : 'Sent to the cloud, refused';
  }
  return e.sentChars > 0 ? 'On this laptop, after the cloud refused' : 'On this laptop';
}

export interface LedgerSummary {
  total: number;
  onDevice: number;
  /** Requests the cloud actually answered. Refused ones are counted in `refusedInCloud`. */
  inCloud: number;
  /** Requests sent to the cloud and not answered: turned down, or no answer in time. The text still left the laptop. */
  refusedInCloud: number;
  blocked: number;
  disabled: number;
  /** Real failures. Stops for a missing on-device model are in `noDeviceModel`. */
  errors: number;
  /** Learner tasks that stopped because this browser has no on-device model. */
  noDeviceModel: number;
  charsSent: number;
  /** Must always be zero. Shown on screen as the headline number. */
  learnerTasksInCloud: number;
}

export function summarise(entries: LedgerEntry[]): LedgerSummary {
  const s: LedgerSummary = {
    total: entries.length,
    onDevice: 0,
    inCloud: 0,
    refusedInCloud: 0,
    blocked: 0,
    disabled: 0,
    errors: 0,
    noDeviceModel: 0,
    charsSent: 0,
    learnerTasksInCloud: 0,
  };
  for (const e of entries) {
    if (e.outcome === 'blocked') s.blocked += 1;
    else if (e.outcome === 'disabled') s.disabled += 1;
    else if (stoppedNoModel(e)) s.noDeviceModel += 1;
    else if (e.outcome === 'error') s.errors += 1;
    if (e.source === 'on_device') s.onDevice += 1;
    if (e.source === 'in_cloud' && e.outcome !== 'error') s.inCloud += 1;
    if (refusedByCloud(e)) s.refusedInCloud += 1;
    if (leftLaptop(e)) {
      s.charsSent += e.sentChars;
      if (e.task !== 'share' && TASKS[e.task].touchesLearnerData) s.learnerTasksInCloud += 1;
    }
  }
  return s;
}

/** Keep the ledger from growing without end. Newest entries are kept. */
export function trim(entries: LedgerEntry[], max = 2000): LedgerEntry[] {
  return entries.length > max ? entries.slice(entries.length - max) : entries;
}
