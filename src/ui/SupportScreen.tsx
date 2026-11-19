/**
 * Support: find a group that is struggling, sum up what they find hard on this laptop,
 * and ask the cloud for a plan with a question that has no learner in it.
 *
 * The outbound preview is the point of the screen: the teacher sees every word of text
 * that will leave, the roster guard re-checks it on every keystroke, and "Ask the cloud"
 * stays switched off, with the reason, until it passes.
 */
import { useMemo, useState } from 'react';
import { askPlan, summariseDifficulty, type Failure } from '../core/flows';
import { checkOutbound, describeHit } from '../core/guard';
import { strugglingGroups, type Group } from '../core/groups';
import { resolveMode, type Settings } from '../core/policy';
import { buildQuestion, parsePlan, PLAN_SYSTEM } from '../core/prompts';
import type { RunContext } from '../core/runner';
import type { ClassData, CurriculumPack, Plan } from '../core/types';
import type { PlanLibrary } from '../firebase/services';

interface Props {
  classData: ClassData | null;
  pack: CurriculumPack | null;
  ctx: RunContext | null;
  settings: Settings;
  online: boolean;
  /** The shared plan library. Null when it is not available (simulated engine). Used on Day 5. */
  library: PlanLibrary | null;
  plans: Plan[];
  savePlans: (update: (current: Plan[]) => Plan[]) => void;
}

/** What the screen remembers for one group, keyed by sub-strand id. */
interface GroupState {
  /** The editable difficulty phrase: the only free text in the question. */
  free: string;
  busy?: 'summing' | 'asking';
  problem?: string;
}

/** One sentence for any failed run, in the teacher's words. */
export function failureText(f: Failure): string {
  if (f.status === 'error') return f.message;
  if (f.status === 'disabled') return f.reason;
  return f.hits.map(describeHit).join(' ');
}

