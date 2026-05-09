import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react';
import { Button, Dropdown, Empty, Form, Input, Modal, Space, Tabs, message } from 'antd';
import type { InputRef } from 'antd';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { openUrl as openExternal } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import FontSizeControl from '../../components/FontSizeControl';
import ToolLayout from '../../components/ToolLayout';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import i18n from '../../i18n';
import './notepad.css';

interface NoteTab {
  id: string;
  name: string;
  sourcePath?: string;
  sourceName?: string;
  readerVariant?: 'abyss';
  viewMode?: 'reader' | 'editor';
}

const STORAGE_TABS_KEY = 'tool:notepad:tabs';
const STORAGE_ACTIVE_KEY = 'tool:notepad:active';
const STORAGE_READER_THEME_KEY = 'tool:notepad:reader-theme';
const MAX_TABS = 8;
const LOCAL_TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'json', 'log', 'csv', 'yml', 'yaml', 'xml', 'html', 'js', 'ts', 'tsx', 'jsx', 'css'];
const ABYSS_TRIGGER_WORD = 'abyss';
const NOVEL_CHAPTER_RE = /^(序章|楔子|正文|尾声|终章|后记|番外|第[0-9一二三四五六七八九十百千万零两〇]+[章回节卷部集篇].*|chapter\s+\d+.*)$/i;

type ReaderThemeId = 'parchment' | 'bamboo' | 'midnight';

const READER_THEME_CONFIG: Record<ReaderThemeId, {
  labelKey: string;
  shellBackground: string;
  shellBorder: string;
  paperBackground: string;
  bannerBackground: string;
  bannerColor: string;
  headingColor: string;
  paragraphColor: string;
  paperShadow: string;
}> = {
  parchment: {
    labelKey: 'notepad.readerThemeParchment',
    shellBackground: 'radial-gradient(circle at top, rgba(255, 248, 232, 0.92), rgba(239, 226, 197, 0.96)), linear-gradient(180deg, #f7efe1 0%, #efe3ca 100%)',
    shellBorder: '#dccfb5',
    paperBackground: 'linear-gradient(180deg, rgba(255, 250, 240, 0.62), rgba(255, 248, 237, 0.4))',
    bannerBackground: 'rgba(146, 64, 14, 0.12)',
    bannerColor: '#9a3412',
    headingColor: '#7c2d12',
    paragraphColor: '#3f2d1d',
    paperShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.32)',
  },
  bamboo: {
    labelKey: 'notepad.readerThemeBamboo',
    shellBackground: 'radial-gradient(circle at top, rgba(239, 248, 239, 0.95), rgba(221, 235, 220, 0.98)), linear-gradient(180deg, #eef7ea 0%, #dbe8d6 100%)',
    shellBorder: '#b5c7af',
    paperBackground: 'linear-gradient(180deg, rgba(248, 252, 246, 0.72), rgba(237, 245, 233, 0.5))',
    bannerBackground: 'rgba(31, 95, 70, 0.12)',
    bannerColor: '#166534',
    headingColor: '#166534',
    paragraphColor: '#243b2f',
    paperShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.28)',
  },
  midnight: {
    labelKey: 'notepad.readerThemeMidnight',
    shellBackground: 'radial-gradient(circle at top, rgba(29, 42, 67, 0.92), rgba(15, 23, 42, 0.98)), linear-gradient(180deg, #172033 0%, #0f172a 100%)',
    shellBorder: '#32425f',
    paperBackground: 'linear-gradient(180deg, rgba(30, 41, 59, 0.68), rgba(17, 24, 39, 0.46))',
    bannerBackground: 'rgba(125, 211, 252, 0.14)',
    bannerColor: '#bae6fd',
    headingColor: '#e2e8f0',
    paragraphColor: '#dbe4f0',
    paperShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
};

interface ReaderBlock {
  key: string;
  kind: 'heading' | 'paragraph';
  text: string;
}

function getContentKey(tabId: string) {
  return `tool:notepad:content:${tabId}`;
}

