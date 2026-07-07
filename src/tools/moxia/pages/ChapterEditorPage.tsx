import { useEffect, useMemo, useState } from 'react';
import { Input } from 'antd';
import { SaveOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import Editor from '../components/Editor';
import PillTag from '../components/PillTag';
import { useMoxiaStore } from '../store';
import {
  CHAPTER_STATUS_LABELS,
  chapterStatusToLabel,
  chapterStatusToKey,
  countWords,
  formatNumber,
  parseChapterPrefix,
} from '../enums';
import styles from '../Moxia.module.css';

interface Props {
  fontSize: number;
  contentMaxWidth: number;
}

export default function ChapterEditorPage({ fontSize, contentMaxWidth }: Props) {
  const { t } = useTranslation();
  const { chapterDraft, chapterDirty, patchChapter, markChapterDirty, saveChapter } = useMoxiaStore(
    useShallow((s) => ({
      chapterDraft: s.chapterDraft,
      chapterDirty: s.chapterDirty,
      patchChapter: s.patchChapter,
      markChapterDirty: s.markChapterDirty,
      saveChapter: s.saveChapter,
    })),
  );

  const [showNotes, setShowNotes] = useState(false);

  const suffix = chapterDraft ? parseChapterPrefix(chapterDraft.title).suffix : '';
  const suffixValid = suffix.trim() !== '';
  const canSave = chapterDirty && suffixValid;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && canSave) {
        e.preventDefault();
        void saveChapter();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canSave, saveChapter]);

  const wordCount = useMemo(() => countWords(chapterDraft?.content ?? ''), [chapterDraft?.content]);

  if (!chapterDraft) return null;

  const { prefix, suffix: draftSuffix } = parseChapterPrefix(chapterDraft.title);

  const handleSuffixChange = (v: string) => {
    const newTitle = prefix ? `${prefix} ${v}` : v;
    patchChapter({ title: newTitle });
    markChapterDirty();
  };

  let saveTitle = t('moxia.nothingToSave');
  if (chapterDirty && !suffixValid) saveTitle = t('moxia.chapterNameRequired');
  else if (chapterDirty) saveTitle = t('moxia.save');

  return (
    <div>
      <div className={styles.pageHeader}>
        {prefix && <span className={styles.pageTitlePrefix}>{prefix}</span>}
        <Input
          className={styles.pageTitleInput}
          value={draftSuffix}
          placeholder={t('moxia.chapterNamePlaceholder')}
          onChange={(e) => handleSuffixChange(e.target.value)}
          variant="borderless"
        />
        <button className={styles.saveBtn} onClick={() => void saveChapter()} disabled={!canSave} title={saveTitle}>
          <SaveOutlined />
        </button>
      </div>

      {chapterDirty && !suffixValid && <div className={styles.validationError}>{t('moxia.chapterNameRequired')}</div>}

      <div className={styles.metaRow}>
        <PillTag
          value={chapterStatusToLabel(chapterDraft.status)}
          options={CHAPTER_STATUS_LABELS}
          onChange={(v) => {
            patchChapter({ status: chapterStatusToKey(v) });
            markChapterDirty();
          }}
        />
        <PillTag value={`${formatNumber(wordCount)} ${t('moxia.words')}`} readOnly />
      </div>

      <div className={styles.divider} />

      <div className={styles.contentCenter} style={{ maxWidth: contentMaxWidth }}>
        <Editor
          key={`chapter-content-${chapterDraft.id}`}
          value={chapterDraft.content}
          onChange={(v) => {
            patchChapter({ content: v });
            markChapterDirty();
          }}
          placeholder={t('moxia.chapterContentPlaceholder')}
          fontSize={fontSize}
        />

        <div className={styles.chapterFooter}>
          <button className={styles.ghostBtn} onClick={() => setShowNotes((s) => !s)}>
            <FileTextOutlined />
            {t('moxia.notes')}
          </button>
          <span className={styles.chapterFooterWordCount}>
            {t('moxia.wordCount')}: {formatNumber(wordCount)}
          </span>
        </div>

        {showNotes && (
          <div className={styles.notesSection}>
            <Editor
              key={`chapter-notes-${chapterDraft.id}`}
              value={chapterDraft.notes}
              onChange={(v) => {
                patchChapter({ notes: v });
                markChapterDirty();
              }}
              placeholder={t('moxia.notesPlaceholder')}
              fontSize={fontSize}
            />
          </div>
        )}
      </div>
    </div>
  );
}
