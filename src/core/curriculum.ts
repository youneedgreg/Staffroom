import type { CurriculumPack, Level } from './types';

/**
 * Kenya CBC, Grade 5 Mathematics.
 *
 * Level names are the four CBC performance levels.
 * Strand and sub-strand names follow the KICD Grade 5 Mathematics curriculum design.
 * The six sub-strands here are a sample term, not the whole year.
 * `levelMeaning` is our own wording, not official KICD text.
 * `keywords` are our own list of the words a note might use for each topic.
 */
export const CBC_G5_MATHS: CurriculumPack = {
  id: 'ke-cbc-g5-maths',
  curriculum: "Kenya's Competency-Based Curriculum (CBC)",
  grade: 'Grade 5',
  learningArea: 'Mathematics',
  levelNames: {
    EE: 'Exceeding Expectation',
    ME: 'Meeting Expectation',
    AE: 'Approaching Expectation',
    BE: 'Below Expectation',
  },
  levelMeaning: {
    EE: 'does this confidently and can go further',
    ME: 'does this correctly without help',
    AE: 'does this with some help and still makes mistakes',
    BE: 'cannot do this yet and needs close support',
  },
  subStrands: [
    {
      id: 'whole-numbers',
      strand: 'Numbers',
      name: 'Whole Numbers',
      keywords: ['place value', 'large numbers?\\b', 'lines? up', 'digits?\\b'],
    },
    {
      id: 'multiplication',
      strand: 'Numbers',
      name: 'Multiplication',
      keywords: ['multipl', 'times\\b', 'tables?\\b', 'product'],
    },
    {
      id: 'division',
      strand: 'Numbers',
      name: 'Division',
      keywords: ['divi', 'shar(?:e|es|ing)\\b', 'remainder', 'quotient'],
    },
    {
      id: 'fractions',
      strand: 'Numbers',
      name: 'Fractions',
      keywords: ['fraction', 'numerator', 'denominator', 'tops?\\b', 'bottoms?\\b', 'halv', 'half\\b', 'quarter'],
    },
    {
      id: 'decimals',
      strand: 'Numbers',
      name: 'Decimals',
      keywords: ['decimal', '\\d*\\.\\d', 'tenths?\\b', 'hundredths?\\b'],
    },
    {
      id: 'length',
      strand: 'Measurement',
      name: 'Length',
      keywords: ['length', 'measur', 'perimeter', '(?:c|m|k)m\\b', 'met(?:re|er)s?\\b', 'ruler'],
    },
  ],
};

export const PACKS: Record<string, CurriculumPack> = {
  [CBC_G5_MATHS.id]: CBC_G5_MATHS,
};

export function getPack(id: string): CurriculumPack {
  const pack = PACKS[id];
  if (!pack) throw new Error(`Unknown curriculum pack: ${id}`);
  return pack;
}

/** Learners at these levels count as struggling in a sub-strand. */
export const STRUGGLING: readonly Level[] = ['AE', 'BE'];
