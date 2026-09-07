import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeleteOutlined, FolderOpenOutlined, SaveOutlined } from '@ant-design/icons';
import { Button, Dropdown, Empty, Form, Input, Modal, Space, Tabs, message } from 'antd';
import type { InputRef, MenuProps } from 'antd';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { openUrl as openExternal } from '@tauri-apps/plugin-opener';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { useTranslation } from 'react-i18next';
import EditorContextMenu from '../../components/EditorContextMenu';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
import ToolLayout from '../../components/ToolLayout';
import { useCodemirror, type CodemirrorLanguage } from '../../hooks/useCodemirror';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';
import { bestEffortFormatJson, countCodePoints, detectLanguage, getUrlAtColumn, normalizeUrl } from './helpers';
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

  return tab?.name.trim() || fallbackName.trim();
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
  const [activeLanguage, setActiveLanguage] = useState<CodemirrorLanguage>('plaintext');
  const [content, setContent] = useState(() =>
    activeTabId ? (localStorage.getItem(getContentKey(activeTabId)) ?? '') : '',
  );

  const activeTabIdRef = useRef(activeTabId);
  const persistTimerRef = useRef<number | null>(null);
  const persistPayloadRef = useRef<{ id: string; value: string }>({
    id: '',
    value: '',
  });
  const statsRafRef = useRef<number | null>(null);
  // Indirection so callbacks passed into useCodemirror can reach the stats scheduler,
  // which itself needs the viewRef returned by the hook.
  const scheduleStatsRef = useRef<() => void>(() => {});

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs]);

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

  const handleEditorUpdate = useCallback((update: ViewUpdate) => {
    if (!update.docChanged && !update.selectionSet) {
      return;
    }

    scheduleStatsRef.current();
  }, []);

  const handleEditorReady = useCallback(() => {
    scheduleStatsRef.current();
  }, []);

  const onContentChange = useCallback(
    (value: string) => {
      setContent(value);
      // Re-detect on every change (typing, paste, and the format-JSON context action
      // all flow through here); otherwise a JSON body pasted into a plaintext tab
      // never gains highlighting/folding even after formatting.
      setActiveLanguage(detectLanguage(value));
      const id = activeTabIdRef.current;
      if (id) {
        schedulePersist(id, value);
      }
    },
    [schedulePersist],
  );

  const urlClickExtension = useMemo(
    () =>
      EditorView.domEventHandlers({
        mousedown: (event, view) => {
          if (event.button !== 0) return;
          const isModifierPressed = isMac ? event.metaKey : event.ctrlKey;
          if (!isModifierPressed) return;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos === null) return;
          const line = view.state.doc.lineAt(pos);
          const matched = getUrlAtColumn(line.text, pos - line.from + 1);
          if (!matched) return;
          event.preventDefault();
          void openExternal(normalizeUrl(matched)).catch((error) => {
            message.error(`Failed to open link: ${String(error)}`);
          });
        },
      }),
    [isMac],
  );

  const { hostRef, viewRef } = useCodemirror({
    value: content,
    onChange: onContentChange,
    variant: 'code',
    language: activeLanguage,
    fontSize,
    extensions: [urlClickExtension],
    onUpdate: handleEditorUpdate,
    onReady: handleEditorReady,
  });

  const updateStats = useCallback(() => {
    const view = viewRef.current;
    if (!view) {
      setStats({ chars: 0, lines: 1, selected: 0 });
      return;
    }

    const { doc, selection } = view.state;
    let selected = 0;
    for (const range of selection.ranges) {
      if (range.empty) {
        continue;
      }
      selected += countCodePoints(doc.sliceString(range.from, range.to).replace(/\r?\n/g, ''));
    }

    setStats({
      chars: countCodePoints(doc.toString()),
      lines: doc.lines,
      selected,
    });
  }, [viewRef]);

  const cancelScheduledStatsUpdate = useCallback(() => {
    if (statsRafRef.current === null) {
      return;
    }

    cancelAnimationFrame(statsRafRef.current);
    statsRafRef.current = null;
  }, []);

  const scheduleStatsUpdate = useCallback(() => {
    if (statsRafRef.current !== null) {
      return;
    }

    statsRafRef.current = requestAnimationFrame(() => {
      statsRafRef.current = null;
      updateStats();
    });
  }, [updateStats]);

  useEffect(() => {
    scheduleStatsRef.current = scheduleStatsUpdate;
  }, [scheduleStatsUpdate]);

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

  // Load content into the editor whenever the active tab changes. The reload happens during
  // render (React's "adjust state when a value changes" pattern) so no frame ever shows the
  // outgoing tab's content under the new tab; the effect below handles the side effects.
  const [loadedTabId, setLoadedTabId] = useState(activeTabId);
  if (loadedTabId !== activeTabId) {
    setLoadedTabId(activeTabId);
    if (activeTabId) {
      const saved = localStorage.getItem(getContentKey(activeTabId)) ?? '';
      setContent(saved);
      setActiveLanguage(detectLanguage(saved));
    } else {
      setContent('');
      setActiveLanguage('plaintext');
    }
  }

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
    // Flush the outgoing tab's pending debounced writes before the new tab's edits can
    // replace the pending payload.
    flushPersist();
    // External value pushes are marked applyingExternalValue in useCodemirror and skip the
    // updateListener, so the stats bar must be refreshed explicitly on tab switches.
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
        // Supersede any pending debounced write so stale text cannot overwrite the reload.
        schedulePersist(existingTab.id, fileText);
        setContent(fileText);
        setActiveLanguage(detectLanguage(fileText));
        setActiveTabId(existingTab.id);
        scheduleStatsUpdate();
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
  }, [schedulePersist, scheduleStatsUpdate, setActiveTabId, setTabs, t, tabs]);

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
      await writeTextFile(targetPath, content);
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
  }, [activeTab, activeTabId, content, setTabs, t]);

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

  const runFormatJson = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const formatted = bestEffortFormatJson(text);
    if (formatted !== text) {
      view.dispatch({ changes: { from: 0, to: text.length, insert: formatted } });
    }
  }, [viewRef]);

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
    setContent('');
    setActiveLanguage('plaintext');
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

  const activeExists = tabs.some((tab) => tab.id === activeTabId);
  const effectiveActive = activeExists ? activeTabId : undefined;
  const modalTitle = dialogMode === 'rename' ? t('action.rename') : t('notepad.newTab');
  const modalOkText = dialogMode === 'rename' ? t('action.save') : t('action.ok');

  const contextMenuExtraItems: MenuProps['items'] = useMemo(
    () => [{ type: 'divider' }, { key: 'formatJson', label: t('notepad.formatJson') }],
    [t],
  );

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
    <ToolLayout>
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

        <div className={`firewood-notepad-stage${activeTabId ? '' : ' firewood-notepad-stageEmpty'}`}>
          <EditorContextMenu
            viewRef={viewRef}
            hasSelection={stats.selected > 0}
            extraItems={contextMenuExtraItems}
            onExtraItemClick={(key) => {
              if (key === 'formatJson') {
                runFormatJson();
              }
            }}
          >
            {/*
              The host div must stay mounted for the whole Notepad lifetime: the EditorView
              created by useCodemirror is parented to this node once, so hiding it (instead
              of unmounting) keeps the view valid when all tabs are removed.
            */}
            <div ref={hostRef} className="fw-cm-host" style={activeTabId ? undefined : { display: 'none' }} />
          </EditorContextMenu>
          {!activeTabId && <Empty description={t('notepad.newTab')} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </div>
        <StatusBar
          left={statusMeta}
          right={<FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />}
        />
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
