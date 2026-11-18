import { describe, expect, it } from 'vitest';
import {
  canReachCloud,
  DEFAULT_SETTINGS,
  MODES,
  parseSettings,
  RC_KEYS,
  resolveMode,
  TASK_IDS,
  TASKS,
  type Settings,
  type TaskId,
} from '../src/core/policy';

const LEARNER_TASKS = TASK_IDS.filter((t) => TASKS[t].touchesLearnerData);
const OPEN_TASKS = TASK_IDS.filter((t) => !TASKS[t].touchesLearnerData);

describe('the task table', () => {
  it('has four learner-data tasks and three open ones', () => {
    expect(LEARNER_TASKS).toEqual(['remark', 'difficulty', 'marksheet', 'personalise']);
    expect(OPEN_TASKS).toEqual(['plan', 'lessonIdea', 'plainWords']);
  });

  it('uses all four modes by default, each for a stated reason', () => {
    const used = new Set(TASK_IDS.map((t) => TASKS[t].defaultMode));
    expect([...used].sort()).toEqual([...MODES].sort());
    for (const t of TASK_IDS) expect(TASKS[t].why.length).toBeGreaterThan(20);
  });
});

describe('resolveMode', () => {
  it('keeps every learner-data task on the device under every possible setting', () => {
    let checked = 0;
    for (const task of LEARNER_TASKS) {
      for (const policy of ['standard', 'strict'] as const) {
        for (const override of [undefined, ...MODES]) {
          const settings: Settings = { ...DEFAULT_SETTINGS, policy, modes: override ? { [task]: override } : {} };
          const r = resolveMode(task, settings);
          expect(r.mode, `${task} ${policy} ${override}`).toBe('only_on_device');
          expect(canReachCloud(r.mode)).toBe(false);
          expect(r.clamped).toBe(override !== undefined && override !== 'only_on_device');
          checked += 1;
        }
      }
    }
    expect(checked).toBe(40);
  });

  it('uses the default modes under the standard policy', () => {
    expect(resolveMode('plan', DEFAULT_SETTINGS).mode).toBe('only_in_cloud');
    expect(resolveMode('lessonIdea', DEFAULT_SETTINGS).mode).toBe('prefer_in_cloud');
    expect(resolveMode('plainWords', DEFAULT_SETTINGS).mode).toBe('prefer_on_device');
  });

  it('lets Remote Config retune an open task', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, modes: { lessonIdea: 'only_on_device' } };
    expect(resolveMode('lessonIdea', settings)).toMatchObject({ mode: 'only_on_device', clamped: false });
  });

  it('lets nothing reach the cloud under the strict policy', () => {
    const strict: Settings = { ...DEFAULT_SETTINGS, policy: 'strict' };
    expect(resolveMode('plan', strict).mode).toBe('disabled');
    expect(resolveMode('lessonIdea', strict).mode).toBe('only_on_device');
    expect(resolveMode('plainWords', strict).mode).toBe('only_on_device');
    for (const task of TASK_IDS) {
      for (const override of MODES) {
        const r = resolveMode(task, { ...strict, modes: { [task]: override } as Partial<Record<TaskId, typeof override>> });
        expect(canReachCloud(r.mode), `${task} ${override}`).toBe(false);
      }
    }
  });
});

describe('parseSettings', () => {
  it('returns the defaults for empty input', () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('reads valid values', () => {
    const s = parseSettings({
      [RC_KEYS.policy]: 'strict',
      [RC_KEYS.cloudModel]: 'gemini-3.5-flash',
      [RC_KEYS.modes]: '{"lessonIdea":"only_on_device","plainWords":"prefer_in_cloud"}',
    });
    expect(s).toEqual({
      policy: 'strict',
      cloudModel: 'gemini-3.5-flash',
      modes: { lessonIdea: 'only_on_device', plainWords: 'prefer_in_cloud' },
    });
  });

  it('ignores anything malformed', () => {
    expect(parseSettings({ [RC_KEYS.policy]: 'open', [RC_KEYS.cloudModel]: 'x y; drop', [RC_KEYS.modes]: 'not json' })).toEqual(
      DEFAULT_SETTINGS,
    );
    expect(parseSettings({ [RC_KEYS.modes]: '{"plan":"anywhere","nonsense":"only_in_cloud"}' }).modes).toEqual({});
    expect(parseSettings({ [RC_KEYS.modes]: '["only_in_cloud"]' }).modes).toEqual({});
  });

  it('cannot be used to move a learner-data task off the device', () => {
    const s = parseSettings({ [RC_KEYS.modes]: '{"remark":"only_in_cloud","marksheet":"prefer_in_cloud"}' });
    expect(resolveMode('remark', s)).toMatchObject({ mode: 'only_on_device', clamped: true });
    expect(resolveMode('marksheet', s)).toMatchObject({ mode: 'only_on_device', clamped: true });
  });
});
