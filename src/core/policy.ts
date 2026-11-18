/**
 * Which task may run where.
 *
 * The one rule that no setting can change: a task that touches learner data runs
 * ONLY on the device. Remote Config can tune everything else.
 */

export type Mode = 'only_on_device' | 'prefer_on_device' | 'prefer_in_cloud' | 'only_in_cloud';

export const MODES: readonly Mode[] = ['only_on_device', 'prefer_on_device', 'prefer_in_cloud', 'only_in_cloud'];

export type TaskId =
  | 'remark'
  | 'difficulty'
  | 'marksheet'
  | 'personalise'
  | 'plan'
  | 'lessonIdea'
  | 'plainWords';

export interface TaskSpec {
  id: TaskId;
  label: string;
  /** True when the prompt holds anything about a child. */
  touchesLearnerData: boolean;
  defaultMode: Mode;
  /** One line for the screen and the README: why this mode. */
  why: string;
}

export const TASKS: Record<TaskId, TaskSpec> = {
  remark: {
    id: 'remark',
    label: 'Draft a report remark',
    touchesLearnerData: true,
    defaultMode: 'only_on_device',
    why: "Holds a learner's levels and the teacher's note.",
  },
  difficulty: {
    id: 'difficulty',
    label: "Sum up a group's common difficulty",
    touchesLearnerData: true,
    defaultMode: 'only_on_device',
    why: "Reads the teacher's notes on several learners.",
  },
  marksheet: {
    id: 'marksheet',
    label: 'Read a mark-sheet photo',
    touchesLearnerData: true,
    defaultMode: 'only_on_device',
    why: 'The photo shows names and levels.',
  },
  personalise: {
    id: 'personalise',
    label: 'Write a note to a parent',
    touchesLearnerData: true,
    defaultMode: 'only_on_device',
    why: "Joins the plan to one learner's levels and note.",
  },
  plan: {
    id: 'plan',
    label: 'Ask for a remedial plan',
    touchesLearnerData: false,
    defaultMode: 'only_in_cloud',
    why: 'Needs curriculum knowledge and web sources. The small model cannot be trusted for facts.',
  },
  lessonIdea: {
    id: 'lessonIdea',
    label: 'Suggest a starter activity',
    touchesLearnerData: false,
    defaultMode: 'prefer_in_cloud',
    why: 'Better from the cloud, still useful offline from the device.',
  },
  plainWords: {
    id: 'plainWords',
    label: 'Put a level into plain words',
    touchesLearnerData: false,
    defaultMode: 'prefer_on_device',
    why: 'Simple rewording. Free on the device, and harmless if it falls back.',
  },
};

export const TASK_IDS = Object.keys(TASKS) as TaskId[];

/** `standard`: curriculum questions may reach the cloud. `strict`: nothing leaves the laptop. */
export type SchoolPolicy = 'standard' | 'strict';

export interface Settings {
  policy: SchoolPolicy;
  /** Cloud model name. Kept in Remote Config so it can change without a release. */
  cloudModel: string;
  /** Per-task overrides. Ignored for tasks that touch learner data. */
  modes: Partial<Record<TaskId, Mode>>;
}

export const DEFAULT_SETTINGS: Settings = {
  policy: 'standard',
  cloudModel: 'gemini-3.5-flash-lite',
  modes: {},
};

/** Remote Config parameter names. */
export const RC_KEYS = {
  policy: 'school_policy',
  cloudModel: 'cloud_model',
  modes: 'task_modes',
} as const;

function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

/**
 * Turn raw Remote Config strings into settings.
 * Anything missing or malformed falls back to the default, so a bad publish cannot break the app.
 */
export function parseSettings(raw: Partial<Record<string, string>>): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS, modes: {} };

  const policy = raw[RC_KEYS.policy]?.trim();
  if (policy === 'strict' || policy === 'standard') settings.policy = policy;

  const model = raw[RC_KEYS.cloudModel]?.trim();
  if (model && /^[a-z0-9][a-z0-9.-]{2,60}$/.test(model)) settings.cloudModel = model;

  const modes = raw[RC_KEYS.modes]?.trim();
  if (modes) {
    try {
      const parsed: unknown = JSON.parse(modes);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if ((TASK_IDS as string[]).includes(key) && isMode(value)) settings.modes[key as TaskId] = value;
        }
      }
    } catch {
      // Keep the defaults.
    }
  }
  return settings;
}

export interface Resolved {
  /** `disabled` means the task may not run at all under the current policy. */
  mode: Mode | 'disabled';
  /** True when a setting asked for something the rules do not allow. */
  clamped: boolean;
  reason: string;
}

/** The mode a task will really run in. This is the only place that decides it. */
export function resolveMode(task: TaskId, settings: Settings): Resolved {
  const spec = TASKS[task];
  const asked = settings.modes[task];

  if (spec.touchesLearnerData) {
    const clamped = asked !== undefined && asked !== 'only_on_device';
    return {
      mode: 'only_on_device',
      clamped,
      reason: clamped
        ? 'This task holds learner data, so the setting was ignored. It runs on this laptop only.'
        : 'This task holds learner data. It runs on this laptop only.',
    };
  }

  const wanted = asked ?? spec.defaultMode;

  if (settings.policy === 'strict') {
    if (wanted === 'only_in_cloud') {
      return { mode: 'disabled', clamped: true, reason: 'Your school allows nothing to leave the laptop, so this is switched off.' };
    }
    return {
      mode: 'only_on_device',
      clamped: wanted !== 'only_on_device',
      reason: 'Your school allows nothing to leave the laptop. This runs on the device.',
    };
  }

  return { mode: wanted, clamped: false, reason: spec.why };
}

/** True when a request in this mode could send text off the laptop. */
export function canReachCloud(mode: Mode | 'disabled'): boolean {
  return mode === 'prefer_on_device' || mode === 'prefer_in_cloud' || mode === 'only_in_cloud';
}
