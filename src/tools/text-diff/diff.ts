import * as Diff from 'diff';

const CONTEXT = 3;

export type RowKind = 'context' | 'add' | 'remove';

export interface Token {
  value: string;
  kind: RowKind;
}

export interface Row {
  id: string;
  kind: RowKind;
  oldNo: number | null;
  newNo: number | null;
  marker: ' ' | '+' | '-';
  text: string;
  tokens?: Token[];
}

export interface Hunk {
  kind: 'hunk';
  id: string;
  header: string;
  rows: Row[];
}

export interface Fold {
  kind: 'fold';
  id: string;
  header: string;
  count: number;
  rows: Row[];
}

export type Block = Hunk | Fold;

export interface Model {
  items: Block[];
  added: number;
  removed: number;
  hasChanges: boolean;
  foldIds: string[];
}

export const EMPTY_MODEL: Model = {
  items: [],
  added: 0,
  removed: 0,
  hasChanges: false,
  foldIds: [],
};

export function splitLines(value: string): string[] {
  if (!value) {
    return [];
  }

  const lines = value.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function countLines(value: string): number {
  const lines = splitLines(value);
  return lines.length > 0 ? lines.length : 1;
}

function hunkHeader(oldStart: number, oldCount: number, newStart: number, newCount: number): string {
  return `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;
}

function inlineTokens(before: string, after: string, kind: 'remove' | 'add'): Token[] {
  const tokens: Token[] = [];

  for (const seg of Diff.diffWordsWithSpace(before, after)) {
    if (seg.added) {
      if (kind === 'add') {
        tokens.push({ value: seg.value, kind: 'add' });
      }
      continue;
    }

    if (seg.removed) {
      if (kind === 'remove') {
        tokens.push({ value: seg.value, kind: 'remove' });
      }
      continue;
    }

    tokens.push({ value: seg.value, kind: 'context' });
  }

  return tokens.length > 0 ? tokens : [{ value: ' ', kind: 'context' }];
}

interface LineBlock {
  kind: RowKind;
  lines: string[];
}

function lineBlocks(original: string, modified: string): LineBlock[] {
  return Diff.diffLines(original, modified)
    .map<LineBlock | null>((part) => {
      const lines = splitLines(part.value);
      if (lines.length === 0) {
        return null;
      }

      return {
        kind: part.added ? 'add' : part.removed ? 'remove' : 'context',
        lines,
      };
    })
    .filter((block): block is LineBlock => block !== null);
}

export function buildModel(original: string, modified: string): Model {
  const blocks = lineBlocks(original, modified);
  const firstChange = blocks.findIndex((block) => block.kind !== 'context');

  if (firstChange === -1) {
    return EMPTY_MODEL;
  }

  let lastChange = firstChange;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    if (blocks[i].kind !== 'context') {
      lastChange = i;
      break;
    }
  }

  const added = blocks.reduce((sum, b) => sum + (b.kind === 'add' ? b.lines.length : 0), 0);
  const removed = blocks.reduce((sum, b) => sum + (b.kind === 'remove' ? b.lines.length : 0), 0);

  const items: Block[] = [];
  const foldIds: string[] = [];
  let rowId = 0;
  let hunkId = 0;
  let foldId = 0;
  let oldNo = 1;
  let newNo = 1;
  let rows: Row[] = [];
  let hunkOldStart = 1;
  let hunkNewStart = 1;

  const ensure = () => {
    if (rows.length === 0) {
      hunkOldStart = oldNo;
      hunkNewStart = newNo;
    }
  };

  const flush = () => {
    if (rows.length === 0) {
      return;
    }

    const oldCount = rows.reduce((sum, r) => sum + (r.oldNo === null ? 0 : 1), 0);
    const newCount = rows.reduce((sum, r) => sum + (r.newNo === null ? 0 : 1), 0);

    items.push({
      kind: 'hunk',
      id: `hunk-${hunkId}`,
      header: hunkHeader(hunkOldStart, oldCount, hunkNewStart, newCount),
      rows,
    });

    hunkId += 1;
    rows = [];
  };

  const ctx = (line: string) => {
    ensure();
    rows.push({ id: `row-${rowId}`, kind: 'context', oldNo, newNo, marker: ' ', text: line });
    rowId += 1;
    oldNo += 1;
    newNo += 1;
  };

  const del = (line: string, tokens?: Token[]) => {
    ensure();
    rows.push({ id: `row-${rowId}`, kind: 'remove', oldNo, newNo: null, marker: '-', text: line, tokens });
    rowId += 1;
    oldNo += 1;
  };

  const add = (line: string, tokens?: Token[]) => {
    ensure();
    rows.push({ id: `row-${rowId}`, kind: 'add', oldNo: null, newNo, marker: '+', text: line, tokens });
    rowId += 1;
    newNo += 1;
  };

  const fold = (lines: string[]) => {
    if (lines.length === 0) {
      return;
    }

    const id = `fold-${foldId}`;
    const oldStart = oldNo;
    const newStart = newNo;
    const foldRows = lines.map<Row>((line) => {
      const row: Row = { id: `row-${rowId}`, kind: 'context', oldNo, newNo, marker: ' ', text: line };
      rowId += 1;
      oldNo += 1;
      newNo += 1;
      return row;
    });

    items.push({
      kind: 'fold',
      id,
      header: hunkHeader(oldStart, foldRows.length, newStart, foldRows.length),
      count: foldRows.length,
      rows: foldRows,
    });

    foldIds.push(id);
    foldId += 1;
  };

  const ctxLines = (lines: string[]) => {
    lines.forEach(ctx);
  };

  const pair = (removed: string[], added: string[]) => {
    const pairs = Math.max(removed.length, added.length);

    for (let i = 0; i < pairs; i += 1) {
      const rm = removed[i];
      const ad = added[i];

      if (rm !== undefined && ad !== undefined) {
        del(rm, inlineTokens(rm, ad, 'remove'));
        add(ad, inlineTokens(rm, ad, 'add'));
        continue;
      }

      if (rm !== undefined) {
        del(rm);
        continue;
      }

      if (ad !== undefined) {
        add(ad);
      }
    }
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];

    if (b.kind === 'context') {
      const leading = i < firstChange;
      const trailing = i > lastChange;
      const n = b.lines.length;

      if (leading) {
        if (n <= CONTEXT) {
          ctxLines(b.lines);
        } else {
          fold(b.lines.slice(0, -CONTEXT));
          ctxLines(b.lines.slice(-CONTEXT));
        }
        continue;
      }

      if (trailing) {
        if (n <= CONTEXT) {
          ctxLines(b.lines);
        } else {
          ctxLines(b.lines.slice(0, CONTEXT));
          flush();
          fold(b.lines.slice(CONTEXT));
        }
        continue;
      }

      if (n <= CONTEXT * 2) {
        ctxLines(b.lines);
        continue;
      }

      ctxLines(b.lines.slice(0, CONTEXT));
      flush();
      fold(b.lines.slice(CONTEXT, -CONTEXT));
      ctxLines(b.lines.slice(-CONTEXT));
      continue;
    }

    if (b.kind === 'remove' && blocks[i + 1]?.kind === 'add') {
      pair(b.lines, blocks[i + 1].lines);
      i += 1;
      continue;
    }

    if (b.kind === 'remove') {
      b.lines.forEach((line) => del(line));
      continue;
    }

    b.lines.forEach((line) => add(line));
  }

  flush();

  return { items, added, removed, hasChanges: true, foldIds };
}
