import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { DeleteOutlined, FolderOpenOutlined, SaveOutlined } from '@ant-design/icons';
import { Button, Dropdown, Empty, Form, Input, Modal, Space, Tabs, message } from 'antd';
import type { InputRef } from 'antd';
import type * as Monaco from 'monaco-editor';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { openUrl as openExternal } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import ToolLayout from '../../components/ToolLayout';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { useMonacoCompat } from '../../hooks/useMonacoCompat';
import { usePersistentState } from '../../hooks/usePersistentState';
import './notepad.css';

interface NoteTab {
  id: string;
  name: string;
  sourcePath?: string;
  sourceName?: string;
}

interface EditorStats {
  chars: number;
  lines: number;
  selected: number;
}

const STORAGE_TABS_KEY = 'tool:notepad:tabs';
const STORAGE_ACTIVE_KEY = 'tool:notepad:active';
const MAX_TABS = 8;
const PERSIST_DEBOUNCE_MS = 250;
const LOCAL_TEXT_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'json',
  'log',
  'csv',
  'yml',
  'yaml',
  'xml',
  'html',
  'js',
  'ts',
  'tsx',
  'jsx',
  'css',
];

function getContentKey(tabId: string) {
  return `tool:notepad:content:${tabId}`;
}

function createTabId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function getPreferredSaveName(tab: NoteTab | null, fallbackName: string) {
  if (tab?.sourceName?.trim()) {
    return tab.sourceName.trim();
  }

  return tab?.name?.trim() || fallbackName.trim();
}

function getUrlAtColumn(line: string, column: number) {
  const urlRegex = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/g;
  let match = urlRegex.exec(line);
  while (match) {
    const start = match.index + 1;
    const end = start + match[0].length - 1;
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

function detectLanguage(text: string) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (
    /^<(!doctype|html|div|span|head|body|p\b|ul|ol|li|table|form|a\b|img|section|article|nav|header|footer)/i.test(
      trimmed,
    )
  )
    return 'html';
  if (/^(import |export |const |let |var |function |class |=>|\/\/)/.test(trimmed)) return 'javascript';
  return 'plaintext';
}

function countCodePoints(text: string) {
  let count = 0;
  for (let i = 0; i < text.length; ) {
    const code = text.charCodeAt(i);
    i += code >= 0xd800 && code <= 0xdbff ? 2 : 1;
    count++;
  }
  return count;
}

/**
 * Best-effort JSON formatter: tries strict parse first, falls back to a
 * character-level pretty-printer that tolerates invalid / partial JSON.
 */
function bestEffortFormatJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    // fall through
  }

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

