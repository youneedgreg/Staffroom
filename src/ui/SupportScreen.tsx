/**
 * Support: find a group that is struggling, sum up what they find hard on this laptop,
 * and ask the cloud for a plan with a question that has no learner in it.
 *
 * The outbound preview is the point of the screen: the teacher sees every word of text
 * that will leave, the roster guard re-checks it on every keystroke, and "Ask the cloud"
 * stays switched off, with the reason, until it passes.
 *
 * Route A: if the grounded request is refused, nothing is retried on its own. The teacher is
 * asked whether to send the same previewed text again without web sources, and the answer is
 * labelled "No web sources". The Privacy ledger shows both sends.
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { runBatch, type BatchProgress } from '../core/batch';
import { askPlan, summariseDifficulty, writeParentNote, type Failure } from '../core/flows';
import { checkOutbound, describeHit } from '../core/guard';
import { strugglingGroups, type Group } from '../core/groups';
import { resolveMode, type Settings } from '../core/policy';
import { ranText, type LedgerEntry } from '../core/ledger';
import {
  buildQuestion,
  lessonIdeaPrompt,
  parsePlan,
  plainWordsPrompt,
  PLAN_SYSTEM,
  type ParsedPlan,
  type PromptSpec,
} from '../core/prompts';
import { runTask, type RunContext } from '../core/runner';
import type { ClassData, CurriculumPack, Plan } from '../core/types';
import type { DeviceStatus } from '../engine/engine';
import { GROUNDED_SHARE_TEXT, sharePlan, type PlanLibrary, type SharedPlan } from '../core/library';
import { focusSoon, offWhen } from './a11y';

interface Props {
  classData: ClassData | null;
  pack: CurriculumPack | null;
  ctx: RunContext | null;
  settings: Settings;
  online: boolean;
  /** Whether this browser has an on-device model. Used to say why a "device first" task ran in the cloud. */
  device: DeviceStatus;
  /** The shared plan library. Null when it is not available (simulated engine without `&library=`). */
  library: PlanLibrary | null;
  plans: Plan[];
  savePlans: (update: (current: Plan[]) => Plan[]) => void;
  /** Kept by App, so the panel survives a trip to another tab and a batch keeps writing. */
  memory: SupportMemory;
  setMemory: Dispatch<SetStateAction<SupportMemory>>;
}

/** Everything the Support screen remembers while the app is open. Not saved: a reload clears it. */
export interface SupportMemory {
  /** Group state keyed by sub-strand id. */
  states: Record<string, GroupState>;
  /** The open group's sub-strand id. */
  openId: string | null;
}

export const EMPTY_SUPPORT: SupportMemory = { states: {}, openId: null };

/** What the screen remembers for one group, keyed by sub-strand id. */
export interface GroupState {
  /** The editable difficulty phrase: the only free text in the question. */
  free: string;
  /** Learner id to parent note, for the plan on screen. Kept until a new plan arrives. */
  notes: Record<string, string>;
  busy?: 'summing' | 'asking' | 'writing';
  problem?: string;
  /** Which step the problem belongs to, so it is shown under that step and nowhere else. */
  problemAt?: 'sum' | 'ask' | 'notes';
  /** Route A: the grounded request was refused, so offer to send it without web sources. */
  offerPlain?: boolean;
  progress?: BatchProgress;
  /** Stops the parent-note batch. Set only while it runs. */
  stop?: () => void;
  /** 12. The two small helpers, each with the text it got and where it ran. */
  quick?: Partial<Record<QuickId, QuickResult>>;
}

type QuickId = 'lessonIdea' | 'plainWords';

interface QuickResult {
  busy?: boolean;
  text?: string;
  /** Where it ran, in the ledger's words: "On this laptop", "In the cloud", … */
  ran?: string;
  problem?: string;
}

type Patch = Partial<GroupState> | ((current: GroupState) => Partial<GroupState>);

const EMPTY: GroupState = { free: '', notes: {} };

/** Where a quick-help answer ran. A "device first" answer from the cloud says why, when there is no model here. */
function quickRanText(entry: LedgerEntry, device: DeviceStatus): string {
  const fellBack = device === 'unavailable' && entry.mode === 'prefer_on_device' && entry.source === 'in_cloud';
  return fellBack ? `${ranText(entry)} (this browser has no on-device model)` : ranText(entry);
}

/** One sentence for any failed run, in the teacher's words. */
export function failureText(f: Failure): string {
  if (f.status === 'error') return f.message;
  if (f.status === 'disabled') return f.reason;
  return f.hits.map(describeHit).join(' ');
}

