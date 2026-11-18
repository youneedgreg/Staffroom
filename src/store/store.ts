/**
 * Where learner data lives: IndexedDB in this browser, on this laptop.
 * Nothing in this file talks to a network.
 */
import { del, get, set } from 'idb-keyval';
import { trim, type LedgerEntry } from '../core/ledger';
import type { ClassData, Plan, Remark } from '../core/types';

export interface KeyValue {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

/** IndexedDB. Falls back to memory if storage is blocked, so the app still works for one sitting. */
export function browserStore(): KeyValue {
  const memory = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      try {
        return (await get<T>(key)) ?? (memory.get(key) as T | undefined);
      } catch {
        return memory.get(key) as T | undefined;
      }
    },
    async set<T>(key: string, value: T) {
      memory.set(key, value);
      try {
        await set(key, value);
      } catch {
        // Kept in memory only.
      }
    },
    async del(key: string) {
      memory.delete(key);
      try {
        await del(key);
      } catch {
        // Nothing to remove.
      }
    },
  };
}

export function memoryStore(): KeyValue {
  const memory = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return structuredClone(memory.get(key)) as T | undefined;
    },
    async set<T>(key: string, value: T) {
      memory.set(key, structuredClone(value));
    },
    async del(key: string) {
      memory.delete(key);
    },
  };
}

const KEYS = {
  classData: 'staffroom:class',
  remarks: 'staffroom:remarks',
  ledger: 'staffroom:ledger',
  plans: 'staffroom:plans',
} as const;

export interface AppData {
  classData: ClassData | null;
  remarks: Record<string, Remark>;
  ledger: LedgerEntry[];
  plans: Plan[];
}

export class Repo {
  constructor(private readonly kv: KeyValue) {}

  async load(): Promise<AppData> {
    const [classData, remarks, ledger, plans] = await Promise.all([
      this.kv.get<ClassData>(KEYS.classData),
      this.kv.get<Record<string, Remark>>(KEYS.remarks),
      this.kv.get<LedgerEntry[]>(KEYS.ledger),
      this.kv.get<Plan[]>(KEYS.plans),
    ]);
    return { classData: classData ?? null, remarks: remarks ?? {}, ledger: ledger ?? [], plans: plans ?? [] };
  }

  saveClass(data: ClassData): Promise<void> {
    return this.kv.set(KEYS.classData, data);
  }

  saveRemarks(remarks: Record<string, Remark>): Promise<void> {
    return this.kv.set(KEYS.remarks, remarks);
  }

  saveLedger(entries: LedgerEntry[]): Promise<void> {
    return this.kv.set(KEYS.ledger, trim(entries));
  }

  savePlans(plans: Plan[]): Promise<void> {
    return this.kv.set(KEYS.plans, plans.slice(-50));
  }

  /** Remove everything Staffroom has stored on this laptop. */
  async wipe(): Promise<void> {
    await Promise.all(Object.values(KEYS).map((k) => this.kv.del(k)));
  }
}
