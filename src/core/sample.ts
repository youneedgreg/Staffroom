/**
 * An invented class for the demo, the tests and the video.
 * Every name, number and note here is made up. Never load real learners into a demo.
 */
import { CBC_G5_MATHS } from './curriculum';
import type { Assessment, ClassData, Learner, Level } from './types';

const CODE: Record<string, Level> = { E: 'EE', M: 'ME', A: 'AE', B: 'BE' };

/** name, levels for the six sub-strands in pack order, teacher's note */
const ROWS: [string, string, string][] = [
  ['Amani Otieno', 'EEMMME', 'quick with mental sums, helps others, rushes written work'],
  ['Faith Wambui', 'MMMAMM', 'adds the tops and the bottoms when adding fractions. neat work'],
  ["Brian Ng'ang'a", 'MEMMMM', 'strong times tables. Brian needs to show his working'],
  ['Zawadi Mutua', 'EEEEME', 'finishes early, ready for harder problems'],
  ['Kevin Kiprop', 'MAABMM', 'guesses in division. cannot find a common denominator yet'],
  ['Joy Achieng', 'MMMAMM', 'compares fractions by the size of the bottom number only'],
  ['Samuel Mwangi', 'MMMMMA', 'mixes up cm and m when measuring. careful otherwise'],
  ['Halima Abdi', 'EMMMEM', 'very good with place value and decimals'],
  ['Dennis Wafula', 'AABBBA', 'often absent this term. needs the basics of sharing equally again'],
  ['Mercy Chebet', 'MMMMMM', 'steady. asks good questions'],
  ['Ian Kamau', 'MEMMMM', 'fast but careless, copies numbers down wrongly'],
  ['Naomi Atieno', 'MMMAAM', 'treats a decimal point like a remainder. adds denominators'],
  ['Peter Njoroge', 'EMMMMM', 'good number sense, shy to answer aloud'],
  ['Aisha Mohamed', 'MMEMMM', 'explains division steps clearly to Kevin'],
  ['Collins Barasa', 'MMAAMM', 'forgets to carry in long division. unsure which fraction is bigger'],
  ['Grace Nyambura', 'EEMEMM', 'enjoys fraction problems, draws her own diagrams'],
  ['Victor Odhiambo', 'MMMMMM', 'works well in a pair, slow alone'],
  ['Esther Jepkorir', 'MMMMEM', 'careful measuring, neat tables'],
  ['Felix Musyoka', 'AMABAM', 'does not line up digits. adds the tops and bottoms of fractions'],
  ['Lydia Wanjiru', 'MMMMMM', 'improved a lot since last term'],
  ['Moses Kiptoo', 'EMMMME', 'estimates lengths well, likes practical tasks'],
  ['Sharon Akinyi', 'MMMAAM', 'cannot place a decimal on a number line. unsure about equivalent fractions'],
  ['Daniel Kariuki', 'MEMMMM', 'knows tables to 12, needs word problem practice'],
  ['Purity Nduta', 'MMMMMM', 'quiet, accurate, could be stretched'],
  ['Elvis Omondi', 'MAABMM', 'shares unequally when dividing. thinks a bigger denominator means a bigger fraction'],
  ['Ruth Cherono', 'EMMMMM', 'reads large numbers confidently'],
  ['Abdi-Rahman Hussein', 'MMMMMM', 'joined this term, settling in well'],
  ['Tabitha Muthoni', 'MMMAAM', 'writes 0.5 as 0.05. adds denominators'],
  ['George Wekesa', 'MMAMMA', 'division by two digits is slow. confuses perimeter with length'],
  ['Wanjiku Mwangi', 'EEMMMM', 'leads her group, checks answers with Samuel'],
];

function build(): ClassData {
  const learners: Learner[] = [];
  const assessments: Record<string, Assessment> = {};
  ROWS.forEach(([name, codes, note], i) => {
    const id = `l${String(i + 1).padStart(2, '0')}`;
    learners.push({ id, name, admission: `R5/${String(231 + i).padStart(4, '0')}` });
    const levels: Record<string, Level> = {};
    CBC_G5_MATHS.subStrands.forEach((s, j) => {
      const level = CODE[codes[j] ?? ''];
      if (level) levels[s.id] = level;
    });
    assessments[id] = { learnerId: id, levels, note };
  });
  return {
    id: 'sample-class',
    name: 'Grade 5 East (invented sample class)',
    packId: CBC_G5_MATHS.id,
    schoolName: 'Riverbend Primary School',
    teacherName: 'Mrs Karanja',
    learners,
    assessments,
  };
}

export const SAMPLE_CLASS: ClassData = build();

/** A fresh copy, so a test or a reset never changes the original. */
export function sampleClass(): ClassData {
  return structuredClone(SAMPLE_CLASS);
}
