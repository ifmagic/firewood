import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../i18n';

// NOTE: the history module is imported lazily inside tests; the first import
// in this file is the "migration" test, which seeds the legacy store first.

type HistoryModule = typeof import('./history');

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let mod: HistoryModule;

function mountWith(use: (m: HistoryModule) => void) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  function Harness() {
    if (mod) use(mod);
    return null;
  }
  act(() => {
    root!.render(<Harness />);
  });
}

function unmount() {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  unmount();
});

describe('numbox history stores', () => {
  it('migrates the combined v1 store into two isolated stores', async () => {
    localStorage.setItem(
      'tool:numbox:history',
      JSON.stringify([
        { id: 'a', at: 3, kind: 'calc', expr: '1+1', result: '2' },
        { id: 'b', at: 2, kind: 'ts-to-date', left: '1700000000', right: '2023-11-14 22:13:20', unit: 's' },
        { id: 'c', at: 1, kind: 'date-to-ts', left: '2023-11-14 22:13:20', right: '1700000000', unit: 'ms' },
      ]),
    );
    localStorage.removeItem('tool:numbox:history:migrated-v2');

    await import('./history'); // module-level migration runs on first load

    const calc = JSON.parse(localStorage.getItem('tool:numbox:calc-history') ?? '[]') as { kind: string }[];
    const ts = JSON.parse(localStorage.getItem('tool:numbox:ts-history') ?? '[]') as { kind: string }[];
    expect(calc).toHaveLength(1);
    expect(calc[0]?.kind).toBe('calc');
    expect(ts).toHaveLength(2);
    expect(ts.map((r) => r.kind).sort()).toEqual(['date-to-ts', 'ts-to-date']);
    expect(localStorage.getItem('tool:numbox:history:migrated-v2')).toBe('true');
  });

  it('caps calculator history at 100 and timestamp history at 20', async () => {
    mod = await import('./history');

    let api!: ReturnType<HistoryModule['useCalcHistory']>;
    mountWith((m) => {
      api = m.useCalcHistory();
    });
    for (let i = 0; i < 105; i++) {
      act(() => api.add({ kind: 'calc', expr: `${i}+1`, result: String(i + 1) }));
    }
    expect(api.records).toHaveLength(100);
    expect(api.records[0]?.expr).toBe('104+1'); // newest first
    unmount();

    let tsApi!: ReturnType<HistoryModule['useTsHistory']>;
    mountWith((m) => {
      tsApi = m.useTsHistory();
    });
    for (let i = 0; i < 25; i++) {
      act(() => tsApi.add({ kind: 'ts-to-date', left: String(i), right: 'r', unit: 's' }));
    }
    expect(tsApi.records).toHaveLength(20);
  });

  it('trims over-cap persisted timestamp history on load', async () => {
    mod = await import('./history');
    const over = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      at: 29 - i,
      kind: 'ts-to-date' as const,
      left: String(29 - i),
      right: 'r',
      unit: 's' as const,
    }));
    localStorage.setItem('tool:numbox:ts-history', JSON.stringify(over));

    let tsApi!: ReturnType<HistoryModule['useTsHistory']>;
    mountWith((m) => {
      tsApi = m.useTsHistory();
    });
    expect(tsApi.records).toHaveLength(20);
    expect(tsApi.records[0]?.left).toBe('29'); // newest first
  });

  it('keeps calculator and timestamp histories fully isolated', async () => {
    mod = await import('./history');

    let api!: ReturnType<HistoryModule['useCalcHistory']>;
    mountWith((m) => {
      api = m.useCalcHistory();
    });
    act(() => api.add({ kind: 'calc', expr: '2*2', result: '4' }));
    expect(api.records).toHaveLength(1);
    unmount();

    let tsApi!: ReturnType<HistoryModule['useTsHistory']>;
    mountWith((m) => {
      tsApi = m.useTsHistory();
    });
    expect(tsApi.records).toHaveLength(0); // nothing leaked from the calc store

    act(() => tsApi.add({ kind: 'ts-to-date', left: '1700000000', right: 'd', unit: 's' }));
    expect(tsApi.records).toHaveLength(1);

    const calc = JSON.parse(localStorage.getItem('tool:numbox:calc-history') ?? '[]');
    const ts = JSON.parse(localStorage.getItem('tool:numbox:ts-history') ?? '[]');
    expect(calc).toHaveLength(1);
    expect(calc[0]?.kind).toBe('calc');
    expect(ts).toHaveLength(1);
    expect(ts[0]?.kind).toBe('ts-to-date');
  });
});

describe('makeTsDeduper', () => {
  const rec = { kind: 'ts-to-date' as const, left: '1700000000', right: '2023-11-14 22:13:20', unit: 's' as const };

  it('dedupes only consecutive repeats', async () => {
    mod = await import('./history');
    const d = mod.makeTsDeduper();
    expect(d.shouldRecord(rec)).toBe(true);
    expect(d.shouldRecord(rec)).toBe(false); // consecutive repeat
    expect(d.shouldRecord({ ...rec, left: '1700000001' })).toBe(true);
    expect(d.shouldRecord(rec)).toBe(true); // old value after another pick records again
  });

  it('records the same value again after reset (history cleared)', async () => {
    mod = await import('./history');
    const d = mod.makeTsDeduper();
    expect(d.shouldRecord(rec)).toBe(true);
    d.reset();
    expect(d.shouldRecord(rec)).toBe(true);
  });
});
