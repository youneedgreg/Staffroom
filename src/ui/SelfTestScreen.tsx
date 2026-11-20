/**
 * Runs six of the seven tasks once, on the invented sample class, and shows where each ran.
 * Use it on Day 1 to prove the real engine works, and keep it: it shows all four
 * inference modes in one click.
 */
import { useState } from 'react';
import { CBC_G5_MATHS as pack } from '../core/curriculum';
import { askPlan, draftRemark, summariseDifficulty, writeParentNote, type Failure } from '../core/flows';
import { strugglingGroups } from '../core/groups';
import { ranText, stoppedNoModel, type LedgerEntry } from '../core/ledger';
import { MODE_TEXT, resolveMode, TASKS, type Mode, type Settings, type TaskId } from '../core/policy';
import { lessonIdeaPrompt, plainWordsPrompt } from '../core/prompts';
import { runTask, type RunContext } from '../core/runner';
import { sampleClass } from '../core/sample';
import type { Engine } from '../engine/engine';
import { offWhen } from './a11y';

interface Row {
  task: TaskId;
  mode: Mode | 'disabled';
  ran: string;
  ms: number;
  result: string;
  ok: boolean;
  /** Stopped because this browser has no on-device model: the rule working, not a failure. */
  stopped: boolean;
}

function failureText(f: Failure): string {
  if (f.status === 'error') return f.message;
  if (f.status === 'disabled') return f.reason;
  return 'Blocked by the name check.';
}

interface Props {
  engine: Engine;
  settings: Settings;
  record: (entry: LedgerEntry) => void | Promise<void>;
}

export function SelfTestScreen({ engine, settings, record }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setRows([]);
    const data = sampleClass();
    const group = strugglingGroups(data, pack)[0]!;
    const learner = group.learners[0]!;
    // Each step records one ledger entry. Keep the latest so the row can show where it ran.
    let last: LedgerEntry | null = null;
    const ctx: RunContext = {
      engine,
      settings,
      guard: { learners: data.learners, extraTerms: [data.schoolName, data.teacherName] },
      record: async (entry) => {
        last = entry;
        await record(entry);
      },
    };
    const add = (task: TaskId, ok: boolean, result: string) => {
      const e = last as LedgerEntry | null;
      const ran = ranText(e);
      setRows((current) => [
        ...current,
        { task, mode: resolveMode(task, settings).mode, ran, ms: e?.ms ?? 0, result, ok, stopped: !ok && !!e && stoppedNoModel(e) },
      ]);
      last = null;
    };

    const remark = await draftRemark(ctx, pack, data, learner);
    add('remark', 'remark' in remark, 'remark' in remark ? remark.remark.text : failureText(remark.failure));

    const difficulty = await summariseDifficulty(ctx, pack, data, group);
    const phrase = 'difficulty' in difficulty ? difficulty.difficulty : '';
    add('difficulty', 'difficulty' in difficulty, 'difficulty' in difficulty ? phrase : failureText(difficulty.failure));

    const plan = await askPlan(ctx, pack, group, phrase);
    const home = 'plan' in plan ? plan.parsed.home || plan.plan.answer : 'Share an orange equally and name each share.';
    add(
      'plan',
      'plan' in plan,
      'plan' in plan
        ? `${plan.parsed.activities.length} activities, ${plan.plan.sources.length} sources. ${plan.plan.answer.slice(0, 160)}`
        : failureText(plan.failure),
    );

    const note = await writeParentNote(ctx, data, group, learner, home, phrase);
    add('personalise', 'note' in note, 'note' in note ? note.note : failureText(note.failure));

    for (const spec of [lessonIdeaPrompt(pack, group.subStrand), plainWordsPrompt(pack, 'AE', group.subStrand)]) {
      const r = await runTask(ctx, spec);
      add(spec.task, r.status === 'ok', r.status === 'ok' ? r.text : failureText(r));
    }
    setRunning(false);
  };

  return (
    <section>
      <h2>Self-test</h2>
      <p>
        Runs six tasks once on the invented sample class and shows where each one ran.
        Engine: <strong>{engine.name}</strong>.
      </p>
      <p className="row">
        <button type="button" className="primary" {...offWhen(running, () => void run())}>Run the self-test</button>
        {running && <span role="status">Running…</span>}
      </p>
      {rows.length > 0 && (
        <div className="scroll">
          <table data-testid="selftest">
            <caption>One row per task</caption>
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Mode</th>
                <th scope="col">Ran</th>
                <th scope="col">Time</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.task}>
                  <th scope="row">{TASKS[r.task].label}</th>
                  <td><code>{MODE_TEXT[r.mode]}</code></td>
                  <td>{r.ran}</td>
                  <td>{r.ms} ms</td>
                  <td className={r.ok || r.stopped ? undefined : 'bad'}>
                    {r.ok ? r.result : r.stopped ? `Stopped, as designed: ${r.result}` : `Failed: ${r.result}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.some((r) => r.stopped) && (
            <p data-testid="selftest-no-model">
              With no on-device model, the three learner tasks stop. That is what Staffroom is meant to do: nothing
              about a child went to the cloud.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
