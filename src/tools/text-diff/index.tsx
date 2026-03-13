import { useState } from 'react';
import { Input, Button, Space, Row, Col, Typography, Tag } from 'antd';
import * as Diff from 'diff';
import ToolLayout from '../../components/ToolLayout';
import FontSizeControl from '../../components/FontSizeControl';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import styles from './TextDiff.module.css';

const { TextArea } = Input;

export default function TextDiff() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [diffs, setDiffs] = useState<Diff.Change[]>([]);
  const [compared, setCompared] = useState(false);
  const { fontSize, increase, decrease } = useEditorFontSize();

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

      <div style={{ position: 'relative' }}>
        {!compared ? (
          <Row gutter={16}>
            <Col span={12}>
              <Typography.Text strong>原文</Typography.Text>
              <TextArea
                rows={20}
                value={left}
                onChange={(e) => setLeft(e.target.value)}
                placeholder="请输入原始文本..."
                style={{ marginTop: 8, fontFamily: 'monospace', fontSize }}
              />
            </Col>
            <Col span={12}>
              <Typography.Text strong>修改后</Typography.Text>
              <TextArea
                rows={20}
                value={right}
                onChange={(e) => setRight(e.target.value)}
                placeholder="请输入修改后文本..."
                style={{ marginTop: 8, fontFamily: 'monospace', fontSize }}
              />
            </Col>
          </Row>
        ) : (
          renderDiff()
        )}
        <FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />
      </div>
    </ToolLayout>
  );
}
