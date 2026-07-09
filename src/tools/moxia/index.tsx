import { useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown, Spin, message } from 'antd';
import type { MenuProps } from 'antd';
import { BulbOutlined, SettingOutlined } from '@ant-design/icons';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import ToolLayout from '../../components/ToolLayout';
import StatusBar from '../../components/StatusBar';
import FontSizeControl from '../../components/FontSizeControl';
import { useMoxiaFontSize } from '../../hooks/useMoxiaFontSize';
import { useMoxiaSettings } from '../../hooks/useMoxiaSettings';
import { useMoxiaStore } from './store';
import { GENRES } from './enums';
import { getLastBookPath, extractBookPathFromError, removeLibraryEntry, clearLastBookPath } from './library';
import LeftPanel from './components/LeftPanel';
import CommandPalette from './components/CommandPalette';
import type { CommandPaletteCommand } from './components/CommandPalette';
import ConfirmPopup from './components/ConfirmPopup';
import EmptyPage from './pages/EmptyPage';
import BookOverviewPage from './pages/BookOverviewPage';
import ChapterEditorPage from './pages/ChapterEditorPage';
import CharacterEditorPage from './pages/CharacterEditorPage';
import SettingsPopup from './dialogs/SettingsPopup';
import PromptInputPopup from './dialogs/PromptInputPopup';
import PromptResultPopup from './dialogs/PromptResultPopup';
import styles from './Moxia.module.css';

const MOXIA_FILTER = {
  name: 'moxia',
  extensions: ['moxia'],
};

