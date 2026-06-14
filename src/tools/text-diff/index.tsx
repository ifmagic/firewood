import { Button, Empty, Input, Space, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import * as Diff from 'diff';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import ToolLayout from '../../components/ToolLayout';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useResizablePanels } from '../../hooks/useResizablePanels';
import styles from './TextDiff.module.css';

const { TextArea } = Input;

const COLLAPSED_CONTEXT_LINES = 3;

type ReviewRowKind = 'context' | 'add' | 'remove';

interface InlineToken {
  value: string;
  kind: ReviewRowKind;
}

interface ReviewRow {
  id: string;
  kind: ReviewRowKind;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  marker: ' ' | '+' | '-';
  text: string;
  tokens?: InlineToken[];
}

interface ReviewHunkItem {
  kind: 'hunk';
  id: string;
  header: string;
  rows: ReviewRow[];
}

interface HiddenSectionItem {
  kind: 'hidden';
  id: string;
  header: string;
  count: number;
  rows: ReviewRow[];
}

type ReviewDiffItem = ReviewHunkItem | HiddenSectionItem;

interface ReviewDiffModel {
  items: ReviewDiffItem[];
  addedLines: number;
  removedLines: number;
  hasChanges: boolean;
  hiddenSectionIds: string[];
}

interface LineBlock {
  kind: ReviewRowKind;
  lines: string[];
}

const EMPTY_DIFF_MODEL: ReviewDiffModel = {
  items: [],
  addedLines: 0,
  removedLines: 0,
  hasChanges: false,
  hiddenSectionIds: [],
};