export function SupportScreen({ classData, pack, ctx, settings, online, device, library, plans, savePlans, memory, setMemory }: Props) {
  const { states, openId } = memory;
  const setOpenId = (id: string | null) => setMemory((m) => ({ ...m, openId: id }));

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
  // Functional so a batch of parent notes can add one note at a time without losing the others.
  const update = (id: string, patch: Patch) =>
    setMemory((m) => {
      const current = { ...EMPTY, ...m.states[id] };
      const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
      return { ...m, states: { ...m.states, [id]: next } };
    });

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
          device={device}
          state={states[open.subStrand.id] ?? EMPTY}
          update={(patch) => update(open.subStrand.id, patch)}
          lastPlan={[...plans].reverse().find((p) => p.packId === pack.id && p.subStrandId === open.subStrand.id)}
          onPlan={(plan) => savePlans((current) => [...current, plan])}
          library={library}
          onShared={(id) => savePlans((current) => current.map((p) => (p.id === id ? { ...p, shared: true } : p)))}
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
  device: DeviceStatus;
  state: GroupState;
  update: (patch: Patch) => void;
  lastPlan?: Plan;
  onPlan: (plan: Plan) => void;
  library: PlanLibrary | null;
  onShared: (planId: string) => void;
}

function GroupPanel({
  group,
  pack,
  classData,
  ctx,
  settings,
  online,
  device,
  state,
  update,
  lastPlan,
  onPlan,
  library,
  onShared,
}: PanelProps) {
  // Bumped after a share, so the shared-plans list loads again.
  const [libraryVersion, setLibraryVersion] = useState(0);
  // 2. The question, rebuilt and re-checked on every keystroke.
  const message = useMemo(() => buildQuestion(pack, group, state.free), [pack, group, state.free]);
  const verdict = useMemo(() => checkOutbound(message, ctx.guard), [message, ctx.guard]);
  const policy = resolveMode('plan', settings);
  const parsed = useMemo(() => (lastPlan ? parsePlan(lastPlan.answer) : null), [lastPlan]);

  // 1. Sum up the difficulty on this laptop.
  const sumUp = async () => {
    update({ busy: 'summing', problem: undefined });
    const result = await summariseDifficulty(ctx, pack, classData, group);
    if ('failure' in result) {
      const f = result.failure;
      const noModel = f.status === 'error' && f.kind === 'no_device_model';
      update({
        busy: undefined,
        problem: noModel ? `${failureText(f)} You can type the difficulty yourself in step 2.` : failureText(f),
        problemAt: 'sum',
      });
      return;
    }
    // The phrase is the next thing to read and edit.
    if (result.difficulty) focusSoon('[data-testid="outbound-free"]');
    update({
      busy: undefined,
      free: result.difficulty,
      problem: result.difficulty ? undefined : "The notes for this group don't describe a difficulty with this topic, so there was nothing to sum up. Type the difficulty yourself.",
      problemAt: 'sum',
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
  //    `search: false` is Route A's second send, from the "Ask without web sources" button only.
  const ask = async (search: boolean) => {
    update({ busy: 'asking', problem: undefined, offerPlain: false });
    const result = await askPlan(ctx, pack, group, state.free, { search });
    if ('failure' in result) {
      const f = result.failure;
      const refused = search && f.status === 'error' && f.kind === 'refused';
      update({ busy: undefined, problem: failureText(f), problemAt: 'ask', offerPlain: refused });
      if (refused) focusSoon('[data-testid="route-a"]');
      return;
    }
    onPlan(result.plan);
    focusSoon('[data-testid="plan"] h4');
    update({ busy: undefined, notes: {}, progress: undefined });
  };

  // 9. Parent notes, one learner at a time, on this laptop only.
  const writeNotes = async () => {
    if (!lastPlan || !parsed) return;
    const home = parsed.home || lastPlan.answer;
    const controller = new AbortController();
    update({ busy: 'writing', problem: undefined, notes: {}, progress: undefined, stop: () => controller.abort() });
    let problem: string | undefined;
    const outcome = await runBatch(
      group.learners,
      async (learner) => {
        const result = await writeParentNote(ctx, classData, group, learner, home, state.free);
        if ('failure' in result) {
          problem = failureText(result.failure);
          // With no on-device model every note would fail the same way, so stop at the first.
          const f = result.failure;
          return f.status === 'error' && f.kind === 'no_device_model' ? 'stop' : 'failed';
        }
        update((current) => ({ notes: { ...current.notes, [learner.id]: result.note } }));
        return 'ok';
      },
      { signal: controller.signal, onProgress: (progress) => update({ progress }) },
    );
    update({
      busy: undefined,
      stop: undefined,
      progress: outcome,
      problem: outcome.failed > 0 || (outcome.stopped && problem) ? problem : undefined,
      problemAt: 'notes',
    });
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
          <button type="button" {...offWhen(busy, () => void sumUp())}>
            {state.busy === 'summing' ? 'Summing up…' : 'Sum up the difficulty'}
          </button>
        </p>
        {state.problem && state.problemAt === 'sum' && (
          <p role="alert" className="bad" data-testid="sum-problem">{state.problem}</p>
        )}
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
            {...offWhen(busy || blockedBecause !== null, () => void ask(true))}
            aria-describedby={blockedBecause ? 'ask-reason' : undefined}
          >
            {state.busy === 'asking' ? 'Asking…' : 'Ask the cloud'}
          </button>
        </p>
        {blockedBecause && <p id="ask-reason" data-testid="ask-reason">{blockedBecause}</p>}
      </div>

      {state.offerPlain ? (
        // Route A. The refused request did leave the laptop; say so, then ask before a second send.
        <div role="alert" className="route-a" data-testid="route-a">
          <p className="bad">{state.problem}</p>
          <p>
            <strong>Web sources aren't available right now.</strong> Ask the cloud for a plan without web sources?
            The same text shown above is sent again, and the answer is marked "No web sources".
          </p>
          <p className="row">
            <button
              type="button"
              data-testid="ask-plain"
              {...offWhen(busy || blockedBecause !== null, () => void ask(false))}
              aria-describedby={blockedBecause ? 'ask-reason' : undefined}
            >
              Ask without web sources
            </button>
            <button type="button" {...offWhen(busy, () => update({ offerPlain: false, problem: undefined }))}>
              Not now
            </button>
          </p>
        </div>
      ) : (
        state.problem && state.problemAt === 'ask' && (
          <p role="alert" className="bad" data-testid="support-problem">{state.problem}</p>
        )
      )}

      {lastPlan && parsed && (
        <>
          <PlanPanel
            plan={lastPlan}
            parsed={parsed}
            share={
              library
                ? async () => {
                    const result = await sharePlan(ctx, library, lastPlan, online);
                    if (result.status === 'ok') {
                      onShared(lastPlan.id);
                      setLibraryVersion((v) => v + 1);
                    }
                    return result.status === 'ok' ? null : result.message;
                  }
                : null
            }
          />
          <div className="step" data-testid="parent-notes">
            <h4>5. Notes to parents</h4>
            <p className="small">
              Each note joins the plan's "At home" activity to one learner's own level and your note on them.
              This runs on this laptop only. Names are added by Staffroom, never given to the model.
            </p>
            <p className="row">
              <button type="button" className="primary" data-testid="write-notes" {...offWhen(busy, () => void writeNotes())}>
                {state.busy === 'writing' ? 'Writing…' : `Write the parent notes (${group.learners.length})`}
              </button>
              {state.busy === 'writing' && (
                <button type="button" onClick={() => state.stop?.()}>Stop</button>
              )}
              {state.progress && (
                <span role="status" data-testid="notes-progress">
                  {state.busy === 'writing'
                    ? `Writing note ${Math.min(state.progress.done + 1, state.progress.total)} of ${state.progress.total}…`
                    : `${state.progress.ok} of ${state.progress.total} notes written${state.progress.failed ? `, ${state.progress.failed} failed` : ''}.`}
                </span>
              )}
            </p>
            {state.problem && state.problemAt === 'notes' && (
              <p role="alert" className="bad" data-testid="notes-problem">{state.problem}</p>
            )}
            {Object.keys(state.notes).length > 0 && (
              <p className="small" data-testid="notes-check">
                Check each note before you send it. The kind words are copied from your own note about the child, and
                the on-device model can mistake a slip for a strength. The rest is your difficulty phrase and the home
                activity, word for word.
              </p>
            )}
            {Object.keys(state.notes).length > 0 && (
              <ul className="cards" data-testid="notes">
                {group.learners
                  .filter((l) => state.notes[l.id] !== undefined)
                  .map((l) => (
                    <li key={l.id} className="card">
                      <p className="row">
                        <label htmlFor={`note-${l.id}`}><strong>{l.name}</strong></label>
                        <span className="badge">Written on this laptop</span>
                      </p>
                      <textarea
                        id={`note-${l.id}`}
                        rows={6}
                        value={state.notes[l.id]}
                        onChange={(e) => update((current) => ({ notes: { ...current.notes, [l.id]: e.target.value } }))}
                      />
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </>
      )}

      {library && <SharedPlans library={library} pack={pack} group={group} version={libraryVersion} online={online} />}

      <QuickHelp
        specs={{
          lessonIdea: lessonIdeaPrompt(pack, group.subStrand),
          plainWords: plainWordsPrompt(pack, 'AE', group.subStrand),
        }}
        labels={{ lessonIdea: 'Starter activity', plainWords: `What does ${pack.levelNames.AE} mean here?` }}
        state={state.quick ?? {}}
        run={async (id, spec) => {
          const set = (r: QuickResult) => update((current) => ({ quick: { ...current.quick, [id]: r } }));
          set({ busy: true });
          const result = await runTask(ctx, spec);
          set(
            result.status === 'ok'
              ? { text: result.text.trim(), ran: quickRanText(result.entry, device) }
              : { problem: failureText(result), ran: ranText(result.entry) },
          );
        }}
      />
    </section>
  );
}

/**
 * 12. Two small helpers with no learner in them. The starter activity prefers the cloud and
 * falls back to the laptop with no connection; the plain-words line prefers the laptop. Each
 * says where it ran, which is where a judge sees PREFER_IN_CLOUD move to the device offline.
 */
function QuickHelp({
  specs,
  labels,
  state,
  run,
}: {
  specs: Record<QuickId, PromptSpec>;
  labels: Record<QuickId, string>;
  state: Partial<Record<QuickId, QuickResult>>;
  run: (id: QuickId, spec: PromptSpec) => Promise<void>;
}) {
  const ids: QuickId[] = ['lessonIdea', 'plainWords'];
  return (
    <div className="step" data-testid="quick-help">
      <h4>Quick help for the lesson</h4>
      <p className="small">No learner is in these questions. Each one says where it ran.</p>
      <div className="cards quick">
        {ids.map((id) => {
          const r = state[id];
          const spec = specs[id];
          return (
            <div key={id} className="card" data-testid={`quick-${id}`}>
              <p className="row">
                <button type="button" data-testid={`quick-${id}-run`} {...offWhen(Boolean(r?.busy), () => void run(id, spec))}>
                  {r?.busy ? 'Working…' : labels[id]}
                </button>
              </p>
              {r?.text && <p data-testid={`quick-${id}-text`}>{r.text}</p>}
              {r?.problem && <p role="alert" className="bad" data-testid={`quick-${id}-problem`}>{r.problem}</p>}
              {r?.ran && !r.busy && (
                <p className="small">Ran: <strong data-testid={`quick-${id}-ran`}>{r.ran}</strong></p>
              )}
              <details className="small">
                <summary>What this sends if it uses the cloud</summary>
                <pre>{`${spec.system}\n\n${spec.prompt}`}</pre>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 7–8. The plan, then its web sources and Google's search suggestions, then sharing. */
function PlanPanel({
  plan,
  parsed,
  share,
}: {
  plan: Plan;
  parsed: ParsedPlan;
  /** Shares the plan; resolves to an error message, or null when it was shared. Null with no library. */
  share: (() => Promise<string | null>) | null;
}) {
  const plain = plan.grounded === false;
  const [sharing, setSharing] = useState(false);
  const [shareProblem, setShareProblem] = useState<string | null>(null);
  const doShare = async () => {
    if (!share) return;
    setSharing(true);
    const problem = await share();
    setShareProblem(problem);
    setSharing(false);
    // The button is replaced by "Shared with teachers…": move focus there, not to the page.
    if (!problem) focusSoon('[data-testid="share-done"]');
  };
  return (
    <div className="step plan" data-testid="plan">
      <h4>4. The plan</h4>
      <p className="row">
        <span className="badge">Answered in the cloud from a question with no learner in it</span>
        {plain && <span className="badge warn-badge" data-testid="no-sources-badge">No web sources</span>}
      </p>
      {parsed.activities.length > 0 ? (
        <>
          <h5>Activities</h5>
          <ol data-testid="plan-activities">{parsed.activities.map((a, i) => <li key={i}>{a}</li>)}</ol>
          {parsed.check && (
            <>
              <h5>Check after two weeks</h5>
              <p data-testid="plan-check">{parsed.check}</p>
            </>
          )}
          {parsed.home && (
            <>
              <h5>At home</h5>
              <p data-testid="plan-home">{parsed.home}</p>
            </>
          )}
        </>
      ) : (
        <pre data-testid="plan-raw">{plan.answer}</pre>
      )}

      <h5>Web sources</h5>
      {plan.sources.length > 0 ? (
        <ul data-testid="plan-sources">
          {plan.sources.map((s) => (
            <li key={s.uri}>
              <a href={s.uri} target="_blank" rel="noopener noreferrer">{s.title || s.uri}</a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small" data-testid="plan-no-sources">
          {plain
            ? 'This plan was asked for without web sources, so there are none to check. Read it as advice, not as a cited answer.'
            : 'The cloud returned no web sources for this answer.'}
        </p>
      )}
      {plan.searchHtml && <SearchSuggestions html={plan.searchHtml} />}
      <p className="small">Asked at {new Date(plan.at).toLocaleTimeString()}. The Privacy ledger shows the exact text that was sent.</p>

      {share && (
        <div data-testid="share">
          <h5>Share with other teachers</h5>
          {!plain ? (
            <p className="small" data-testid="share-grounded">{GROUNDED_SHARE_TEXT}</p>
          ) : plan.shared ? (
            <p role="status" data-testid="share-done">Shared with teachers using Staffroom.</p>
          ) : (
            <>
              <p className="small">
                Anyone using Staffroom can read a shared plan: the question above and this answer, nothing else. It
                can't be changed or taken back from here.
              </p>
              <p className="row">
                <button type="button" data-testid="share-plan" {...offWhen(sharing, () => void doShare())}>
                  {sharing ? 'Sharing…' : 'Share this plan'}
                </button>
              </p>
            </>
          )}
          {shareProblem && (
            <p role="alert" className="bad" data-testid="share-problem">{shareProblem}</p>
          )}
        </div>
      )}
    </div>
  );
}

type LibraryState = { status: 'loading' } | { status: 'error' } | { status: 'ok'; plans: SharedPlan[] };

/** Plans other teachers shared for this topic. Plain text only: no HTML from the library is rendered. */
function SharedPlans({
  library,
  pack,
  group,
  version,
  online,
}: {
  library: PlanLibrary;
  pack: CurriculumPack;
  group: Group;
  version: number;
  /** Offline, nothing is loaded; the list loads again when the connection comes back. */
  online: boolean;
}) {
  const [state, setState] = useState<LibraryState>({ status: 'loading' });
  useEffect(() => {
    if (!online) return;
    let live = true;
    setState({ status: 'loading' });
    library.list(pack.id, group.subStrand.id).then(
      (plans) => live && setState({ status: 'ok', plans }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [library, pack.id, group.subStrand.id, version, online]);

  return (
    <div className="step" data-testid="shared-plans">
      <h4>Plans shared by other teachers</h4>
      <p className="small">
        Plans for {group.subStrand.name} that teachers using Staffroom chose to share, newest first. Each is a
        question with no learner in it and the cloud's answer, asked without web sources.
      </p>
      {!online ? (
        <p className="small" data-testid="shared-plans-offline">
          Shared plans need the internet. They load when the connection comes back.
        </p>
      ) : (
        <>
          {state.status === 'loading' && <p role="status">Loading shared plans…</p>}
          {state.status === 'error' && (
            <p className="small" data-testid="shared-plans-error">The shared plans could not be loaded. Check the connection and open the group again.</p>
          )}
          {state.status === 'ok' && state.plans.length === 0 && (
            <p className="small" data-testid="shared-plans-empty">No one has shared a plan for this topic yet.</p>
          )}
          {state.status === 'ok' && state.plans.length > 0 && (
            <ul className="cards" data-testid="shared-plans-list">
              {state.plans.map((p) => {
                const parsedShared = parsePlan(p.answer);
                return (
                  <li key={p.id} className="card">
                    <p className="row">
                      <span className="small">Asked {new Date(p.at).toLocaleDateString()}</span>
                      {p.mine && <span className="badge" data-testid="shared-mine">You shared this</span>}
                      <span className="badge warn-badge">No web sources</span>
                    </p>
                    <details>
                      <summary>The question that was asked</summary>
                      <p>{p.question}</p>
                    </details>
                    {parsedShared.activities.length > 0 ? (
                      <>
                        <ol>{parsedShared.activities.map((a, i) => <li key={i}>{a}</li>)}</ol>
                        {parsedShared.check && <p><strong>Check after two weeks:</strong> {parsedShared.check}</p>}
                        {parsedShared.home && <p><strong>At home:</strong> {parsedShared.home}</p>}
                      </>
                    ) : (
                      <pre>{p.answer}</pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Google's search suggestions, as the grounding terms require. Kept in a shadow root so its
 * styles can't leak into the page. `innerHTML` never runs the scripts in it.
 */
function SearchSuggestions({ html }: { html: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = html;
  }, [html]);
  return <div ref={host} data-testid="search-suggestions" />;
}
