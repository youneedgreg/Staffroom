import { describe, expect, it } from 'vitest';
import { CBC_G5_MATHS as pack } from '../src/core/curriculum';
import { findNames } from '../src/core/guard';
import { strugglingGroups, groupNotes, topicPart } from '../src/core/groups';
import {
  buildParentNote,
  parsePraise,
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
  notePraise,
  noteParts,
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

  it('gives the praise in the note its own line, and leaves mistakes out of it', () => {
    const mercy = byName('Mercy Chebet');
    expect(remarkPrompt(pack, mercy, data.assessments[mercy.id]!, roster).prompt).toContain(
      'Habit to praise: steady and asks good questions.',
    );
    const kevin = byName('Kevin Kiprop');
    expect(remarkPrompt(pack, kevin, data.assessments[kevin.id]!, roster).prompt).not.toContain('Habit to praise');
  });

  it('keeps a mistake out of the praise line, even when they share a note', () => {
    const faith = byName('Faith Wambui');
    const prompt = remarkPrompt(pack, faith, data.assessments[faith.id]!, roster).prompt;
    expect(prompt).toContain('Habit to praise: neat work.');
    expect(prompt).toContain('Something to work on (never praise it): adds the tops and the bottoms when adding fractions.');
    expect(prompt).not.toContain("Teacher's note:");
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
    expect(spec.prompt).toContain('Strength: secure work in Division and Decimals.');
    expect(spec.prompt).toContain('Next step: more practice in Fractions.');
  });

  it('takes two of the best topics, with words that fit the level, and the first of the weakest as the next step', () => {
    expect(remarkFocus(pack, levels({ division: 'EE', fractions: 'AE', decimals: 'EE', length: 'EE', 'whole-numbers': 'BE' })))
      .toEqual({ strength: 'excellent work in Division and Decimals', nextStep: 'more practice in Whole Numbers' });
    // A best level of Approaching Expectation is never called strong.
    expect(remarkFocus(pack, levels({ fractions: 'AE', decimals: 'BE' })).strength).toBe('growing confidence in Fractions');
  });

  it('asks for harder problems when every topic is at the same good level', () => {
    expect(remarkFocus(pack, levels({ fractions: 'ME', decimals: 'ME' })))
      .toEqual({ strength: 'secure work in Decimals and Fractions', nextStep: 'harder problems in Decimals' });
  });

  it('gives learners at the same level different topics, the same ones every time', () => {
    const all = Object.fromEntries(pack.subStrands.map((s) => [s.id, 'ME' as const]));
    const focus = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => remarkFocus(pack, { learnerId: id, levels: all, note: '' }));
    expect(new Set(focus.map((f) => f.strength)).size).toBeGreaterThan(1);
    for (const f of focus) expect(f.strength).not.toContain(f.nextStep.replace('harder problems in ', ''));
    expect(remarkFocus(pack, { learnerId: 'a', levels: all, note: '' })).toEqual(focus[0]);
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
    expect(REMARK_SYSTEM).toContain('Never praise the thing to work on');
  });
});

