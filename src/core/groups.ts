import { STRUGGLING } from './curriculum';
import type { ClassData, CurriculumPack, Learner, SubStrand } from './types';

export interface Group {
  subStrand: SubStrand;
  /** Learners at Approaching or Below Expectation in this sub-strand. */
  learners: Learner[];
  /** Learners with any level recorded for this sub-strand. */
  assessed: number;
  /** A share of the class in words. This is what leaves the laptop, never the count. */
  band: string;
}

/** Turn a count into words, so no exact class size or head count is sent. */
export function band(count: number, total: number): string {
  if (total <= 0 || count <= 0) return 'None';
  const share = count / total;
  if (share >= 0.85) return 'Almost all';
  if (share >= 0.6) return 'Most';
  if (share >= 0.4) return 'About half';
  if (share >= 0.28) return 'About a third';
  if (share >= 0.18) return 'About a quarter';
  return 'A few';
}

/**
 * Sub-strands where a group of learners is struggling, largest group first.
 * Plain counting. No model is involved.
 */
export function strugglingGroups(data: ClassData, pack: CurriculumPack, minSize = 3): Group[] {
  const groups: Group[] = [];
  for (const subStrand of pack.subStrands) {
    const struggling: Learner[] = [];
    let assessed = 0;
    for (const learner of data.learners) {
      const level = data.assessments[learner.id]?.levels[subStrand.id];
      if (!level) continue;
      assessed += 1;
      if (STRUGGLING.includes(level)) struggling.push(learner);
    }
    if (struggling.length >= minSize) {
      groups.push({ subStrand, learners: struggling, assessed, band: band(struggling.length, assessed) });
    }
  }
  return groups.sort((a, b) => b.learners.length - a.learners.length);
}

function topicPattern(subStrand: SubStrand): RegExp | null {
  const words = subStrand.keywords ?? [];
  return words.length ? new RegExp(`\\b(?:${words.join('|')})`, 'i') : null;
}

/**
 * The part of a note that is about one topic. Plain word matching, no model.
 *
 * A note covers the learner, not one topic ("treats a decimal point like a remainder. adds
 * denominators"), and the on-device model would otherwise sum up a Fractions group from its
 * decimal mistakes. So a note is split into sentences and:
 *   - the sentences that name this topic are kept;
 *   - a note that names only other topics is dropped;
 *   - a note that names no topic at all is kept whole, since it may be about this one.
 * A pack without keywords keeps every note whole.
 */
export function topicPart(note: string, subStrand: SubStrand, pack: CurriculumPack): string {
  const text = note.trim();
  const mine = topicPattern(subStrand);
  if (!text || !mine) return text;
  // Split after . ; ! ? followed by a space, so "0.5" stays whole.
  const sentences = text.split(/(?<=[.;!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const kept = sentences.filter((s) => mine.test(s));
  if (kept.length) return kept.join(' ').replace(/[.;]$/, '');
  const others = pack.subStrands
    .filter((s) => s.id !== subStrand.id)
    .map(topicPattern)
    .filter((p): p is RegExp => p !== null);
  return sentences.some((s) => others.some((p) => p.test(s))) ? '' : text;
}

/** The notes of the learners in a group, cut to the part about the group's topic, skipping empty ones. */
export function groupNotes(data: ClassData, pack: CurriculumPack, group: Group): string[] {
  return group.learners
    .map((l) => topicPart(data.assessments[l.id]?.note ?? '', group.subStrand, pack))
    .filter((note) => note.length > 0);
}
