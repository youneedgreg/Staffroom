import { describe, expect, it } from 'vitest';
import { CBC_G5_MATHS as pack } from '../src/core/curriculum';
import { findNames } from '../src/core/guard';
import { strugglingGroups, groupNotes } from '../src/core/groups';
import {
  cleanParentNote,
  cleanRemark,
  clip,
  difficultyPrompt,
  firstName,
  lessonIdeaPrompt,
  marksheetPrompt,
  parentNotePrompt,
  parseDifficulty,
  parseMarksheet,
  parsePlan,
  plainWordsPrompt,
  planPrompt,
  DIFFICULTY_SCHEMA,
  REMARK_SYSTEM,
  remarkFocus,
  remarkInputHash,
  remarkPrompt,
} from '../src/core/prompts';
import { sampleClass } from '../src/core/sample';

const data = sampleClass();
const roster = data.learners;
const byName = (name: string) => roster.find((l) => l.name === name)!;

describe('remarkPrompt', () => {
  it('holds the levels and the note, and no learner name at all', () => {
    for (const learner of roster) {
      const spec = remarkPrompt(pack, learner, data.assessments[learner.id]!, roster);
      expect(spec.task).toBe('remark');
      expect(findNames(spec.prompt, roster), learner.name).toEqual([]);
      expect(spec.prompt).toContain('[NAME]');
      expect(spec.prompt).toContain('- Fractions: ');
      expect(spec.outbound).toBeUndefined();
      expect(spec.system.length + spec.prompt.length).toBeLessThan(1200);
    }
  });

  it("turns the learner's own name into the token and a classmate into 'a classmate'", () => {
    const brian = byName("Brian Ng'ang'a");
    expect(remarkPrompt(pack, brian, data.assessments[brian.id]!, roster).prompt).toContain('[NAME] needs to show his working');
    const aisha = byName('Aisha Mohamed');
    expect(remarkPrompt(pack, aisha, data.assessments[aisha.id]!, roster).prompt).toContain('clearly to a classmate');
  });

  it('writes "none" for an empty note and skips levels that are not set', () => {
    const learner = roster[0]!;
    const spec = remarkPrompt(pack, learner, { learnerId: learner.id, levels: { fractions: 'ME' }, note: '  ' }, roster);
    expect(spec.prompt).toContain("Teacher's note: none");
    expect(spec.prompt.match(/^- /gm)).toHaveLength(1);
  });

  it('changes its hash when a level or the note changes, and not otherwise', () => {
    const a = data.assessments[roster[0]!.id]!;
    const h = remarkInputHash(pack, a);
    expect(remarkInputHash(pack, structuredClone(a))).toBe(h);
    expect(remarkInputHash(pack, { ...a, note: a.note + '!' })).not.toBe(h);
    expect(remarkInputHash(pack, { ...a, levels: { ...a.levels, fractions: 'BE' } })).not.toBe(h);
  });
});

describe('cleanRemark', () => {
  it('fills in the name, whatever brackets the model used', () => {
    expect(cleanRemark('[NAME] works hard. {name} should practise.', 'Amani')).toBe('Amani works hard. Amani should practise.');
    expect(cleanRemark('<NAME> works hard.', 'Amani')).toBe('Amani works hard.');
  });

  it('strips labels, markdown and quotes', () => {
    expect(cleanRemark('Remark: **[NAME]** is "careful".', 'Joy')).toBe('Joy is "careful".');
    expect(cleanRemark('"[NAME] is careful."', 'Joy')).toBe('Joy is careful.');
  });

  it('keeps at most three sentences and adds a full stop', () => {
    expect(cleanRemark('One. Two. Three. Four. Five.', 'x')).toBe('One. Two. Three.');
    expect(cleanRemark('[NAME] is steady', 'Ian')).toBe('Ian is steady.');
  });

  it('cuts a run-on reply to sixty words', () => {
    const long = Array.from({ length: 90 }, (_, i) => `w${i}`).join(' ');
    expect(cleanRemark(long, 'x').split(' ')).toHaveLength(60);
  });

  it('returns an empty string for an empty reply', () => {
    expect(cleanRemark('   ', 'x')).toBe('');
  });
});

