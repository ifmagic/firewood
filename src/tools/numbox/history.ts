import { useCallback, useMemo } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';

export type TsUnit = 's' | 'ms';

export interface CalcRecord {
  id: string;
  at: number;
  kind: 'calc';
  expr: string;
  result: string;
}

export interface TsRecord {
  id: string;
  at: number;
  kind: 'ts-to-date' | 'date-to-ts';
  left: string;
  right: string;
  unit: TsUnit;
}

export type NumboxHistoryRecord = CalcRecord | TsRecord;

export type NewCalcRecord = Omit<CalcRecord, 'id' | 'at'>;
export type NewTsRecord = Omit<TsRecord, 'id' | 'at'>;

export const MAX_CALC_HISTORY = 100;
export const MAX_TS_HISTORY = 50;

const CALC_KEY = 'tool:numbox:calc-history';
const TS_KEY = 'tool:numbox:ts-history';
const LEGACY_COMBINED_KEY = 'tool:numbox:history';
const LEGACY_CALC_KEY = 'tool:calculator:history';
const LEGACY_TS_KEY = 'tool:timestamp:history';
const LEGACY_MIGRATED_KEY = 'tool:numbox:migrated';
const MIGRATION_KEY = 'tool:numbox:history:migrated-v2';

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

interface LegacyCalc {
  id: string;
  expr: string;
  result: string;
  calculatedAt: number;
}

interface LegacyTs {
  id: string;
  type: 'ts-to-date' | 'date-to-ts';
  timestamp: string;
  date: string;
  unit: 'milliseconds' | 'seconds';
  convertedAt: number;
}

function readLegacyCalc(): CalcRecord[] {
  const raw = readJSON<LegacyCalc[]>(LEGACY_CALC_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => typeof r?.expr === 'string')
    .map((r) => ({
      id: r.id || crypto.randomUUID(),
      kind: 'calc' as const,
      at: r.calculatedAt || Date.now(),
      expr: r.expr,
      result: String(r.result ?? ''),
    }));
}

function readLegacyTs(): TsRecord[] {
  const raw = readJSON<LegacyTs[]>(LEGACY_TS_KEY);
  if (!Array.isArray(raw)) return [];
  const out: TsRecord[] = [];
  for (const r of raw) {
    const isTsToDate = r.type === 'ts-to-date';
    out.push({
      id: r.id || crypto.randomUUID(),
      kind: r.type,
      at: r.convertedAt || Date.now(),
      left: isTsToDate ? r.timestamp : r.date,
      right: isTsToDate ? r.date : r.timestamp,
      unit: r.unit === 'seconds' ? 's' : 'ms',
    });
  }
  return out;
}

/** Split the v1 combined store (and, if the app never ran v1, the pre-numbox stores)
 *  into the two isolated calc / timestamp history stores. Runs once at module load. */
function migrateOnce(): { calc: CalcRecord[]; ts: TsRecord[] } {
  const combined = readJSON<NumboxHistoryRecord[]>(LEGACY_COMBINED_KEY);
  const calc: CalcRecord[] = [];
  const ts: TsRecord[] = [];

  if (Array.isArray(combined)) {
    for (const rec of combined) {
      if (rec?.kind === 'calc') calc.push(rec);
      else if (rec && (rec.kind === 'ts-to-date' || rec.kind === 'date-to-ts')) ts.push(rec);
    }
  }

  // Only the oldest pre-numbox stores if v1 never migrated them (avoids duplicates).
  if (calc.length === 0 && ts.length === 0 && !readJSON<boolean>(LEGACY_MIGRATED_KEY)) {
    calc.push(...readLegacyCalc());
    ts.push(...readLegacyTs());
  }

  calc.sort((a, b) => b.at - a.at);
  ts.sort((a, b) => b.at - a.at);
  return { calc: calc.slice(0, MAX_CALC_HISTORY), ts: ts.slice(0, MAX_TS_HISTORY) };
}

// Module-level one-time migration, before any hook reads the stores.
if (typeof localStorage !== 'undefined' && !readJSON<boolean>(MIGRATION_KEY)) {
  writeJSON(MIGRATION_KEY, true);
  const { calc, ts } = migrateOnce();
  writeJSON(CALC_KEY, calc);
  writeJSON(TS_KEY, ts);
}

function useSplitHistory() {
  const [calcRecords, setCalcRecords] = usePersistentState<CalcRecord[]>(CALC_KEY, []);
  const [tsRecords, setTsRecords] = usePersistentState<TsRecord[]>(TS_KEY, []);

  const addCalc = useCallback(
    (rec: NewCalcRecord) => {
      const full: CalcRecord = { ...rec, id: crypto.randomUUID(), at: Date.now() };
      setCalcRecords((prev) => [full, ...prev].slice(0, MAX_CALC_HISTORY));
    },
    [setCalcRecords],
  );

  const clearCalc = useCallback(() => setCalcRecords([]), [setCalcRecords]);

  const addTs = useCallback(
    (rec: NewTsRecord) => {
      const full: TsRecord = { ...rec, id: crypto.randomUUID(), at: Date.now() };
      setTsRecords((prev) => [full, ...prev].slice(0, MAX_TS_HISTORY));
    },
    [setTsRecords],
  );

  const clearTs = useCallback(() => setTsRecords([]), [setTsRecords]);

  return { calcRecords, tsRecords, addCalc, clearCalc, addTs, clearTs };
}

export function useCalcHistory() {
  const { calcRecords, addCalc, clearCalc } = useSplitHistory();
  return useMemo(() => ({ records: calcRecords, add: addCalc, clear: clearCalc }), [calcRecords, addCalc, clearCalc]);
}

export function useTsHistory() {
  const { tsRecords, addTs, clearTs } = useSplitHistory();
  return useMemo(() => ({ records: tsRecords, add: addTs, clear: clearTs }), [tsRecords, addTs, clearTs]);
}

export interface RecordTag {
  color: string;
  label: string;
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

export function recordTag(rec: NumboxHistoryRecord, t: TFunc): RecordTag {
  switch (rec.kind) {
    case 'calc':
      return { color: 'blue', label: t('numbox.tagCalc') };
    case 'ts-to-date':
      return { color: 'geekblue', label: t('numbox.tagTsToDate') };
    case 'date-to-ts':
      return { color: 'green', label: t('numbox.tagDateToTs') };
  }
}

export function formatRecordForCopy(rec: NumboxHistoryRecord, t: TFunc): string {
  if (rec.kind === 'calc') {
    return [`${t('numbox.formatCopyExpr')}: ${rec.expr}`, `${t('numbox.formatCopyResult')}: ${rec.result}`].join('\n');
  }
  const isTsToDate = rec.kind === 'ts-to-date';
  const typeLabel = isTsToDate ? t('numbox.formatCopyTsToDate') : t('numbox.formatCopyDateToTs');
  const tsLabel = `${t('numbox.formatCopyTs')} (${rec.unit})`;
  const dateLabel = t('numbox.formatCopyDate');
  const ts = isTsToDate ? rec.left : rec.right;
  const date = isTsToDate ? rec.right : rec.left;
  return [typeLabel, `${tsLabel}: ${ts}`, `${dateLabel}: ${date}`].join('\n');
}
