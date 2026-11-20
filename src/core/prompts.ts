/**
 * Every prompt the app sends, in one place.
 *
 * On-device prompts are short on purpose: the small model does best with one clear job,
 * and the on-device limit is 9,216 tokens for the whole request.
 */
import { fold, redactNames, type Outbound, outboundText } from './guard';
import type { Group } from './groups';
import { fnv1a } from './hash';
import type { TaskId } from './policy';
import { LEVELS, type Assessment, type CurriculumPack, type Learner, type Level, type SubStrand } from './types';

/** Bump when a prompt changes, so saved remarks are redrafted. */
export const PROMPT_VERSION = 2;

export interface PromptSpec {
  task: TaskId;
  system: string;
  prompt: string;
  /** JSON Schema for structured output. */
  schema?: Record<string, unknown>;
  /** Present on every task that can reach the cloud. The guard checks it. */
  outbound?: Outbound;
  /** Ask the cloud model to ground its answer with Google Search. */
  search?: boolean;
  image?: { mimeType: 'image/jpeg' | 'image/png'; base64: string };
}

const NAME_TOKEN = '[NAME]';

export function firstName(learner: Learner): string {
  return learner.name.trim().split(/\s+/)[0] ?? learner.name;
}

function levelLines(pack: CurriculumPack, assessment: Assessment): string[] {
  const lines: string[] = [];
  for (const s of pack.subStrands) {
    const level = assessment.levels[s.id];
    if (level) lines.push(`- ${s.name}: ${pack.levelNames[level]}`);
  }
  return lines;
}

/** Cut text to a number of characters at a word boundary. */
export function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space >= max * 0.5 ? cut.slice(0, space) : cut).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// 1. Report remark. ONLY_ON_DEVICE.
// ---------------------------------------------------------------------------

export const REMARK_SYSTEM =
  'You write end-of-term report remarks for a primary school class teacher in Kenya. ' +
  `Write exactly two sentences, 45 words at most, about ${NAME_TOKEN} in the third person. ` +
  'Never write "you" or "your". ' +
  'Sentence one praises the strength given. Sentence two gives the next step given. ' +
  'Use the topic names exactly as given and never swap one operation for another. ' +
  "The teacher's note may describe a mistake: never praise it, use it only for the next step. " +
  'Use only the facts given. Be kind and specific. Plain British English. ' +
  'Do not use the level names or their initials. No lists, no quotation marks.';

/**
 * The strength and the next step are chosen here, from the levels, not by the model.
 * The small model picked them itself before and praised a topic the learner was behind in.
 */
export function remarkFocus(pack: CurriculumPack, assessment: Assessment): { strength: string; nextStep: string } {
  const rated = pack.subStrands
    .map((s) => ({ name: s.name, rank: assessment.levels[s.id] ? LEVELS.indexOf(assessment.levels[s.id]!) : -1 }))
    .filter((t) => t.rank >= 0);
  if (rated.length === 0) {
    return { strength: "take it from the teacher's note", nextStep: "take it from the teacher's note" };
  }
  const best = Math.min(...rated.map((t) => t.rank));
  const worst = Math.max(...rated.map((t) => t.rank));
  const top = rated.filter((t) => t.rank === best).slice(0, 2).map((t) => t.name);
  const strength =
    best === LEVELS.indexOf('BE') ? "effort, or a strength from the teacher's note" : top.join(' and ');
  const nextStep =
    worst > best
      ? `more practice in ${rated.find((t) => t.rank === worst)!.name}`
      : best === LEVELS.indexOf('BE')
        ? `more practice in ${rated[0]!.name}`
        : `harder problems in ${top[0]}`;
  return { strength, nextStep };
}

export function remarkInputHash(pack: CurriculumPack, assessment: Assessment): string {
  const levels = pack.subStrands.map((s) => assessment.levels[s.id] ?? '-').join(',');
  return fnv1a(`${PROMPT_VERSION}|${pack.id}|${levels}|${assessment.note.trim()}`);
}

