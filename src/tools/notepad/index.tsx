import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react';
import { Button, Dropdown, Empty, Form, Input, Modal, Progress, Space, Tabs, message } from 'antd';
import { BgColorsOutlined, BookOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined, LeftOutlined, RightOutlined, SaveOutlined } from '@ant-design/icons';
import type { InputRef } from 'antd';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { openUrl as openExternal } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import FontSizeControl from '../../components/FontSizeControl';
import StatusBar from '../../components/StatusBar';
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
  lineNumber: number;
  startOffset: number;
}

interface ReaderChapter {
  key: string;
  title: string;
  lineNumber: number;
  startOffset: number;
}

interface ReaderBookmark {
  id: string;
  label: string;
  chapterKey: string | null;
  scrollTop: number;
  progress: number;
  createdAt: number;
}

function getContentKey(tabId: string) {
  return `tool:notepad:content:${tabId}`;
}

function getReaderScrollKey(tabId: string) {
  return `tool:notepad:reader-scroll:${tabId}`;
}

function readReaderScrollPosition(tabId: string) {
  const raw = localStorage.getItem(getReaderScrollKey(tabId));
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function persistReaderScrollPosition(tabId: string, scrollTop: number) {
  localStorage.setItem(getReaderScrollKey(tabId), String(Math.max(0, Math.round(scrollTop))));
}

function getReaderBookmarkStorageKey(tab: NoteTab | null) {
  const identity = tab?.sourcePath ?? tab?.sourceName ?? tab?.name ?? tab?.id ?? 'default';
  return `tool:notepad:reader-bookmarks:${encodeURIComponent(identity)}`;
}

function readReaderBookmarks(tab: NoteTab | null): ReaderBookmark[] {
  try {
    const raw = localStorage.getItem(getReaderBookmarkStorageKey(tab));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is ReaderBookmark => (
      item
      && typeof item.id === 'string'
      && typeof item.label === 'string'
      && (typeof item.chapterKey === 'string' || item.chapterKey === null)
      && typeof item.scrollTop === 'number'
      && typeof item.progress === 'number'
      && typeof item.createdAt === 'number'
    ));
  } catch {
    return [];
  }
}

