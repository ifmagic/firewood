import { useState } from 'react';
import { Button, Space, Alert, Row, Col } from 'antd';
import Editor from '@monaco-editor/react';
import ToolLayout from '../../components/ToolLayout';
import FontSizeControl from '../../components/FontSizeControl';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';

export default function JsonFormatter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const { fontSize, increase, decrease } = useEditorFontSize();

  const format = () => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      setError('');
    } catch (e) {
      setError((e as Error).message);
      setOutput('');
    }
  };

  const minify = () => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      setError('');
    } catch (e) {
      setError((e as Error).message);
      setOutput('');
    }
  };

  const unescape = () => {
    try {
      // 去除外层引号后解析转义字符串
      let text = input.trim();
      if (text.startsWith('"') && text.endsWith('"')) {
        text = JSON.parse(text);
      } else {
        // 直接替换常见转义序列
        text = text
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
      setOutput(text);
      setError('');
    } catch (e) {
      setError((e as Error).message);
      setOutput('');
    }
  };

  const clear = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  const editorOptions = { minimap: { enabled: false }, fontSize };

  return (
    <ToolLayout title="JSON 格式化" description="JSON 格式化、压缩与语法校验">
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={format}>格式化</Button>
        <Button onClick={minify}>压缩</Button>
        <Button onClick={unescape}>去除转义</Button>
        <Button danger onClick={clear}>清空</Button>
      </Space>

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 12 }} showIcon />
      )}

      <Row gutter={16} style={{ height: 'calc(100% - 80px)', position: 'relative' }}>
        <Col span={12}>
          <Editor
            height="100%"
            language="json"
            value={input}
            onChange={(v) => setInput(v ?? '')}
            theme="vs-dark"
            options={editorOptions}
          />
        </Col>
        <Col span={12}>
          <Editor
            height="100%"
            language="json"
            value={output}
            theme="vs-dark"
            options={{ ...editorOptions, readOnly: true }}
          />
        </Col>
        <FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />
      </Row>
    </ToolLayout>
  );
}