export default function Notepad() {
  const { t } = useTranslation();
  const [tabs, setTabs] = usePersistentState<NoteTab[]>(STORAGE_TABS_KEY, [
    { id: 'default', name: t('notepad.untitled') },
  ]);
  const [activeTabId, setActiveTabId] = usePersistentState(STORAGE_ACTIVE_KEY, 'default');
  const [dialogMode, setDialogMode] = useState<'create' | 'rename' | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [submittingDialog, setSubmittingDialog] = useState(false);
  const [form] = Form.useForm<{ name: string }>();
  const nameInputRef = useRef<InputRef>(null);
  const { fontSize, increase, decrease } = useEditorFontSize();
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const [stats, setStats] = useState<EditorStats>({
    chars: 0,
    lines: 1,
    selected: 0,
  });
  const [activeLanguage, setActiveLanguage] = useState('plaintext');

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const activeTabIdRef = useRef(activeTabId);
  const activeContentRef = useRef('');
  const persistTimerRef = useRef<number | null>(null);
  const persistPayloadRef = useRef<{ id: string; value: string }>({
    id: '',
    value: '',
  });
  const statsRafRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);

  const [initialContent] = useState(() => {
    const saved = activeTabId ? (localStorage.getItem(getContentKey(activeTabId)) ?? '') : '';
    activeContentRef.current = saved;
    return saved;
  });

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs]);

  useEffect(() => {
    document.body.classList.add('firewood-notepad-active');

    return () => {
      document.body.classList.remove('firewood-notepad-active');
    };
  }, []);

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
      const { id, value } = persistPayloadRef.current;
      if (id) {
        try {
          localStorage.setItem(getContentKey(id), value);
        } catch {
          // Ignore storage failures and keep the in-memory state usable.
        }
      }
    }
  }, []);

  const schedulePersist = useCallback((id: string, value: string) => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistPayloadRef.current = { id, value };
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      try {
        localStorage.setItem(getContentKey(id), value);
      } catch {
        // Ignore storage failures and keep the in-memory state usable.
      }
    }, PERSIST_DEBOUNCE_MS);
  }, []);

  const updateStats = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const value = model?.getValue() ?? '';
    const selections = editor?.getSelections() ?? [];
    let selected = 0;
    if (model) {
      for (const selection of selections) {
        if (selection.isEmpty()) {
          continue;
        }
        selected += countCodePoints(model.getValueInRange(selection).replace(/\r?\n/g, ''));
      }
    }
    setStats({
      chars: countCodePoints(value),
      lines: model?.getLineCount() ?? 1,
      selected,
    });
  }, []);

  const cancelScheduledStatsUpdate = useCallback(() => {
    if (statsRafRef.current === null) {
      return;
    }

    cancelAnimationFrame(statsRafRef.current);
    statsRafRef.current = null;
  }, []);

  const scheduleStatsUpdate = useCallback(() => {
    if (isComposingRef.current) {
      return;
    }

    if (statsRafRef.current !== null) {
      return;
    }

    statsRafRef.current = requestAnimationFrame(() => {
      statsRafRef.current = null;

      if (isComposingRef.current) {
        return;
      }

      updateStats();
    });
  }, [updateStats]);

  // Resolve activeTabId when it becomes invalid (tab deleted / list emptied).
  useEffect(() => {
    if (tabs.length === 0) {
      if (activeTabId !== '') {
        setActiveTabId('');
      }
      return;
    }

    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId, setActiveTabId]);

  // Load content into the editor whenever the active tab changes.
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
    flushPersist();

    if (!activeTabId) {
      activeContentRef.current = '';
      scheduleStatsUpdate();
      return;
    }

    const saved = localStorage.getItem(getContentKey(activeTabId)) ?? '';
    activeContentRef.current = saved;
    setActiveLanguage(detectLanguage(saved));
    const editor = editorRef.current;
    if (editor && editor.getValue() !== saved) {
      editor.setValue(saved);
    }
    scheduleStatsUpdate();
  }, [activeTabId, flushPersist, scheduleStatsUpdate]);

  // Flush pending writes and cancel the stats rAF on unmount.
  useEffect(
    () => () => {
      flushPersist();
      cancelScheduledStatsUpdate();
    },
    [cancelScheduledStatsUpdate, flushPersist],
  );

  const onContentChange = useCallback(
    (value: string | undefined) => {
      const text = value ?? '';
      activeContentRef.current = text;
      const id = activeTabIdRef.current;
      if (id) {
        schedulePersist(id, text);
      }
      scheduleStatsUpdate();
    },
    [schedulePersist, scheduleStatsUpdate],
  );

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
      const existingTab = tabs.find((tab) => tab.sourcePath === selected);
      const successMessage = existingTab
        ? t('notepad.fileReloaded', { name: fileName })
        : t('notepad.fileOpened', { name: fileName });

      if (existingTab) {
        setTabs((currentTabs) =>
          currentTabs.map((tab) => {
            if (tab.id !== existingTab.id) {
              return tab;
            }

            return {
              id: tab.id,
              name: fileName,
              sourcePath: selected,
              sourceName: fileName,
            };
          }),
        );
        localStorage.setItem(getContentKey(existingTab.id), fileText);
        activeContentRef.current = fileText;
        if (editorRef.current) {
          editorRef.current.setValue(fileText);
        }
        setActiveTabId(existingTab.id);
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
      };

      setTabs((currentTabs) => [...currentTabs, nextTab]);
      localStorage.setItem(getContentKey(id), fileText);
      setActiveTabId(id);
      message.success(successMessage);
    } catch (error) {
      message.error(
        t('notepad.openFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }, [setActiveTabId, setTabs, t, tabs]);

  const handleSaveAs = useCallback(async () => {
    if (!activeTabId) {
      return;
    }

    const suggestedName = getPreferredSaveName(activeTab, t('notepad.untitled'));
    const targetPath = await save({
      defaultPath: activeTab?.sourcePath ?? suggestedName,
    });

    if (!targetPath) {
      return;
    }

    try {
      await writeTextFile(targetPath, activeContentRef.current);
      const fileName = getFileNameFromPath(targetPath);

      setTabs((currentTabs) =>
        currentTabs.map((tab) => {
          if (tab.id !== activeTabId) {
            return tab;
          }

          return {
            id: tab.id,
            name: fileName,
            sourcePath: targetPath,
            sourceName: fileName,
          };
        }),
      );

      message.success(t('notepad.fileSaved', { name: fileName }));
    } catch (error) {
      message.error(
        t('notepad.saveFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }, [activeTab, activeTabId, setTabs, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
      if (!modifierPressed || event.altKey || event.shiftKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'o') {
        event.preventDefault();
        void handleOpenLocalFile();
        return;
      }

      if (key === 's') {
        event.preventDefault();
        void handleSaveAs();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleOpenLocalFile, handleSaveAs, isMac]);

  const tabItems = useMemo(
    () =>
      tabs.map((tab) => ({
        key: tab.id,
        label: (
          <Dropdown
            trigger={['contextMenu']}
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
        setTabs((currentTabs) => currentTabs.map((tab) => (tab.id === editingTabId ? { ...tab, name } : tab)));
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
      localStorage.setItem(getContentKey(id), '');
      setTabs((currentTabs) => [...currentTabs, { id, name }]);
      setActiveTabId(id);

      form.resetFields();
      setEditingTabId(null);
      setDialogMode(null);
    } finally {
      setSubmittingDialog(false);
    }
  }, [dialogMode, editingTabId, form, setActiveTabId, setTabs, submittingDialog, t, tabs]);

  const handleRemoveTab = useCallback(
    (targetKey: string) => {
      flushPersist();
      const currentIndex = tabs.findIndex((tab) => tab.id === targetKey);
      if (currentIndex < 0) {
        return;
      }

      const nextTabs = tabs.filter((tab) => tab.id !== targetKey);
      setTabs(nextTabs);
      localStorage.removeItem(getContentKey(targetKey));

      if (activeTabId === targetKey) {
        const fallback = nextTabs[currentIndex] ?? nextTabs[currentIndex - 1];
        setActiveTabId(fallback?.id ?? '');
      }
    },
    [activeTabId, flushPersist, setActiveTabId, setTabs, tabs],
  );

  const handleEdit = (targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
    if (action === 'add') {
      if (tabs.length >= MAX_TABS) {
        message.warning(t('notepad.maxTabs', { count: MAX_TABS }));
        return;
      }
      const pool = (t('notepadNames', { returnObjects: true }) as string[] | null) ?? [];
      const base = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'Note';
      const suffix = Math.random().toString(36).slice(2, 5);
      form.setFieldsValue({ name: `${base}-${suffix}` });
      setDialogMode('create');
      return;
    }

    if (typeof targetKey === 'string') {
      const tab = tabs.find((item) => item.id === targetKey);
      Modal.confirm({
        title: t('notepad.deleteTab'),
        content: t('notepad.confirmDelete', {
          name: tab?.name ?? t('notepad.untitled'),
        }),
        okText: t('action.delete'),
        okButtonProps: { danger: true },
        cancelText: t('action.cancel'),
        onOk: () => handleRemoveTab(targetKey),
      });
    }
  };

  const handleClear = useCallback(() => {
    if (!activeTabId) {
      return;
    }
    flushPersist();
    localStorage.removeItem(getContentKey(activeTabId));
    activeContentRef.current = '';
    if (editorRef.current) {
      editorRef.current.setValue('');
    }
    scheduleStatsUpdate();
  }, [activeTabId, flushPersist, scheduleStatsUpdate]);

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
        'editor.background': '#FBFBFC',
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
        'editor.lineHighlightBackground': '#F5F6F8',
        'editorIndentGuide.background1': '#E2E8F0',
      },
    });
  }, []);

  const handleEditorMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      isComposingRef.current = false;
      cancelScheduledStatsUpdate();
      monaco.editor.setTheme('firewood-contrast-light');

      // Keep React out of the IME hot path: defer status-bar stats refreshes
      // until composition ends so WKWebView doesn't relayout the active line.
      const compositionStartDisposable = editor.onDidCompositionStart(() => {
        isComposingRef.current = true;
        cancelScheduledStatsUpdate();
      });

      const compositionEndDisposable = editor.onDidCompositionEnd(() => {
        isComposingRef.current = false;
        scheduleStatsUpdate();
      });

      editor.onDidChangeCursorPosition(() => scheduleStatsUpdate());
      editor.onDidChangeCursorSelection(() => scheduleStatsUpdate());
      editor.onDidChangeModelContent(() => scheduleStatsUpdate());

      const mouseDownDisposable = editor.onMouseDown(async (event) => {
        const isModifierPressed = isMac ? event.event.metaKey : event.event.ctrlKey;
        if (!event.event.leftButton || !isModifierPressed) return;
        if (!event.target.position) return;
        const model = editor.getModel();
        if (!model) return;

        const line = model.getLineContent(event.target.position.lineNumber);
        const matched = getUrlAtColumn(line, event.target.position.column);
        if (!matched) return;

        try {
          await openExternal(normalizeUrl(matched));
        } catch (error) {
          message.error(`Failed to open link: ${String(error)}`);
        }
      });

      const formatActionDisposable = editor.addAction({
        id: 'firewood.formatJson',
        label: t('notepad.formatJson'),
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1,
        run: (ed) => {
          const model = ed.getModel();
          if (!model) return;
          const fullRange = model.getFullModelRange();
          const text = model.getValue();
          const formatted = bestEffortFormatJson(text);
          if (formatted !== text) {
            ed.executeEdits('firewood.formatJson', [{ range: fullRange, text: formatted }]);
          }
        },
      });

      editor.onDidDispose(() => {
        isComposingRef.current = false;
        cancelScheduledStatsUpdate();
        editorRef.current = null;
        compositionStartDisposable.dispose();
        compositionEndDisposable.dispose();
        mouseDownDisposable.dispose();
        formatActionDisposable.dispose();
      });

      updateStats();
    },
    [cancelScheduledStatsUpdate, isMac, scheduleStatsUpdate, t, updateStats],
  );

  const baseEditorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      // Wrapped CJK IME input becomes unstable with Monaco's monospace fast-path.
      letterSpacing: 0,
      wrappingStrategy: 'advanced' as const,
      disableMonospaceOptimizations: true,
      cursorStyle: 'line' as const,
      cursorWidth: 3,
      cursorBlinking: 'solid' as const,
      lineNumbers: 'on' as const,
      glyphMargin: false,
      folding: true,
      lineDecorationsWidth: 8,
      lineNumbersMinChars: 3,
      wordWrap: 'on' as const,
      scrollBeyondLastLine: false,
      unicodeHighlight: {
        invisibleCharacters: false,
        ambiguousCharacters: false,
        nonBasicASCII: false,
      },
    }),
    [],
  );

  const { editorClassName, editorOptions } = useMonacoCompat({
    fontSize,
    options: baseEditorOptions,
  });

  const activeExists = tabs.some((tab) => tab.id === activeTabId);
  const effectiveActive = activeExists ? activeTabId : undefined;
  const modalTitle = dialogMode === 'rename' ? t('action.rename') : t('notepad.newTab');
  const modalOkText = dialogMode === 'rename' ? t('action.save') : t('action.ok');

  const statusMeta = (
    <span className="firewood-notepad-statusMeta">
      {activeLanguage !== 'plaintext' && (
        <span className="firewood-notepad-statusLanguage">{activeLanguage.toUpperCase()}</span>
      )}
      <span>
        {t('notepad.chars')} {stats.chars}
      </span>
      <span>
        {t('notepad.line')} {stats.lines}
      </span>
      {stats.selected > 0 && (
        <span>
          {t('notepad.selected')} {stats.selected}
        </span>
      )}
    </span>
  );

  return (
    <ToolLayout title={t('notepad.title')}>
      <div className="firewood-notepad-shell">
        <div className="firewood-notepad-toolbar">
          <Space wrap className="firewood-notepad-toolbarActions">
            <Button
              type="text"
              className="firewood-notepad-ghostButton"
              icon={<FolderOpenOutlined />}
              onClick={() => {
                void handleOpenLocalFile();
              }}
            >
              {t('notepad.openFile')}
            </Button>
            <Button
              type="text"
              className="firewood-notepad-ghostButton"
              icon={<SaveOutlined />}
              onClick={() => {
                void handleSaveAs();
              }}
              disabled={!activeTabId}
            >
              {t('notepad.saveAs')}
            </Button>
          </Space>
          <Button
            type="text"
            className="firewood-notepad-clearButton"
            icon={<DeleteOutlined />}
            title={t('action.clear')}
            aria-label={t('action.clear')}
            onClick={handleClear}
            disabled={!activeTabId}
          />
        </div>

        <Tabs
          className="firewood-notepad-tabs"
          type="editable-card"
          onEdit={handleEdit}
          activeKey={effectiveActive}
          items={tabItems}
          onChange={setActiveTabId}
        />

        <div className="firewood-notepad-workspace">
          <div className={`firewood-notepad-stage${activeTabId ? '' : ' firewood-notepad-stageEmpty'}`}>
            {activeTabId ? (
              <Editor
                className={editorClassName}
                height="100%"
                language={activeLanguage}
                defaultValue={initialContent}
                onChange={onContentChange}
                beforeMount={handleEditorBeforeMount}
                onMount={handleEditorMount}
                theme="firewood-contrast-light"
                options={editorOptions}
              />
            ) : (
              <Empty description={t('notepad.newTab')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
          <StatusBar
            left={statusMeta}
            right={<FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />}
          />
        </div>
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
              {
                required: true,
                whitespace: true,
                message: t('notepad.enterName'),
              },
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
