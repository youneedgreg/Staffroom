/**
 * A simulated engine for unit tests and the browser test. It calls no model.
 * It follows the same four modes as the real engine, so the routing can be tested
 * on a machine with no on-device model and no Firebase project.
 */
import type { DeviceStatus, Engine, EngineRequest, EngineResult } from './engine';
import { CloudRefusedError, CloudTimeoutError, NoDeviceModelError, OfflineError } from './engine';
import type { InferenceSource } from '../core/types';

export interface DemoOptions {
  device: DeviceStatus;
  online: boolean;
  delayMs: number;
  /** 'refused' turns down every grounded request with HTTP 429, as the free tier does (check 9). */
  grounding: 'ok' | 'refused';
  /** 'slow' makes every request that reaches the cloud go unanswered until the time limit. */
  cloud: 'ok' | 'slow';
}

const RANK = ['Exceeding Expectation', 'Meeting Expectation', 'Approaching Expectation', 'Below Expectation'];

function demoRemark(prompt: string): string {
  const levels = [...prompt.matchAll(/^- (.+?): (.+)$/gm)].map((m) => ({ topic: m[1] ?? '', rank: RANK.indexOf(m[2] ?? '') }));
  const sorted = [...levels].sort((a, b) => a.rank - b.rank);
  const best = sorted[0]?.topic.toLowerCase() ?? 'class work';
  const worst = sorted[sorted.length - 1]?.topic.toLowerCase() ?? 'new topics';
  return `[NAME] has worked well in ${best} this term. The next step is regular practice in ${worst}, a little each day.`;
}

function text(request: EngineRequest): string {
  switch (request.task) {
    case 'remark':
      return demoRemark(request.prompt);
    case 'difficulty': {
      const topic = /^Topic: (.+?) \(/m.exec(request.prompt)?.[1]?.toLowerCase() ?? 'this topic';
      return JSON.stringify({ difficulty: `mixing up the steps when working with ${topic}` });
    }
    case 'plan':
      return [
        'Activities',
        '1. Paper strips: learners fold equal strips into halves, thirds and sixths, then lay them side by side to compare.',
        '2. Number line walk: draw a line on the floor from 0 to 1 and have learners stand on a named point.',
        '3. Pair check: one learner works a sum aloud while the partner listens for the step that goes wrong.',
        'Check after two weeks',
        'Give five short questions of the same kind and compare with the first attempt.',
        'At home',
        'Ask the child to share a chapati or an orange equally between family members and name each share.',
      ].join('\n');
    case 'personalise':
      return JSON.stringify({ praise: 'neat work' });
    case 'lessonIdea':
      return 'Call out a number. Learners show it with fingers, then say one more and one less.';
    case 'plainWords':
      return 'Your child can do this with some help and is still making a few mistakes.';
    case 'marksheet':
      return JSON.stringify({ rows: [] });
  }
}

export class DemoEngine implements Engine {
  readonly name = 'Simulated engine (no model)';
  readonly simulated = true;
  readonly calls: EngineRequest[] = [];
  options: DemoOptions;

  constructor(options: Partial<DemoOptions> = {}) {
    this.options = { device: 'available', online: true, delayMs: 0, grounding: 'ok', cloud: 'ok', ...options };
  }

  private where(mode: EngineRequest['mode']): InferenceSource {
    const device = this.options.device === 'available';
    const online = this.options.online;
    switch (mode) {
      case 'only_on_device':
        if (!device) throw new NoDeviceModelError();
        return 'on_device';
      case 'only_in_cloud':
        if (!online) throw new OfflineError();
        return 'in_cloud';
      case 'prefer_on_device':
        if (device) return 'on_device';
        if (!online) throw new OfflineError();
        return 'in_cloud';
      case 'prefer_in_cloud':
        if (online) return 'in_cloud';
        if (!device) throw new OfflineError();
        return 'on_device';
    }
  }

  async run(request: EngineRequest): Promise<EngineResult> {
    this.calls.push(request);
    if (this.options.delayMs > 0) await new Promise((r) => setTimeout(r, this.options.delayMs));
    const source = this.where(request.mode);
    // The real SDK does not fall back to the device after a timeout, so neither does this.
    if (source === 'in_cloud' && this.options.cloud === 'slow') throw new CloudTimeoutError();
    if (request.search && source === 'in_cloud' && this.options.grounding === 'refused') {
      throw new CloudRefusedError(429, 'Grounding with Google Search is not available (simulated)');
    }
    const result: EngineResult = { text: text(request), source };
    if (request.task === 'plan' && source === 'in_cloud' && request.search) {
      result.sources = [{ title: 'Example source (simulated)', uri: 'https://example.com/' }];
    }
    return result;
  }

  async deviceStatus(): Promise<DeviceStatus> {
    return this.options.device;
  }

  async prepareDevice(onProgress: (progress: number) => void): Promise<void> {
    onProgress(1);
    this.options.device = 'available';
  }

  /** No model to load. */
  async warmDevice(): Promise<void> {}
}
