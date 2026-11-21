import { CBC_G5_MATHS } from '../core/curriculum';
import { uid } from '../core/hash';
import { sampleClass } from '../core/sample';
import { LEVELS, type ClassData, type CurriculumPack, type Level } from '../core/types';
import { focusSoon } from './a11y';
import { LaptopIcon } from './icons';

interface Props {
  classData: ClassData | null;
  pack: CurriculumPack | null;
  onChange: (next: ClassData | null) => void;
  onWipe: () => Promise<void>;
}

function emptyClass(): ClassData {
  return {
    id: uid('class'),
    name: 'My class',
    packId: CBC_G5_MATHS.id,
    schoolName: '',
    teacherName: '',
    learners: [],
    assessments: {},
  };
}

export function ClassScreen({ classData, pack, onChange, onWipe }: Props) {
  if (!classData || !pack) {
    return (
      <section>
        <h2>Your class</h2>
        <div className="step welcome">
          <p className="where laptop"><LaptopIcon />On this laptop</p>
          <p>Nothing is stored yet. Everything you enter here stays in this browser, on this laptop.</p>
          <p className="row">
            <button type="button" className="primary" onClick={() => { onChange(sampleClass()); focusSoon('main h2'); }}>
              Load the invented sample class
            </button>
            <button type="button" onClick={() => { onChange(emptyClass()); focusSoon('main h2'); }}>Start an empty class</button>
          </p>
          <p className="quiet">The sample class has 30 made-up learners. No real child is in it.</p>
        </div>
      </section>
    );
  }

  const data = classData;
  const update = (patch: Partial<ClassData>) => onChange({ ...data, ...patch });

  const setLevel = (learnerId: string, subStrandId: string, value: string) => {
    const current = data.assessments[learnerId] ?? { learnerId, levels: {}, note: '' };
    const levels = { ...current.levels };
    if (value) levels[subStrandId] = value as Level;
    else delete levels[subStrandId];
    update({ assessments: { ...data.assessments, [learnerId]: { ...current, levels } } });
  };

  const setNote = (learnerId: string, note: string) => {
    const current = data.assessments[learnerId] ?? { learnerId, levels: {}, note: '' };
    update({ assessments: { ...data.assessments, [learnerId]: { ...current, note } } });
  };

  const setName = (learnerId: string, name: string) => {
    update({ learners: data.learners.map((l) => (l.id === learnerId ? { ...l, name } : l)) });
  };

  const addLearner = () => {
    const id = uid('l');
    update({
      learners: [...data.learners, { id, name: '' }],
      assessments: { ...data.assessments, [id]: { learnerId: id, levels: {}, note: '' } },
    });
  };

  const removeLearner = (learnerId: string) => {
    const assessments = { ...data.assessments };
    delete assessments[learnerId];
    update({ learners: data.learners.filter((l) => l.id !== learnerId), assessments });
  };

  return (
    <section>
      <h2>{data.name}</h2>
      <p>
        {pack.grade} {pack.learningArea}, {pack.curriculum}. {data.learners.length} learners.
      </p>
      <div className="step">
        <p className="where laptop"><LaptopIcon />On this laptop</p>
        <div className="fields">
          <label>
            School name
            <input value={data.schoolName} onChange={(e) => update({ schoolName: e.target.value })} />
          </label>
          <label>
            Your name
            <input value={data.teacherName} onChange={(e) => update({ teacherName: e.target.value })} />
          </label>
        </div>
        <p className="quiet">Both names are kept here so Staffroom can stop them from being sent anywhere.</p>
      </div>

      <div className="scroll sheet roster">
        <table>
          <caption>Levels and notes for this term</caption>
          <thead>
            <tr>
              <th scope="col">Learner</th>
              {pack.subStrands.map((s) => (
                <th scope="col" key={s.id}>{s.name}</th>
              ))}
              <th scope="col">Your note</th>
              <th scope="col"><span className="sr">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {data.learners.map((learner, row) => {
              const a = data.assessments[learner.id];
              const label = learner.name || `Learner ${row + 1}`;
              return (
                <tr key={learner.id}>
                  <th scope="row">
                    <input
                      aria-label={`Name of learner ${row + 1}`}
                      value={learner.name}
                      onChange={(e) => setName(learner.id, e.target.value)}
                    />
                  </th>
                  {pack.subStrands.map((s) => (
                    <td key={s.id}>
                      <select
                        aria-label={`${label}, ${s.name}`}
                        value={a?.levels[s.id] ?? ''}
                        onChange={(e) => setLevel(learner.id, s.id, e.target.value)}
                      >
                        <option value="">–</option>
                        {LEVELS.map((level) => (
                          <option key={level} value={level} title={pack.levelNames[level]}>{level}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td>
                    <textarea
                      className="note"
                      rows={1}
                      aria-label={`Note for ${label}`}
                      value={a?.note ?? ''}
                      onChange={(e) => setNote(learner.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <button type="button" aria-label={`Remove ${label}`} onClick={() => removeLearner(learner.id)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="row class-actions">
        <button type="button" onClick={addLearner}>Add a learner</button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm('Remove the class, every remark and the ledger from this laptop?')) void onWipe();
          }}
        >
          Remove everything from this laptop
        </button>
      </p>
      <p className="quiet">
        EE: {pack.levelNames.EE}. ME: {pack.levelNames.ME}. AE: {pack.levelNames.AE}. BE: {pack.levelNames.BE}.
      </p>
    </section>
  );
}
