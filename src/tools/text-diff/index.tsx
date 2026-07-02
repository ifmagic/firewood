import { Button, Empty, Input, Space, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import ToolLayout from '../../components/ToolLayout';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useResizablePanels } from '../../hooks/useResizablePanels';
import { type Block, type Fold, type Hunk, type Row, buildModel, countLines, EMPTY_MODEL } from './diff';
import styles from './TextDiff.module.css';

const { TextArea } = Input;

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

  const status = `Original ${countLines(original)} · Modified ${countLines(modified)}`;

  return (
    <ToolLayout title="DIFF">
      <div className="fw-tool-stack">
        <div className="fw-tool-toolbar">
          <div className="fw-tool-toolbarMain">
            <Button type="primary" onClick={compare}>
              Compare
            </Button>
            <Button onClick={restore} disabled={!compared}>
              Edit View
            </Button>
            {compared && hasFolds && (
              <>
                <Button onClick={() => setExpanded(foldIds)} disabled={allExpanded}>
                  Expand all
                </Button>
                <Button onClick={() => setExpanded([])} disabled={expanded.length === 0}>
                  Collapse all
                </Button>
              </>
            )}
          </div>
          <Space size={8}>
            {compared && model.hasChanges && (
              <>
                <Tag color="green">+{model.added} added</Tag>
                <Tag color="red">-{model.removed} deleted</Tag>
              </>
            )}
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              className="fw-tool-iconDangerButton"
              title="Clear"
              aria-label="Clear"
              onClick={clear}
            />
          </Space>
        </div>

        <div className="fw-tool-editorShell">
          <div ref={containerRef} className="fw-tool-split">
            {!compared ? (
              <>
                <div className="fw-tool-pane" style={{ width: `${leftPercent}%` }}>
                  <div className="fw-tool-paneLabel">Original</div>
                  <div className="fw-tool-paneBody">
                    <TextArea
                      value={original}
                      onChange={(e) => setOriginal(e.target.value)}
                      placeholder="Enter original text..."
                      className="fw-tool-mono fw-tool-textarea"
                      name="text-diff-original"
                      style={{ position: 'absolute', inset: 0, resize: 'none', fontSize }}
                    />
                  </div>
                </div>
                <div className="fw-tool-divider" onMouseDown={onDividerMouseDown}>
                  <div className="fw-tool-dividerGrip" />
                </div>
                <div className="fw-tool-pane" style={{ flex: 1 }}>
                  <div className="fw-tool-paneLabel">Modified</div>
                  <div className="fw-tool-paneBody">
                    <TextArea
                      value={modified}
                      onChange={(e) => setModified(e.target.value)}
                      placeholder="Enter modified text..."
                      className="fw-tool-mono fw-tool-textarea"
                      name="text-diff-modified"
                      style={{ position: 'absolute', inset: 0, resize: 'none', fontSize }}
                    />
                  </div>
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
                        return renderHunkBody(item, `Collapse ${item.count} unchanged lines`, () =>
                          toggleFold(item.id),
                        );
                      }

                      return (
                        <div key={item.id} className={styles.fold}>
                          <div className={styles.foldMeta}>
                            <span className={styles.foldLabel}>{item.header}</span>
                            <span>{item.count} unchanged lines hidden</span>
                          </div>
                          <button type="button" className={styles.foldBtn} onClick={() => toggleFold(item.id)}>
                            {`Show ${item.count} unchanged lines`}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.empty}>
                      <Empty description="No differences" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
