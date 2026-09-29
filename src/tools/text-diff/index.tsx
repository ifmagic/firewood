import { Button, Empty, Space, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ViewUpdate } from '@codemirror/view';
import EditorContextMenu from '../../components/EditorContextMenu';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import ToolLayout from '../../components/ToolLayout';
import { useCodemirror } from '../../hooks/useCodemirror';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useResizablePanels } from '../../hooks/useResizablePanels';
import { detectLanguage } from '../../utils/detectLanguage';
import { formatJsonText, unescapeJsonText } from '../../utils/jsonText';
import { type Block, type Fold, type Hunk, type Row, buildModel, countLines, EMPTY_MODEL } from './diff';
import styles from './TextDiff.module.css';

interface DiffPaneProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  fontSize: number;
}

/**
 * One edit pane: a header (label + JSON transforms) over a CodeMirror instance. Text editing
 * goes through useCodemirror everywhere (AGENTS convention) — the antd TextArea this tool
 * started with had no highlighting, no column selection and a different IME path, and the
 * panes are exactly where JSON gets pasted. `onChange` lifts the document into the persisted
 * parent value the diff model is built from.
 */
function DiffPane({ label, value, onChange, placeholder, fontSize }: DiffPaneProps) {
  const { t } = useTranslation();
  const [hasSelection, setHasSelection] = useState(false);
  // Same sniffing as notepad: JSON/HTML/JS get highlighting, prose stays plaintext.
  const language = useMemo(() => detectLanguage(value), [value]);
  const handleUpdate = useCallback((update: ViewUpdate) => {
    const next = update.state.selection.ranges.some((range) => !range.empty);
    setHasSelection((prev) => (prev === next ? prev : next));
  }, []);
  const { hostRef, viewRef } = useCodemirror({
    value,
    onChange,
    variant: 'code',
    language,
    fontSize,
    placeholder,
    onUpdate: handleUpdate,
  });

  // Failures stay silent, matching json-formatter's toolbar actions: unescapeJsonText
  // throws for text that is not an escaped JSON string, and the pane is simply left as is.
  const applyTransform = (transform: (text: string) => string) => {
    const view = viewRef.current;
    if (!view) return;

    const text = view.state.doc.toString();
    let next: string;
    try {
      next = transform(text);
    } catch {
      return;
    }

    if (next !== text) {
      view.dispatch({ changes: { from: 0, to: text.length, insert: next } });
    }
  };

  const empty = !value.trim();

  return (
    <>
      <div className={styles.paneHead}>
        <span className={styles.paneTitle}>{label}</span>
        <div className={styles.paneActions}>
          <Button size="small" type="text" disabled={empty} onClick={() => applyTransform(formatJsonText)}>
            {t('textDiff.formatJson')}
          </Button>
          <Button size="small" type="text" disabled={empty} onClick={() => applyTransform(unescapeJsonText)}>
            {t('action.unescape')}
          </Button>
        </div>
      </div>
      <div className="fw-tool-paneBody">
        <EditorContextMenu viewRef={viewRef} hasSelection={hasSelection}>
          <div ref={hostRef} className={`fw-cm-host ${styles.cmHost}`} />
        </EditorContextMenu>
      </div>
    </>
  );
}

function renderTokens(row: Row) {
  if (!row.tokens || row.tokens.length === 0) {
    return row.text || ' ';
  }

  return row.tokens.map((token, i) => {
    let className = '';

    if (token.kind === 'add') {
      className = styles.inlineAdd;
    } else if (token.kind === 'remove') {
      className = styles.inlineDel;
    }

    return (
      <span key={`${row.id}-tok-${i}`} className={className}>
        {token.value || ' '}
      </span>
    );
  });
}

function renderRow(row: Row) {
  const cls = row.kind === 'add' ? styles.add : row.kind === 'remove' ? styles.del : styles.ctx;

  return (
    <div key={row.id} className={`${styles.row} ${cls}`}>
      <span className={styles.ln}>{row.oldNo ?? ''}</span>
      <span className={styles.ln}>{row.newNo ?? ''}</span>
      <span className={styles.marker}>{row.marker}</span>
      <span className={styles.content}>{renderTokens(row)}</span>
    </div>
  );
}

