import { Alert, Button, Empty, Tooltip, message } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';

export default function JsonFormatter() {
  const { t } = useTranslation();
  const [content, setContent] = usePersistentState('tool:json-formatter:input', '');
  const [error, setError] = usePersistentState('tool:json-formatter:error', '');
  const { fontSize, increase, decrease } = useEditorFontSize();

  const applyTransform = (transform: (text: string) => string) => {
    if (!content.trim()) {
      setError(t('jsonFormatter.emptyError'));
      return;
    }

    try {
      const nextContent = transform(content);
      setContent(nextContent);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const format = () => {
    applyTransform((text) => {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    });
  };

  const minify = () => {
    applyTransform((text) => {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed);
    });
  };

  const unescape = () => {
    applyTransform((text) => {
      // Strip outer quotes then parse escape sequences
      let nextText = text.trim();
      if (nextText.startsWith('"') && nextText.endsWith('"')) {
        nextText = JSON.parse(nextText);
      } else {
        // Replace common escape sequences directly
        nextText = nextText
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
      return nextText;
    });
  };

  const clear = () => {
    setContent('');
    setError('');
  };

  const handleContentChange = (value?: string) => {
    const nextValue = value ?? '';
    setContent(nextValue);
    setError('');
  };

  const editorOptions = {
    minimap: { enabled: false },
    fontSize,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', ui-monospace, monospace",
    letterSpacing: 0.5,
    automaticLayout: true,
  };

  return (
    <ToolLayout title={t('jsonFormatter.title')} description={t('jsonFormatter.description')}>
      <div className="fw-tool-stack">
        <div className="fw-tool-toolbar">
          <div className="fw-tool-toolbarMain">
            <Button type="primary" onClick={format}>{t('action.format')}</Button>
            <Button onClick={minify}>{t('action.minify')}</Button>
            <Button onClick={unescape}>{t('action.unescape')}</Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Tooltip title={t('action.copy')}>
              <Button
                type="text"
                icon={<CopyOutlined />}
                className="fw-tool-iconDangerButton"
                title={t('action.copy')}
                aria-label={t('action.copy')}
                disabled={!content}
                onClick={() => {
                  navigator.clipboard.writeText(content);
                  message.success(t('action.copied'));
                }}
              />
            </Tooltip>
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
        </div>

        {error && (
          <Alert type="error" message={error} showIcon />
        )}

        <div className="fw-tool-editorShell">
          <div className="fw-tool-pane" style={{ flex: 1 }}>
            <div className="fw-tool-paneBody">
              {!content && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                >
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t('jsonFormatter.emptyHint')}
                  />
                </div>
              )}
              <Editor
                height="100%"
                language="json"
                value={content}
                onChange={handleContentChange}
                theme="vs-light"
                options={editorOptions}
              />
            </div>
          </div>
          <StatusBar
            left={error ? <span className="fw-tool-statusHint">{error}</span> : undefined}
            right={<FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />}
          />
        </div>
      </div>
    </ToolLayout>
  );
}
