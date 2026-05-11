import { useState } from 'react';
import { Button, Alert } from 'antd';
import { DeleteOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useResizablePanels } from '../../hooks/useResizablePanels';

export default function JsonFormatter() {
  const { t } = useTranslation();
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
      // Strip outer quotes then parse escape sequences
      let text = input.trim();
      if (text.startsWith('"') && text.endsWith('"')) {
        text = JSON.parse(text);
      } else {
        // Replace common escape sequences directly
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

  const editorOptions = {
    minimap: { enabled: false },
    fontSize,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', ui-monospace, monospace",
    letterSpacing: 0.5,
  };
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
    <ToolLayout title={t('jsonFormatter.title')} description={t('jsonFormatter.description')}>
      <div className="fw-tool-stack">
        <div className="fw-tool-toolbar">
          <div className="fw-tool-toolbarMain">
            <Button type="primary" onClick={format}>{t('action.format')}</Button>
            <Button onClick={minify}>{t('action.minify')}</Button>
            <Button onClick={unescape}>{t('action.unescape')}</Button>
            {hasCompared && (
              <Button
                type="default"
                onClick={() => setIsInputCollapsed((prev) => !prev)}
                icon={isInputCollapsed ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                style={toggleInputButtonStyle}
              >
                {isInputCollapsed ? t('action.showOriginalInput') : t('action.hideOriginalInput')}
              </Button>
            )}
          </div>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            className="fw-tool-iconDangerButton"
            title={t('action.clear')}
            aria-label={t('action.clear')}
            onClick={clear}
          />
        </div>

        {error && (
          <Alert type="error" message={error} showIcon />
        )}

        <div className="fw-tool-editorShell">
          <div
            ref={containerRef}
            className="fw-tool-split"
          >
            <div
              className="fw-tool-pane"
              style={{
                width: isInputCollapsed ? 0 : `${leftPercent}%`,
                opacity: isInputCollapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'width 220ms ease, opacity 220ms ease',
              }}
            >
              <div className="fw-tool-paneLabel">{t('label.text')}</div>
              <div className="fw-tool-paneBody">
                <Editor
                  height="100%"
                  language="json"
                  value={input}
                  onChange={(v) => setInput(v ?? '')}
                  theme="vs-light"
                  options={editorOptions}
                />
              </div>
            </div>
            {!isInputCollapsed && (
              <div className="fw-tool-divider" onMouseDown={onDividerMouseDown}>
                <div className="fw-tool-dividerGrip" />
              </div>
            )}
            <div className="fw-tool-pane" style={{ flex: 1 }}>
              <div className="fw-tool-paneLabel">{t('label.result')}</div>
              <div className="fw-tool-paneBody">
                <Editor
                  height="100%"
                  language="json"
                  value={output}
                  theme="vs-light"
                  options={{ ...editorOptions, readOnly: true }}
                />
              </div>
            </div>
          </div>
          <StatusBar
            left={<span className="fw-tool-statusHint">{error || (isInputCollapsed ? t('label.result') : `${t('label.text')} / ${t('label.result')}`)}</span>}
            right={<FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />}
          />
        </div>
      </div>
    </ToolLayout>
  );
}
