import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { applyEdits, format as formatJsonc } from 'jsonc-parser';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { useTranslation } from 'react-i18next';
import EditorContextMenu from '../../components/EditorContextMenu';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import ToolLayout from '../../components/ToolLayout';
import { useCodemirror } from '../../hooks/useCodemirror';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import JumpDebugger from './JumpDebugger';
import { jumpDebuggerExtension } from './jumpDebuggerExtension';
import { jsoncLinter } from './jsoncLinter';

const jsoncFormatOptions = {
  tabSize: 2,
  insertSpaces: true,
  eol: '\n',
  keepLines: false,
} as const;

export default function JsonFormatter() {
  const { t } = useTranslation();
  const [content, setContent] = usePersistentState('tool:json-formatter:input', '');
  const [viewportResetVersion, setViewportResetVersion] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  const { fontSize, increase, decrease } = useEditorFontSize();

  const handleContentChange = (value: string) => {
    setContent(value);
  };

  const handleEditorUpdate = (update: ViewUpdate) => {
    if (!update.docChanged && !update.selectionSet) {
      return;
    }

    const next = update.state.selection.ranges.some((range) => !range.empty);
    setHasSelection((prev) => (prev === next ? prev : next));
  };

  const lintExtensions = useMemo(
    () => (import.meta.env.DEV ? [jsoncLinter(), jumpDebuggerExtension()] : [jsoncLinter()]),
    [],
  );

  const { hostRef, viewRef } = useCodemirror({
    value: content,
    onChange: handleContentChange,
    variant: 'code',
    language: 'json',
    wrap: false,
    fontSize,
    extensions: lintExtensions,
    onUpdate: handleEditorUpdate,
  });

  const requestViewportReset = () => {
    setViewportResetVersion((version) => version + 1);
  };

  useEffect(() => {
    if (viewportResetVersion === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      view.dispatch({
        selection: { anchor: 0, head: 0 },
        effects: EditorView.scrollIntoView(0, { y: 'start' }),
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [viewportResetVersion, viewRef]);

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
        return applyEdits(text, formatJsonc(text, undefined, jsoncFormatOptions));
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

  return (
    <ToolLayout>
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
              <EditorContextMenu viewRef={viewRef} hasSelection={hasSelection}>
                <div ref={hostRef} className="fw-cm-host" />
              </EditorContextMenu>
            </div>
          </div>
          <StatusBar right={<FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />} />
        </div>
        <JumpDebugger />
      </div>
    </ToolLayout>
  );
}
