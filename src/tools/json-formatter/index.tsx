import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import Editor, { type OnMount } from '@monaco-editor/react';
import { format as formatJsonc, type EditOperation } from 'monaco-editor/esm/external/jsonc-parser/lib/esm/main.js';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import './json-formatter.css';

const jsoncFormatOptions = {
  tabSize: 2,
  insertSpaces: true,
  eol: '\n',
  keepLines: false,
} as const;

function applyJsoncEdits(text: string, edits: EditOperation[]) {
  return edits
    .slice()
    .sort((left, right) => right.offset - left.offset)
    .reduce(
      (current, edit) => `${current.slice(0, edit.offset)}${edit.content}${current.slice(edit.offset + edit.length)}`,
      text,
    );
}

export default function JsonFormatter() {
  const { t } = useTranslation();
  const [content, setContent] = usePersistentState('tool:json-formatter:input', '');
  const [viewportResetVersion, setViewportResetVersion] = useState(0);
  const { fontSize, increase, decrease } = useEditorFontSize();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const requestViewportReset = () => {
    setViewportResetVersion((version) => version + 1);
  };

  useEffect(() => {
    document.body.classList.add('firewood-json-formatter-active');

    return () => {
      document.body.classList.remove('firewood-json-formatter-active');
    };
  }, []);

  useEffect(() => {
    if (viewportResetVersion === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const startPosition = { lineNumber: 1, column: 1 };
      editor.setPosition(startPosition);
      editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
      editor.revealPosition(startPosition);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [viewportResetVersion]);

  const applyTransform = (transform: (text: string) => string) => {
    if (!content.trim()) {
      return;
    }

    try {
      const nextContent = transform(content);
      if (nextContent !== content) {
        setContent(nextContent);
        requestViewportReset();
      }
    } catch {
      return;
    }
  };

  const format = () => {
    applyTransform((text) => {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return applyJsoncEdits(text, formatJsonc(text, undefined, jsoncFormatOptions));
      }
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
        // Single-pass unescape; sequential .replace() chains mis-handle `\\`
        nextText = JSON.parse(`"${nextText}"`);
      }
      return nextText;
    });
  };

  const clear = () => {
    setContent('');
    requestViewportReset();
  };

  const handleContentChange = (value?: string) => {
    const nextValue = value ?? '';
    setContent(nextValue);
  };

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', ui-monospace, monospace",
      letterSpacing: 0.5,
      automaticLayout: true,
    }),
    [fontSize],
  );

  return (
    <ToolLayout title={t('jsonFormatter.title')}>
      <div className="fw-tool-stack">
        <div className="fw-tool-toolbar">
          <div className="fw-tool-toolbarMain">
            <Button type="primary" onClick={format}>
              {t('action.format')}
            </Button>
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
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('jsonFormatter.emptyHint')} />
                </div>
              )}
              <Editor
                height="100%"
                language="json"
                value={content}
                onChange={handleContentChange}
                onMount={handleEditorMount}
                theme="vs-light"
                options={editorOptions}
              />
            </div>
          </div>
          <StatusBar right={<FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />} />
        </div>
      </div>
    </ToolLayout>
  );
}
