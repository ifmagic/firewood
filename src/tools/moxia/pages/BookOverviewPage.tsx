import { useEffect, useRef } from 'react';
import { Input } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import Editor from '../components/Editor';
import type { EditorHandle } from '../components/Editor';
import PillTag from '../components/PillTag';
import SectionCard from '../components/SectionCard';
import { useMoxiaStore } from '../store';
import { GENRES, BOOK_STATUS_LABELS, bookStatusToLabel, bookStatusToKey, formatNumber } from '../enums';
import styles from '../Moxia.module.css';

interface Props {
  fontSize: number;
  contentMaxWidth: number;
}

export default function BookOverviewPage({ fontSize, contentMaxWidth }: Props) {
  const { t } = useTranslation();
  const { bookMeta, bookMetaDirty, patchBookMeta, markBookMetaDirty, saveBookMeta } = useMoxiaStore(
    useShallow((s) => ({
      bookMeta: s.bookMeta,
      bookMetaDirty: s.bookMetaDirty,
      patchBookMeta: s.patchBookMeta,
      markBookMetaDirty: s.markBookMetaDirty,
      saveBookMeta: s.saveBookMeta,
    })),
  );

  // Ctrl+S saves the book metadata.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && bookMetaDirty) {
        e.preventDefault();
        void saveBookMeta();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [bookMetaDirty, saveBookMeta]);

  const descriptionEditorRef = useRef<EditorHandle>(null);

  if (!bookMeta) return null;

  return (
    <div>
      <div className={styles.pageHeader}>
        <Input
          className={styles.pageTitleInput}
          value={bookMeta.title}
          placeholder={t('moxia.untitled')}
          onChange={(e) => {
            patchBookMeta({ title: e.target.value });
            markBookMetaDirty();
          }}
          onPressEnter={(e) => {
            e.preventDefault();
            if (bookMetaDirty) void saveBookMeta();
            // Defer focus to the next frame so the Enter keydown isn't dispatched
            // to the CodeMirror editor (which would insert a newline).
            requestAnimationFrame(() => descriptionEditorRef.current?.focus());
          }}
          variant="borderless"
        />
        <button
          className={styles.saveBtn}
          onClick={() => void saveBookMeta()}
          disabled={!bookMetaDirty}
          title={bookMetaDirty ? t('moxia.save') : t('moxia.nothingToSave')}
        >
          <SaveOutlined />
        </button>
      </div>

      <div className={styles.metaRow}>
        <PillTag
          value={bookMeta.genre || t('moxia.uncategorized')}
          options={GENRES}
          onChange={(v) => {
            patchBookMeta({ genre: v });
            markBookMetaDirty();
          }}
        />
        <PillTag
          value={bookStatusToLabel(bookMeta.status)}
          options={BOOK_STATUS_LABELS}
          onChange={(v) => {
            patchBookMeta({ status: bookStatusToKey(v) });
            markBookMetaDirty();
          }}
        />
        <PillTag value={`${formatNumber(bookMeta.wordCount)} ${t('moxia.words')}`} readOnly />
      </div>

      <div className={styles.divider} />

      <div className={styles.contentCenter} style={{ maxWidth: contentMaxWidth }}>
        <SectionCard title={t('moxia.workDescription')}>
          <div className={styles.sectionCardDescriptionBody}>
            <Editor
              key="book-description"
              ref={descriptionEditorRef}
              value={bookMeta.description}
              onChange={(v) => {
                patchBookMeta({ description: v });
                markBookMetaDirty();
              }}
              placeholder={t('moxia.bookDescriptionPlaceholder')}
              fontSize={fontSize}
            />
          </div>
        </SectionCard>

        <SectionCard title={t('moxia.worldbuilding')}>
          <Editor
            key="book-worldbuilding"
            value={bookMeta.worldbuilding}
            onChange={(v) => {
              patchBookMeta({ worldbuilding: v });
              markBookMetaDirty();
            }}
            placeholder={t('moxia.worldbuildingPlaceholder')}
            fontSize={fontSize}
          />
        </SectionCard>
      </div>
    </div>
  );
}
