import { useState } from 'react';
import { Modal, Select, Input, Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { ROLE_TYPES, RELATION_TYPES } from '../enums';
import { useMoxiaStore } from '../store';
import { renderCharacterCard, characterToLike, bookToLike, relationsToLike } from '../characterCard';
import type { Character, CharacterRelation } from '../types';

const { TextArea } = Input;

interface Props {
  open: boolean;
  onGenerated: (prompt: string) => void;
  onCancel: () => void;
}

const AUTO = '根据上下文自动判断';

/**
 * Inner form: mounted only when open=true. useState initial values double as the reset values,
 * avoiding setState-in-effect.
 */
function PromptInputForm({ onGenerated, onCancel }: { onGenerated: (prompt: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const { bookPath, bookMeta, characters, characterDraft, relations, setError } = useMoxiaStore(
    useShallow((s) => ({
      bookPath: s.bookPath,
      bookMeta: s.bookMeta,
      characters: s.characters,
      characterDraft: s.characterDraft,
      relations: s.relations,
      setError: s.setError,
    })),
  );

  const [refine, setRefine] = useState(false);
  const [referenceId, setReferenceId] = useState<number | null>(null);
  const [relationType, setRelationType] = useState<string>('');
  const [roleType, setRoleType] = useState<string>(AUTO);
  const [expectation, setExpectation] = useState('');

  const hasCharacter = characterDraft !== null;
  const candidates = characters.filter((c) => !characterDraft || c.id !== characterDraft.id);

  const canGenerate = expectation.trim() !== '' && (refine ? hasCharacter : bookPath !== null);

  const handleGenerate = async () => {
    if (!bookMeta) {
      setError(t('moxia.bookRequired'));
      return;
    }
    try {
      const mode = refine && hasCharacter ? 'refine' : 'create';
      const referenceCharacter =
        referenceId !== null ? (candidates.find((c) => c.id === referenceId) as Character | undefined) : undefined;

      let existingRelations: ReturnType<typeof relationsToLike> = [];
      if (mode === 'refine' && characterDraft) {
        existingRelations = relationsToLike(relations as CharacterRelation[], characterDraft.id);
      }

      const existingCharacters = characters
        .filter((c) => !characterDraft || c.id !== characterDraft.id)
        .map((c) => ({
          name: c.name,
          roleType: c.roleType,
          description: '',
          personality: '',
          background: '',
        }));

      const prompt = await renderCharacterCard({
        userExpectation: expectation,
        roleType: roleType === AUTO ? '' : roleType,
        mode,
        book: bookToLike(bookMeta),
        existingCharacters,
        character: mode === 'refine' && characterDraft ? characterToLike(characterDraft) : undefined,
        existingRelations,
        roleTypeOptions: [...ROLE_TYPES],
        relationTypeOptions: [],
        referenceCharacter: referenceCharacter
          ? {
              name: referenceCharacter.name,
              roleType: referenceCharacter.roleType,
              description: '',
              personality: '',
              background: '',
            }
          : undefined,
        referenceRelationType: relationType,
      });
      onGenerated(prompt);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Modal
      open
      title={<span>✨ {t('moxia.generateCharacterCard')}</span>}
      onCancel={onCancel}
      onOk={handleGenerate}
      okButtonProps={{ disabled: !canGenerate }}
      okText={t('moxia.generatePrompt')}
      cancelText={t('moxia.cancel')}
      width={560}
    >
      {hasCharacter && (
        <div style={{ marginBottom: 12 }}>
          <Checkbox checked={refine} onChange={(e) => setRefine(e.target.checked)}>
            {t('moxia.refineCurrentCharacter')}
          </Checkbox>
        </div>
      )}

      {!refine && (
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--fw-text-tertiary)' }}>
          {bookMeta ? `${t('moxia.currentBook')}: ${bookMeta.title}` : t('moxia.bookRequired')}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>{t('moxia.referenceCharacter')}</div>
        <Select
          style={{ width: '100%' }}
          value={referenceId}
          onChange={(v) => setReferenceId(v)}
          options={[
            { value: null, label: t('moxia.noReference') },
            ...candidates.map((c) => ({ value: c.id, label: c.name })),
          ]}
          allowClear
        />
        {referenceId !== null && (
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--fw-text-tertiary)' }}>
            {t('moxia.referenceCharacterHint')}
          </div>
        )}
      </div>

      {referenceId !== null && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 4, fontSize: 13 }}>{t('moxia.relationType')}</div>
          <Select
            style={{ width: '100%' }}
            value={relationType}
            onChange={setRelationType}
            options={RELATION_TYPES.map((r) => ({
              value: r,
              label: r,
            }))}
            allowClear
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>{t('moxia.roleType')}</div>
        <Select
          style={{ width: '100%' }}
          value={roleType}
          onChange={setRoleType}
          options={[AUTO, ...ROLE_TYPES].map((r) => ({ value: r, label: r }))}
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontSize: 13 }}>{t('moxia.expectation')}</div>
        <TextArea
          rows={6}
          value={expectation}
          onChange={(e) => setExpectation(e.target.value)}
          placeholder={t('moxia.expectationPlaceholder')}
        />
      </div>
    </Modal>
  );
}

export default function PromptInputPopup({ open, onGenerated, onCancel }: Props) {
  // Mount the form when open=true (useState initial values serve as the reset), unmount when closed.
  if (!open) return null;
  return <PromptInputForm onGenerated={onGenerated} onCancel={onCancel} />;
}
