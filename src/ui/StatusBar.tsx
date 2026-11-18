import { useState } from 'react';
import { summarise, type LedgerEntry } from '../core/ledger';
import type { Settings } from '../core/policy';
import type { DeviceStatus, Engine } from '../engine/engine';

const DEVICE_TEXT: Record<DeviceStatus, string> = {
  available: 'ready',
  downloadable: 'needs a one-time download',
  downloading: 'downloading',
  unavailable: 'not available in this browser',
};

interface Props {
  engine: Engine;
  simulatedReason: string | null;
  device: DeviceStatus;
  online: boolean;
  settings: Settings;
  ledger: LedgerEntry[];
  onPrepared: () => void;
}

export function StatusBar({ engine, simulatedReason, device, online, settings, ledger, onPrepared }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const s = summarise(ledger);

  const download = async () => {
    setError('');
    setProgress(0);
    try {
      await engine.prepareDevice(setProgress);
    } catch {
      setError('The download did not finish. Check the connection and try again.');
    }
    setProgress(null);
    onPrepared();
  };

  return (
    <section className="status" aria-label="Where work runs">
      {simulatedReason && (
        <p className="warn" role="status">
          <strong>Simulated.</strong> {simulatedReason} No model is running.
        </p>
      )}
      <dl>
        <div>
          <dt>On-device model</dt>
          <dd data-testid="device-status">{DEVICE_TEXT[device]}</dd>
        </div>
        <div>
          <dt>Connection</dt>
          <dd>{online ? 'online' : 'offline'}</dd>
        </div>
        <div>
          <dt>School policy</dt>
          <dd>{settings.policy === 'strict' ? 'nothing leaves this laptop' : 'curriculum questions may use the cloud'}</dd>
        </div>
        <div>
          <dt>Learner tasks sent to the cloud</dt>
          <dd data-testid="learner-cloud">{s.learnerTasksInCloud}</dd>
        </div>
      </dl>
      {device === 'downloadable' && progress === null && (
        <button type="button" onClick={download}>Download the on-device model</button>
      )}
      {progress !== null && (
        <p role="status">
          Downloading the on-device model: {Math.round(progress * 100)}%
          <progress max={1} value={progress} aria-label="Model download" />
        </p>
      )}
      {error && <p className="bad" role="alert">{error}</p>}
    </section>
  );
}
