import { Input, Button, Space, Typography, Tag } from 'antd';
import * as Diff from 'diff';
import { useState } from 'react';
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
  const [expandedUnchangedChunks, setExpandedUnchangedChunks] = useState<number[]>([]);
  const { fontSize, increase, decrease } = useEditorFontSize();
  const { leftPercent, containerRef, onDividerMouseDown } = useResizablePanels();

  const compare = () => {
    const result = Diff.diffLines(left, right);
    setDiffs(result);
    setCompared(true);
    setExpandedUnchangedChunks([]);
  };

  const restore = () => {
    setCompared(false);
  };

  const clear = () => {
    setLeft('');
    setRight('');
    setDiffs([]);
    setCompared(false);
    setExpandedUnchangedChunks([]);
  };

  const getLines = (value: string) => {
    const lines = value.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines.length > 0 ? lines : [''];
  };

  const countLines = (value: string) => getLines(value).length;

  const toggleUnchangedChunk = (index: number) => {
    setExpandedUnchangedChunks((prev) =>
      prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]
    );
  };

  const renderChunkLines = (value: string, marker: string) => {
    const lines = getLines(value);

    return lines.map((line, lineIndex) => (
      <div key={`${marker}-${lineIndex}`} className={styles.diffLine}>
        <span className={styles.lineMarker}>{marker}</span>
        <span className={styles.lineContent}>{line || ' '}</span>
      </div>
    ));
  };

  const renderDiff = () => (
    <div className={styles.diffResult} style={{ fontSize }}>
      {diffs.map((part, i) => (
        part.added ? (
          <div key={i} className={`${styles.chunk} ${styles.addedChunk}`}>
            {renderChunkLines(part.value, '+')}
          </div>
        ) : part.removed ? (
          <div key={i} className={`${styles.chunk} ${styles.removedChunk}`}>
            {renderChunkLines(part.value, '-')}
          </div>
        ) : (
          <div key={i} className={styles.unchangedContainer}>
            {expandedUnchangedChunks.includes(i) ? (
              <div className={`${styles.chunk} ${styles.unchangedChunk}`}>
                <button className={styles.foldButton} onClick={() => toggleUnchangedChunk(i)}>
                  收起 {countLines(part.value)} 行未变化内容
                </button>
                {renderChunkLines(part.value, ' ')}
              </div>
            ) : (
              <button className={styles.foldButton} onClick={() => toggleUnchangedChunk(i)}>
                显示 {countLines(part.value)} 行未变化内容
              </button>
            )}
          </div>
        )
      ))}
    </div>
  );

  const addedLines = diffs.filter((d) => d.added).reduce((sum, d) => sum + countLines(d.value), 0);
  const removedLines = diffs.filter((d) => d.removed).reduce((sum, d) => sum + countLines(d.value), 0);

  return (
    <ToolLayout title="文本 Diff" description="对比两段文本的差异">
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={compare}>对比</Button>
        <Button onClick={restore} disabled={!compared}>恢复编辑视图</Button>
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
