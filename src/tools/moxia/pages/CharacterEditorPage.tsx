import { useEffect, useState } from 'react';
import { Input, message } from 'antd';
import { SaveOutlined, PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import Editor from '../components/Editor';
import PillTag from '../components/PillTag';
import ConfirmPopup from '../components/ConfirmPopup';
import AddRelationPopup from '../dialogs/AddRelationPopup';
import { useMoxiaStore } from '../store';
import { ROLE_TYPES } from '../enums';
import type { CharacterRelation } from '../types';
import styles from '../Moxia.module.css';

interface Props {
  fontSize: number;
  contentMaxWidth: number;
}

export default function CharacterEditorPage({ fontSize, contentMaxWidth }: Props) {
  const { t } = useTranslation();
  const {
    characterDraft,
    characterDirty,
    relations,
    characterCandidates,
    patchCharacter,
    markCharacterDirty,
    saveCharacter,
    addRelation,
    updateRelation,
    deleteRelation,
  } = useMoxiaStore(
    useShallow((s) => ({
      characterDraft: s.characterDraft,
      characterDirty: s.characterDirty,
      relations: s.relations,
      characterCandidates: s.characterCandidates,
      patchCharacter: s.patchCharacter,
      markCharacterDirty: s.markCharacterDirty,
      saveCharacter: s.saveCharacter,
      addRelation: s.addRelation,
      updateRelation: s.updateRelation,
      deleteRelation: s.deleteRelation,
    })),
  );

  const [addRelationOpen, setAddRelationOpen] = useState(false);
  const [editRelation, setEditRelation] = useState<CharacterRelation | null>(null);
  const [deleteRelationId, setDeleteRelationId] = useState<number | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && characterDirty) {
        e.preventDefault();
        void saveCharacter();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [characterDirty, saveCharacter]);

  if (!characterDraft) return null;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div className={styles.characterAvatar}>
          <UserOutlined />
        </div>
        <Input
          className={styles.pageTitleInput}
          value={characterDraft.name}
          placeholder={t('moxia.characterNamePlaceholder')}
          onChange={(e) => {
            patchCharacter({ name: e.target.value });
            markCharacterDirty();
          }}
          variant="borderless"
        />
        <button
          className={styles.saveBtn}
          onClick={() => void saveCharacter()}
          disabled={!characterDirty}
          title={characterDirty ? t('moxia.save') : t('moxia.nothingToSave')}
        >
          <SaveOutlined />
        </button>
      </div>

      <div className={styles.metaRow}>
        <PillTag
          value={characterDraft.roleType || t('moxia.uncategorized')}
          options={ROLE_TYPES}
          onChange={(v) => {
            patchCharacter({ roleType: v });
            markCharacterDirty();
          }}
        />
        <PillTag value={`${relations.length} ${t('moxia.relationsCount')}`} readOnly />
      </div>

      <div className={styles.divider} />

      <div className={styles.contentCenter} style={{ maxWidth: contentMaxWidth }}>
        <div className={styles.characterSection}>
          <div className={styles.characterSectionTitle}>{t('moxia.description')}</div>
          <div className={styles.editorBordered}>
            <Editor
              key={`char-desc-${characterDraft.id}`}
              value={characterDraft.description}
              onChange={(v) => {
                patchCharacter({ description: v });
                markCharacterDirty();
              }}
              placeholder={t('moxia.descriptionPlaceholder')}
              fontSize={fontSize}
            />
          </div>
        </div>

        <div className={styles.characterSection}>
          <div className={styles.characterSectionTitle}>{t('moxia.personality')}</div>
          <div className={styles.editorBordered}>
            <Editor
              key={`char-pers-${characterDraft.id}`}
              value={characterDraft.personality}
              onChange={(v) => {
                patchCharacter({ personality: v });
                markCharacterDirty();
              }}
              placeholder={t('moxia.personalityPlaceholder')}
              fontSize={fontSize}
            />
          </div>
        </div>

        <div className={styles.characterSection}>
          <div className={styles.characterSectionTitle}>{t('moxia.background')}</div>
          <div className={styles.editorBordered}>
            <Editor
              key={`char-bg-${characterDraft.id}`}
              value={characterDraft.background}
              onChange={(v) => {
                patchCharacter({ background: v });
                markCharacterDirty();
              }}
              placeholder={t('moxia.backgroundPlaceholder')}
              fontSize={fontSize}
            />
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.characterSection}>
          <div className={styles.characterSectionHeader}>
            <div className={styles.characterSectionTitle}>
              {t('moxia.relations')} ({relations.length})
            </div>
            <button
              className={styles.iconBtn}
              onClick={() => {
                setEditRelation(null);
                setAddRelationOpen(true);
              }}
              title={t('moxia.addRelation')}
            >
              <PlusOutlined />
            </button>
          </div>

          {relations.length === 0 ? (
            <div className={styles.relationsEmpty}>{t('moxia.noRelations')}</div>
          ) : (
            <div className={styles.relationsList}>
              {relations.map((r) => {
                const direction =
                  r.characterId === characterDraft.id ? (
                    <span className={styles.relationDirection}>{t('moxia.outgoing')}</span>
                  ) : (
                    <span className={styles.relationDirection}>{t('moxia.incoming')}</span>
                  );
                return (
                  <div key={r.id} className={styles.relationRow}>
                    {direction}
                    <span className={styles.relationName}>{r.relatedName}</span>
                    {r.relationType && <span className={styles.relationTypePill}>{r.relationType}</span>}
                    <span className={styles.relationDesc}>{r.description}</span>
                    <div className={styles.relationActions}>
                      <button
                        className={styles.relationActionBtn}
                        onClick={() => {
                          setEditRelation(r);
                          setAddRelationOpen(true);
                        }}
                      >
                        <EditOutlined />
                      </button>
                      <button
                        className={`${styles.relationActionBtn} ${styles.relationActionBtnDanger}`}
                        onClick={() => setDeleteRelationId(r.id)}
                      >
                        <DeleteOutlined />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AddRelationPopup
        open={addRelationOpen}
        editRelation={editRelation}
        candidates={characterCandidates.map((c) => ({ id: c.id, name: c.name }))}
        onAdd={async (relatedId, relationType, description) => {
          try {
            await addRelation(relatedId, relationType, description);
            setAddRelationOpen(false);
          } catch (e) {
            void message.error(String(e));
          }
        }}
        onUpdate={async (relationId, relationType, description) => {
          try {
            await updateRelation(relationId, relationType, description);
            setAddRelationOpen(false);
            setEditRelation(null);
          } catch (e) {
            void message.error(String(e));
          }
        }}
        onCancel={() => {
          setAddRelationOpen(false);
          setEditRelation(null);
        }}
      />

      <ConfirmPopup
        open={deleteRelationId !== null}
        title={t('moxia.deleteRelation')}
        message={t('moxia.deleteRelationConfirm')}
        onConfirm={async () => {
          if (deleteRelationId !== null) {
            await deleteRelation(deleteRelationId);
            setDeleteRelationId(null);
          }
        }}
        onCancel={() => setDeleteRelationId(null)}
      />
    </div>
  );
}
