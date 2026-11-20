import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPack } from '../core/curriculum';
import type { LedgerEntry } from '../core/ledger';
import type { Settings } from '../core/policy';
import type { RunContext } from '../core/runner';
import type { ClassData, Plan, Remark } from '../core/types';
import type { DeviceStatus } from '../engine/engine';
import { ClassScreen } from '../ui/ClassScreen';
import { LedgerScreen } from '../ui/LedgerScreen';
import { ReportsScreen } from '../ui/ReportsScreen';
import { SelfTestScreen } from '../ui/SelfTestScreen';
import { StatusBar } from '../ui/StatusBar';
import { EMPTY_SUPPORT, SupportScreen, type SupportMemory } from '../ui/SupportScreen';
import type { Boot } from './boot';

const TABS = [
  { id: 'class', label: 'Class' },
  { id: 'reports', label: 'Reports' },
  { id: 'support', label: 'Support' },
  { id: 'ledger', label: 'Privacy ledger' },
  { id: 'selftest', label: 'Self-test' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function tabFromHash(): TabId {
  const id = location.hash.replace('#/', '');
  return TABS.some((t) => t.id === id) ? (id as TabId) : 'class';
}

export function App({ boot }: { boot: Boot }) {
  const { engine, repo } = boot;
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [classData, setClassData] = useState<ClassData | null>(boot.data.classData);
  const [remarks, setRemarks] = useState<Record<string, Remark>>(boot.data.remarks);
  const [ledger, setLedger] = useState<LedgerEntry[]>(boot.data.ledger);
  const [plans, setPlans] = useState<Plan[]>(boot.data.plans);
  const [settings, setSettings] = useState<Settings>(boot.settings);
  const [device, setDevice] = useState<DeviceStatus>('unavailable');
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  // Held here, not in the Support screen, so leaving the tab keeps the phrase, the notes and the Route A offer.
  const [support, setSupport] = useState<SupportMemory>(EMPTY_SUPPORT);
  // A different class (or none) means different learners: drop the notes written for the old one.
  const classId = classData?.id ?? null;
  useEffect(() => setSupport(EMPTY_SUPPORT), [classId]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    addEventListener('hashchange', onHash);
    addEventListener('online', up);
    addEventListener('offline', down);
    return () => {
      removeEventListener('hashchange', onHash);
      removeEventListener('online', up);
      removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => boot.watchSettings(setSettings), [boot]);

  const refreshDevice = useCallback(() => {
    void engine.deviceStatus().then(setDevice);
  }, [engine]);
  useEffect(refreshDevice, [refreshDevice]);

  const saveClass = useCallback(
    (next: ClassData | null) => {
      setClassData(next);
      if (next) void repo.saveClass(next);
    },
    [repo],
  );

  const saveRemarks = useCallback(
    (update: (current: Record<string, Remark>) => Record<string, Remark>) => {
      setRemarks((current) => {
        const next = update(current);
        void repo.saveRemarks(next);
        return next;
      });
    },
    [repo],
  );

  const savePlans = useCallback(
    (update: (current: Plan[]) => Plan[]) => {
      setPlans((current) => {
        const next = update(current);
        void repo.savePlans(next);
        return next;
      });
    },
    [repo],
  );

  // The ledger is appended from long-running batches, so it is kept in a ref as well as in state.
  const ledgerRef = useRef(ledger);
  const record = useCallback(
    (entry: LedgerEntry) => {
      ledgerRef.current = [...ledgerRef.current, entry];
      setLedger(ledgerRef.current);
      return repo.saveLedger(ledgerRef.current);
    },
    [repo],
  );
  const clearLedger = useCallback(() => {
    ledgerRef.current = [];
    setLedger([]);
    void repo.saveLedger([]);
  }, [repo]);

  const wipe = useCallback(async () => {
    await repo.wipe();
    ledgerRef.current = [];
    setClassData(null);
    setRemarks({});
    setPlans([]);
    setLedger([]);
    setSupport(EMPTY_SUPPORT);
  }, [repo]);

  const ctx: RunContext | null = useMemo(() => {
    if (!classData) return null;
    return {
      engine,
      settings,
      guard: { learners: classData.learners, extraTerms: [classData.schoolName, classData.teacherName] },
      record,
    };
  }, [classData, engine, settings, record]);

  const pack = classData ? getPack(classData.packId) : null;

  return (
    <>
      <a className="skip" href="#main">Skip to the page</a>
      <header className="top">
        <h1>Staffroom</h1>
        <p className="lead">Anything about a child stays on this laptop. Only curriculum questions reach the cloud.</p>
        <nav aria-label="Sections">
          <ul>
            {TABS.map((t) => (
              <li key={t.id}>
                <a href={`#/${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <StatusBar
        engine={engine}
        simulatedReason={boot.simulatedReason}
        device={device}
        online={online}
        settings={settings}
        ledger={ledger}
        onPrepared={refreshDevice}
      />
      <main id="main" tabIndex={-1}>
        {tab === 'class' && <ClassScreen classData={classData} pack={pack} onChange={saveClass} onWipe={wipe} />}
        {tab === 'reports' && (
          <ReportsScreen classData={classData} pack={pack} ctx={ctx} remarks={remarks} saveRemarks={saveRemarks} />
        )}
        {tab === 'support' && (
          <SupportScreen
            classData={classData}
            pack={pack}
            ctx={ctx}
            settings={settings}
            online={online}
            device={device}
            library={boot.plans}
            plans={plans}
            savePlans={savePlans}
            memory={support}
            setMemory={setSupport}
          />
        )}
        {tab === 'ledger' && <LedgerScreen ledger={ledger} onClear={clearLedger} />}
        {tab === 'selftest' && <SelfTestScreen engine={engine} settings={settings} record={record} />}
      </main>
    </>
  );
}