function renderHunkBody(item: Hunk | Fold, collapseLabel?: string, onCollapse?: () => void) {
  return (
    <section key={item.id} className={styles.hunk}>
      <div className={styles.hunkHead}>
        <span className={styles.hunkLabel}>{item.header}</span>
        {onCollapse && collapseLabel && (
          <button type="button" className={styles.hunkBtn} onClick={onCollapse}>
            {collapseLabel}
          </button>
        )}
      </div>
      <div>{item.rows.map(renderRow)}</div>
    </section>
  );
}

export default function TextDiff() {
  const { t } = useTranslation();
  const [original, setOriginal] = usePersistentState('tool:text-diff:left', '');
  const [modified, setModified] = usePersistentState('tool:text-diff:right', '');
  const [compared, setCompared] = usePersistentState('tool:text-diff:compared', false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const { fontSize, increase, decrease } = useEditorFontSize();
  const { leftPercent, containerRef, onDividerMouseDown } = useResizablePanels();

  const model = useMemo(
    () => (compared ? buildModel(original, modified) : EMPTY_MODEL),
    [compared, modified, original],
  );

  const { foldIds } = model;
  const hasFolds = foldIds.length > 0;
  const allExpanded = hasFolds && foldIds.every((id) => expanded.includes(id));

  const compare = () => {
    setCompared(true);
    setExpanded([]);
  };

  const restore = () => {
    setCompared(false);
    setExpanded([]);
  };

  const clear = () => {
    setOriginal('');
    setModified('');
    setCompared(false);
    setExpanded([]);
  };

  const toggleFold = (id: string) => {
    setExpanded((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const status = t('textDiff.status', {
    original: countLines(original),
    modified: countLines(modified),
  });

  return (
    <ToolLayout>
      <div className="fw-tool-stack">
        <div className="fw-tool-toolbar">
          <div className="fw-tool-toolbarMain">
            <Button type="primary" onClick={compare}>
              {t('textDiff.compare')}
            </Button>
            <Button onClick={restore} disabled={!compared}>
              {t('textDiff.editView')}
            </Button>
            {compared && hasFolds && (
              <>
                <Button onClick={() => setExpanded(foldIds)} disabled={allExpanded}>
                  {t('textDiff.expandAll')}
                </Button>
                <Button onClick={() => setExpanded([])} disabled={expanded.length === 0}>
                  {t('textDiff.collapseAll')}
                </Button>
              </>
            )}
          </div>
          <Space size={8}>
            {compared && model.hasChanges && (
              <>
                <Tag color="green">{t('textDiff.added', { count: model.added })}</Tag>
                <Tag color="red">{t('textDiff.deleted', { count: model.removed })}</Tag>
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
                  <DiffPane
                    label={t('textDiff.original')}
                    value={original}
                    onChange={setOriginal}
                    placeholder={t('textDiff.originalPlaceholder')}
                    fontSize={fontSize}
                  />
                </div>
                <div className="fw-tool-divider" onMouseDown={onDividerMouseDown}>
                  <div className="fw-tool-dividerGrip" />
                </div>
                <div className="fw-tool-pane" style={{ flex: 1 }}>
                  <DiffPane
                    label={t('textDiff.modified')}
                    value={modified}
                    onChange={setModified}
                    placeholder={t('textDiff.modifiedPlaceholder')}
                    fontSize={fontSize}
                  />
                </div>
              </>
            ) : (
              <div className={styles.pane}>
                <div className={styles.surface} style={{ fontSize }}>
                  {model.hasChanges ? (
                    model.items.map((item: Block) => {
                      if (item.kind === 'hunk') {
                        return renderHunkBody(item);
                      }

                      if (expanded.includes(item.id)) {
                        return renderHunkBody(item, t('textDiff.collapseUnchanged', { count: item.count }), () =>
                          toggleFold(item.id),
                        );
                      }

                      return (
                        <div key={item.id} className={styles.fold}>
                          <div className={styles.foldMeta}>
                            <span className={styles.foldLabel}>{item.header}</span>
                            <span>{t('textDiff.unchangedHidden', { count: item.count })}</span>
                          </div>
                          <button type="button" className={styles.foldBtn} onClick={() => toggleFold(item.id)}>
                            {t('textDiff.showUnchanged', { count: item.count })}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.empty}>
                      <Empty description={t('textDiff.noDifferences')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <StatusBar
            left={<span className="fw-tool-statusHint">{status}</span>}
            right={<FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />}
          />
        </div>
      </div>
    </ToolLayout>
  );
}
