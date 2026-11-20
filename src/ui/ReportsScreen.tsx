import { useRef, useState } from 'react';
import { runBatch, type BatchProgress, type ItemResult } from '../core/batch';
import { draftRemark, needsRemark } from '../core/flows';
import type { RunContext } from '../core/runner';
import type { ClassData, CurriculumPack, Learner, Remark } from '../core/types';
import { offWhen } from './a11y';

interface Props {
  classData: ClassData | null;
  pack: CurriculumPack | null;
  ctx: RunContext | null;
  remarks: Record<string, Remark>;
  saveRemarks: (update: (current: Record<string, Remark>) => Record<string, Remark>) => void;
}

const SOURCE_TEXT = { on_device: 'Written on this laptop', in_cloud: 'Written in the cloud' } as const;

export function ReportsScreen({ classData, pack, ctx, remarks, saveRemarks }: Props) {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const stopper = useRef<AbortController | null>(null);
  // The batch reads remarks while it runs, so it needs the latest value, not the one from its first render.
  const latest = useRef(remarks);
  latest.current = remarks;

  if (!classData || !pack || !ctx) {
    return (
      <section>
        <h2>Report remarks</h2>
        <p>Add your class first. <a href="#/class">Go to Class</a>.</p>
      </section>
    );
  }

  const running = progress !== null;

  const draftOne = async (learner: Learner, force: boolean): Promise<ItemResult> => {
    if (!force && !needsRemark(pack, classData, learner, latest.current[learner.id])) return 'skipped';
    const result = await draftRemark(ctx, pack, classData, learner);
    if ('failure' in result) {
      const f = result.failure;
      const text = f.status === 'error' ? f.message : f.status === 'disabled' ? f.reason : 'This request was blocked.';
      setProblem(text);
      // No on-device model: the same thing would happen for every learner, so stop.
      return f.status === 'error' && f.kind === 'no_device_model' ? 'stop' : 'failed';
    }
    saveRemarks((current) => ({ ...current, [learner.id]: result.remark }));
    return 'ok';
  };

  const draftAll = async () => {
    setProblem('');
    setMessage('');
    const controller = new AbortController();
    stopper.current = controller;
    setProgress({ done: 0, total: classData.learners.length, ok: 0, skipped: 0, failed: 0 });
    const outcome = await runBatch(classData.learners, (l) => draftOne(l, false), {
      onProgress: setProgress,
      signal: controller.signal,
    });
    setProgress(null);
    stopper.current = null;
    const parts = [`${outcome.ok} drafted`];
    if (outcome.skipped) parts.push(`${outcome.skipped} already up to date`);
    if (outcome.failed) parts.push(`${outcome.failed} failed`);
    setMessage(`${outcome.stopped ? 'Stopped. ' : 'Done. '}${parts.join(', ')}.`);
  };

  const edit = (learnerId: string, text: string) => {
    saveRemarks((current) => {
      const existing = current[learnerId];
      if (!existing) return current;
      return { ...current, [learnerId]: { ...existing, text, status: 'edited', at: Date.now() } };
    });
  };

  const approve = (learnerId: string, approved: boolean) => {
    saveRemarks((current) => {
      const existing = current[learnerId];
      if (!existing) return current;
      return { ...current, [learnerId]: { ...existing, status: approved ? 'approved' : 'edited' } };
    });
  };

  const copyAll = async () => {
    const text = classData.learners
      .filter((l) => remarks[l.id])
      .map((l) => `${l.name}\n${remarks[l.id]!.text}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copied every remark.');
    } catch {
      setMessage('Copying is blocked in this browser. Select the text by hand.');
    }
  };

  const written = classData.learners.filter((l) => remarks[l.id]).length;

  return (
    <section>
      <h2>Report remarks</h2>
      <p>
        Each remark is drafted from the levels and your note. This runs on this laptop only.
        If this browser has no on-device model, Staffroom stops. It does not send a learner to the cloud instead.
      </p>
      <p className="row">
        <button type="button" className="primary" {...offWhen(running, () => void draftAll())}>Draft all remarks</button>
        {running && <button type="button" onClick={() => stopper.current?.abort()}>Stop</button>}
        <button type="button" onClick={copyAll} disabled={written === 0}>Copy all</button>
      </p>
      {running && (
        <p role="status">
          Drafting {progress.done} of {progress.total}
          <progress max={progress.total} value={progress.done} aria-label="Remarks drafted" />
        </p>
      )}
      {message && <p role="status" data-testid="batch-message">{message}</p>}
      {problem && <p className="bad" role="alert" data-testid="batch-problem">{problem}</p>}
      <p className="quiet" data-testid="written-count">{written} of {classData.learners.length} written.</p>

      <ol className="cards">
        {classData.learners.map((learner) => {
          const remark = remarks[learner.id];
          const a = classData.assessments[learner.id];
          const levels = pack.subStrands
            .filter((s) => a?.levels[s.id])
            .map((s) => `${s.name} ${a!.levels[s.id]}`)
            .join(' · ');
          return (
            <li key={learner.id} className="card">
              <h3>{learner.name || 'Unnamed learner'}</h3>
              <p className="quiet">{levels || 'No levels yet'}</p>
              {remark ? (
                <>
                  <label>
                    <span className="sr">Remark for {learner.name}</span>
                    <textarea rows={3} value={remark.text} onChange={(e) => edit(learner.id, e.target.value)} />
                  </label>
                  <p className="row small">
                    <span className="badge">{SOURCE_TEXT[remark.source]}</span>
                    <span>{remark.status === 'draft' ? 'Draft' : remark.status === 'edited' ? 'Edited by you' : 'Approved'}</span>
                    <label className="inline">
                      <input
                        type="checkbox"
                        checked={remark.status === 'approved'}
                        onChange={(e) => approve(learner.id, e.target.checked)}
                      />
                      Approved
                    </label>
                    <button type="button" {...offWhen(running, () => void draftOne(learner, true))}>Draft again</button>
                  </p>
                </>
              ) : (
                <p className="row small">
                  <button type="button" {...offWhen(running || !levels, () => void draftOne(learner, true))}>
                    Draft this remark
                  </button>
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
