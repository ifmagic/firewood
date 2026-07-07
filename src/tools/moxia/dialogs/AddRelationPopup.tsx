import { useState } from 'react';
import { Modal, Select, Input } from 'antd';
import { useTranslation } from 'react-i18next';
import { RELATION_TYPES } from '../enums';
import type { CharacterRelation } from '../types';

const { TextArea } = Input;

interface Candidate {
  id: number;
  name: string;
}

interface Props {
  open: boolean;
  editRelation: CharacterRelation | null;
  candidates: Candidate[];
  onAdd: (relatedId: number, relationType: string, description: string) => Promise<void>;
  onUpdate: (relationId: number, relationType: string, description: string) => Promise<void>;
  onCancel: () => void;
}

const CUSTOM = '其他';

/**
 * Inner form: mounted only when open=true. Initial useState values are derived from editRelation,
 * avoiding setState-in-effect.
 */
function AddRelationForm({ editRelation, candidates, onAdd, onUpdate, onCancel }: Omit<Props, 'open'>) {
  const { t } = useTranslation();

  // Initial values are fixed at mount time based on editRelation.
  const [relatedId, setRelatedId] = useState<number | null>(editRelation ? editRelation.relatedId : null);
  const [relationType, setRelationType] = useState<string>(() => {
    if (!editRelation) return RELATION_TYPES[0];
    if (RELATION_TYPES.includes(editRelation.relationType as (typeof RELATION_TYPES)[number])) {
      return editRelation.relationType;
    }
    return CUSTOM;
  });
  const [customType, setCustomType] = useState<string>(() => {
    if (!editRelation) return '';
    if (RELATION_TYPES.includes(editRelation.relationType as (typeof RELATION_TYPES)[number])) {
      return '';
    }
    return editRelation.relationType;
  });
  const [description, setDescription] = useState<string>(editRelation?.description ?? '');

  const effectiveType = relationType === CUSTOM ? customType : relationType;
  const canSubmit = (editRelation !== null || relatedId !== null) && effectiveType.trim() !== '';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (editRelation) {
      await onUpdate(editRelation.id, effectiveType, description);
    } else if (relatedId !== null) {
      await onAdd(relatedId, effectiveType, description);
    }
  };

  return (
    <Modal
      open
      title={<span>🤝 {editRelation ? t('moxia.editRelation') : t('moxia.addRelation')}</span>}
      onCancel={onCancel}
      onOk={handleSubmit}
      okButtonProps={{ disabled: !canSubmit }}
      okText={editRelation ? t('moxia.save') : t('moxia.addRelation')}
      cancelText={t('moxia.cancel')}
      width={480}
    >
      {!editRelation && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 4, fontSize: 13 }}>{t('moxia.targetCharacter')}</div>
          {candidates.length === 0 ? (
            <div style={{ color: 'var(--fw-text-tertiary)', fontSize: 12 }}>{t('moxia.noCandidates')}</div>
          ) : (
            <Select
              style={{ width: '100%' }}
              value={relatedId}
              onChange={(v) => setRelatedId(v)}
              options={candidates.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t('moxia.selectTarget')}
            />
          )}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>{t('moxia.relationType')}</div>
        <Select
          style={{ width: '100%' }}
          value={relationType}
          onChange={(v) => setRelationType(v)}
          options={[...RELATION_TYPES].map((r) => ({ value: r, label: r }))}
        />
        {relationType === CUSTOM && (
          <Input
            style={{ marginTop: 8 }}
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder={t('moxia.customRelationTypePlaceholder')}
          />
        )}
      </div>

      <div>
        <div style={{ marginBottom: 4, fontSize: 13 }}>{t('moxia.relationDescription')}</div>
        <TextArea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('moxia.relationDescriptionPlaceholder')}
        />
      </div>
    </Modal>
  );
}

export default function AddRelationPopup({ open, editRelation, candidates, onAdd, onUpdate, onCancel }: Props) {
  // Mount the form when open=true (useState initial values serve as the reset), unmount when closed.
  if (!open) return null;
  return (
    <AddRelationForm
      editRelation={editRelation}
      candidates={candidates}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onCancel={onCancel}
    />
  );
}