describe('difficulty', () => {
  const group = strugglingGroups(data, pack)[0]!;
  const notes = groupNotes(data, pack, group);

  it('keeps only the part of each note about the topic', () => {
    const byId = (id: string) => strugglingGroups(data, pack).find((g) => g.subStrand.id === id)!;
    const fractions = groupNotes(data, pack, byId('fractions')).join('\n');
    // The Fractions group's notes also hold decimal and division mistakes. They must not reach the model.
    expect(fractions).not.toMatch(/decimal|0\.5|division|divid|sharing/i);
    expect(fractions).toContain('adds the tops and the bottoms when adding fractions');
    expect(fractions).toContain('adds denominators');
    expect(fractions).not.toContain('neat work');
    const decimals = groupNotes(data, pack, byId('decimals')).join('\n');
    expect(decimals).toContain('writes 0.5 as 0.05');
    expect(decimals).toContain('treats a decimal point like a remainder');
    expect(decimals).not.toMatch(/denominator|fraction/i);
  });

  it('keeps a note that names no topic, and drops one about other topics only', () => {
    const fractions = pack.subStrands.find((s) => s.id === 'fractions')!;
    expect(topicPart('keeps getting it wrong, needs time', fractions, pack)).toBe('keeps getting it wrong, needs time');
    expect(topicPart('mixes up cm and m when measuring. careful otherwise', fractions, pack)).toBe('');
    expect(topicPart('  ', fractions, pack)).toBe('');
    const bare = { ...fractions, keywords: undefined };
    expect(topicPart('treats a decimal point like a remainder. adds denominators', bare, pack)).toBe(
      'treats a decimal point like a remainder. adds denominators',
    );
  });

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
    expect(parseDifficulty('{"difficulty":"Adding the tops and the bottoms"}')).toBe('adding the tops and the bottoms');
    expect(parseDifficulty('{"difficulty":"LCM of two numbers"}')).toBe('LCM of two numbers');
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
    const spec = parentNotePrompt(felix, data.assessments[felix.id]!, roster);
    expect(findNames(spec.prompt, roster)).toEqual([]);
    expect(spec.prompt).toContain("Teacher's note: does not line up digits");
    // The model is not given the level or the activity: code adds what the parent must get right.
    expect(spec.prompt).not.toMatch(/cannot do this yet|Home activity/);
    expect(spec.schema).toBeDefined();
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

describe('parsePraise', () => {
  const note = 'adds the tops and the bottoms when adding fractions. neat work';

  it('keeps praise copied from the note', () => {
    expect(parsePraise('{"praise": "neat work."}', 'Faith', note)).toBe('neat work');
    expect(parsePraise('Sure: {"praise":"Neat  Work"}', 'Faith', note)).toBe('Neat Work');
  });

  it('drops praise that is not in the note, too long, empty or not JSON', () => {
    expect(parsePraise('{"praise": "always helpful"}', 'Faith', note)).toBe('');
    expect(parsePraise('{"praise": "Writes 0.5 as 0.05 adds denominators"}', 'Tabitha', 'writes 0.5 as 0.05. adds denominators')).toBe('');
    const long = 'works well in a pair and helps the others in the group when they are stuck';
    expect(parsePraise(`{"praise": "${long}"}`, 'Victor', long)).toBe('');
    expect(parsePraise('{"praise": ""}', 'Faith', note)).toBe('');
    // Real replies from the on-device model: the whole note, and a mistake.
    expect(parsePraise('{"praise": "Writes 0.5 as 0.05. Adds denominators"}', 'Tabitha', 'writes 0.5 as 0.05. adds denominators')).toBe('');
    expect(parsePraise('{"praise": "cannot find a common denominator yet"}', 'Kevin', 'guesses in division. cannot find a common denominator yet')).toBe('');
    expect(parsePraise('{"praise": "careful otherwise"}', 'Samuel', 'mixes up cm and m when measuring. careful otherwise')).toBe('careful otherwise');
    expect(parsePraise('neat work', 'Faith', note)).toBe('');
  });

  it('puts the name back before checking', () => {
    expect(parsePraise('{"praise": "[NAME] helps others"}', 'Amani', 'Amani helps others')).toBe('Amani helps others');
  });
});

describe('buildParentNote', () => {
  const facts = {
    topic: 'Fractions',
    teacherNote: 'neat work',
    difficulty: 'adding the tops and the bottoms',
    homeActivity: 'Share an orange equally',
  };
  const tail =
    ' In class we are working on a common mistake in fractions: adding the tops and the bottoms.' +
    ' Something you can do at home: Share an orange equally.';

  it('writes the greeting, the praise, the difficulty and the home activity', () => {
    expect(buildParentNote('Neat work', 'Faith', facts)).toBe(
      `Dear parent or guardian of Faith,\n\nSomething I have noticed about Faith: neat work.${tail}`,
    );
  });

  it('opens plainly when there is no praise', () => {
    expect(buildParentNote('', 'Joy', facts)).toBe(`Dear parent or guardian of Joy,\n\nJoy is working hard on fractions.${tail}`);
  });

  it('uses the difficulty as the teacher left it, and copes with an empty one', () => {
    expect(buildParentNote('', 'Ian', { ...facts, difficulty: 'mixing up cm and m.' })).toContain(
      'a common mistake in fractions: mixing up cm and m.',
    );
    expect(buildParentNote('', 'Ian', { ...facts, difficulty: ' ' })).toContain('In class we are giving extra practice in fractions.');
  });
});

describe('notePraise', () => {
  it('keeps the clauses that praise, in the teacher\'s words', () => {
    expect(notePraise('steady. asks good questions')).toBe('steady and asks good questions');
    expect(notePraise('improved a lot since last term')).toBe('improved a lot since last term');
    expect(notePraise('joined this term, settling in well')).toBe('settling in well');
    expect(notePraise('works well in a pair, slow alone')).toBe('works well in a pair');
    expect(notePraise('adds the tops and the bottoms when adding fractions. neat work')).toBe('neat work');
  });

  it('never keeps a clause that holds a mistake or a worry', () => {
    expect(notePraise('fast but careless, copies numbers down wrongly')).toBe('');
    expect(notePraise('guesses in division. cannot find a common denominator yet')).toBe('');
    expect(notePraise('quick with mental sums, helps others, rushes written work')).toBe('quick with mental sums and helps others');
    expect(notePraise('knows tables to 12, needs word problem practice')).toBe('knows tables to 12');
    expect(notePraise('')).toBe('');
  });

  it('finds praise in most of the sample notes that have some, and in none of the pure-mistake ones', () => {
    const praised = roster.filter((l) => notePraise(data.assessments[l.id]!.note));
    expect(praised.length).toBeGreaterThanOrEqual(18);
    for (const name of ['Kevin Kiprop', 'Joy Achieng', 'Naomi Atieno', 'Elvis Omondi', 'Dennis Wafula']) {
      expect(notePraise(data.assessments[byName(name).id]!.note), name).toBe('');
    }
  });
});

describe('noteParts', () => {
  it('sorts every clause into praise, something to work on, or other', () => {
    expect(noteParts('quiet, accurate, could be stretched')).toEqual({ praise: 'accurate', workOn: '', other: 'quiet; could be stretched' });
    expect(noteParts('fast but careless, copies numbers down wrongly')).toEqual({
      praise: '',
      workOn: 'careless; copies numbers down wrongly',
      other: 'fast',
    });
  });
});