describe('remark focus: the strength and next step come from the levels', () => {
  const levels = (l: Record<string, 'EE' | 'ME' | 'AE' | 'BE'>) => ({ learnerId: 'x', levels: l, note: '' });

  it('never offers a topic the learner is behind in as the strength', () => {
    const faith = byName('Faith Wambui');
    const spec = remarkPrompt(pack, faith, data.assessments[faith.id]!, roster);
    expect(spec.prompt).toContain('Strength: Whole Numbers and Multiplication.');
    expect(spec.prompt).toContain('Next step: more practice in Fractions.');
  });

  it('takes the two best topics in curriculum order, and the first of the weakest as the next step', () => {
    expect(remarkFocus(pack, levels({ division: 'EE', fractions: 'AE', decimals: 'EE', length: 'EE', 'whole-numbers': 'BE' })))
      .toEqual({ strength: 'Division and Decimals', nextStep: 'more practice in Whole Numbers' });
  });

  it('asks for harder problems when every topic is at the same good level', () => {
    expect(remarkFocus(pack, levels({ fractions: 'ME', decimals: 'ME' })))
      .toEqual({ strength: 'Fractions and Decimals', nextStep: 'harder problems in Fractions' });
  });

  it('does not invent a strength when every topic is below expectation', () => {
    const f = remarkFocus(pack, levels({ fractions: 'BE', decimals: 'BE' }));
    expect(f.strength).toBe("effort, or a strength from the teacher's note");
    expect(f.nextStep).toBe('more practice in Fractions');
  });

  it("falls back to the teacher's note when no level is set", () => {
    expect(remarkFocus(pack, levels({})).strength).toContain("teacher's note");
  });

  it('tells the model to write in the third person and never praise a mistake in the note', () => {
    expect(REMARK_SYSTEM).toContain('third person');
    expect(REMARK_SYSTEM).toContain('Never write "you" or "your"');
    expect(REMARK_SYSTEM).toContain('never praise it');
  });
});

describe('difficulty', () => {
  const group = strugglingGroups(data, pack)[0]!;
  const notes = groupNotes(data, group);

  it('sends the notes with every name removed', () => {
    const spec = difficultyPrompt(pack, group, [...notes, 'Felix copies from Sharon Akinyi'], roster);
    expect(findNames(spec.prompt, roster)).toEqual([]);
    expect(spec.prompt).toContain('the learner copies from the learner');
    expect(spec.schema).toBeDefined();
    expect(spec.prompt.length).toBeLessThan(2000);
  });

  it('sets no length limit in the schema, which would stop the on-device model mid-word', () => {
    const props = DIFFICULTY_SCHEMA.properties as Record<string, Record<string, unknown>>;
    expect(props.difficulty).not.toHaveProperty('maxLength');
  });

  it('reads JSON, JSON with chatter around it, and plain text', () => {
    expect(parseDifficulty('{"difficulty":"adding the denominators"}')).toBe('adding the denominators');
    expect(parseDifficulty('Sure! {"difficulty": "adding the denominators."} Hope that helps')).toBe('adding the denominators');
    expect(parseDifficulty('Difficulty: adding the denominators. They also guess.')).toBe('adding the denominators');
    expect(parseDifficulty('{"difficulty": 4}')).toBe('');
    expect(parseDifficulty('')).toBe('');
  });

  it('keeps at most twenty-five words', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    expect(parseDifficulty(JSON.stringify({ difficulty: long })).split(' ')).toHaveLength(25);
  });
});

describe('planPrompt', () => {
  const group = strugglingGroups(data, pack)[0]!;

  it('sends exactly the text that the guard checks', () => {
    const spec = planPrompt(pack, group, 'adding the tops and the bottoms');
    expect(spec.search).toBe(true);
    expect(spec.outbound).toBeDefined();
    expect(spec.prompt).toBe(`${spec.outbound!.fixed} ${spec.outbound!.free}`);
    expect(spec.prompt).toContain('About a third of my class');
    expect(spec.prompt).toContain('"Fractions" (strand: Numbers)');
    expect(spec.prompt).toContain('The difficulty they share: adding the tops and the bottoms.');
  });

  it('leaves the free part empty when there is no difficulty', () => {
    expect(planPrompt(pack, group, '  ').outbound!.free).toBe('');
  });
});

describe('parsePlan', () => {
  it('reads plain headings', () => {
    const p = parsePlan('Activities\n1. Fold strips.\n2. Walk the line.\n3. Pair check.\nCheck after two weeks\nFive questions.\nAt home\nShare an orange.');
    expect(p.activities).toEqual(['Fold strips.', 'Walk the line.', 'Pair check.']);
    expect(p.check).toBe('Five questions.');
    expect(p.home).toBe('Share an orange.');
  });

  it('reads markdown headings, colons, bullets and wrapped lines', () => {
    const p = parsePlan('## Activities:\n- **Fold** strips\n  into halves.\n- Walk the line.\n\n**Check after two weeks**\nFive questions.\n\n### At home\nShare an orange.\nName each share.');
    expect(p.activities).toEqual(['Fold strips into halves.', 'Walk the line.']);
    expect(p.check).toBe('Five questions.');
    expect(p.home).toBe('Share an orange. Name each share.');
  });

  it('returns empty parts when the reply has no headings', () => {
    expect(parsePlan('Just some text.')).toEqual({ activities: [], check: '', home: '' });
  });
});