function persistReaderBookmarks(tab: NoteTab | null, bookmarks: ReaderBookmark[]) {
  localStorage.setItem(getReaderBookmarkStorageKey(tab), JSON.stringify(bookmarks));
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

function getPreferredSaveName(tab: NoteTab | null, fallbackName: string) {
  if (tab?.sourceName?.trim()) {
    return tab.sourceName.trim();
  }

  return tab?.name?.trim() || fallbackName.trim();
}

function getReaderVariantForName(fileName: string): NoteTab['readerVariant'] {
  const baseName = stripFileExtension(fileName).trim();
  const lowerBaseName = baseName.toLowerCase();
  return lowerBaseName.includes(ABYSS_TRIGGER_WORD) ? 'abyss' : undefined;
}

function buildReaderBlocks(text: string): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  const linePattern = /([^\r\n]*)(\r\n|\n|$)/g;
  let lineNumber = 0;

  for (const match of text.matchAll(linePattern)) {
    const rawLine = match[1] ?? '';
    const lineBreak = match[2] ?? '';
    if (!rawLine && !lineBreak) {
      break;
    }

    lineNumber += 1;
    const trimmed = rawLine.trim();
    if (trimmed) {
      const leadingWhitespace = rawLine.length - rawLine.trimStart().length;
      const startOffset = (match.index ?? 0) + leadingWhitespace;
      blocks.push({
        key: `${lineNumber}-${trimmed.slice(0, 16)}`,
        kind: NOVEL_CHAPTER_RE.test(trimmed) ? 'heading' : 'paragraph',
        text: trimmed,
        lineNumber,
        startOffset,
      });
    }

    if (!lineBreak) {
      break;
    }
  }

  return blocks;
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

function findPlainTextMatchOffsets(text: string, query: string) {
  if (!query) {
    return [] as number[];
  }

  const offsets: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= text.length - query.length) {
    const matchIndex = text.indexOf(query, searchFrom);
    if (matchIndex < 0) {
      break;
    }

    offsets.push(matchIndex);
    searchFrom = matchIndex + Math.max(query.length, 1);
  }

  return offsets;
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
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const readerShellRef = useRef<HTMLDivElement | null>(null);
  const readerHeadingRefs = useRef<Record<string, HTMLHeadingElement | null>>({});
  const readerScrollPositionsRef = useRef<Record<string, number>>({});
  const { fontSize, increase, decrease } = useEditorFontSize();
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const [selectedCharCount, setSelectedCharCount] = useState(0);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [sourceReplaceQuery, setSourceReplaceQuery] = useState('');
  const [sourceActiveMatchIndex, setSourceActiveMatchIndex] = useState<number | null>(null);
  const [readerProgress, setReaderProgress] = useState(0);
  const [currentChapterKey, setCurrentChapterKey] = useState<string | null>(null);
  const [readerBookmarks, setReaderBookmarks] = useState<ReaderBookmark[]>([]);
  const [readerBookmarkScopeKey, setReaderBookmarkScopeKey] = useState<string | null>(null);
  const [isReaderTocCollapsed, setIsReaderTocCollapsed] = usePersistentState<boolean>('tool:notepad:reader-toc-collapsed', false);
  const [isReaderRailHidden, setIsReaderRailHidden] = usePersistentState<boolean>('tool:notepad:reader-rail-hidden', false);
  const [readerThemeId, setReaderThemeId] = usePersistentState<ReaderThemeId>(STORAGE_READER_THEME_KEY, 'parchment');
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const activeReaderTheme = READER_THEME_CONFIG[readerThemeId] ?? READER_THEME_CONFIG.parchment;
  const readerBookmarkStorageKey = useMemo(
    () => (activeTab?.readerVariant === 'abyss' ? getReaderBookmarkStorageKey(activeTab) : null),
    [activeTab],
  );

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
      const readerVariant = getReaderVariantForName(fileName);

      setTabs((currentTabs) => currentTabs.map((tab) => {
        if (tab.id !== activeTabId) {
          return tab;
        }

        return {
          ...tab,
          name: fileName,
          sourcePath: targetPath,
          sourceName: fileName,
          readerVariant,
          viewMode: readerVariant ? 'reader' : tab.viewMode,
        };
      }));

      message.success(t('notepad.fileSaved', { name: fileName }));
    } catch (error) {
      message.error(t('notepad.saveFailed', {
        error: error instanceof Error ? error.message : String(error),
      }));
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
    localStorage.removeItem(getReaderScrollKey(targetKey));
    delete readerScrollPositionsRef.current[targetKey];

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

  const updateNativeSelectionStats = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) {
      setSelectedCharCount(0);
      return;
    }

    const selectionStart = element.selectionStart ?? 0;
    const selectionEnd = element.selectionEnd ?? selectionStart;
    if (selectionEnd <= selectionStart) {
      setSelectedCharCount(0);
      return;
    }

    setSelectedCharCount(
      getCharacterCountWithoutLineBreaks(element.value.slice(selectionStart, selectionEnd)),
    );
  }, []);

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
  const totalCharCount = useMemo(() => getCharacterCount(content), [content]);
  const totalLineCount = useMemo(() => (content ? content.split(/\r?\n/).length : 1), [content]);
  const showReaderView = activeTab?.readerVariant === 'abyss' && activeTab.viewMode !== 'editor';
  const showAbyssSourceView = activeTab?.readerVariant === 'abyss' && activeTab.viewMode === 'editor';
  const readerBlocks = useMemo(
    () => (activeTab?.readerVariant === 'abyss' ? buildReaderBlocks(content) : []),
    [activeTab?.readerVariant, content],
  );
  const readerChapters = useMemo<ReaderChapter[]>(
    () => readerBlocks
      .filter((block) => block.kind === 'heading')
      .map((block) => ({
        key: block.key,
        title: block.text,
        lineNumber: block.lineNumber,
        startOffset: block.startOffset,
      })),
    [readerBlocks],
  );
  const activeChapter = useMemo(
    () => readerChapters.find((chapter) => chapter.key === currentChapterKey) ?? readerChapters[0] ?? null,
    [currentChapterKey, readerChapters],
  );
  const sourceMatchOffsets = useMemo(
    () => findPlainTextMatchOffsets(content, sourceSearchQuery),
    [content, sourceSearchQuery],
  );
  const sourceMatchLabel = useMemo(() => {
    if (!sourceSearchQuery) {
      return '';
    }

    if (sourceMatchOffsets.length === 0) {
      return t('notepad.noSearchResults');
    }

    const currentIndex = sourceActiveMatchIndex !== null ? sourceActiveMatchIndex + 1 : 0;
    return t('notepad.searchMatchCount', {
      current: currentIndex,
      total: sourceMatchOffsets.length,
    });
  }, [sourceActiveMatchIndex, sourceMatchOffsets.length, sourceSearchQuery, t]);
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

  const syncReaderProgress = useCallback((shell: HTMLDivElement) => {
    const maxScroll = Math.max(shell.scrollHeight - shell.clientHeight, 0);
    const nextProgress = maxScroll > 0 ? (shell.scrollTop / maxScroll) * 100 : 0;
    setReaderProgress(nextProgress);

    if (readerChapters.length === 0) {
      setCurrentChapterKey(null);
      return;
    }

    const shellTop = shell.getBoundingClientRect().top;
    const probeTop = shellTop + 96;
    let resolvedChapterKey = readerChapters[0]?.key ?? null;

    for (const chapter of readerChapters) {
      const heading = readerHeadingRefs.current[chapter.key];
      if (!heading) {
        continue;
      }

      if (heading.getBoundingClientRect().top <= probeTop) {
        resolvedChapterKey = chapter.key;
      } else {
        break;
      }
    }

    setCurrentChapterKey(resolvedChapterKey);
  }, [readerChapters]);

  const focusSourceRange = useCallback((startOffset: number, length: number) => {
    const textarea = sourceTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(startOffset, startOffset + length);
    updateNativeSelectionStats(textarea);
  }, [updateNativeSelectionStats]);

  const jumpToSourceOffset = useCallback((startOffset: number, length = 0) => {
    focusSourceRange(startOffset, length);
  }, [focusSourceRange]);

  const navigateSourceMatch = useCallback((direction: 'next' | 'prev') => {
    if (!sourceSearchQuery) {
      message.info(t('notepad.enterSearchKeyword'));
      return;
    }

    if (sourceMatchOffsets.length === 0) {
      message.info(t('notepad.noSearchResults'));
      setSourceActiveMatchIndex(null);
      return;
    }

    const textarea = sourceTextareaRef.current;
    const cursorStart = textarea?.selectionStart ?? 0;
    const cursorEnd = textarea?.selectionEnd ?? 0;

    let targetIndex = -1;
    if (direction === 'next') {
      targetIndex = sourceMatchOffsets.findIndex((offset) => offset >= cursorEnd);
    } else {
      for (let index = sourceMatchOffsets.length - 1; index >= 0; index -= 1) {
        if (sourceMatchOffsets[index] < cursorStart) {
          targetIndex = index;
          break;
        }
      }
    }

    const resolvedIndex = targetIndex >= 0
      ? targetIndex
      : direction === 'next'
        ? 0
        : sourceMatchOffsets.length - 1;

    focusSourceRange(sourceMatchOffsets[resolvedIndex], sourceSearchQuery.length);
    setSourceActiveMatchIndex(resolvedIndex);
  }, [focusSourceRange, sourceMatchOffsets, sourceSearchQuery, t]);

  const replaceCurrentSourceMatch = useCallback(() => {
    if (!sourceSearchQuery) {
      message.info(t('notepad.enterSearchKeyword'));
      return;
    }

    if (sourceMatchOffsets.length === 0) {
      message.info(t('notepad.noSearchResults'));
      return;
    }

    const textarea = sourceTextareaRef.current;
    if (!textarea) {
      return;
    }

    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const selectedText = content.slice(selectionStart, selectionEnd);
    const matchesSelection = selectedText === sourceSearchQuery;
    const replaceFrom = matchesSelection
      ? selectionStart
      : sourceMatchOffsets.find((offset) => offset >= selectionEnd) ?? sourceMatchOffsets[0];

    const nextContent = `${content.slice(0, replaceFrom)}${sourceReplaceQuery}${content.slice(replaceFrom + sourceSearchQuery.length)}`;
    onContentChange(nextContent);

    window.requestAnimationFrame(() => {
      focusSourceRange(replaceFrom, sourceReplaceQuery.length);
    });
  }, [content, focusSourceRange, onContentChange, sourceMatchOffsets, sourceReplaceQuery, sourceSearchQuery, t]);

  const replaceAllSourceMatches = useCallback(() => {
    if (!sourceSearchQuery) {
      message.info(t('notepad.enterSearchKeyword'));
      return;
    }

    if (sourceMatchOffsets.length === 0) {
      message.info(t('notepad.noSearchResults'));
      return;
    }

    onContentChange(content.split(sourceSearchQuery).join(sourceReplaceQuery));
    setSourceActiveMatchIndex(null);
    message.success(t('notepad.replaceAllDone', { count: sourceMatchOffsets.length }));
  }, [content, onContentChange, sourceMatchOffsets.length, sourceReplaceQuery, sourceSearchQuery, t]);

  const scrollReaderToTop = useCallback((scrollTop: number) => {
    const shell = readerShellRef.current;
    if (!shell) {
      return;
    }

    shell.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
  }, []);

  const scrollReaderToChapter = useCallback((chapterKey: string) => {
    const shell = readerShellRef.current;
    const heading = readerHeadingRefs.current[chapterKey];
    if (!shell || !heading) {
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const nextScrollTop = shell.scrollTop + (headingRect.top - shellRect.top) - 24;
    shell.scrollTo({ top: Math.max(0, nextScrollTop), behavior: 'smooth' });
  }, []);

  const addReaderBookmark = useCallback(() => {
    if (!showReaderView || !activeTab) {
      return;
    }

    const shell = readerShellRef.current;
    if (!shell) {
      return;
    }

    const bookmarkLabel = activeChapter?.title ?? activeTab.name;
    const nextBookmark: ReaderBookmark = {
      id: createTabId(),
      label: bookmarkLabel,
      chapterKey: activeChapter?.key ?? null,
      scrollTop: shell.scrollTop,
      progress: readerProgress,
      createdAt: Date.now(),
    };

    setReaderBookmarks((currentBookmarks) => [nextBookmark, ...currentBookmarks].slice(0, 24));
    message.success(t('notepad.bookmarkAdded'));
  }, [activeChapter, activeTab, readerProgress, showReaderView, t]);

  const removeReaderBookmark = useCallback((bookmarkId: string) => {
    setReaderBookmarks((currentBookmarks) => currentBookmarks.filter((bookmark) => bookmark.id !== bookmarkId));
  }, []);

  useLayoutEffect(() => {
    if (!showReaderView || !activeTabId) {
      return;
    }

    const shell = readerShellRef.current;
    if (!shell) {
      return;
    }

    const nextScrollTop = readerScrollPositionsRef.current[activeTabId] ?? readReaderScrollPosition(activeTabId);
    readerScrollPositionsRef.current[activeTabId] = nextScrollTop;

    const restoreId = window.requestAnimationFrame(() => {
      if (readerShellRef.current === shell) {
        shell.scrollTop = nextScrollTop;
        syncReaderProgress(shell);
      }
    });

    return () => {
      window.cancelAnimationFrame(restoreId);
    };
  }, [activeTabId, readerBlocks.length, showReaderView, syncReaderProgress]);

  useEffect(() => {
    if (!showReaderView || !activeTabId) {
      return;
    }

    const shell = readerShellRef.current;
    if (!shell) {
      return;
    }

    const handleScroll = () => {
      readerScrollPositionsRef.current[activeTabId] = shell.scrollTop;
      persistReaderScrollPosition(activeTabId, shell.scrollTop);
      syncReaderProgress(shell);
    };

    shell.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      shell.removeEventListener('scroll', handleScroll);
      const lastScrollTop = readerScrollPositionsRef.current[activeTabId] ?? shell.scrollTop;
      readerScrollPositionsRef.current[activeTabId] = lastScrollTop;
      persistReaderScrollPosition(activeTabId, lastScrollTop);
    };
  }, [activeTabId, showReaderView, syncReaderProgress]);

  useEffect(() => {
    if (!readerBookmarkStorageKey || activeTab?.readerVariant !== 'abyss') {
      setReaderBookmarks([]);
      setReaderBookmarkScopeKey(null);
      return;
    }

    setReaderBookmarks(readReaderBookmarks(activeTab));
    setReaderBookmarkScopeKey(readerBookmarkStorageKey);
  }, [activeTab, readerBookmarkStorageKey]);

  useEffect(() => {
    if (!readerBookmarkStorageKey || activeTab?.readerVariant !== 'abyss') {
      return;
    }

    if (readerBookmarkScopeKey !== readerBookmarkStorageKey) {
      return;
    }

    persistReaderBookmarks(activeTab, readerBookmarks);
  }, [activeTab, readerBookmarkScopeKey, readerBookmarkStorageKey, readerBookmarks]);

  useEffect(() => {
    setSourceSearchQuery('');
    setSourceReplaceQuery('');
    setSourceActiveMatchIndex(null);
  }, [activeTabId]);

  useEffect(() => {
    setSourceActiveMatchIndex(null);
  }, [sourceSearchQuery]);

  useEffect(() => {
    setSelectedCharCount(0);
  }, [activeTabId, showAbyssSourceView, showReaderView]);

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

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    monaco.editor.setTheme('firewood-contrast-light');

    const updateCursorStats = () => {
      const model = editor.getModel();
      if (!model) {
        setSelectedCharCount(0);
        return;
      }

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
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', ui-monospace, monospace",
    letterSpacing: 0.5,
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
    unicodeHighlight: {
      invisibleCharacters: false,
      ambiguousCharacters: false,
      nonBasicASCII: false,
    },
  };

  const statusMeta = showReaderView ? (
    <span className="firewood-notepad-statusMeta">
      <span className="firewood-notepad-statusBadge">{t('notepad.readerBadge')}</span>
      <span>{activeTab?.name ?? t('notepad.untitled')}</span>
      <span>{t('notepad.readingProgress')} {Math.round(readerProgress)}%</span>
      {activeChapter && <span>{t('notepad.currentChapter')} {activeChapter.title}</span>}
    </span>
  ) : (
    <span className="firewood-notepad-statusMeta">
      {detectedLanguage !== 'plaintext' && (
        <span className="firewood-notepad-statusLanguage">{detectedLanguage.toUpperCase()}</span>
      )}
      <span>{t('notepad.chars')} {totalCharCount}</span>
      <span>{t('notepad.line')} {totalLineCount}</span>
      {showAbyssSourceView && sourceMatchLabel && <span>{sourceMatchLabel}</span>}
      {selectedCharCount > 0 && <span>{t('notepad.selected')} {selectedCharCount}</span>}
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
            {activeTab?.readerVariant === 'abyss' && (
              <>
                <Button
                  type="text"
                  className="firewood-notepad-ghostButton"
                  icon={showReaderView ? <EditOutlined /> : <BookOutlined />}
                  onClick={handleToggleReaderView}
                >
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
                  <Button
                    type="text"
                    className="firewood-notepad-ghostButton"
                    icon={<BgColorsOutlined />}
                  >
                    {t('notepad.readerTheme')}: {t(activeReaderTheme.labelKey)}
                  </Button>
                </Dropdown>
              </>
            )}
          </Space>
          <Button
            type="text"
            className="firewood-notepad-clearButton"
            icon={<DeleteOutlined />}
            title={t('action.clear')}
            aria-label={t('action.clear')}
            onClick={() => {
              if (!activeTabId) return;
              localStorage.removeItem(getContentKey(activeTabId));
              setContent('');
            }}
            disabled={!activeTabId}
          />
        </div>

        <Tabs
          className="firewood-notepad-tabs"
          type="editable-card"
          hideAdd={false}
          onEdit={handleEdit}
          activeKey={effectiveActive}
          items={tabItems}
          onChange={setActiveTabId}
        />

        <div className="firewood-notepad-workspace">
          <div className={`firewood-notepad-stage${activeTabId ? '' : ' firewood-notepad-stageEmpty'}`}>
            {activeTabId ? (
              showReaderView ? (
                <div ref={readerShellRef} className="firewood-notepad-readerShell" style={readerThemeStyle}>
                  <div className="firewood-notepad-readerLayout">
                    <div className="firewood-notepad-readerMain">
                      <div className="firewood-notepad-readerPaper">
                        <div className="firewood-notepad-readerBanner">{t('notepad.readerBadge')}</div>
                        {readerBlocks.length > 0 ? (
                          readerBlocks.map((block) => (
                            block.kind === 'heading' ? (
                              <h3
                                key={block.key}
                                ref={(node) => {
                                  readerHeadingRefs.current[block.key] = node;
                                }}
                                className="firewood-notepad-readerHeading"
                              >
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

                    <div className={`firewood-notepad-readerRailSlot${isReaderRailHidden ? ' is-hidden' : ''}`}>
                      <Button
                        type="text"
                        className="firewood-notepad-readerRailVisibilityToggle"
                        icon={isReaderRailHidden ? <LeftOutlined /> : <RightOutlined />}
                        title={isReaderRailHidden ? t('notepad.showReaderRail') : t('notepad.hideReaderRail')}
                        aria-label={isReaderRailHidden ? t('notepad.showReaderRail') : t('notepad.hideReaderRail')}
                        onClick={() => {
                          setIsReaderRailHidden((currentValue) => !currentValue);
                        }}
                      />

                      <div className="firewood-notepad-readerRailViewport" aria-hidden={isReaderRailHidden}>
                        <aside className="firewood-notepad-readerRail">
                          <section className="firewood-notepad-readerPanel">
                            <div className="firewood-notepad-readerPanelHeader">
                              <span>{t('notepad.readingProgress')}</span>
                              <Button type="text" className="firewood-notepad-ghostButton" onClick={addReaderBookmark}>
                                {t('notepad.addBookmark')}
                              </Button>
                            </div>
                            <Progress percent={Math.round(readerProgress)} size="small" showInfo={false} strokeColor="#ff7a45" />
                            <div className="firewood-notepad-readerPanelMeta">
                              <span>{Math.round(readerProgress)}%</span>
                              <span>{activeChapter?.title ?? t('notepad.noChapters')}</span>
                            </div>
                          </section>

                          <section className="firewood-notepad-readerPanel firewood-notepad-readerTocPanel">
                            <div className="firewood-notepad-readerPanelHeader">
                              <span>{t('notepad.chapterToc')}</span>
                              <Button
                                type="text"
                                className="firewood-notepad-readerPanelToggle"
                                aria-expanded={!isReaderTocCollapsed}
                                onClick={() => {
                                  setIsReaderTocCollapsed((currentValue) => !currentValue);
                                }}
                              >
                                {isReaderTocCollapsed ? t('notepad.expandToc') : t('notepad.collapseToc')}
                              </Button>
                            </div>
                            {!isReaderTocCollapsed && (
                              <div className="firewood-notepad-readerList">
                                {readerChapters.length > 0 ? (
                                  readerChapters.map((chapter) => (
                                    <button
                                      key={chapter.key}
                                      type="button"
                                      className={`firewood-notepad-readerListItem${chapter.key === activeChapter?.key ? ' is-active' : ''}`}
                                      onClick={() => {
                                        scrollReaderToChapter(chapter.key);
                                      }}
                                    >
                                      {chapter.title}
                                    </button>
                                  ))
                                ) : (
                                  <div className="firewood-notepad-readerPanelEmpty">{t('notepad.noChapters')}</div>
                                )}
                              </div>
                            )}
                          </section>

                          <section className="firewood-notepad-readerPanel">
                            <div className="firewood-notepad-readerPanelHeader">
                              <span>{t('notepad.bookmarks')}</span>
                            </div>
                            <div className="firewood-notepad-readerList">
                              {readerBookmarks.length > 0 ? (
                                readerBookmarks.map((bookmark) => (
                                  <div key={bookmark.id} className="firewood-notepad-readerBookmarkItem">
                                    <button
                                      type="button"
                                      className="firewood-notepad-readerBookmarkButton"
                                      onClick={() => {
                                        scrollReaderToTop(bookmark.scrollTop);
                                      }}
                                    >
                                      <span>{bookmark.label}</span>
                                      <span className="firewood-notepad-readerBookmarkMeta">{Math.round(bookmark.progress)}%</span>
                                    </button>
                                    <Button
                                      type="text"
                                      className="firewood-notepad-readerBookmarkDelete"
                                      icon={<DeleteOutlined />}
                                      title={t('action.delete')}
                                      aria-label={t('action.delete')}
                                      onClick={() => {
                                        removeReaderBookmark(bookmark.id);
                                      }}
                                    />
                                  </div>
                                ))
                              ) : (
                                <div className="firewood-notepad-readerPanelEmpty">{t('notepad.noBookmarks')}</div>
                              )}
                            </div>
                          </section>
                        </aside>
                      </div>
                    </div>
                  </div>
                </div>
              ) : showAbyssSourceView ? (
                <div className="firewood-notepad-sourceShell">
                  <div className="firewood-notepad-sourceTools">
                    <Input
                      value={sourceSearchQuery}
                      placeholder={t('notepad.searchPlaceholder')}
                      onChange={(event) => {
                        setSourceSearchQuery(event.target.value);
                      }}
                      onPressEnter={(event) => {
                        if (event.shiftKey) {
                          navigateSourceMatch('prev');
                          return;
                        }

                        navigateSourceMatch('next');
                      }}
                    />
                    <Input
                      value={sourceReplaceQuery}
                      placeholder={t('notepad.replacePlaceholder')}
                      onChange={(event) => {
                        setSourceReplaceQuery(event.target.value);
                      }}
                      onPressEnter={() => {
                        replaceCurrentSourceMatch();
                      }}
                    />
                    <Space wrap>
                      <Button type="text" className="firewood-notepad-ghostButton" onClick={() => navigateSourceMatch('prev')}>
                        {t('notepad.findPrev')}
                      </Button>
                      <Button type="text" className="firewood-notepad-ghostButton" onClick={() => navigateSourceMatch('next')}>
                        {t('notepad.findNext')}
                      </Button>
                      <Button type="text" className="firewood-notepad-ghostButton" onClick={replaceCurrentSourceMatch}>
                        {t('notepad.replaceOne')}
                      </Button>
                      <Button type="text" className="firewood-notepad-ghostButton" onClick={replaceAllSourceMatches}>
                        {t('notepad.replaceAll')}
                      </Button>
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: readerChapters.map((chapter) => ({ key: chapter.key, label: chapter.title })),
                          onClick: ({ key }) => {
                            const chapter = readerChapters.find((item) => item.key === key);
                            if (chapter) {
                              jumpToSourceOffset(chapter.startOffset, chapter.title.length);
                            }
                          },
                        }}
                        disabled={readerChapters.length === 0}
                      >
                        <Button type="text" className="firewood-notepad-ghostButton">
                          {t('notepad.chapterJump')}
                        </Button>
                      </Dropdown>
                    </Space>
                  </div>
                  <textarea
                    ref={sourceTextareaRef}
                    value={content}
                    onChange={(event) => {
                      onContentChange(event.target.value);
                      updateNativeSelectionStats(event.currentTarget);
                    }}
                    onSelect={(event) => {
                      updateNativeSelectionStats(event.currentTarget);
                    }}
                    onKeyUp={(event) => {
                      updateNativeSelectionStats(event.currentTarget);
                    }}
                    onMouseUp={(event) => {
                      updateNativeSelectionStats(event.currentTarget);
                    }}
                    className="firewood-notepad-sourceTextarea"
                    style={{ fontSize }}
                    spellCheck={false}
                  />
                </div>
              ) : (
                <Editor
                  height="100%"
                  language={detectedLanguage}
                  value={content}
                  onChange={(value) => onContentChange(value ?? '')}
                  beforeMount={handleEditorBeforeMount}
                  onMount={handleEditorMount}
                  theme="firewood-contrast-light"
                  options={editorOptions}
                />
              )
            ) : (
              <Empty
                description={t('notepad.newTab')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
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