function splitDiffLines(value: string) {
  if (!value) {
    return [] as string[];
  }

  const lines = value.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function countLines(value: string) {
  const lines = splitDiffLines(value);
  return lines.length > 0 ? lines.length : 1;
}

function formatHunkHeader(oldStart: number, oldCount: number, newStart: number, newCount: number) {
  return `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;
}

function buildInlineTokens(beforeLine: string, afterLine: string, kind: 'remove' | 'add'): InlineToken[] {
  const tokens: InlineToken[] = [];

  for (const segment of Diff.diffWordsWithSpace(beforeLine, afterLine)) {
    if (segment.added) {
      if (kind === 'add') {
        tokens.push({ value: segment.value, kind: 'add' });
      }
      continue;
    }

    if (segment.removed) {
      if (kind === 'remove') {
        tokens.push({ value: segment.value, kind: 'remove' });
      }
      continue;
    }

    tokens.push({ value: segment.value, kind: 'context' });
  }

  return tokens.length > 0 ? tokens : [{ value: ' ', kind: 'context' }];
}

function buildLineBlocks(original: string, modified: string) {
  return Diff.diffLines(original, modified)
    .map<LineBlock | null>((part) => {
      const lines = splitDiffLines(part.value);
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

function buildReviewDiffModel(original: string, modified: string): ReviewDiffModel {
  const blocks = buildLineBlocks(original, modified);
  const firstChangeIndex = blocks.findIndex((block) => block.kind !== 'context');

  if (firstChangeIndex === -1) {
    return EMPTY_DIFF_MODEL;
  }

  let lastChangeIndex = firstChangeIndex;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index].kind !== 'context') {
      lastChangeIndex = index;
      break;
    }
  }

  const addedLines = blocks.reduce((sum, block) => sum + (block.kind === 'add' ? block.lines.length : 0), 0);
  const removedLines = blocks.reduce((sum, block) => sum + (block.kind === 'remove' ? block.lines.length : 0), 0);

  const items: ReviewDiffItem[] = [];
  const hiddenSectionIds: string[] = [];
  let rowId = 0;
  let hunkId = 0;
  let hiddenId = 0;
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let currentHunkRows: ReviewRow[] = [];
  let currentHunkOldStart = 1;
  let currentHunkNewStart = 1;

  const ensureHunk = () => {
    if (currentHunkRows.length === 0) {
      currentHunkOldStart = oldLineNumber;
      currentHunkNewStart = newLineNumber;
    }
  };

  const flushHunk = () => {
    if (currentHunkRows.length === 0) {
      return;
    }

    const oldCount = currentHunkRows.reduce(
      (sum, row) => sum + (row.oldLineNumber === null ? 0 : 1),
      0,
    );
    const newCount = currentHunkRows.reduce(
      (sum, row) => sum + (row.newLineNumber === null ? 0 : 1),
      0,
    );

    items.push({
      kind: 'hunk',
      id: `hunk-${hunkId}`,
      header: formatHunkHeader(currentHunkOldStart, oldCount, currentHunkNewStart, newCount),
      rows: currentHunkRows,
    });

    hunkId += 1;
    currentHunkRows = [];
  };

  const pushContextLine = (line: string) => {
    ensureHunk();
    currentHunkRows.push({
      id: `row-${rowId}`,
      kind: 'context',
      oldLineNumber,
      newLineNumber,
      marker: ' ',
      text: line,
    });
    rowId += 1;
    oldLineNumber += 1;
    newLineNumber += 1;
  };

  const pushRemovedLine = (line: string, tokens?: InlineToken[]) => {
    ensureHunk();
    currentHunkRows.push({
      id: `row-${rowId}`,
      kind: 'remove',
      oldLineNumber,
      newLineNumber: null,
      marker: '-',
      text: line,
      tokens,
    });
    rowId += 1;
    oldLineNumber += 1;
  };

  const pushAddedLine = (line: string, tokens?: InlineToken[]) => {
    ensureHunk();
    currentHunkRows.push({
      id: `row-${rowId}`,
      kind: 'add',
      oldLineNumber: null,
      newLineNumber,
      marker: '+',
      text: line,
      tokens,
    });
    rowId += 1;
    newLineNumber += 1;
  };

  const pushHiddenSection = (lines: string[]) => {
    if (lines.length === 0) {
      return;
    }

    const sectionId = `hidden-${hiddenId}`;
    const sectionOldStart = oldLineNumber;
    const sectionNewStart = newLineNumber;
    const rows = lines.map<ReviewRow>((line) => {
      const row: ReviewRow = {
        id: `row-${rowId}`,
        kind: 'context',
        oldLineNumber,
        newLineNumber,
        marker: ' ',
        text: line,
      };
      rowId += 1;
      oldLineNumber += 1;
      newLineNumber += 1;
      return row;
    });

    items.push({
      kind: 'hidden',
      id: sectionId,
      header: formatHunkHeader(sectionOldStart, rows.length, sectionNewStart, rows.length),
      count: rows.length,
      rows,
    });

    hiddenSectionIds.push(sectionId);
    hiddenId += 1;
  };

  const pushContextLines = (lines: string[]) => {
    lines.forEach(pushContextLine);
  };

  const pushModifiedBlock = (removed: string[], added: string[]) => {
    const pairCount = Math.max(removed.length, added.length);

    for (let index = 0; index < pairCount; index += 1) {
      const removedLine = removed[index];
      const addedLine = added[index];

      if (removedLine !== undefined && addedLine !== undefined) {
        pushRemovedLine(removedLine, buildInlineTokens(removedLine, addedLine, 'remove'));
        pushAddedLine(addedLine, buildInlineTokens(removedLine, addedLine, 'add'));
        continue;
      }

      if (removedLine !== undefined) {
        pushRemovedLine(removedLine);
        continue;
      }

      if (addedLine !== undefined) {
        pushAddedLine(addedLine);
      }
    }
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (block.kind === 'context') {
      const isLeadingContext = index < firstChangeIndex;
      const isTrailingContext = index > lastChangeIndex;
      const lineCount = block.lines.length;

      if (isLeadingContext) {
        if (lineCount <= COLLAPSED_CONTEXT_LINES) {
          pushContextLines(block.lines);
        } else {
          pushHiddenSection(block.lines.slice(0, -COLLAPSED_CONTEXT_LINES));
          pushContextLines(block.lines.slice(-COLLAPSED_CONTEXT_LINES));
        }
        continue;
      }

      if (isTrailingContext) {
        if (lineCount <= COLLAPSED_CONTEXT_LINES) {
          pushContextLines(block.lines);
        } else {
          pushContextLines(block.lines.slice(0, COLLAPSED_CONTEXT_LINES));
          flushHunk();
          pushHiddenSection(block.lines.slice(COLLAPSED_CONTEXT_LINES));
        }
        continue;
      }

      if (lineCount <= COLLAPSED_CONTEXT_LINES * 2) {
        pushContextLines(block.lines);
        continue;
      }

      pushContextLines(block.lines.slice(0, COLLAPSED_CONTEXT_LINES));
      flushHunk();
      pushHiddenSection(block.lines.slice(COLLAPSED_CONTEXT_LINES, -COLLAPSED_CONTEXT_LINES));
      pushContextLines(block.lines.slice(-COLLAPSED_CONTEXT_LINES));
      continue;
    }

    if (block.kind === 'remove' && blocks[index + 1]?.kind === 'add') {
      pushModifiedBlock(block.lines, blocks[index + 1].lines);
      index += 1;
      continue;
    }

    if (block.kind === 'remove') {
      block.lines.forEach((line) => pushRemovedLine(line));
      continue;
    }

    block.lines.forEach((line) => pushAddedLine(line));
  }

  flushHunk();

  return {
    items,
    addedLines,
    removedLines,
    hasChanges: true,
    hiddenSectionIds,
  };
}

export default function TextDiff() {
  const { t } = useTranslation();
  const [original, setOriginal] = usePersistentState('tool:text-diff:left', '');
  const [modified, setModified] = usePersistentState('tool:text-diff:right', '');
  const [compared, setCompared] = usePersistentState('tool:text-diff:compared', false);
  const [expandedHiddenSections, setExpandedHiddenSections] = useState<string[]>([]);
  const { fontSize, increase, decrease } = useEditorFontSize();
  const { leftPercent, containerRef, onDividerMouseDown } = useResizablePanels();

  const diffModel = useMemo(
    () => (compared ? buildReviewDiffModel(original, modified) : EMPTY_DIFF_MODEL),
    [compared, modified, original],
  );

  const hiddenSectionIds = diffModel.hiddenSectionIds;
  const hasHiddenSections = hiddenSectionIds.length > 0;
  const allHiddenExpanded = hasHiddenSections && hiddenSectionIds.every((id) => expandedHiddenSections.includes(id));

  const compare = () => {
    setCompared(true);
    setExpandedHiddenSections([]);
  };

  const restore = () => {
    setCompared(false);
    setExpandedHiddenSections([]);
  };

  const clear = () => {
    setOriginal('');
    setModified('');
    setCompared(false);
    setExpandedHiddenSections([]);
  };

  const toggleHiddenSection = (sectionId: string) => {
    setExpandedHiddenSections((currentSections) => (
      currentSections.includes(sectionId)
        ? currentSections.filter((item) => item !== sectionId)
        : [...currentSections, sectionId]
    ));
  };

  const expandAllHiddenSections = () => {
    setExpandedHiddenSections(hiddenSectionIds);
  };

  const collapseAllHiddenSections = () => {
    setExpandedHiddenSections([]);
  };

  const renderLineContent = (row: ReviewRow) => {
    if (!row.tokens || row.tokens.length === 0) {
      return row.text || ' ';
    }

    return row.tokens.map((token, index) => {
      let className = '';

      if (token.kind === 'add') {
        className = styles.inlineAdded;
      } else if (token.kind === 'remove') {
        className = styles.inlineRemoved;
      }

      return (
        <span
          key={`${row.id}-token-${index}`}
          className={className}
        >
          {token.value || ' '}
        </span>
      );
    });
  };

  const renderRow = (row: ReviewRow) => {
    const rowClassName = row.kind === 'add'
      ? styles.addedRow
      : row.kind === 'remove'
        ? styles.removedRow
        : styles.contextRow;

    return (
      <div key={row.id} className={`${styles.diffRow} ${rowClassName}`}>
        <span className={styles.lineNumber}>{row.oldLineNumber ?? ''}</span>
        <span className={styles.lineNumber}>{row.newLineNumber ?? ''}</span>
        <span className={styles.lineMarker}>{row.marker}</span>
        <span className={styles.lineContent}>{renderLineContent(row)}</span>
      </div>
    );
  };

  const renderHunk = (
    item: ReviewHunkItem | HiddenSectionItem,
    collapseLabel?: string,
    onCollapse?: () => void,
  ) => (
    <section key={item.id} className={styles.hunk}>
      <div className={styles.hunkHeader}>
        <span className={styles.hunkHeaderLabel}>{item.header}</span>
        {onCollapse && collapseLabel && (
          <button
            type="button"
            className={styles.hunkHeaderButton}
            onClick={onCollapse}
          >
            {collapseLabel}
          </button>
        )}
      </div>
      <div>{item.rows.map(renderRow)}</div>
    </section>
  );

  const renderCollapsedSection = (item: HiddenSectionItem) => (
    <div key={item.id} className={styles.collapsedSection}>
      <div className={styles.collapsedMeta}>
        <span className={styles.collapsedHeader}>{item.header}</span>
        <span>{t('textDiff.hiddenLines', { count: item.count })}</span>
      </div>
      <button
        type="button"
        className={styles.collapsedButton}
        onClick={() => {
          toggleHiddenSection(item.id);
        }}
      >
        {t('textDiff.foldLines', { count: item.count })}
      </button>
    </div>
  );

  const statusText = `${t('label.original')} ${countLines(original)} · ${t('label.modified')} ${countLines(modified)}`;

  return (
    <ToolLayout title={t('textDiff.title')}>
      <div className="fw-tool-stack">
        <div className="fw-tool-toolbar">
          <div className="fw-tool-toolbarMain">
            <Button type="primary" onClick={compare}>{t('action.compare')}</Button>
            <Button onClick={restore} disabled={!compared}>{t('action.restoreEdit')}</Button>
            {compared && hasHiddenSections && (
              <>
                <Button onClick={expandAllHiddenSections} disabled={allHiddenExpanded}>
                  {t('textDiff.expandAllUnchanged')}
                </Button>
                <Button onClick={collapseAllHiddenSections} disabled={expandedHiddenSections.length === 0}>
                  {t('textDiff.collapseAllUnchanged')}
                </Button>
              </>
            )}
          </div>
          <Space size={8}>
            {compared && diffModel.hasChanges && (
              <>
                <Tag color="green">+{diffModel.addedLines} {t('textDiff.added')}</Tag>
                <Tag color="red">-{diffModel.removedLines} {t('textDiff.deleted')}</Tag>
              </>
            )}
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              className="fw-tool-iconDangerButton"
              title={t('action.clear')}
              aria-label={t('action.clear')}
              onClick={clear}
            />
          </Space>
        </div>

        <div className="fw-tool-editorShell">
          <div ref={containerRef} className="fw-tool-split">
            {!compared ? (
              <>
                <div className="fw-tool-pane" style={{ width: `${leftPercent}%` }}>
                  <div className="fw-tool-paneLabel">{t('label.original')}</div>
                  <div className="fw-tool-paneBody">
                    <TextArea
                      value={original}
                      onChange={(event) => setOriginal(event.target.value)}
                      placeholder={t('textDiff.enterOriginal')}
                      className="fw-tool-mono fw-tool-textarea"
                      name="text-diff-original"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        resize: 'none',
                        fontSize,
                      }}
                    />
                  </div>
                </div>
                <div className="fw-tool-divider" onMouseDown={onDividerMouseDown}>
                  <div className="fw-tool-dividerGrip" />
                </div>
                <div className="fw-tool-pane" style={{ flex: 1 }}>
                  <div className="fw-tool-paneLabel">{t('label.modified')}</div>
                  <div className="fw-tool-paneBody">
                    <TextArea
                      value={modified}
                      onChange={(event) => setModified(event.target.value)}
                      placeholder={t('textDiff.enterModified')}
                      className="fw-tool-mono fw-tool-textarea"
                      name="text-diff-modified"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        resize: 'none',
                        fontSize,
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.reviewPane}>
                <div className={styles.reviewSurface} style={{ fontSize }}>
                  {diffModel.hasChanges ? (
                    diffModel.items.map((item) => {
                      if (item.kind === 'hunk') {
                        return renderHunk(item);
                      }

                      if (expandedHiddenSections.includes(item.id)) {
                        return renderHunk(
                          item,
                          t('textDiff.unfoldLines', { count: item.count }),
                          () => {
                            toggleHiddenSection(item.id);
                          },
                        );
                      }

                      return renderCollapsedSection(item);
                    })
                  ) : (
                    <div className={styles.emptyState}>
                      <Empty
                        description={t('textDiff.noDifferences')}
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <StatusBar
            left={<span className="fw-tool-statusHint">{statusText}</span>}
            right={<FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />}
          />
        </div>
      </div>
    </ToolLayout>
  );
}
