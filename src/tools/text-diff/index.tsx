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

  /** 对一对 removed/added 行做 word-level diff，返回带高亮的 span */
  const renderInlineHighlight = (
    removedLine: string,
    addedLine: string,
  ): { removedSpans: React.ReactNode; addedSpans: React.ReactNode } => {
    const wordDiffs = Diff.diffWords(removedLine, addedLine);
    const removed: React.ReactNode[] = [];
    const added: React.ReactNode[] = [];
    wordDiffs.forEach((seg, j) => {
      if (seg.added) {
        added.push(<span key={j} className={styles.inlineAdded}>{seg.value}</span>);
      } else if (seg.removed) {
        removed.push(<span key={j} className={styles.inlineRemoved}>{seg.value}</span>);
      } else {
        removed.push(<span key={`r${j}`}>{seg.value}</span>);
        added.push(<span key={`a${j}`}>{seg.value}</span>);
      }
    });
    return {
      removedSpans: removed.length ? removed : ' ',
      addedSpans: added.length ? added : ' ',
    };
  };

  /** 渲染一对 removed+added 块，逐行做 word-level 高亮 */
  const renderModifiedPair = (removedPart: Diff.Change, addedPart: Diff.Change, key: string) => {
    const removedLines = getLines(removedPart.value);
    const addedLines = getLines(addedPart.value);
    const maxLen = Math.max(removedLines.length, addedLines.length);
    const elements: React.ReactNode[] = [];

    for (let li = 0; li < maxLen; li++) {
      const rLine = li < removedLines.length ? removedLines[li] : null;
      const aLine = li < addedLines.length ? addedLines[li] : null;

      if (rLine !== null && aLine !== null) {
        // 同时有对应行：做 inline word diff
        const { removedSpans, addedSpans } = renderInlineHighlight(rLine, aLine);
        elements.push(
          <div key={`${key}-r${li}`} className={`${styles.diffLine} ${styles.modRemovedLine}`}>
            <span className={styles.lineMarker}>-</span>
            <span className={styles.lineContent}>{removedSpans}</span>
          </div>,
        );
        elements.push(
          <div key={`${key}-a${li}`} className={`${styles.diffLine} ${styles.modAddedLine}`}>
            <span className={styles.lineMarker}>+</span>
            <span className={styles.lineContent}>{addedSpans}</span>
          </div>,
        );
      } else if (rLine !== null) {
        elements.push(
          <div key={`${key}-r${li}`} className={`${styles.diffLine} ${styles.modRemovedLine}`}>
            <span className={styles.lineMarker}>-</span>
            <span className={styles.lineContent}>{rLine || ' '}</span>
          </div>,
        );
      } else if (aLine !== null) {
        elements.push(
          <div key={`${key}-a${li}`} className={`${styles.diffLine} ${styles.modAddedLine}`}>
            <span className={styles.lineMarker}>+</span>
            <span className={styles.lineContent}>{aLine || ' '}</span>
          </div>,
        );
      }
    }
    return elements;
  };

  const renderDiff = () => {
    const elements: React.ReactNode[] = [];
    for (let i = 0; i < diffs.length; ) {
      const ci = i; // 在 i 被修改前捕获，供闭包使用
      const part = diffs[i];
      // 检测 removed + added 配对
      if (part.removed && i + 1 < diffs.length && diffs[i + 1].added) {
        elements.push(
          <div key={ci} className={`${styles.chunk} ${styles.modifiedChunk}`}>
            {renderModifiedPair(part, diffs[i + 1], `mod-${ci}`)}
          </div>,
        );
        i += 2; 
      } else if (part.added) {
        elements.push(
          <div key={ci} className={`${styles.chunk} ${styles.addedChunk}`}>
            {renderChunkLines(part.value, '+')}
          </div>,
        );
        i++;
      } else if (part.removed) {
        elements.push(
          <div key={ci} className={`${styles.chunk} ${styles.removedChunk}`}>
            {renderChunkLines(part.value, '-')}
          </div>,
        );
        i++;
      } else {
        elements.push(
          <div key={ci} className={styles.unchangedContainer}>
            {expandedUnchangedChunks.includes(ci) ? (
              <div className={`${styles.chunk} ${styles.unchangedChunk}`}>
                <button className={styles.foldButton} onClick={() => toggleUnchangedChunk(ci)}>
                  收起 {countLines(part.value)} 行未变化内容
                </button>
                {renderChunkLines(part.value, ' ')}
              </div>
            ) : (
              <button className={styles.foldButton} onClick={() => toggleUnchangedChunk(ci)}>
                显示 {countLines(part.value)} 行未变化内容
              </button>
            )}
          </div>,
        );
        i++;
      }
    }
    return (
      <div className={styles.diffResult} style={{ fontSize }}>
        {elements}
      </div>
    );
  };

  const addedLines = diffs.filter((d) => d.added).reduce((sum, d) => sum + countLines(d.value), 0);
  const removedLines = diffs.filter((d) => d.removed).reduce((sum, d) => sum + countLines(d.value), 0);

  return (
    <ToolLayout title="文本对比" description="对比两段文本的差异">
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
