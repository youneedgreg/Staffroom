/** Decide which engine to use and load what is stored on this laptop. */
import { DEFAULT_SETTINGS, type Settings } from '../core/policy';
import { DemoEngine } from '../engine/demo';
import type { DeviceStatus, Engine } from '../engine/engine';
import { demoLibrary, type PlanLibrary } from '../core/library';
import { browserStore, Repo, type AppData } from '../store/store';

export interface Boot {
  engine: Engine;
  settings: Settings;
  watchSettings: (onChange: (settings: Settings) => void) => () => void;
  plans: PlanLibrary | null;
  repo: Repo;
  data: AppData;
  /** Why the simulated engine is in use, if it is. */
  simulatedReason: string | null;
}

export async function boot(): Promise<Boot> {
  const repo = new Repo(browserStore());
  const data = await repo.load();
  const params = new URLSearchParams(location.search);
  const base = { repo, data };

  // `?engine=demo` is for the browser test and for looking at the screens with no Firebase project.
  // `&device=unavailable` and `&offline=1` let the test check both failure paths.
  // `&grounding=refused` turns down grounded plans with HTTP 429, as the free tier does (Route A).
  // `&cloud=slow` leaves every cloud request unanswered until the 30-second limit.
  // `&library=demo` adds an in-memory plan library; `&library=down` makes it fail.
  const forced = params.get('engine') === 'demo';
  const { hasFirebaseConfig, startFirebase } = await import('../firebase/services');
  if (forced || !hasFirebaseConfig()) {
    const engine = new DemoEngine({
      device: (params.get('device') as DeviceStatus | null) ?? 'available',
      online: params.get('offline') !== '1',
      delayMs: Number(params.get('delay') ?? 0),
      grounding: params.get('grounding') === 'refused' ? 'refused' : 'ok',
      cloud: params.get('cloud') === 'slow' ? 'slow' : 'ok',
    });
    const policy = params.get('policy') === 'strict' ? 'strict' : 'standard';
    return {
      ...base,
      engine,
      settings: { ...DEFAULT_SETTINGS, policy },
      watchSettings: () => () => undefined,
      plans: params.get('library') ? demoLibrary(params.get('library') === 'down') : null,
      simulatedReason: forced
        ? 'Simulated engine: asked for in the address bar.'
        : 'Simulated engine: no Firebase settings found. Copy .env.example to .env.local and fill it in.',
    };
  }

  const services = await startFirebase();
  return { ...base, ...services, simulatedReason: null };
}