function createTabId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function stripFileExtension(fileName: string) {
  const extensionIndex = fileName.lastIndexOf('.');
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function getReaderVariantForName(fileName: string): NoteTab['readerVariant'] {
  const baseName = stripFileExtension(fileName).trim();
  const lowerBaseName = baseName.toLowerCase();
  return lowerBaseName.includes(ABYSS_TRIGGER_WORD) ? 'abyss' : undefined;
}

function buildReaderBlocks(text: string): ReaderBlock[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      key: `${index}-${line.slice(0, 16)}`,
      kind: NOVEL_CHAPTER_RE.test(line) ? 'heading' : 'paragraph',
      text: line,
    }));
}

const DEFAULT_NAME_POOL = [
  'Draft', 'Notes', 'Memo', 'Scratch', 'Snippet',
  'Ideas', 'Tasks', 'Journal', 'Log', 'Quick Note',
  'Thoughts', 'Review', 'Summary', 'Reference',
];

function randomDefaultName() {
  const pool = (i18n.t('notepadNames', { returnObjects: true }) as string[]) || DEFAULT_NAME_POOL;
  const base = pool[Math.floor(Math.random() * pool.length)];
  const suffix = Math.random().toString(36).slice(2, 5);
  return `${base}-${suffix}`;
}

function getUrlAtColumn(line: string, column: number) {
  const urlRegex = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/g;
  let match = urlRegex.exec(line);
  while (match) {
    const start = match.index + 1;
    const end = start + match[0].length;
    if (column >= start && column <= end) {
      return match[0];
    }
    match = urlRegex.exec(line);
  }
  return null;
}

function normalizeUrl(raw: string) {
  const trimmed = raw.trim().replace(/[),.;:!?\]}]+$/g, '');
  return trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
}

/**
 * Best-effort JSON formatter: tries strict parse first, falls back to a
 * character-level pretty-printer that tolerates invalid / partial JSON.
 */
function bestEffortFormatJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  // Fast path: valid JSON
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    // fall through
  }

  // Slow path: character-level scanner
  let result = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  const indent = () => '  '.repeat(depth);

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      result += ch;
      continue;
    }

    // Skip existing whitespace outside strings
    if (/\s/.test(ch)) continue;

    if (ch === '{' || ch === '[') {
      result += ch;
      depth++;
      result += '\n' + indent();
    } else if (ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
      result += '\n' + indent() + ch;
    } else if (ch === ',') {
      result += ',\n' + indent();
    } else if (ch === ':') {
      result += ': ';
    } else {
      result += ch;
    }
  }

  return result;
}

function getCharacterCount(text: string) {
  return Array.from(text).length;
}

function getCharacterCountWithoutLineBreaks(text: string) {
  return getCharacterCount(text.replace(/\r?\n/g, ''));
}