export default function Moxia() {
  const { t } = useTranslation();
  const { fontSize, increase, decrease, setFontSize } = useMoxiaFontSize();
  const { contentMaxWidth, setContentMaxWidth, widthMin, widthMax, widthStep } = useMoxiaSettings();

  const {
    library,
    bookPath,
    bookMeta,
    page,
    loading,
    error,
    refreshLibraryFromDisk,
    openBook,
    createBook,
    switchBook,
    closeBook,
    setError,
  } = useMoxiaStore(
    useShallow((s) => ({
      library: s.library,
      bookPath: s.bookPath,
      bookMeta: s.bookMeta,
      page: s.page,
      loading: s.loading,
      error: s.error,
      refreshLibraryFromDisk: s.refreshLibraryFromDisk,
      openBook: s.openBook,
      createBook: s.createBook,
      switchBook: s.switchBook,
      closeBook: s.closeBook,
      setError: s.setError,
    })),
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promptInputOpen, setPromptInputOpen] = useState(false);
  const [promptResult, setPromptResult] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [missingBook, setMissingBook] = useState<{ path: string; title: string } | null>(null);

  // Surface backend errors. File-not-found errors route to a removal-confirm
  // popup (IDEA-style) instead of a generic toast; everything else toasts.
  useEffect(() => {
    if (!error) return;
    const missingPath = extractBookPathFromError(error);
    if (missingPath) {
      const entry = useMoxiaStore.getState().library.find((it) => it.path === missingPath);
      // missingBook must persist after error is cleared below so the popup stays
      // open until the user confirms/cancels — hence setState in effect is required.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMissingBook({ path: missingPath, title: entry?.title ?? '' });
    } else {
      void message.error(error);
    }
    setError(null);
  }, [error, setError]);

  // On mount: load the library and try to reopen the last book.
  // Guard: if the store already has a book open (tool-switch remount), skip
  // openBook so the in-memory page/selection/drafts are preserved.
  useEffect(() => {
    refreshLibraryFromDisk();
    if (useMoxiaStore.getState().bookPath) return;
    const last = getLastBookPath();
    if (last) {
      // Failures (e.g. file moved/deleted) surface via the error effect above,
      // which routes file-not-found to the removal-confirm popup.
      void openBook(last).catch(() => {});
    }
  }, [openBook, refreshLibraryFromDisk]);

  // Global Cmd/Ctrl+K → open the command palette.
  // Capture phase so we intercept before CodeMirror/other editors handle it.
  // When the palette is already open, yield so the palette's own handler can
  // refocus the search input (rather than closing it).
  const paletteOpenRef = useRef(false);
  useEffect(() => {
    paletteOpenRef.current = paletteOpen;
  }, [paletteOpen]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'k') return;
      if (e.repeat) return;
      if (paletteOpenRef.current) return; // let palette handle refocus
      e.preventDefault();
      e.stopPropagation();
      setPaletteOpen(true);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  const handleOpenBook = async () => {
    let path: string | null = null;
    try {
      path = await openDialog({
        filters: [MOXIA_FILTER],
        multiple: false,
      });
    } catch (e) {
      void message.error(String(e));
      return;
    }
    if (typeof path === 'string' && path) {
      // Failures surface via the store error state, routed by the error effect:
      // file-not-found → removal-confirm popup; other errors → toast.
      // Fire-and-forget here so we don't double-display at the call site.
      if (bookPath) {
        void switchBook(path);
      } else {
        void openBook(path);
      }
    }
  };

  const handleNewBook = async () => {
    let path: string | null = null;
    try {
      path = await saveDialog({
        filters: [MOXIA_FILTER],
        defaultPath: 'untitled.moxia',
      });
    } catch (e) {
      void message.error(String(e));
      return;
    }
    if (!path) return;
    // Title = filename (without .moxia); genre defaults to the first option and can be edited later.
    const fileName = path.split(/[/\\]/).pop() ?? 'Untitled';
    const title = fileName.replace(/\.moxia$/i, '') || 'Untitled';
    const genre = GENRES[0];
    // createBook failures surface via the store error state → error effect.
    void createBook(path, title, genre);
  };

  const handleOpenRecent = (path: string) => {
    // Failures surface via the store error state, routed by the error effect:
    // file-not-found → removal-confirm popup; other errors → toast.
    // .catch() swallows the rethrown rejection so it doesn't surface as an
    // unhandled promise rejection in the console (the effect already surfaced it).
    if (bookPath) {
      void switchBook(path).catch(() => {});
    } else {
      void openBook(path).catch(() => {});
    }
  };

  const bookMenuItems: MenuProps['items'] = [
    ...library.map((entry) => ({
      key: entry.path,
      label: `${entry.title} — ${entry.path}`,
      onClick: () => {
        if (entry.path === bookPath) return;
        handleOpenRecent(entry.path);
      },
    })),
    { type: 'divider' as const },
    {
      key: 'open',
      label: t('moxia.openBook'),
      onClick: () => void handleOpenBook(),
    },
    {
      key: 'new',
      label: t('moxia.newBook'),
      onClick: () => void handleNewBook(),
    },
    ...(bookPath
      ? [
          { type: 'divider' as const },
          {
            key: 'close',
            label: t('moxia.closeBook'),
            onClick: () => void closeBook(),
          },
        ]
      : []),
  ];

  // AI tool registry surfaced via the command palette. Each entry is a self-contained trigger;
  // the palette is the single global entry point (Cmd+K or the ✨ menu-bar button).
  const commands: CommandPaletteCommand[] = useMemo(
    () => [
      {
        id: 'generate-character-card',
        label: t('moxia.generateCharacterCard'),
        icon: <BulbOutlined />,
        description: t('moxia.generateCharacterCardDesc'),
        disabled: !bookPath,
        onSelect: () => {
          setPaletteOpen(false);
          setPromptInputOpen(true);
        },
      },
    ],
    [t, bookPath],
  );

  // Promoted menu bar: replaces the default ToolLayout breadcrumb and the old internal topBar.
  const menuBar = (
    <div className={styles.topBar}>
      <Dropdown menu={{ items: bookMenuItems }} trigger={['click']}>
        <button className={styles.bookSwitcherBtn}>
          <span className={styles.bookSwitcherLabel}>Moxia</span>
        </button>
      </Dropdown>
      <div className={styles.topBarActions}>
        <button
          className={styles.iconBtn}
          onClick={() => setPaletteOpen((o) => !o)}
          title={t('moxia.commandPaletteTitle')}
          aria-label={t('moxia.commandPaletteTitle')}
          aria-expanded={paletteOpen}
        >
          <BulbOutlined />
        </button>
        <button
          className={styles.iconBtn}
          onClick={() => setSettingsOpen(true)}
          title={t('moxia.settings')}
          aria-label={t('moxia.settings')}
        >
          <SettingOutlined />
        </button>
      </div>
    </div>
  );

  return (
    <ToolLayout title={t('toolName.moxia', { defaultValue: 'Moxia' })} header={menuBar}>
      <div className={styles.wrapper}>
        {/* Two-column body (left nav + center panel). The right AI sidebar was removed; AI tool triggers now live inside page content. */}
        <div className={styles.body}>
          {bookPath && <LeftPanel />}

          <div className={`${styles.centerPanel} ${styles.centerPanelRelative}`}>
            {loading && (
              <div className={styles.loadingOverlay}>
                <Spin />
              </div>
            )}
            {!bookPath ? (
              <EmptyPage />
            ) : page === 'book' ? (
              <BookOverviewPage fontSize={fontSize} contentMaxWidth={contentMaxWidth} />
            ) : page === 'chapter' ? (
              <ChapterEditorPage fontSize={fontSize} contentMaxWidth={contentMaxWidth} />
            ) : page === 'character' ? (
              <CharacterEditorPage fontSize={fontSize} contentMaxWidth={contentMaxWidth} />
            ) : (
              <EmptyPage />
            )}
          </div>
        </div>

        {/* Status bar */}
        <StatusBar
          left={
            bookMeta ? (
              <>
                <span>{bookMeta.title}</span>
                <span className={styles.statusBarSeparator}>·</span>
                <span>{bookMeta.genre}</span>
              </>
            ) : null
          }
          right={<FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />}
        />
      </div>

      <SettingsPopup
        open={settingsOpen}
        fontSize={fontSize}
        contentMaxWidth={contentMaxWidth}
        widthMin={widthMin}
        widthMax={widthMax}
        widthStep={widthStep}
        onFontSizeChange={setFontSize}
        onContentWidthChange={setContentMaxWidth}
        onCancel={() => setSettingsOpen(false)}
      />

      <PromptInputPopup
        open={promptInputOpen}
        onGenerated={(p) => {
          setPromptInputOpen(false);
          setPromptResult(p);
        }}
        onCancel={() => setPromptInputOpen(false)}
      />

      <PromptResultPopup
        open={promptResult !== null}
        prompt={promptResult ?? ''}
        onCancel={() => setPromptResult(null)}
      />

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />

      <ConfirmPopup
        open={missingBook !== null}
        title={t('moxia.bookNotFoundTitle')}
        message={missingBook ? `${missingBook.title}\n${missingBook.path}\n\n${t('moxia.bookNotFoundMessage')}` : ''}
        confirmText={t('moxia.remove')}
        onConfirm={() => {
          if (!missingBook) return;
          removeLibraryEntry(missingBook.path);
          if (getLastBookPath() === missingBook.path) clearLastBookPath();
          refreshLibraryFromDisk();
          setMissingBook(null);
        }}
        onCancel={() => setMissingBook(null)}
      />
    </ToolLayout>
  );
}
