import { useEffect, useState } from 'react';
import { Dropdown, Spin, message } from 'antd';
import type { MenuProps } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
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
import { getLastBookPath } from './library';
import LeftPanel from './components/LeftPanel';
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
  const [promptResult, setPromptResult] = useState<string>('');

  // Surface backend errors via toast.
  useEffect(() => {
    if (error) {
      void message.error(error);
      setError(null);
    }
  }, [error, setError]);

  // On mount: load the library and try to reopen the last book.
  // Guard: if the store already has a book open (tool-switch remount), skip
  // openBook so the in-memory page/selection/drafts are preserved.
  useEffect(() => {
    refreshLibraryFromDisk();
    if (useMoxiaStore.getState().bookPath) return;
    const last = getLastBookPath();
    if (last) {
      void openBook(last).catch(() => {
        // The last book may have been moved or deleted; ignore.
      });
    }
  }, [openBook, refreshLibraryFromDisk]);

  const handleOpenBook = async () => {
    try {
      const path = await openDialog({
        filters: [MOXIA_FILTER],
        multiple: false,
      });
      if (typeof path === 'string' && path) {
        if (bookPath) {
          await switchBook(path);
        } else {
          await openBook(path);
        }
      }
    } catch (e) {
      void message.error(String(e));
    }
  };

  const handleNewBook = async () => {
    try {
      const path = await saveDialog({
        filters: [MOXIA_FILTER],
        defaultPath: 'untitled.moxia',
      });
      if (!path) return;
      // Title = filename (without .moxia); genre defaults to the first option and can be edited later.
      const fileName = path.split(/[/\\]/).pop() ?? 'Untitled';
      const title = fileName.replace(/\.moxia$/i, '') || 'Untitled';
      const genre = GENRES[0];
      await createBook(path, title, genre);
    } catch (e) {
      void message.error(String(e));
    }
  };

  const bookMenuItems: MenuProps['items'] = [
    ...library.map((entry) => ({
      key: entry.path,
      label: `${entry.title} — ${entry.path}`,
      onClick: () => {
        if (entry.path === bookPath) return;
        void (bookPath ? switchBook(entry.path) : openBook(entry.path));
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
              <BookOverviewPage fontSize={fontSize} onGenerateCharacterCard={() => setPromptInputOpen(true)} />
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

      <PromptResultPopup open={promptResult !== ''} prompt={promptResult} onCancel={() => setPromptResult('')} />
    </ToolLayout>
  );
}
