import { useState } from 'react';
import { Modal, Input, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { ROLE_TYPES } from '../enums';

interface Props {
  open: boolean;
  onAdd: (name: string, roleType: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * New-character dialog. Ports the original moxia "add character" flow (previously window.prompt,
 * which is silently broken under Tauri's WKWebView).
 * The parent owns the `open` flag; the inner form mounts only when open=true so useState's initial
 * value doubles as the reset value (no setState-in-effect).
 */
function AddCharacterForm({ onAdd, onCancel }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [roleType, setRoleType] = useState<string>(ROLE_TYPES[0]);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim() !== '' && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onAdd(name.trim(), roleType);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={<span>👤 {t('moxia.newCharacter')}</span>}
      onCancel={onCancel}
      onOk={handleSubmit}
      okButtonProps={{ disabled: !canSubmit, loading: submitting }}
      okText={t('moxia.create')}
      cancelText={t('moxia.cancel')}
      width={420}
      destroyOnClose
    >
      <div style={{ marginBottom: 12, marginTop: 16 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>{t('moxia.characterName')}</div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('moxia.characterNamePlaceholder')}
          onPressEnter={handleSubmit}
          autoFocus
        />
      </div>
      <div>
        <div style={{ marginBottom: 4, fontSize: 13 }}>{t('moxia.roleType')}</div>
        <Select
          style={{ width: '100%' }}
          value={roleType}
          onChange={(v) => setRoleType(v)}
          options={ROLE_TYPES.map((r) => ({ value: r, label: r }))}
        />
      </div>
    </Modal>
  );
}

export default function AddCharacterPopup({ open, onAdd, onCancel }: Props) {
  if (!open) return null;
  return <AddCharacterForm onAdd={onAdd} onCancel={onCancel} />;
}
