import type { ReactElement, RefObject } from 'react';
import { Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';
import { useTranslation } from 'react-i18next';

interface EditorContextMenuProps {
  viewRef: RefObject<EditorView | null>;
  /** Whether the editor currently has a non-empty selection; enables cut/copy. */
  hasSelection: boolean;
  /** Extra menu items appended after the built-in ones (e.g. tool-specific actions). */
  extraItems?: MenuProps['items'];
  /** Called when an extra item is clicked. */
  onExtraItemClick?: (key: string) => void;
  children: ReactElement;
}

function getSelectedText(view: EditorView) {
  const { state } = view;
  return state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => state.doc.sliceString(range.from, range.to))
    .join(state.lineBreak);
}

/**
 * Shared CodeMirror right-click menu (AGENTS convention): cut / copy / paste / select all /
 * find, plus caller-provided extraItems. Paste goes through navigator.clipboard; on macOS
 * WKWebView this triggers the native paste-confirmation prompt.
 */
export default function EditorContextMenu({
  viewRef,
  hasSelection,
  extraItems,
  onExtraItemClick,
  children,
}: EditorContextMenuProps) {
  const { t } = useTranslation();

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const view = viewRef.current;
    if (!view) return;

    switch (key) {
      case 'cut': {
        const text = getSelectedText(view);
        if (!text) return;
        void (async () => {
          try {
            await navigator.clipboard.writeText(text);
            const liveView = viewRef.current;
            if (liveView) {
              // Clicking the antd menu moved focus out of the editor; restore it before
              // dispatching, otherwise the caret stays invisible after the cut.
              liveView.focus();
              liveView.dispatch(liveView.state.replaceSelection(''));
            }
          } catch {
            // Clipboard unavailable; keep the selection intact.
          }
        })();
        return;
      }
      case 'copy': {
        const text = getSelectedText(view);
        if (text) {
          void navigator.clipboard.writeText(text).catch(() => undefined);
        }
        return;
      }
      case 'paste': {
        void (async () => {
          try {
            const text = await navigator.clipboard.readText();
            const liveView = viewRef.current;
            if (liveView) {
              liveView.focus();
              liveView.dispatch(liveView.state.replaceSelection(text));
            }
          } catch {
            message.warning(t('editor.pasteFailed'));
          }
        })();
        return;
      }
      case 'selectAll': {
        // Focus first: the menu click blurred the editor, and a selection-only
        // transaction on an unfocused CM6 view never reaches the visible DOM
        // selection (WebKit only paints selection in a focused contenteditable).
        view.focus();
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        return;
      }
      case 'find': {
        openSearchPanel(view);
        return;
      }
      default:
        onExtraItemClick?.(key);
    }
  };

  const items: MenuProps['items'] = [
    { key: 'cut', label: t('action.cut'), disabled: !hasSelection },
    { key: 'copy', label: t('action.copy'), disabled: !hasSelection },
    { key: 'paste', label: t('action.paste') },
    { type: 'divider' },
    { key: 'selectAll', label: t('action.selectAll') },
    { key: 'find', label: t('action.find') },
    ...(extraItems ?? []),
  ];

  return (
    <Dropdown trigger={['contextMenu']} menu={{ items, onClick: handleMenuClick }}>
      {children}
    </Dropdown>
  );
}