export default function Notepad() {
  const { t } = useTranslation();
  const [tabs, setTabs] = usePersistentState<NoteTab[]>(STORAGE_TABS_KEY, [
    { id: 'default', name: t('notepad.untitled') },
  ]);
  const [activeTabId, setActiveTabId] = usePersistentState(STORAGE_ACTIVE_KEY, 'default');
  const [content, setContent] = useState('');
  const [dialogMode, setDialogMode] = useState<'create' | 'rename' | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [submittingDialog, setSubmittingDialog] = useState(false);
  const [form] = Form.useForm<{ name: string }>();
  const nameInputRef = useRef<InputRef>(null);
  const { fontSize, increase, decrease } = useEditorFontSize();
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const [currentLineCharCount, setCurrentLineCharCount] = useState(0);
  const [selectedCharCount, setSelectedCharCount] = useState(0);
  const [readerThemeId, setReaderThemeId] = usePersistentState<ReaderThemeId>(STORAGE_READER_THEME_KEY, 'parchment');
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const activeReaderTheme = READER_THEME_CONFIG[readerThemeId] ?? READER_THEME_CONFIG.parchment;

  useEffect(() => {
    document.body.classList.add('firewood-notepad-active');

    return () => {
      document.body.classList.remove('firewood-notepad-active');
    };
  }, []);

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabId('');
      setContent('');
      return;
    }

    const hasActive = tabs.some((tab) => tab.id === activeTabId);
    const resolvedActive = hasActive ? activeTabId : tabs[0].id;
    if (resolvedActive !== activeTabId) {
      setActiveTabId(resolvedActive);
      return;
    }

    const saved = localStorage.getItem(getContentKey(resolvedActive));
    setContent(saved ?? '');
  }, [activeTabId, setActiveTabId, tabs]);

  const handleOpenLocalFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: t('notepad.textFiles'), extensions: LOCAL_TEXT_EXTENSIONS }],
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    try {
      const fileText = await readTextFile(selected);
      const fileName = getFileNameFromPath(selected);
      const readerVariant = getReaderVariantForName(fileName);
      const existingTab = tabs.find((tab) => tab.sourcePath === selected);
      const successMessage = readerVariant
        ? t('notepad.readerActivated', { name: fileName })
        : existingTab
          ? t('notepad.fileReloaded', { name: fileName })
          : t('notepad.fileOpened', { name: fileName });

      if (existingTab) {
        setTabs((currentTabs) => currentTabs.map((tab) => {
          if (tab.id !== existingTab.id) {
            return tab;
          }

          return {
            ...tab,
            name: fileName,
            sourcePath: selected,
            sourceName: fileName,
            readerVariant,
            viewMode: readerVariant ? 'reader' : undefined,
          };
        }));
        localStorage.setItem(getContentKey(existingTab.id), fileText);
        setActiveTabId(existingTab.id);
        setContent(fileText);
        message.success(successMessage);
        return;
      }

      if (tabs.length >= MAX_TABS) {
        message.warning(t('notepad.maxTabs', { count: MAX_TABS }));
        return;
      }

      const id = createTabId();
      const nextTab: NoteTab = {
        id,
        name: fileName,
        sourcePath: selected,
        sourceName: fileName,
        readerVariant,
        viewMode: readerVariant ? 'reader' : undefined,
      };

      setTabs((currentTabs) => [...currentTabs, nextTab]);
      setActiveTabId(id);
      localStorage.setItem(getContentKey(id), fileText);
      setContent(fileText);
      message.success(successMessage);
    } catch (error) {
      message.error(t('notepad.openFailed', {
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [setActiveTabId, setTabs, t, tabs]);

  const handleToggleReaderView = useCallback(() => {
    if (!activeTabId || activeTab?.readerVariant !== 'abyss') {
      return;
    }

    setTabs((currentTabs) => currentTabs.map((tab) => {
      if (tab.id !== activeTabId) {
        return tab;
      }

      return {
        ...tab,
        viewMode: tab.viewMode === 'editor' ? 'reader' : 'editor',
      };
    }));
  }, [activeTab, activeTabId, setTabs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
      if (!modifierPressed || event.altKey || event.shiftKey) {
        return;
      }

      if (event.key.toLowerCase() !== 'o') {
        return;
      }

      event.preventDefault();
      void handleOpenLocalFile();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleOpenLocalFile, isMac]);

  const tabItems = useMemo(
    () =>
      tabs.map((tab) => ({
        key: tab.id,
        label: (
          <Dropdown
            trigger={["contextMenu"]}
            menu={{
              items: [{ key: 'rename', label: t('action.rename') }],
              onClick: () => {
                setEditingTabId(tab.id);
                form.setFieldsValue({ name: tab.name });
                setDialogMode('rename');
              },
            }}
          >
            <span
              onDoubleClick={() => {
                setEditingTabId(tab.id);
                form.setFieldsValue({ name: tab.name });
                setDialogMode('rename');
              }}
            >
              {tab.name}
            </span>
          </Dropdown>
        ),
        closable: true,
        children: null,
      })),
    [form, t, tabs],
  );

  const handleSubmit = useCallback(async () => {
    if (submittingDialog) {
      return;
    }

    setSubmittingDialog(true);

    try {
      const values = await form.validateFields();
      const name = values.name.trim();

      if (dialogMode === 'rename' && editingTabId) {
        const readerVariant = getReaderVariantForName(name);
        setTabs(
          tabs.map((tab) => {
            if (tab.id !== editingTabId) {
              return tab;
            }

            return {
              ...tab,
              name,
              readerVariant,
              viewMode: readerVariant ? 'reader' : undefined,
            };
          }),
        );
        form.resetFields();
        setEditingTabId(null);
        setDialogMode(null);
        return;
      }

      if (tabs.length >= MAX_TABS) {
        message.warning(t('notepad.maxTabs', { count: MAX_TABS }));
        return;
      }

      const id = createTabId();

      const nextTabs = [...tabs, { id, name }];
      setTabs(nextTabs);
      setActiveTabId(id);
      localStorage.setItem(getContentKey(id), '');
      setContent('');

      form.resetFields();
      setEditingTabId(null);
      setDialogMode(null);
    } finally {
      setSubmittingDialog(false);
    }
  }, [dialogMode, editingTabId, form, setActiveTabId, setTabs, submittingDialog, t, tabs]);

  const handleRemoveTab = (targetKey: string) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === targetKey);
    if (currentIndex < 0) return;

    const nextTabs = tabs.filter((tab) => tab.id !== targetKey);
    setTabs(nextTabs);
    localStorage.removeItem(getContentKey(targetKey));

    if (activeTabId === targetKey) {
      const fallback = nextTabs[currentIndex] ?? nextTabs[currentIndex - 1];
      setActiveTabId(fallback?.id ?? '');
      setContent('');
    }
  };

  const handleEdit = (targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
    if (action === 'add') {
      if (tabs.length >= MAX_TABS) {
        message.warning(t('notepad.maxTabs', { count: MAX_TABS }));
        return;
      }
      setEditingTabId(null);
      form.setFieldsValue({ name: randomDefaultName() });
      setDialogMode('create');
      return;
    }

    if (typeof targetKey === 'string') {
      const tab = tabs.find((t) => t.id === targetKey);
      Modal.confirm({
        title: t('notepad.deleteTab'),
        content: t('notepad.confirmDelete', { name: tab?.name ?? t('notepad.untitled') }),
        okText: t('action.delete'),
        okButtonProps: { danger: true },
        cancelText: t('action.cancel'),
        onOk: () => handleRemoveTab(targetKey),
      });
    }
  };

  const onContentChange = (value: string) => {
    setContent(value);
    if (!activeTabId) return;
    localStorage.setItem(getContentKey(activeTabId), value);
  };

  const activeExists = tabs.some((tab) => tab.id === activeTabId);
  const effectiveActive = activeExists ? activeTabId : undefined;
  const modalTitle = dialogMode === 'rename' ? t('action.rename') : t('notepad.newTab');
  const modalOkText = dialogMode === 'rename' ? t('action.save') : t('action.ok');

  const detectedLanguage = useMemo(() => {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    if (/^<(!doctype|html|div|span|head|body|p\b|ul|ol|li|table|form|a\b|img|section|article|nav|header|footer)/i.test(trimmed)) return 'html';
    if (/^(import |export |const |let |var |function |class |=>|\/\/)/.test(trimmed)) return 'javascript';
    return 'plaintext';
  }, [content]);
  const showReaderView = activeTab?.readerVariant === 'abyss' && activeTab.viewMode !== 'editor';
  const readerBlocks = useMemo(
    () => (showReaderView ? buildReaderBlocks(content) : []),
    [content, showReaderView],
  );
  const readerThemeStyle = useMemo(() => ({
    '--firewood-reader-shell-background': activeReaderTheme.shellBackground,
    '--firewood-reader-shell-border': activeReaderTheme.shellBorder,
    '--firewood-reader-paper-background': activeReaderTheme.paperBackground,
    '--firewood-reader-paper-shadow': activeReaderTheme.paperShadow,
    '--firewood-reader-banner-background': activeReaderTheme.bannerBackground,
    '--firewood-reader-banner-color': activeReaderTheme.bannerColor,
    '--firewood-reader-heading-color': activeReaderTheme.headingColor,
    '--firewood-reader-paragraph-color': activeReaderTheme.paragraphColor,
  }) as CSSProperties, [activeReaderTheme]);

  const focusNameInput = useCallback(() => {
    requestAnimationFrame(() => {
      const input = nameInputRef.current?.input;
      if (!input) {
        return;
      }

      input.focus();

      if (dialogMode === 'rename') {
        const extensionIndex = input.value.lastIndexOf('.');
        const selectionEnd = extensionIndex > 0 ? extensionIndex : input.value.length;
        input.setSelectionRange(0, selectionEnd);
      }
    });
  }, [dialogMode]);

  const handleEditorBeforeMount = useCallback<BeforeMount>((monaco) => {
    monaco.editor.defineTheme('firewood-contrast-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7C3AED' },
        { token: 'number', foreground: 'B45309' },
        { token: 'string', foreground: '047857' },
        { token: 'regexp', foreground: '0369A1' },
        { token: 'type.identifier', foreground: '1D4ED8' },
      ],
      colors: {
        'editor.background': '#F8FAFC',
        'editor.foreground': '#0F172A',
        'editorCursor.foreground': '#EF4444',
        'editorCursor.background': '#FFFFFF',
        'editorMultiCursor.primary.foreground': '#EF4444',
        'editorMultiCursor.secondary.foreground': '#DC2626',
        'editorLineNumber.foreground': '#94A3B8',
        'editorLineNumber.activeForeground': '#334155',
        'editor.selectionBackground': '#CBD5E199',
        'editor.inactiveSelectionBackground': '#E2E8F099',
        'editor.selectionHighlightBackground': '#E2E8F055',
        'editor.selectionHighlightBorder': '#94A3B8',
        'editor.lineHighlightBackground': '#F1F5F9',
        'editorIndentGuide.background1': '#E2E8F0',
      },
    });
  }, []);

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    monaco.editor.setTheme('firewood-contrast-light');

    const updateCursorStats = () => {
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) {
        setCurrentLineCharCount(0);
        setSelectedCharCount(0);
        return;
      }

      const currentLineText = model.getLineContent(position.lineNumber);
      setCurrentLineCharCount(getCharacterCount(currentLineText));

      const selections = editor.getSelections() ?? [];
      const selectedLength = selections.reduce((total, selection) => {
        if (selection.isEmpty()) {
          return total;
        }
        return total + getCharacterCountWithoutLineBreaks(model.getValueInRange(selection));
      }, 0);
      setSelectedCharCount(selectedLength);
    };

    updateCursorStats();
    const cursorPositionDisposable = editor.onDidChangeCursorPosition(updateCursorStats);
    const cursorSelectionDisposable = editor.onDidChangeCursorSelection(updateCursorStats);
    const contentDisposable = editor.onDidChangeModelContent(updateCursorStats);

    editor.onMouseDown(async (event) => {
      const isModifierPressed = isMac ? event.event.metaKey : event.event.ctrlKey;
      if (!event.event.leftButton || !isModifierPressed) return;
      if (!event.target.position) return;
      const model = editor.getModel();
      if (!model) return;

      const line = model.getLineContent(event.target.position.lineNumber);
      const matched = getUrlAtColumn(line, event.target.position.column);
      if (!matched) return;

      const normalized = normalizeUrl(matched);
      try {
        await openExternal(normalized);
      } catch (error) {
        message.error(`Failed to open link: ${String(error)}`);
      }
    });

    editor.onDidDispose(() => {
      cursorPositionDisposable.dispose();
      cursorSelectionDisposable.dispose();
      contentDisposable.dispose();
    });

    editor.addAction({
      id: 'firewood.formatJson',
      label: 'Format JSON',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1,
      run: (ed) => {
        const model = ed.getModel();
        if (!model) return;
        const fullRange = model.getFullModelRange();
        const text = model.getValue();
        const formatted = bestEffortFormatJson(text);
        if (formatted !== text) {
          ed.executeEdits('firewood.formatJson', [
            { range: fullRange, text: formatted },
          ]);
        }
      },
    });
  }, [isMac]);

  const editorOptions = {
    minimap: { enabled: false },
    fontSize,
    cursorStyle: 'line' as const,
    cursorWidth: 3,
    cursorBlinking: 'solid' as const,
    lineNumbers: 'on' as const,
    glyphMargin: false,
    folding: true,
    lineDecorationsWidth: 8,
    lineNumbersMinChars: 3,
    wordWrap: 'on' as const,
    links: true,
    smoothScrolling: true,
    scrollBeyondLastLine: false,
  };

  return (
    <ToolLayout title={t('notepad.title')} description={t('notepad.description')}>
      <div className="firewood-notepad-toolbar">
        <Space wrap>
          <Button
            onClick={() => {
              void handleOpenLocalFile();
            }}
          >
            {t('notepad.openFile')}
          </Button>
          {activeTab?.readerVariant === 'abyss' && (
            <>
              <Button type={showReaderView ? 'primary' : 'default'} onClick={handleToggleReaderView}>
                {showReaderView ? t('notepad.sourceView') : t('notepad.readerView')}
              </Button>
              <Dropdown
                trigger={['click']}
                menu={{
                  selectable: true,
                  selectedKeys: [readerThemeId],
                  items: (Object.entries(READER_THEME_CONFIG) as Array<[ReaderThemeId, typeof READER_THEME_CONFIG[ReaderThemeId]]>).map(([themeId, theme]) => ({
                    key: themeId,
                    label: t(theme.labelKey),
                  })),
                  onClick: ({ key }) => {
                    setReaderThemeId(key as ReaderThemeId);
                  },
                }}
              >
                <Button>{t('notepad.readerTheme')}: {t(activeReaderTheme.labelKey)}</Button>
              </Dropdown>
            </>
          )}
          <Button
            danger
            onClick={() => {
              if (!activeTabId) return;
              localStorage.removeItem(getContentKey(activeTabId));
              setContent('');
            }}
            disabled={!activeTabId}
          >
            {t('action.clear')}
          </Button>
        </Space>
        <div className="firewood-notepad-toolbarMeta">
          <span>{t('notepad.linkHint', { shortcut: isMac ? 'Cmd' : 'Ctrl' })}</span>
          <span>{t('notepad.openHint', { shortcut: isMac ? 'Cmd' : 'Ctrl' })}</span>
          {activeTab?.name && <span>{activeTab.name}</span>}
        </div>
      </div>

      <Tabs
        type="editable-card"
        hideAdd={false}
        onEdit={handleEdit}
        activeKey={effectiveActive}
        items={tabItems}
        onChange={setActiveTabId}
      />

      <div style={{ position: 'relative', height: 'calc(100% - 110px)' }}>
        {activeTabId ? (
          <>
            {showReaderView ? (
              <div className="firewood-notepad-readerShell" style={{ ...readerThemeStyle, height: 'calc(100% - 34px)' }}>
                <div className="firewood-notepad-readerPaper">
                  <div className="firewood-notepad-readerBanner">{t('notepad.readerBadge')}</div>
                  {readerBlocks.length > 0 ? (
                    readerBlocks.map((block) => (
                      block.kind === 'heading' ? (
                        <h3 key={block.key} className="firewood-notepad-readerHeading">
                          {block.text}
                        </h3>
                      ) : (
                        <p key={block.key} className="firewood-notepad-readerParagraph" style={{ fontSize }}>
                          {block.text}
                        </p>
                      )
                    ))
                  ) : (
                    <Empty
                      description={t('notepad.readerEmpty')}
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      style={{ marginTop: 36 }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <Editor
                height="calc(100% - 34px)"
                language={detectedLanguage}
                value={content}
                onChange={(value) => onContentChange(value ?? '')}
                beforeMount={handleEditorBeforeMount}
                onMount={handleEditorMount}
                theme="firewood-contrast-light"
                options={editorOptions}
              />
            )}
            <div
              style={{
                height: 34,
                borderTop: '1px solid #e2e8f0',
                background: '#f1f5f9',
                color: '#334155',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '0 140px 0 12px',
              }}
            >
              <span>
                {showReaderView ? (
                  <>
                    <span style={{ color: activeReaderTheme.bannerColor, marginRight: 8 }}>{t('notepad.readerBadge')}</span>
                    {activeTab?.name}
                  </>
                ) : (
                  <>
                    {detectedLanguage !== 'plaintext' && (
                      <span style={{ color: '#6366f1', marginRight: 8 }}>{detectedLanguage.toUpperCase()}</span>
                    )}
                    {t('notepad.line')}: {currentLineCharCount} {t('notepad.chars')} | {t('notepad.selected')}: {selectedCharCount}
                  </>
                )}
              </span>
            </div>
          </>
        ) : (
          <Empty
            description={t('notepad.newTab')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 36 }}
          />
        )}
        <FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />
      </div>

      <Modal
        title={modalTitle}
        open={dialogMode !== null}
        afterOpenChange={(open) => {
          if (open) {
            focusNameInput();
          }
        }}
        onCancel={() => {
          setDialogMode(null);
          setEditingTabId(null);
          form.resetFields();
        }}
        onOk={() => void handleSubmit()}
        okText={modalOkText}
        cancelText={t('action.cancel')}
        confirmLoading={submittingDialog}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            label={t('notepad.tabName')}
            name="name"
            rules={[
              { required: true, whitespace: true, message: t('notepad.enterName') },
              { max: 60, message: t('notepad.maxNameLength', { count: 60 }) },
            ]}
          >
            <Input
              ref={nameInputRef}
              placeholder={t('notepad.namePlaceholder')}
              maxLength={60}
              onPressEnter={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </ToolLayout>
  );
}
