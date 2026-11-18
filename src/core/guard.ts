/**
 * The roster guard.
 *
 * Plain code, no model. It decides whether a piece of text may leave the laptop.
 * It knows the class roster, so it can refuse any text that holds a learner's name.
 *
 * Rule of use: every request that can reach the cloud passes through `checkOutbound` first.
 */
import type { Learner } from './types';

export type HitKind = 'name' | 'admission' | 'school' | 'digits' | 'email' | 'date';

export interface GuardHit {
  kind: HitKind;
  /** The offending text, as it appears in the message. */
  match: string;
  /** Which part of the message it was found in. */
  where: 'fixed' | 'free';
}

export interface GuardResult {
  ok: boolean;
  hits: GuardHit[];
}

export interface GuardContext {
  learners: Learner[];
  /** School name, teacher name and anything else that points at this class. */
  extraTerms?: string[];
}

/** An outbound message has a part built from curriculum words and a part of free text. */
export interface Outbound {
  /** Built only from the curriculum pack and fixed wording. Safe by construction. */
  fixed: string;
  /** Anything a model or a person wrote. Checked strictly. */
  free: string;
}

const APOSTROPHES = /['’ʼ‘`]/g;
/** A word: letters and marks, with apostrophes inside it (Ng'ang'a, O'Brien). */
const WORD = /[\p{L}\p{M}]+(?:['’ʼ‘`][\p{L}\p{M}]+)*/gu;
const POSSESSIVE = /['’ʼ‘`]s$/i;

/** Words in a school name that do not point at one school. */
const GENERIC = new Set([
  'school', 'primary', 'secondary', 'junior', 'senior', 'academy', 'academies', 'college', 'centre', 'center',
  'the', 'of', 'and', 'for', 'saint', 'girls', 'boys', 'mixed', 'day', 'boarding', 'comprehensive', 'education',
  'mr', 'mrs', 'ms', 'miss', 'madam', 'teacher', 'mwalimu', 'class', 'grade',
]);

/** Lower-case, strip accents and apostrophes. "Ng'ang'a" and "NGANGA" fold to the same string. */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(APOSTROPHES, '')
    .toLowerCase();
}

function words(text: string): { raw: string; index: number }[] {
  const out: { raw: string; index: number }[] = [];
  for (const m of text.matchAll(WORD)) out.push({ raw: m[0], index: m.index });
  return out;
}

interface NameIndex {
  /** Folded name parts of three letters or more. Matched without regard to case. */
  long: Set<string>;
  /** Two-letter name parts, kept exactly as written. Matched only with the same capitals. */
  short: Set<string>;
  /** Folded full names with every space removed, six letters or more. */
  joined: string[];
}

function nameIndex(learners: Learner[]): NameIndex {
  const long = new Set<string>();
  const short = new Set<string>();
  const joined: string[] = [];
  for (const learner of learners) {
    const parts = words(learner.name).map((w) => w.raw);
    for (const part of parts) {
      const f = fold(part);
      if (f.length >= 3) long.add(f);
      else if (f.length === 2) short.add(part.normalize('NFC'));
    }
    const all = fold(parts.join(''));
    if (parts.length > 1 && all.length >= 6) joined.push(all);
  }
  return { long, short, joined };
}

function isNameWord(raw: string, names: NameIndex): boolean {
  const base = raw.replace(POSSESSIVE, '');
  const f = fold(base);
  if (f.length >= 3) return names.long.has(f);
  if (f.length === 2) return names.short.has(base.normalize('NFC'));
  return false;
}

/** Every learner-name word found in the text. */
export function findNames(text: string, learners: Learner[]): string[] {
  const names = nameIndex(learners);
  const hits = words(text)
    .filter((w) => isNameWord(w.raw, names))
    .map((w) => w.raw);
  // Names written with no space, or split by punctuation: "WanjikuMwangi", "Wanjiku.Mwangi".
  const squeezed = fold(text).replace(/[^\p{L}]/gu, '');
  for (const j of names.joined) {
    if (squeezed.includes(j) && hits.length === 0) hits.push(j);
  }
  return hits;
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const DATE = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g;
/** Seven or more digits, allowing spaces and dashes between them: phone and ID numbers. */
const LONG_DIGITS = /\+?\d(?:[\s-]?\d){6,}/g;
/** Five or more digits in a row: admission and assessment numbers. */
const DIGIT_RUN = /\d{5,}/g;

function patternHits(text: string, where: 'fixed' | 'free'): GuardHit[] {
  const hits: GuardHit[] = [];
  for (const m of text.matchAll(EMAIL)) hits.push({ kind: 'email', match: m[0], where });
  for (const m of text.matchAll(DATE)) hits.push({ kind: 'date', match: m[0], where });
  const seen = new Set<string>();
  for (const re of [LONG_DIGITS, DIGIT_RUN]) {
    for (const m of text.matchAll(re)) {
      const key = m[0].replace(/\D/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ kind: 'digits', match: m[0], where });
    }
  }
  return hits;
}

function admissionHits(text: string, learners: Learner[], where: 'fixed' | 'free'): GuardHit[] {
  const lower = text.toLowerCase();
  const hits: GuardHit[] = [];
  for (const learner of learners) {
    const adm = learner.admission?.trim();
    if (!adm || adm.length < 3) continue;
    if (lower.includes(adm.toLowerCase())) hits.push({ kind: 'admission', match: adm, where });
  }
  return hits;
}

function schoolHits(text: string, extraTerms: string[], where: 'fixed' | 'free'): GuardHit[] {
  const wanted = new Set<string>();
  for (const term of extraTerms) {
    for (const w of words(term)) {
      const f = fold(w.raw);
      if (f.length >= 3 && !GENERIC.has(f)) wanted.add(f);
    }
  }
  return words(text)
    .filter((w) => wanted.has(fold(w.raw.replace(POSSESSIVE, ''))))
    .map((w) => ({ kind: 'school' as const, match: w.raw, where }));
}

/**
 * May this message leave the laptop?
 *
 * - Learner names are looked for in the free part only. The fixed part is built from
 *   curriculum words, which can share a spelling with a name ("Faith" in a Religious
 *   Education strand) and must not block the request.
 * - Admission numbers, school words, emails, dates and long numbers are looked for in both parts.
 */
export function checkOutbound(message: Outbound, ctx: GuardContext): GuardResult {
  const hits: GuardHit[] = [];
  for (const raw of findNames(message.free, ctx.learners)) hits.push({ kind: 'name', match: raw, where: 'free' });
  for (const where of ['fixed', 'free'] as const) {
    const text = message[where];
    hits.push(...admissionHits(text, ctx.learners, where));
    hits.push(...schoolHits(text, ctx.extraTerms ?? [], where));
    hits.push(...patternHits(text, where));
  }
  return { ok: hits.length === 0, hits };
}

/** The whole message, exactly as it will be sent. */
export function outboundText(message: Outbound): string {
  return [message.fixed.trim(), message.free.trim()].filter(Boolean).join(' ');
}

/**
 * Replace every learner-name word with a neutral phrase.
 * Used on teacher notes before they are summarised, so the summary has no name to repeat.
 */
export function redactNames(text: string, learners: Learner[], replacement = 'the learner'): string {
  const names = nameIndex(learners);
  let out = '';
  let last = 0;
  let previousWasName = false;
  for (const w of words(text)) {
    const between = text.slice(last, w.index);
    if (isNameWord(w.raw, names)) {
      const possessive = POSSESSIVE.test(w.raw) ? "'s" : '';
      // "Wanjiku Mwangi" becomes one "the learner", not two.
      if (previousWasName && /^\s*$/.test(between)) {
        if (possessive && !out.endsWith("'s")) out += possessive;
      } else {
        out += between + replacement + possessive;
      }
      previousWasName = true;
    } else {
      out += between + w.raw;
      previousWasName = false;
    }
    last = w.index + w.raw.length;
  }
  return out + text.slice(last);
}

/** One plain sentence per hit, for the screen. */
export function describeHit(hit: GuardHit): string {
  switch (hit.kind) {
    case 'name':
      return `"${hit.match}" is a learner's name in this class. Remove it or reword the sentence.`;
    case 'admission':
      return `"${hit.match}" is an admission number in this class.`;
    case 'school':
      return `"${hit.match}" is part of your school's or your own name.`;
    case 'digits':
      return `"${hit.match}" looks like a phone, ID or admission number.`;
    case 'email':
      return `"${hit.match}" is an email address.`;
    case 'date':
      return `"${hit.match}" looks like a date of birth.`;
  }
}