describe('the other prompts', () => {
  const group = strugglingGroups(data, pack)[0]!;

  it('builds a parent note prompt with no learner name', () => {
    const felix = byName('Felix Musyoka');
    const spec = parentNotePrompt(pack, group.subStrand, felix, data.assessments[felix.id]!, 'Share an orange equally.', roster);
    expect(findNames(spec.prompt, roster)).toEqual([]);
    expect(spec.prompt).toContain('cannot do this yet');
    expect(spec.prompt).toContain('Home activity: Share an orange equally.');
    expect(spec.outbound).toBeUndefined();
  });

  it('builds the two open prompts from curriculum words only', () => {
    const idea = lessonIdeaPrompt(pack, group.subStrand);
    const plain = plainWordsPrompt(pack, 'AE', group.subStrand);
    for (const spec of [idea, plain]) {
      expect(spec.outbound!.free).toBe('');
      expect(spec.prompt).toBe(spec.outbound!.fixed);
    }
    expect(plain.prompt).toContain('Approaching Expectation');
  });

  it('builds the mark-sheet prompt with one enum column per sub-strand', () => {
    const spec = marksheetPrompt(pack, { mimeType: 'image/jpeg', base64: 'AAAA' });
    expect(spec.prompt).toContain('Whole Numbers, Multiplication, Division, Fractions, Decimals, Length');
    expect(JSON.stringify(spec.schema)).toContain('"minItems":6');
    expect(spec.outbound).toBeUndefined();
  });
});

describe('parseMarksheet', () => {
  const sheet = (rows: unknown[]) => JSON.stringify({ rows });

  it('matches rows to learners by name, in any order of words and any case', () => {
    const r = parseMarksheet(
      sheet([
        { name: 'OTIENO Amani', levels: ['EE', 'ee', 'ME', 'ME', 'ME', 'EE'] },
        { name: 'Zawadi', levels: ['ME', 'ME', 'ME', 'ME', '', 'XX'] },
      ]),
      pack,
      roster,
    );
    expect(r.unmatched).toEqual([]);
    expect(r.rows[0]).toEqual({
      learnerId: 'l01',
      levels: { 'whole-numbers': 'EE', multiplication: 'EE', division: 'ME', fractions: 'ME', decimals: 'ME', length: 'EE' },
    });
    expect(r.rows[1]?.levels).toEqual({ 'whole-numbers': 'ME', multiplication: 'ME', division: 'ME', fractions: 'ME' });
  });

  it('refuses a name that fits two learners, an unknown name and a repeat', () => {
    const r = parseMarksheet(
      sheet([
        { name: 'Mwangi', levels: [] },
        { name: 'Somebody Else', levels: [] },
        { name: 'Amani Otieno', levels: [] },
        { name: 'Amani Otieno', levels: [] },
      ]),
      pack,
      roster,
    );
    expect(r.rows.map((x) => x.learnerId)).toEqual(['l01']);
    expect(r.unmatched).toEqual(['Mwangi', 'Somebody Else', 'Amani Otieno']);
  });

  it('returns nothing for a reply that is not JSON', () => {
    expect(parseMarksheet('I cannot read this photo.', pack, roster)).toEqual({ rows: [], unmatched: [] });
    expect(parseMarksheet('{"rows": "none"}', pack, roster)).toEqual({ rows: [], unmatched: [] });
  });
});

describe('helpers', () => {
  it('clips at a word boundary', () => {
    expect(clip('one two three four', 100)).toBe('one two three four');
    expect(clip('one two three four', 12)).toBe('one two…');
  });

  it('takes the first name', () => {
    expect(firstName(byName('Abdi-Rahman Hussein'))).toBe('Abdi-Rahman');
  });
});

describe('cleanParentNote', () => {
  it('drops the model greeting and adds one written by code', () => {
    expect(cleanParentNote('Dear Mr. & Mrs. Faith, [NAME] finds fractions hard.', 'Faith')).toBe(
      'Dear parent or guardian of Faith,\n\nFaith finds fractions hard.',
    );
    expect(cleanParentNote('Hello Parent: [NAME] tries hard.', 'Joy')).toBe('Dear parent or guardian of Joy,\n\nJoy tries hard.');
  });

  it('drops a sign-off and anything after it', () => {
    const note = cleanParentNote('[NAME] tries hard. Practise at home.\n\nKind regards,\n[Teacher Name]', 'Ian');
    expect(note).toBe('Dear parent or guardian of Ian,\n\nIan tries hard. Practise at home.');
    expect(cleanParentNote('[NAME] tries hard. Sincerely, Mrs Otieno', 'Ian')).not.toMatch(/Sincerely|Otieno/);
  });

  it('keeps a note that has neither', () => {
    expect(cleanParentNote('[NAME] tries hard.', 'Ian')).toBe('Dear parent or guardian of Ian,\n\nIan tries hard.');
  });

  it('returns nothing for an empty note, so no bare greeting is shown', () => {
    expect(cleanParentNote('  ', 'Ian')).toBe('');
  });
});
