import { AIError, AIErrorCode, type AI } from 'firebase/ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudRefusedError, NoDeviceModelError, OfflineError, type EngineRequest } from '../src/engine/engine';
import { FirebaseEngine } from '../src/engine/firebase';

// Only the model factory is replaced: the errors are the SDK's own classes.
const generateContent = vi.fn();
vi.mock('firebase/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/ai')>();
  return { ...actual, getGenerativeModel: () => ({ generateContent }) };
});

const engine = () => new FirebaseEngine({} as AI);
const request = (mode: EngineRequest['mode']): EngineRequest => ({
  task: 'plan',
  mode,
  system: 'system',
  prompt: 'prompt',
  cloudModel: 'gemini-3.5-flash-lite',
  search: true,
});

// Node's `navigator` has no `onLine`; without this the engine's own offline check fires first.
beforeEach(() => vi.stubGlobal('navigator', { onLine: true }));
afterEach(() => {
  generateContent.mockReset();
  vi.unstubAllGlobals();
});

describe('FirebaseEngine: how SDK errors are reported', () => {
  it('reports an HTTP 429 as refused by the cloud, not as offline', async () => {
    generateContent.mockRejectedValue(
      new AIError(AIErrorCode.FETCH_ERROR, 'Error fetching from https://x: [429 ] You exceeded your current quota', {
        status: 429,
        statusText: '',
      }),
    );
    const error = await engine().run(request('only_in_cloud')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CloudRefusedError);
    expect((error as CloudRefusedError).status).toBe(429);
    expect((error as CloudRefusedError).message).toBe(
      'The cloud refused the request (HTTP 429): You exceeded your current quota',
    );
  });

  it('reports a request that got no response as offline', async () => {
    generateContent.mockRejectedValue(new AIError(AIErrorCode.ERROR, 'Error fetching from https://x: Failed to fetch'));
    await expect(engine().run(request('only_in_cloud'))).rejects.toBeInstanceOf(OfflineError);
  });

  it('reports a missing on-device model for an on-device-only request', async () => {
    vi.stubGlobal('LanguageModel', { availability: async () => 'available' });
    generateContent.mockRejectedValue(new AIError(AIErrorCode.UNSUPPORTED, 'no model'));
    await expect(engine().run(request('only_on_device'))).rejects.toBeInstanceOf(NoDeviceModelError);
  });
});
