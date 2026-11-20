import type { LedgerEntry } from '../core/ledger';
import { CloudIcon, LaptopIcon } from './icons';

export type Where = 'laptop' | 'cloud' | '';

/** Teal for a request that stayed on this laptop, orange for anything that left it, plain if nothing ran. */
export function whereOf(e: LedgerEntry | null | undefined): Where {
  if (!e) return '';
  if (e.source === 'on_device' && e.sentChars === 0) return 'laptop';
  return e.source === 'in_cloud' || e.sentChars > 0 ? 'cloud' : '';
}

/** Where a request ran, in the ledger's words, coloured and marked like everywhere else. */
export function Ran({ where, text }: { where: Where; text: string }) {
  return (
    <span className={`ran ${where}`}>
      {where === 'laptop' && <LaptopIcon />}
      {where === 'cloud' && <CloudIcon />}
      {text}
    </span>
  );
}
