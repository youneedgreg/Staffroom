import { describe, expect, it } from 'vitest';
import { CBC_G5_MATHS } from '../src/core/curriculum';
import { checkOutbound, describeHit, findNames, fold, outboundText, redactNames } from '../src/core/guard';
import { band, strugglingGroups } from '../src/core/groups';
import { buildQuestion } from '../src/core/prompts';
import { sampleClass } from '../src/core/sample';
import type { Learner } from '../src/core/types';

const data = sampleClass();
const roster = data.learners;
const ctx = { learners: roster, extraTerms: [data.schoolName, data.teacherName] };
const free = (text: string) => checkOutbound({ fixed: '', free: text }, ctx);

describe('fold', () => {
  it('ignores case, accents and apostrophes', () => {
    expect(fold("Ng'ang'a")).toBe('nganga');
    expect(fold('NG’ANG’A')).toBe('nganga');
    expect(fold('Zoë')).toBe('zoe');
  });
});

describe('findNames', () => {
  it('finds a first name, a surname and a full name', () => {
    expect(findNames('Amani is doing well', roster)).toEqual(['Amani']);
    expect(findNames('the Otieno boy', roster)).toEqual(['Otieno']);
    expect(findNames('Wanjiku Mwangi leads', roster)).toEqual(['Wanjiku', 'Mwangi']);
  });

  it('ignores case', () => {
    expect(findNames('amani and ZAWADI', roster)).toEqual(['amani', 'ZAWADI']);
  });

  it('finds possessives with either apostrophe', () => {
    expect(findNames("Kevin's book and Halima’s ruler", roster)).toEqual(["Kevin's", 'Halima’s']);
  });

  it('finds names with apostrophes, however they are typed', () => {
    for (const form of ["Ng'ang'a", 'Ng’ang’a', 'Nganga', 'NGANGA', "ng'ang'a's"]) {
      expect(findNames(`work by ${form} here`, roster), form).toHaveLength(1);
    }
  });

  it('finds both halves of a hyphenated name', () => {
    expect(findNames('Abdi-Rahman joined', roster)).toEqual(['Abdi', 'Rahman']);
    expect(findNames('Rahman joined', roster)).toEqual(['Rahman']);
  });

  it('finds a full name written with no space or with a dot', () => {
    expect(findNames('see WanjikuMwangi', roster)).toEqual(['wanjikumwangi']);
    expect(findNames('wanjiku.mwangi', roster).length).toBeGreaterThan(0);
  });

  it('does not match a name inside a longer word', () => {
    // Ian, Joy, Ruth and Grace are in the roster.
    expect(findNames('Indian children enjoy the truth about disgraceful sums', roster)).toEqual([]);
  });

  it('leaves ordinary classroom words alone', () => {
    const text = 'They add the tops and the bottoms and cannot find a common denominator when adding fractions.';
    expect(findNames(text, roster)).toEqual([]);
  });

  it('matches a two-letter name only with the same capitals', () => {
    const li: Learner[] = [{ id: 'x', name: 'An Li' }];
    expect(findNames('give an apple to the class', li)).toEqual([]);
    expect(findNames('An is ready', li)).toEqual(['An']);
    expect(findNames('Li is ready', li)).toEqual(['Li']);
  });

  it('catches every word of every sample name in four written forms', () => {
    let checked = 0;
    for (const learner of roster) {
      for (const part of learner.name.split(/[\s-]+/)) {
        for (const form of [part, part.toLowerCase(), part.toUpperCase(), `${part}'s`]) {
          expect(findNames(`the group with ${form} in it`, roster).length, `${learner.name} as ${form}`).toBeGreaterThan(0);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(244);
  });
});

describe('checkOutbound', () => {
  it('passes plain curriculum text', () => {
    expect(free('The difficulty they share: adding fractions with different denominators.').ok).toBe(true);
  });

  it('blocks a learner name in the free part', () => {
    const r = free('Kevin cannot find a common denominator.');
    expect(r.ok).toBe(false);
    expect(r.hits[0]).toMatchObject({ kind: 'name', match: 'Kevin', where: 'free' });
    expect(describeHit(r.hits[0]!)).toContain("learner's name");
  });

  it('blocks a name that is also an everyday word, wherever it is in the free part', () => {
    // Faith, Joy, Grace and Mercy are learners. Being strict here is the safe side.
    expect(free('they lack faith in their answers').ok).toBe(false);
  });

  it('does not look for names in the fixed part', () => {
    const r = checkOutbound({ fixed: 'Strand: Faith and Grace in daily life.', free: '' }, ctx);
    expect(r.ok).toBe(true);
  });

  it('blocks an admission number from the roster', () => {
    expect(free('see learner R5/0231').hits.map((h) => h.kind)).toContain('admission');
    expect(checkOutbound({ fixed: 'ref r5/0240', free: '' }, ctx).ok).toBe(false);
  });

  it('blocks the school and the teacher, but not generic school words', () => {
    expect(free('at Riverbend they struggle').hits[0]).toMatchObject({ kind: 'school', match: 'Riverbend' });
    expect(free('Mrs Karanja says so').hits[0]).toMatchObject({ kind: 'school', match: 'Karanja' });
    expect(free('a primary school class in this grade').ok).toBe(true);
  });

  it('blocks emails, dates of birth and long numbers', () => {
    expect(free('write to parent@example.com').hits[0]?.kind).toBe('email');
    expect(free('born 14/03/2015').hits[0]?.kind).toBe('date');
    expect(free('call 0712 345 678').hits[0]?.kind).toBe('digits');
    expect(free('call +254712345678').hits[0]?.kind).toBe('digits');
    expect(free('assessment number 123456').hits[0]?.kind).toBe('digits');
  });

  it('allows short numbers that are part of the mathematics', () => {
    expect(free('writes 0.5 as 0.05 and thinks 1/8 is bigger than 1/4').ok).toBe(true);
    expect(free('division by 2-digit numbers up to 9999').ok).toBe(true);
  });
});

describe('redactNames', () => {
  it('replaces names and keeps the possessive', () => {
    expect(redactNames('Brian needs to show his working', roster)).toBe('the learner needs to show his working');
    expect(redactNames("Kevin's fractions", roster)).toBe("the learner's fractions");
  });

  it('turns a full name into one phrase, not two', () => {
    expect(redactNames('Wanjiku Mwangi leads', roster)).toBe('the learner leads');
    expect(redactNames("Wanjiku Mwangi's group", roster)).toBe("the learner's group");
  });

  it('leaves text with no names unchanged', () => {
    const text = 'adds the tops and the bottoms. neat work';
    expect(redactNames(text, roster)).toBe(text);
  });

  it('leaves no name behind in any sample note', () => {
    for (const a of Object.values(data.assessments)) {
      expect(findNames(redactNames(a.note, roster), roster), a.note).toEqual([]);
    }
  });
});

describe('the curriculum question', () => {
  const groups = strugglingGroups(data, CBC_G5_MATHS);

  it('finds the struggling groups by counting', () => {
    expect(groups.map((g) => [g.subStrand.id, g.learners.length])).toEqual([
      ['fractions', 10],
      ['division', 6],
      ['decimals', 5],
      ['multiplication', 3],
      ['length', 3],
    ]);
    expect(groups[0]?.band).toBe('About a third');
  });

  it('puts a share in words, never a head count', () => {
    expect(band(10, 30)).toBe('About a third');
    expect(band(1, 30)).toBe('A few');
    expect(band(29, 30)).toBe('Almost all');
    expect(band(0, 30)).toBe('None');
    for (const g of groups) {
      const q = outboundText(buildQuestion(CBC_G5_MATHS, g, 'adding denominators')).replace(CBC_G5_MATHS.grade, '');
      expect(q).not.toMatch(new RegExp(`\\b(${g.learners.length}|${g.assessed})\\b`));
    }
  });

  it('passes the guard for every sub-strand and holds no learner name', () => {
    for (const g of groups) {
      const message = buildQuestion(CBC_G5_MATHS, g, 'adding the tops and the bottoms');
      expect(checkOutbound(message, ctx)).toEqual({ ok: true, hits: [] });
      expect(findNames(outboundText(message), roster)).toEqual([]);
    }
  });

  it('is blocked the moment a name is in the difficulty', () => {
    const message = buildQuestion(CBC_G5_MATHS, groups[0]!, 'Felix adds the tops and bottoms');
    expect(checkOutbound(message, ctx).ok).toBe(false);
  });
});
