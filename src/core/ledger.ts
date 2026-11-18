/**
 * The privacy ledger: one entry for every inference the app runs.
 * It is the evidence behind the claim that learner data never leaves the laptop.
 * The ledger itself stays on the laptop.
 */
import { uid } from './hash';
import { TASKS, type Mode, type TaskId } from './policy';
import type { InferenceSource } from './types';

export type Outcome = 'ok' | 'blocked' | 'disabled' | 'error';

export interface LedgerEntry {
  id: string;
  at: number;
  task: TaskId;
  /** The mode the request was made in, after the rules were applied. */
  mode: Mode | 'disabled';
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

export interface LedgerSummary {
  total: number;
  onDevice: number;
  inCloud: number;
  blocked: number;
  disabled: number;
  errors: number;
  charsSent: number;
  /** Must always be zero. Shown on screen as the headline number. */
  learnerTasksInCloud: number;
}

export function summarise(entries: LedgerEntry[]): LedgerSummary {
  const s: LedgerSummary = {
    total: entries.length,
    onDevice: 0,
    inCloud: 0,
    blocked: 0,
    disabled: 0,
    errors: 0,
    charsSent: 0,
    learnerTasksInCloud: 0,
  };
  for (const e of entries) {
    if (e.outcome === 'blocked') s.blocked += 1;
    else if (e.outcome === 'disabled') s.disabled += 1;
    else if (e.outcome === 'error') s.errors += 1;
    if (e.source === 'on_device') s.onDevice += 1;
    if (e.source === 'in_cloud') {
      s.inCloud += 1;
      s.charsSent += e.sentChars;
      if (TASKS[e.task].touchesLearnerData) s.learnerTasksInCloud += 1;
    }
  }
  return s;
}

/** Keep the ledger from growing without end. Newest entries are kept. */
export function trim(entries: LedgerEntry[], max = 2000): LedgerEntry[] {
  return entries.length > max ? entries.slice(entries.length - max) : entries;
}
