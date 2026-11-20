/** The teacher-facing jobs, each built from a prompt, the runner and a parser. */
import { groupNotes, type Group } from './groups';
import {
  buildParentNote,
  parsePraise,
  cleanRemark,
  difficultyPrompt,
  firstName,
  parentNotePrompt,
  parseDifficulty,
  parsePlan,
  planPrompt,
  remarkInputHash,
  remarkPrompt,
  type ParsedPlan,
} from './prompts';
import { runTask, type RunContext, type RunResult } from './runner';
import { uid } from './hash';
import type { ClassData, CurriculumPack, Learner, Plan, Remark } from './types';

export type Failure = Exclude<RunResult, { status: 'ok' }>;

/** True when the learner has at least one level and no up-to-date remark. */
export function needsRemark(pack: CurriculumPack, data: ClassData, learner: Learner, existing?: Remark): boolean {
  const assessment = data.assessments[learner.id];
  if (!assessment || Object.keys(assessment.levels).length === 0) return false;
  if (!existing) return true;
  if (existing.status !== 'draft') return false; // Never overwrite the teacher's own edits.
  return existing.inputHash !== remarkInputHash(pack, assessment);
}

export async function draftRemark(
  ctx: RunContext,
  pack: CurriculumPack,
  data: ClassData,
  learner: Learner,
): Promise<{ remark: Remark } | { failure: Failure }> {
  const assessment = data.assessments[learner.id];
  if (!assessment) throw new Error(`No assessment for learner ${learner.id}`);
  const result = await runTask(ctx, remarkPrompt(pack, learner, assessment, data.learners));
  if (result.status !== 'ok') return { failure: result };
  const text = cleanRemark(result.text, firstName(learner));
  if (!text) {
    return { failure: { status: 'error', kind: 'other', message: 'The model returned an empty remark.', entry: result.entry } };
  }
  return {
    remark: {
      learnerId: learner.id,
      text,
      inputHash: remarkInputHash(pack, assessment),
      source: result.source,
      status: 'draft',
      at: Date.now(),
    },
  };
}

/** On-device: one phrase for what the group finds hard. Empty when there are no notes. */
export async function summariseDifficulty(
  ctx: RunContext,
  pack: CurriculumPack,
  data: ClassData,
  group: Group,
): Promise<{ difficulty: string } | { failure: Failure }> {
  const notes = groupNotes(data, pack, group);
  if (notes.length === 0) return { difficulty: '' };
  const result = await runTask(ctx, difficultyPrompt(pack, group, notes, data.learners));
  if (result.status !== 'ok') return { failure: result };
  return { difficulty: parseDifficulty(result.text) };
}

/**
 * Cloud: the one request that leaves the laptop. The runner applies the roster guard.
 * `search: false` is Route A's second send: the same question, without Google Search,
 * only after the grounded one was refused and the teacher clicked again. Never called on its own.
 */
export async function askPlan(
  ctx: RunContext,
  pack: CurriculumPack,
  group: Group,
  difficulty: string,
  options: { search?: boolean } = {},
): Promise<{ plan: Plan; parsed: ParsedPlan } | { failure: Failure }> {
  const search = options.search ?? true;
  const spec = planPrompt(pack, group, difficulty, search);
  const result = await runTask(ctx, spec);
  if (result.status !== 'ok') return { failure: result };
  const plan: Plan = {
    id: uid('plan'),
    packId: pack.id,
    subStrandId: group.subStrand.id,
    question: spec.prompt,
    answer: result.text,
    sources: result.sources,
    searchHtml: result.searchHtml,
    grounded: search,
    at: Date.now(),
  };
  return { plan, parsed: parsePlan(result.text) };
}

/**
 * On-device: a word of praise copied from the learner's note, then code adds the difficulty
 * phrase the teacher reviewed and the cloud's home activity.
 */
export async function writeParentNote(
  ctx: RunContext,
  data: ClassData,
  group: Group,
  learner: Learner,
  homeActivity: string,
  difficulty: string,
): Promise<{ note: string } | { failure: Failure }> {
  const assessment = data.assessments[learner.id];
  if (!assessment) throw new Error(`No assessment for learner ${learner.id}`);
  const spec = parentNotePrompt(learner, assessment, data.learners);
  const result = await runTask(ctx, spec);
  if (result.status !== 'ok') return { failure: result };
  const first = firstName(learner);
  const note = buildParentNote(parsePraise(result.text, first, assessment.note), first, {
    topic: group.subStrand.name,
    teacherNote: assessment.note,
    difficulty,
    homeActivity,
  });
  return { note };
}
