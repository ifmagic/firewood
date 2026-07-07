import { useEffect } from 'react';
import { Input } from 'antd';
import { SaveOutlined, BulbOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import Editor from '../components/Editor';
import PillTag from '../components/PillTag';
import CollapsibleSection from '../components/CollapsibleSection';
import AiToolButton from '../components/AiToolButton';
import { useMoxiaStore } from '../store';
import { GENRES, BOOK_STATUS_LABELS, bookStatusToLabel, bookStatusToKey, formatNumber } from '../enums';
import styles from '../Moxia.module.css';

interface Props {
  fontSize: number;
  onGenerateCharacterCard: () => void;
}

export default function BookOverviewPage({ fontSize, onGenerateCharacterCard }: Props) {
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

      {/* AI tools row: reusable trigger chips for AI generators. Currently only character card; more can be appended. */}
      <div className={styles.aiToolRow}>
        <span className={styles.aiToolRowTitle}>{t('moxia.aiToolsRow')}</span>
        <AiToolButton
          icon={<BulbOutlined />}
          label={t('moxia.generateCharacterCard')}
          onClick={onGenerateCharacterCard}
        />
      </div>

      <div className={styles.divider} />

      <div className={styles.bookSplit}>
        <div className={styles.bookSplitMain}>
          <Editor
            key="book-description"
            value={bookMeta.description}
            onChange={(v) => {
              patchBookMeta({ description: v });
              markBookMetaDirty();
            }}
            placeholder={t('moxia.bookDescriptionPlaceholder')}
            fontSize={fontSize}
          />
        </div>
        <div className={styles.bookSplitSide}>
          <CollapsibleSection title={t('moxia.worldbuilding')}>
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
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
