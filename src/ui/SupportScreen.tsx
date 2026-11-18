/**
 * TO WRITE. This is the screen the judges will remember, and it is yours.
 * The roadmap doc lists it function by function. Everything it needs is already in
 * src/core/flows.ts and is tested: summariseDifficulty, askPlan, writeParentNote.
 *
 * What is here now: the list of struggling groups, which is plain counting.
 */
import { strugglingGroups } from '../core/groups';
import type { ClassData, CurriculumPack } from '../core/types';

export function SupportScreen({ classData, pack }: { classData: ClassData | null; pack: CurriculumPack | null }) {
  if (!classData || !pack) {
    return (
      <section>
        <h2>Support</h2>
        <p>Add your class first. <a href="#/class">Go to Class</a>.</p>
      </section>
    );
  }
  const groups = strugglingGroups(classData, pack);
  return (
    <section>
      <h2>Support</h2>
      <p>Sub-strands where three or more learners are at {pack.levelNames.AE} or {pack.levelNames.BE}.</p>
      {groups.length === 0 ? (
        <p>No group of three or more is struggling in the same sub-strand.</p>
      ) : (
        <ul data-testid="groups">
          {groups.map((g) => (
            <li key={g.subStrand.id}>
              <strong>{g.subStrand.name}</strong>: {g.learners.length} learners ({g.band.toLowerCase()} of the class)
            </li>
          ))}
        </ul>
      )}
      <p className="warn">The rest of this screen is not built yet. See “Support screen” in the roadmap.</p>
    </section>
  );
}
