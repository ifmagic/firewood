import { useState } from 'react';
import { Button, Space, Alert } from 'antd';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import ToolLayout from '../../components/ToolLayout';
import FontSizeControl from '../../components/FontSizeControl';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useResizablePanels } from '../../hooks/useResizablePanels';

export default function JsonFormatter() {
  const [input, setInput] = usePersistentState('tool:json-formatter:input', '');
  const [output, setOutput] = usePersistentState('tool:json-formatter:output', '');
  const [error, setError] = usePersistentState('tool:json-formatter:error', '');
  const [hasCompared, setHasCompared] = useState(false);
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const { fontSize, increase, decrease } = useEditorFontSize();
  const { leftPercent, containerRef, onDividerMouseDown } = useResizablePanels();

  const format = () => {
    setHasCompared(true);
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      setError('');
      setIsInputCollapsed(true);
    } catch (e) {
      setError((e as Error).message);
      setOutput('');
    }
  };

  const minify = () => {
    setHasCompared(true);
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      setError('');
      setIsInputCollapsed(true);
    } catch (e) {
      setError((e as Error).message);
      setOutput('');
    }
  };

  const unescape = () => {
    setHasCompared(true);
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
      setIsInputCollapsed(true);
    } catch (e) {
      setError((e as Error).message);
      setOutput('');
    }
  };

  const clear = () => {
    setInput('');
    setOutput('');
    setError('');
    setHasCompared(false);
    setIsInputCollapsed(false);
  };

  const editorOptions = { minimap: { enabled: false }, fontSize };
  const toggleInputButtonStyle = {
    color: 'rgba(31, 41, 55, 0.9)',
    borderColor: 'rgba(15, 23, 42, 0.14)',
    background: isInputCollapsed ? 'rgba(15, 23, 42, 0.1)' : 'rgba(15, 23, 42, 0.04)',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    fontWeight: 500,
    transition: 'all 180ms ease',
  } as const;

  return (
    <ToolLayout title="JSON 格式化" description="JSON 格式化、压缩与语法校验">
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={format}>格式化</Button>
        <Button onClick={minify}>压缩</Button>
        <Button onClick={unescape}>去除转义</Button>
        {hasCompared && (
          <Button
            type="default"
            onClick={() => setIsInputCollapsed((prev) => !prev)}
            icon={isInputCollapsed ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            style={toggleInputButtonStyle}
          >
            {isInputCollapsed ? '显示原始输入' : '隐藏原始输入'}
          </Button>
        )}
        <Button danger onClick={clear}>清空</Button>
      </Space>

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 12 }} showIcon />
      )}

      <div
        ref={containerRef}
        style={{ display: 'flex', height: 'calc(100% - 80px)', position: 'relative', userSelect: 'none' }}
      >
        <div
          style={{
            width: isInputCollapsed ? 0 : `${leftPercent}%`,
            height: '100%',
            minWidth: 0,
            opacity: isInputCollapsed ? 0 : 1,
            overflow: 'hidden',
            transition: 'width 220ms ease, opacity 220ms ease',
          }}
        >
          <Editor
            height="100%"
            language="json"
            value={input}
            onChange={(v) => setInput(v ?? '')}
            theme="vs-dark"
            options={editorOptions}
          />
        </div>
        {!isInputCollapsed && (
          <div
            style={{
              width: 6,
              height: '100%',
              cursor: 'col-resize',
              background: 'rgba(255,255,255,0.06)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseDown={onDividerMouseDown}
          >
            <div style={{ width: 2, height: 32, background: 'rgba(255,255,255,0.25)', borderRadius: 1 }} />
          </div>
        )}
        <div style={{ flex: 1, height: '100%', minWidth: 0 }}>
          <Editor
            height="100%"
            language="json"
            value={output}
            theme="vs-dark"
            options={{ ...editorOptions, readOnly: true }}
          />
        </div>
        <FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />
      </div>
    </ToolLayout>
  );
}
