import { Input, Button, Space, Typography, Tag } from 'antd';
import * as Diff from 'diff';
import ToolLayout from '../../components/ToolLayout';
import FontSizeControl from '../../components/FontSizeControl';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useResizablePanels } from '../../hooks/useResizablePanels';
import styles from './TextDiff.module.css';

const { TextArea } = Input;

export default function TextDiff() {
  const [left, setLeft] = usePersistentState('tool:text-diff:left', '');
  const [right, setRight] = usePersistentState('tool:text-diff:right', '');
  const [diffs, setDiffs] = usePersistentState<Diff.Change[]>('tool:text-diff:diffs', []);
  const [compared, setCompared] = usePersistentState('tool:text-diff:compared', false);
  const { fontSize, increase, decrease } = useEditorFontSize();
  const { leftPercent, containerRef, onDividerMouseDown } = useResizablePanels();

  const compare = () => {
    const result = Diff.diffLines(left, right);
    setDiffs(result);
    setCompared(true);
  };

  const clear = () => {
    setLeft('');
    setRight('');
    setDiffs([]);
    setCompared(false);
  };

  const renderDiff = () => (
    <div className={styles.diffResult} style={{ fontSize }}>
      {diffs.map((part, i) => (
        <span
          key={i}
          className={
            part.added
              ? styles.added
              : part.removed
              ? styles.removed
              : styles.unchanged
          }
        >
          {part.value}
        </span>
      ))}
    </div>
  );

  const addedLines = diffs.filter((d) => d.added).length;
  const removedLines = diffs.filter((d) => d.removed).length;

  return (
    <ToolLayout title="文本 Diff" description="对比两段文本的差异">
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={compare}>对比</Button>
        <Button danger onClick={clear}>清空</Button>
        {compared && (
          <>
            <Tag color="green">+{addedLines} 新增</Tag>
            <Tag color="red">-{removedLines} 删除</Tag>
          </>
        )}
      </Space>

      <div
        ref={containerRef}
        style={{ position: 'relative', height: 'calc(100% - 80px)', userSelect: 'none' }}
      >
        {!compared ? (
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: `${leftPercent}%`, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <Typography.Text strong>原文</Typography.Text>
              <div style={{ flex: 1, marginTop: 8, position: 'relative' }}>
                <TextArea
                  value={left}
                  onChange={(e) => setLeft(e.target.value)}
                  placeholder="请输入原始文本..."
                  style={{
                    position: 'absolute',
                    inset: 0,
                    resize: 'none',
                    fontFamily: 'monospace',
                    fontSize,
                  }}
                />
              </div>
            </div>
            <div
              style={{
                width: 6,
                height: '100%',
                cursor: 'col-resize',
                background: 'rgba(0,0,0,0.06)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseDown={onDividerMouseDown}
            >
              <div style={{ width: 2, height: 32, background: 'rgba(0,0,0,0.2)', borderRadius: 1 }} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <Typography.Text strong>修改后</Typography.Text>
              <div style={{ flex: 1, marginTop: 8, position: 'relative' }}>
                <TextArea
                  value={right}
                  onChange={(e) => setRight(e.target.value)}
                  placeholder="请输入修改后文本..."
                  style={{
                    position: 'absolute',
                    inset: 0,
                    resize: 'none',
                    fontFamily: 'monospace',
                    fontSize,
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          renderDiff()
        )}
        <FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />
      </div>
    </ToolLayout>
  );
}
