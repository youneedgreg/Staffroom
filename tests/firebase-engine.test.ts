import { AIError, AIErrorCode, type AI } from 'firebase/ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_TIMEOUT_MS,
  CloudRefusedError,
  CloudTimeoutError,
  NoDeviceModelError,
  OfflineError,
  type EngineRequest,
} from '../src/engine/engine';
import { FirebaseEngine, resetFetchWatchForTests } from '../src/engine/firebase';

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
beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true });
  resetFetchWatchForTests();
});
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

  it('gives every request that can reach the cloud a 30-second limit, and none to an on-device-only one', async () => {
    vi.stubGlobal('LanguageModel', { availability: async () => 'available' });
    generateContent.mockResolvedValue({ response: { inferenceSource: 'in_cloud', text: () => 'ok' } });
    for (const mode of ['only_in_cloud', 'prefer_in_cloud', 'prefer_on_device'] as const) {
      generateContent.mockClear();
      await engine().run(request(mode));
      expect(generateContent.mock.calls[0]?.[1]).toEqual({ timeout: CLOUD_TIMEOUT_MS });
    }
    generateContent.mockClear();
    generateContent.mockResolvedValue({ response: { inferenceSource: 'on_device', text: () => 'ok' } });
    await engine().run(request('only_on_device'));
    expect(generateContent.mock.calls[0]?.[1]).toBeUndefined();
    expect(CLOUD_TIMEOUT_MS).toBe(30_000);
  });

  it('reports a request the SDK stopped waiting for as timed out, not as offline', async () => {
    generateContent.mockRejectedValue(new DOMException('signal is aborted without reason', 'AbortError'));
    for (const mode of ['only_in_cloud', 'prefer_in_cloud'] as const) {
      const error = await engine().run(request(mode)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CloudTimeoutError);
      expect((error as Error).message).toBe('The cloud did not answer within 30 seconds.');
    }
  });

  it('reports a missing on-device model for an on-device-only request', async () => {
    vi.stubGlobal('LanguageModel', { availability: async () => 'available' });
    generateContent.mockRejectedValue(new AIError(AIErrorCode.UNSUPPORTED, 'no model'));
    await expect(engine().run(request('only_on_device'))).rejects.toBeInstanceOf(NoDeviceModelError);
  });
});

describe('FirebaseEngine: PREFER_IN_CLOUD falling back to the device', () => {
  const lesson = (prompt = 'Suggest a starter activity for "Fractions".'): EngineRequest => ({
    task: 'lessonIdea',
    mode: 'prefer_in_cloud',
    system: 'system',
    prompt,
    cloudModel: 'gemini-3.5-flash-lite',
  });

  /** Make the mocked SDK call fetch with a body that carries `bodyPrompt`, then report `source`. */
  function sdkCalls(bodyPrompt: string, source: 'on_device' | 'in_cloud') {
    generateContent.mockImplementation(async () => {
      try {
        await fetch('https://firebasevertexai.googleapis.com/x', {
          method: 'POST',
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: bodyPrompt }] }] }),
        });
      } catch {
        // The SDK swallows the cloud error and falls back.
      }
      return { response: { inferenceSource: source, text: () => 'ok', candidates: [] } };
    });
  }

  it('flags a request the cloud refused (HTTP 429) before the device ran it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    sdkCalls(lesson().prompt, 'on_device');
    const result = await engine().run(lesson());
    expect(result.source).toBe('on_device');
    expect(result.refusedBeforeFallback).toEqual({ status: 429 });
  });

  it('does not flag a fallback when the cloud gave no response (nothing left)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    sdkCalls(lesson().prompt, 'on_device');
    const result = await engine().run(lesson());
    expect(result.source).toBe('on_device');
    expect(result.refusedBeforeFallback).toBeUndefined();
  });

  it('does not flag a request the cloud answered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    sdkCalls(lesson().prompt, 'in_cloud');
    const result = await engine().run(lesson());
    expect(result.source).toBe('in_cloud');
    expect(result.refusedBeforeFallback).toBeUndefined();
  });

  it('ignores fetches that carry a different prompt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    sdkCalls('Some other "question"', 'on_device');
    const result = await engine().run(lesson());
    expect(result.refusedBeforeFallback).toBeUndefined();
  });

  it('matches a prompt with quotes and new lines as the SDK writes it in JSON', async () => {
    const prompt = 'Line one "quoted"\nLine two';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    sdkCalls(prompt, 'on_device');
    const result = await engine().run(lesson(prompt));
    expect(result.refusedBeforeFallback).toEqual({ status: 503 });
  });
});
