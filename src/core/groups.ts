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

/** The notes of the learners in a group, skipping empty ones. */
export function groupNotes(data: ClassData, group: Group): string[] {
  return group.learners
    .map((l) => data.assessments[l.id]?.note.trim() ?? '')
    .filter((note) => note.length > 0);
}
