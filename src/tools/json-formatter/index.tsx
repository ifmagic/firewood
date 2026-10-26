import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Tooltip, message } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { useTranslation } from 'react-i18next';
import EditorContextMenu from '../../components/EditorContextMenu';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import ToolLayout from '../../components/ToolLayout';
import { useCodemirror } from '../../hooks/useCodemirror';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import { formatJsonText, minifyJsonText, unescapeJsonText } from '../../utils/jsonText';
import JumpDebugger from './JumpDebugger';
import { jumpDebuggerExtension } from './jumpDebuggerExtension';
import { jsoncDiagnostics, jsoncLinter } from './jsoncLinter';

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

  /**
   * Apply a text transform, surfacing failures instead of failing silently:
   * an antd error toast names the reason, and `selectFirstError` additionally
   * focuses the editor and moves the cursor onto the first JSONC parse error
   * (the same position the linter squiggle marks).
   */
  const applyTransform = (transform: (text: string) => string, failureKey: string, selectFirstError = false) => {
    if (!content.trim()) {
      return;
    }

    try {
      const nextContent = transform(content);
      if (nextContent !== content) {
        setContent(nextContent);
        requestViewportReset();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      message.error(t(failureKey, { error: detail }));
      if (selectFirstError) {
        const [first] = jsoncDiagnostics(content);
        const view = viewRef.current;
        if (first && view) {
          view.focus();
          view.dispatch({
            selection: { anchor: first.from, head: first.to },
            effects: EditorView.scrollIntoView(first.from, { y: 'center' }),
          });
        }
      }
    }
  };

  const format = () => {
    applyTransform(formatJsonText, 'jsonFormatter.formatFailed');
  };

  const minify = () => {
    applyTransform(minifyJsonText, 'jsonFormatter.minifyFailed', true);
  };

  const unescape = () => {
    applyTransform(unescapeJsonText, 'jsonFormatter.unescapeFailed');
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
            {/* No native title here: it would double up with the Tooltip. */}
            <Tooltip title={t('action.copy')}>
              <Button
                type="text"
                icon={<CopyOutlined />}
                className="fw-tool-iconDangerButton"
                aria-label={t('action.copy')}
                disabled={!content}
                onClick={() => {
                  // Acknowledge the copy: without feedback a user cannot tell
                  // an empty clipboard from a successful one.
                  navigator.clipboard.writeText(content).then(
                    () => message.success(t('action.copied')),
                    () => message.error(t('action.copyFailed')),
                  );
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