/** The learner's own name becomes the token. Any other learner becomes "a classmate". */
function prepareNote(note: string, learner: Learner, roster: Learner[]): string {
  const own = redactNames(note, [learner], NAME_TOKEN);
  const others = roster.filter((l) => l.id !== learner.id);
  return redactNames(own, others, 'a classmate');
}

export function remarkPrompt(
  pack: CurriculumPack,
  learner: Learner,
  assessment: Assessment,
  roster: Learner[] = [learner],
): PromptSpec {
  // The teacher's note may use the learner's own name. Swap it for the token, so the
  // model has one way to refer to the learner and code fills in the name afterwards.
  const note = prepareNote(assessment.note, learner, roster);
  const focus = remarkFocus(pack, assessment);
  const prompt = [
    `Learning area: ${pack.learningArea}, ${pack.grade}.`,
    'Levels this term:',
    ...levelLines(pack, assessment),
    `Teacher's note: ${note.trim() ? clip(note, 400) : 'none'}`,
    `Strength: ${focus.strength}.`,
    `Next step: ${focus.nextStep}.`,
    `Write the remark for ${NAME_TOKEN}.`,
  ].join('\n');
  return { task: 'remark', system: REMARK_SYSTEM, prompt };
}

/** Tidy what the small model returns and put the real first name back in. */
export function cleanRemark(raw: string, name: string): string {
  let text = raw
    .replace(/^\s*(remark|report remark)\s*[:\-]\s*/i, '')
    .replace(/[*_#`]/g, '')
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  text = text.replace(/\[\s*name\s*\]|\{\s*name\s*\}|<\s*name\s*>/gi, name);
  // Keep at most three sentences and sixty words.
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  text = sentences.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim();
  const wordsList = text.split(' ');
  if (wordsList.length > 60) text = wordsList.slice(0, 60).join(' ').replace(/[,;:]$/, '') + '.';
  if (text && !/[.!?]$/.test(text)) text += '.';
  return text;
}

// ---------------------------------------------------------------------------
// 2. A group's common difficulty. ONLY_ON_DEVICE, structured output.
// ---------------------------------------------------------------------------

/**
 * The phrase is put after "The difficulty they share:" in the question to the cloud, so it must
 * finish that sentence. Each learner's note covers every topic, so the model is told to keep to
 * this one. The example is from a topic that isn't in the sample class, so it can't be copied.
 */
export const DIFFICULTY_SYSTEM =
  "You read a teacher's short notes about learners who struggle with one maths topic. " +
  'A note may also mention other topics: use only what is about the given topic. ' +
  'Write the one mistake most of them share, as a phrase that finishes this sentence: ' +
  '"The difficulty they share: ...". ' +
  'Start with a lowercase verb ending in -ing that says what the learners do, for example ' +
  '"reading the hour hand as the minutes when telling the time". ' +
  'One phrase of 18 words at most, not a list. Use only what the notes say. ' +
  'If no note is about the given topic, return an empty string. ' +
  'Describe the mathematics only. Never name or describe a person.';

export const DIFFICULTY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  // No maxLength: on the device the schema is enforced while the model writes, so a
  // length limit stops it mid-word ("…misinterpre"). The word limit is applied after.
  properties: { difficulty: { type: 'string' } },
  required: ['difficulty'],
  additionalProperties: false,
};

export function difficultyPrompt(
  pack: CurriculumPack,
  group: Group,
  notes: string[],
  roster: Learner[],
): PromptSpec {
  // Names are stripped before the notes reach even the on-device model,
  // so its summary has no name to repeat.
  const lines = notes.map((n) => `- ${clip(redactNames(n, roster), 220)}`);
  let body = lines.join('\n');
  if (body.length > 1600) body = clip(body, 1600);
  const prompt = [
    `Topic: ${group.subStrand.name} (${pack.learningArea}, ${pack.grade}).`,
    'Notes:',
    body || '- none',
    'Return JSON: {"difficulty": "..."}',
  ].join('\n');
  return { task: 'difficulty', system: DIFFICULTY_SYSTEM, prompt, schema: DIFFICULTY_SCHEMA };
}

export function parseDifficulty(raw: string): string {
  let text = raw.trim();
  const brace = text.indexOf('{');
  if (brace >= 0) {
    try {
      const parsed: unknown = JSON.parse(text.slice(brace, text.lastIndexOf('}') + 1));
      if (parsed && typeof parsed === 'object') {
        const value = (parsed as { difficulty?: unknown }).difficulty;
        if (typeof value !== 'string') return '';
        text = value;
      }
    } catch {
      // Fall through and treat the reply as plain text.
    }
  }
  text = text.replace(/[*_#`"{}]/g, '').replace(/^difficulty\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
  const first = text.match(/[^.!?]+/)?.[0]?.trim() ?? '';
  const wordsList = first.split(' ').filter(Boolean);
  const phrase = wordsList.slice(0, 25).join(' ');
  // It follows "The difficulty they share:", so "Adding …" becomes "adding …". Acronyms stay.
  return /^[A-Z][a-z]/.test(phrase) ? phrase.charAt(0).toLowerCase() + phrase.slice(1) : phrase;
}

// ---------------------------------------------------------------------------
// 3. The curriculum question. ONLY_IN_CLOUD, grounded with Google Search.
//    This is the only learner-adjacent text that ever leaves the laptop.
// ---------------------------------------------------------------------------

export const PLAN_SYSTEM =
  'You advise primary school teachers. Answer for the curriculum and grade named in the question. ' +
  'Assume a large class, no devices for learners and very few materials. ' +
  'Reply in plain text with exactly these three headings, each on its own line: ' +
  '"Activities", "Check after two weeks", "At home". ' +
  'Under Activities give three numbered activities of 40 words at most each. ' +
  'Under the other two headings give one short paragraph each. No other text.';

/**
 * Build the question from curriculum words and a share of the class in words.
 * `difficulty` is the only free text, and it has already been through the guard.
 */
export function buildQuestion(pack: CurriculumPack, group: Group, difficulty: string): Outbound {
  const fixed =
    `I teach ${pack.grade} ${pack.learningArea} under ${pack.curriculum}. ` +
    `${group.band} of my class are at "${pack.levelNames.AE}" or "${pack.levelNames.BE}" ` +
    `in the sub-strand "${group.subStrand.name}" (strand: ${group.subStrand.strand}). ` +
    'What should I do in class over the next two weeks, how do I check progress, ' +
    'and what can parents do at home?';
  const d = difficulty.trim().replace(/[.\s]+$/, '');
  const free = d ? `The difficulty they share: ${d}.` : '';
  return { fixed, free };
}

/**
 * `search` asks the cloud to ground the answer with Google Search. It is false only for the
 * second send of Route A, after the grounded request was refused and the teacher said yes.
 * The question text is the same either way.
 */
export function planPrompt(pack: CurriculumPack, group: Group, difficulty: string, search = true): PromptSpec {
  const outbound = buildQuestion(pack, group, difficulty);
  return { task: 'plan', system: PLAN_SYSTEM, prompt: outboundText(outbound), outbound, search };
}

export interface ParsedPlan {
  activities: string[];
  check: string;
  home: string;
}

/** Split the plan into its three parts. Tolerates markdown and missing headings. */
export function parsePlan(raw: string): ParsedPlan {
  const text = raw.replace(/\r/g, '').replace(/[*#`]/g, '');
  const heading = /^\s*(activities|check after two weeks|at home)\s*:?\s*$/i;
  const parts: Record<string, string[]> = { activities: [], check: [], home: [] };
  let current: 'activities' | 'check' | 'home' | null = null;
  for (const line of text.split('\n')) {
    const m = heading.exec(line);
    if (m?.[1]) {
      const h = m[1].toLowerCase();
      current = h === 'activities' ? 'activities' : h === 'at home' ? 'home' : 'check';
      continue;
    }
    if (current && line.trim()) parts[current]?.push(line.trim());
  }
  const activities: string[] = [];
  for (const line of parts.activities ?? []) {
    const item = /^\s*(?:\d+[.)]|[-•])\s*(.+)$/.exec(line);
    if (item?.[1]) activities.push(item[1].trim());
    else if (activities.length > 0) activities[activities.length - 1] += ' ' + line;
    else activities.push(line);
  }
  return {
    activities,
    check: (parts.check ?? []).join(' '),
    home: (parts.home ?? []).join(' '),
  };
}

// ---------------------------------------------------------------------------
// 4. A note to one parent. ONLY_ON_DEVICE.
// ---------------------------------------------------------------------------

export const PARENT_SYSTEM =
  'You write a short note from a class teacher to a parent in Kenya. ' +
  `Three sentences, 60 words at most. Call the child ${NAME_TOKEN}. ` +
  'Say what the child finds hard, in kind words. Then give the one home activity provided, in simple steps. ' +
  'Use only the facts given. Plain English a parent can follow. No level names. ' +
  'No greeting and no sign-off: Staffroom adds those.';

/** Written by code so the model never guesses the parents' names (it wrote "Dear Mr. & Mrs. Faith"). */
export function parentGreeting(first: string): string {
  return `Dear parent or guardian of ${first},`;
}

const GREETING = /^\s*(?:dear|hello|hi|greetings|good (?:morning|afternoon|evening))\b[^\n,:!]*[,:!]?\s*/i;
const SIGN_OFF =
  /\s*(?:(?:with )?(?:best|kind|warm(?:est)?)? ?regards|yours (?:sincerely|faithfully|truly)|sincerely|warmly|best wishes)\s*,?[\s\S]*$/i;

/** Strip any greeting or sign-off the model wrote anyway, tidy it, then add the code's greeting. */
export function cleanParentNote(raw: string, first: string): string {
  const body = cleanRemark(raw.replace(/[*_#`]/g, '').replace(GREETING, '').replace(SIGN_OFF, ''), first);
  return body ? `${parentGreeting(first)}\n\n${body}` : '';
}

export function parentNotePrompt(
  pack: CurriculumPack,
  subStrand: SubStrand,
  learner: Learner,
  assessment: Assessment,
  homeActivity: string,
  roster: Learner[] = [learner],
): PromptSpec {
  const level = assessment.levels[subStrand.id];
  const note = prepareNote(assessment.note, learner, roster);
  const prompt = [
    `Topic: ${subStrand.name} (${pack.learningArea}, ${pack.grade}).`,
    `How the child is doing: ${level ? pack.levelMeaning[level] : 'not assessed yet'}.`,
    `Teacher's note: ${note.trim() ? clip(note, 300) : 'none'}`,
    `Home activity: ${clip(homeActivity, 500)}`,
    `Write the note about ${NAME_TOKEN}.`,
  ].join('\n');
  return { task: 'personalise', system: PARENT_SYSTEM, prompt };
}

// ---------------------------------------------------------------------------
// 5. A starter activity. PREFER_IN_CLOUD. No learner data.
// ---------------------------------------------------------------------------

export const LESSON_SYSTEM =
  'You suggest one five-minute starter activity for a primary school lesson. ' +
  '50 words at most. No devices, no printed materials. Plain text, no heading.';

export function lessonIdeaPrompt(pack: CurriculumPack, subStrand: SubStrand): PromptSpec {
  const outbound: Outbound = {
    fixed: `Suggest a starter activity for ${pack.grade} ${pack.learningArea}, sub-strand "${subStrand.name}", under ${pack.curriculum}.`,
    free: '',
  };
  return { task: 'lessonIdea', system: LESSON_SYSTEM, prompt: outboundText(outbound), outbound };
}

// ---------------------------------------------------------------------------
// 6. A level in plain words. PREFER_ON_DEVICE. No learner data.
// ---------------------------------------------------------------------------

export const PLAIN_SYSTEM =
  'You explain a school performance level to a parent in one sentence of 25 words at most. ' +
  'Plain English. No jargon. Do not mention any child.';

export function plainWordsPrompt(pack: CurriculumPack, level: Level, subStrand: SubStrand): PromptSpec {
  const outbound: Outbound = {
    fixed:
      `Explain what "${pack.levelNames[level]}" means for a child learning ` +
      `"${subStrand.name}" in ${pack.grade} ${pack.learningArea}.`,
    free: '',
  };
  return { task: 'plainWords', system: PLAIN_SYSTEM, prompt: outboundText(outbound), outbound };
}

// ---------------------------------------------------------------------------
// 7. A mark-sheet photo. ONLY_ON_DEVICE, image input, structured output.
// ---------------------------------------------------------------------------

export const MARKSHEET_SYSTEM =
  'You read a photo of a class mark sheet. Each row has a learner name, then one level per column. ' +
  'Levels are written EE, ME, AE or BE. Copy what is written. If a cell is unclear, use an empty string.';

export function marksheetSchema(columns: number): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            levels: {
              type: 'array',
              items: { type: 'string', enum: ['EE', 'ME', 'AE', 'BE', ''] },
              minItems: columns,
              maxItems: columns,
            },
          },
          required: ['name', 'levels'],
          additionalProperties: false,
        },
      },
    },
    required: ['rows'],
    additionalProperties: false,
  };
}

export function marksheetPrompt(
  pack: CurriculumPack,
  image: { mimeType: 'image/jpeg' | 'image/png'; base64: string },
): PromptSpec {
  const columns = pack.subStrands.map((s) => s.name).join(', ');
  const prompt = `Columns, left to right after the name: ${columns}.\nReturn JSON: {"rows":[{"name":"...","levels":["ME","AE",...]}]}`;
  return { task: 'marksheet', system: MARKSHEET_SYSTEM, prompt, schema: marksheetSchema(pack.subStrands.length), image };
}

export interface MarksheetRow {
  learnerId: string;
  levels: Record<string, Level>;
}

export interface MarksheetResult {
  rows: MarksheetRow[];
  /** Names on the sheet that matched no learner, or matched more than one. */
  unmatched: string[];
}

function matchLearner(name: string, learners: Learner[]): Learner | null {
  const wanted = fold(name).split(/[^\p{L}]+/u).filter((w) => w.length >= 2);
  if (wanted.length === 0) return null;
  let best: Learner | null = null;
  let bestScore = 0;
  let tie = false;
  for (const learner of learners) {
    const have = new Set(fold(learner.name).split(/[^\p{L}]+/u).filter(Boolean));
    const score = wanted.filter((w) => have.has(w)).length / Math.max(wanted.length, have.size);
    if (score > bestScore) {
      best = learner;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return bestScore >= 0.5 && !tie ? best : null;
}

/** Match the rows the model read to the roster. Nothing is saved until the teacher confirms. */
export function parseMarksheet(raw: string, pack: CurriculumPack, learners: Learner[]): MarksheetResult {
  const result: MarksheetResult = { rows: [], unmatched: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    return result;
  }
  const rows = (parsed as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return result;
  const taken = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const { name, levels } = row as { name?: unknown; levels?: unknown };
    if (typeof name !== 'string' || !Array.isArray(levels)) continue;
    const learner = matchLearner(name, learners);
    if (!learner || taken.has(learner.id)) {
      result.unmatched.push(name);
      continue;
    }
    taken.add(learner.id);
    const out: Record<string, Level> = {};
    pack.subStrands.forEach((s, i) => {
      const value = levels[i];
      if (typeof value === 'string' && (LEVELS as readonly string[]).includes(value.toUpperCase())) {
        out[s.id] = value.toUpperCase() as Level;
      }
    });
    result.rows.push({ learnerId: learner.id, levels: out });
  }
  return result;
}
