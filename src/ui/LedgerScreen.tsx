import { ranText, stoppedNoModel, summarise, timedOutInCloud, type LedgerEntry, type LedgerMode } from '../core/ledger';
import { TASKS } from '../core/policy';

const MODE_TEXT: Record<LedgerMode, string> = {
  only_on_device: 'Device only',
  prefer_on_device: 'Device first',
  prefer_in_cloud: 'Cloud first',
  only_in_cloud: 'Cloud only',
  disabled: 'Switched off',
  library: 'Shared plan library',
};

const OUTCOME_TEXT = { ok: 'Done', blocked: 'Blocked by the name check', disabled: 'Switched off', error: 'Failed' } as const;

/** The Result cell. A stop for a missing on-device model is the rule working, so it isn't shown as a failure. */
function resultText(e: LedgerEntry): string {
  if (stoppedNoModel(e)) return 'Stopped: this browser has no on-device model. Nothing was sent.';
  if (timedOutInCloud(e)) return 'Failed: the cloud did not answer within 30 seconds.';
  return `${OUTCOME_TEXT[e.outcome]}${e.note ? `: ${e.note}` : ''}`;
}

export function LedgerScreen({ ledger, onClear }: { ledger: LedgerEntry[]; onClear: () => void }) {
  const s = summarise(ledger);
  const newestFirst = [...ledger].reverse().slice(0, 300);
  return (
    <section>
      <h2>Privacy ledger</h2>
      <p>Every request Staffroom has made, and where it ran. This list is stored on this laptop and nowhere else.</p>
      <dl className="tiles">
        <div className={s.learnerTasksInCloud === 0 ? 'tile good' : 'tile bad'}>
          <dt>Learner tasks sent to the cloud</dt>
          <dd data-testid="tile-learner-cloud">{s.learnerTasksInCloud}</dd>
        </div>
        <div className="tile"><dt>Ran on this laptop</dt><dd data-testid="tile-on-device">{s.onDevice}</dd></div>
        <div className="tile"><dt>Ran in the cloud</dt><dd data-testid="tile-in-cloud">{s.inCloud}</dd></div>
        <div className="tile"><dt>Sent to the cloud, not answered</dt><dd data-testid="tile-refused">{s.refusedInCloud}</dd></div>
        <div className="tile"><dt>Characters sent</dt><dd data-testid="tile-chars">{s.charsSent}</dd></div>
        <div className="tile"><dt>Blocked by the name check</dt><dd>{s.blocked}</dd></div>
        <div className="tile"><dt>Stopped, no on-device model</dt><dd data-testid="tile-no-model">{s.noDeviceModel}</dd></div>
        <div className="tile"><dt>Failed</dt><dd data-testid="tile-errors">{s.errors}</dd></div>
      </dl>

      {ledger.length === 0 ? (
        <p>Nothing has run yet.</p>
      ) : (
        <div className="scroll">
          <table>
            <caption>Newest first{ledger.length > 300 ? ' (latest 300 shown)' : ''}</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Task</th>
                <th scope="col">Allowed to run</th>
                <th scope="col">Ran</th>
                <th scope="col">Result</th>
                <th scope="col">Sent</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleTimeString()}</td>
                  <th scope="row">{e.task === 'share' ? 'Share a plan with other teachers' : TASKS[e.task].label}</th>
                  <td>{MODE_TEXT[e.mode]}</td>
                  <td>{ranText(e)}</td>
                  <td>{resultText(e)}</td>
                  <td>
                    {e.sentText ? (
                      <details>
                        <summary>{e.sentChars} characters</summary>
                        <pre>{e.sentText}</pre>
                      </details>
                    ) : (
                      'Nothing'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="row">
        <button type="button" onClick={onClear} disabled={ledger.length === 0}>Clear the ledger</button>
      </p>
    </section>
  );
}