export function SupportScreen({ classData, pack, ctx, settings, online, plans, savePlans }: Props) {
  const [states, setStates] = useState<Record<string, GroupState>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  if (!classData || !pack || !ctx) {
    return (
      <section>
        <h2>Support</h2>
        <p>Add your class first. <a href="#/class">Go to Class</a>.</p>
      </section>
    );
  }

  const groups = strugglingGroups(classData, pack);
  const open = groups.find((g) => g.subStrand.id === openId) ?? null;
  const update = (id: string, patch: Partial<GroupState>) =>
    setStates((current) => ({ ...current, [id]: { free: '', ...current[id], ...patch } }));

  return (
    <section>
      <h2>Support</h2>
      <p>Sub-strands where three or more learners are at {pack.levelNames.AE} or {pack.levelNames.BE}.</p>
      {groups.length === 0 ? (
        <p>No group of three or more is struggling in the same sub-strand.</p>
      ) : (
        <ul data-testid="groups" className="groups">
          {groups.map((g) => (
            <li key={g.subStrand.id}>
              <strong>{g.subStrand.name}</strong>: {g.learners.length} learners ({g.band.toLowerCase()} of the class){' '}
              <button
                type="button"
                aria-expanded={openId === g.subStrand.id}
                onClick={() => setOpenId(openId === g.subStrand.id ? null : g.subStrand.id)}
              >
                {openId === g.subStrand.id ? 'Close' : 'Plan support'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <GroupPanel
          key={open.subStrand.id}
          group={open}
          pack={pack}
          classData={classData}
          ctx={ctx}
          settings={settings}
          online={online}
          state={states[open.subStrand.id] ?? { free: '' }}
          update={(patch) => update(open.subStrand.id, patch)}
          lastPlan={[...plans].reverse().find((p) => p.packId === pack.id && p.subStrandId === open.subStrand.id)}
          onPlan={(plan) => savePlans((current) => [...current, plan])}
        />
      )}
    </section>
  );
}

interface PanelProps {
  group: Group;
  pack: CurriculumPack;
  classData: ClassData;
  ctx: RunContext;
  settings: Settings;
  online: boolean;
  state: GroupState;
  update: (patch: Partial<GroupState>) => void;
  lastPlan?: Plan;
  onPlan: (plan: Plan) => void;
}

function GroupPanel({ group, pack, classData, ctx, settings, online, state, update, lastPlan, onPlan }: PanelProps) {
  // 2. The question, rebuilt and re-checked on every keystroke.
  const message = useMemo(() => buildQuestion(pack, group, state.free), [pack, group, state.free]);
  const verdict = useMemo(() => checkOutbound(message, ctx.guard), [message, ctx.guard]);
  const policy = resolveMode('plan', settings);

  // 1. Sum up the difficulty on this laptop.
  const sumUp = async () => {
    update({ busy: 'summing', problem: undefined });
    const result = await summariseDifficulty(ctx, pack, classData, group);
    if ('failure' in result) {
      update({ busy: undefined, problem: failureText(result.failure) });
      return;
    }
    update({
      busy: undefined,
      free: result.difficulty,
      problem: result.difficulty ? undefined : 'There are no notes for this group, so there was nothing to sum up. Type the difficulty yourself.',
    });
  };

  // 5. Why "Ask the cloud" is switched off, if it is. The first reason that applies is shown.
  const blockedBecause =
    policy.mode === 'disabled'
      ? policy.reason
      : !online
        ? 'You are offline, so nothing can be sent. Connect to the internet to ask the cloud.'
        : !verdict.ok
          ? 'Fix what is listed above first. Nothing is sent while the check fails.'
          : null;

  // 6. Ask once. Never retry on our own: a second send needs a second click.
  const ask = async () => {
    update({ busy: 'asking', problem: undefined });
    const result = await askPlan(ctx, pack, group, state.free);
    if ('failure' in result) {
      update({ busy: undefined, problem: failureText(result.failure) });
      return;
    }
    onPlan(result.plan);
    update({ busy: undefined });
  };

  const busy = state.busy !== undefined;
  const nameHits = verdict.hits.filter((h) => h.kind === 'name').length;
  const digitHits = verdict.hits.filter((h) => h.kind === 'digits' || h.kind === 'admission' || h.kind === 'date').length;
  const schoolHits = verdict.hits.filter((h) => h.kind === 'school' || h.kind === 'email').length;

  return (
    <section className="panel" aria-labelledby="panel-title" data-testid="group-panel">
      <h3 id="panel-title">{group.subStrand.name}: {group.band.toLowerCase()} of the class</h3>

      <div className="step">
        <h4>1. What do they find hard?</h4>
        <p className="small">Staffroom reads your notes on these learners and sums them up in one phrase. This runs on this laptop only.</p>
        <p className="row">
          <button type="button" onClick={sumUp} disabled={busy}>
            {state.busy === 'summing' ? 'Summing up…' : 'Sum up the difficulty'}
          </button>
        </p>
      </div>

      {/* 3. The outbound preview: everything that will leave, in full. */}
      <div className="outbound" data-testid="outbound">
        <h4>2. This is all the text that will leave this laptop</h4>
        <p className="fixed" data-testid="outbound-fixed">{message.fixed}</p>
        <label htmlFor="free">The difficulty they share <span className="small">(the only part you can change)</span></label>
        <textarea
          id="free"
          data-testid="outbound-free"
          rows={2}
          value={state.free}
          onChange={(e) => update({ free: e.target.value })}
          placeholder="For example: adding the tops and the bottoms when adding fractions"
          aria-describedby="verdict"
        />
        {/* 4. The verdict, recomputed on every keystroke. */}
        <div id="verdict" data-testid="verdict">
          {verdict.ok ? (
            <p className="pass">Checked against your class list: 0 learner names, 0 numbers, 0 school words.</p>
          ) : (
            <div role="alert" className="fail">
              <p>
                Checked against your class list: {nameHits} learner {nameHits === 1 ? 'name' : 'names'}, {digitHits}{' '}
                {digitHits === 1 ? 'number' : 'numbers'}, {schoolHits} school {schoolHits === 1 ? 'word' : 'words'}.
              </p>
              <ul>
                {verdict.hits.map((h, i) => <li key={`${h.kind}-${h.match}-${i}`}>{describeHit(h)}</li>)}
              </ul>
            </div>
          )}
        </div>
        <details className="small">
          <summary>Also sent: the instructions Staffroom gives the cloud model</summary>
          <p>{PLAN_SYSTEM}</p>
        </details>
      </div>

      <div className="step">
        <h4>3. Ask the cloud for a plan</h4>
        <p className="row">
          <button
            type="button"
            className="primary"
            data-testid="ask"
            onClick={ask}
            disabled={busy || blockedBecause !== null}
            aria-describedby={blockedBecause ? 'ask-reason' : undefined}
          >
            {state.busy === 'asking' ? 'Asking…' : 'Ask the cloud'}
          </button>
        </p>
        {blockedBecause && <p id="ask-reason" data-testid="ask-reason">{blockedBecause}</p>}
      </div>

      {state.problem && <p role="alert" className="bad" data-testid="support-problem">{state.problem}</p>}

      {lastPlan && <PlanPreview plan={lastPlan} />}
    </section>
  );
}

/** Day 2 shows the answer as text. The full plan panel, sources and parent notes come on Day 3. */
function PlanPreview({ plan }: { plan: Plan }) {
  const parsed = parsePlan(plan.answer);
  return (
    <div className="step" data-testid="plan">
      <h4>The plan</h4>
      <p><span className="badge">Answered in the cloud from a question with no learner in it</span></p>
      {parsed.activities.length > 0 ? (
        <ol data-testid="plan-activities">{parsed.activities.map((a, i) => <li key={i}>{a}</li>)}</ol>
      ) : (
        <pre>{plan.answer}</pre>
      )}
      <p className="small">Asked at {new Date(plan.at).toLocaleTimeString()}. The Privacy ledger shows the exact text that was sent.</p>
    </div>
  );
}
