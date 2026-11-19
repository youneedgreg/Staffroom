/** The four CBC performance levels. */
export type Level = 'EE' | 'ME' | 'AE' | 'BE';

export const LEVELS: readonly Level[] = ['EE', 'ME', 'AE', 'BE'];

export interface SubStrand {
  id: string;
  strand: string;
  name: string;
}

/** A curriculum pack holds only public curriculum words. Nothing about a learner. */
export interface CurriculumPack {
  id: string;
  curriculum: string;
  grade: string;
  learningArea: string;
  levelNames: Record<Level, string>;
  /** Our own plain-words descriptions. Not official KICD text. */
  levelMeaning: Record<Level, string>;
  subStrands: SubStrand[];
}

export interface Learner {
  id: string;
  name: string;
  admission?: string;
}

export interface Assessment {
  learnerId: string;
  /** Sub-strand id to level. A missing key means not assessed yet. */
  levels: Record<string, Level>;
  /** The teacher's shorthand note. Free text, so it may hold names. */
  note: string;
}

export interface ClassData {
  id: string;
  name: string;
  packId: string;
  schoolName: string;
  teacherName: string;
  learners: Learner[];
  assessments: Record<string, Assessment>;
}

export type InferenceSource = 'on_device' | 'in_cloud';

export interface Remark {
  learnerId: string;
  text: string;
  /** Hash of the inputs that produced the text. Lets a batch skip unchanged learners. */
  inputHash: string;
  source: InferenceSource;
  status: 'draft' | 'edited' | 'approved';
  at: number;
}

export interface WebSource {
  title: string;
  uri: string;
}

export interface Plan {
  id: string;
  packId: string;
  subStrandId: string;
  /** The exact text that left the laptop. */
  question: string;
  answer: string;
  sources: WebSource[];
  /** Google's search suggestions snippet. The grounding terms require showing it. */
  searchHtml?: string;
  /**
   * False when the teacher asked again without web sources after the grounded request was
   * refused (Route A). Missing on plans saved before Day 3, which were all grounded requests.
   */
  grounded?: boolean;
  at: number;
}
