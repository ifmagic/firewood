import { useState } from 'react';
import { Modal, Input, Button, message } from 'antd';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;

interface Props {
  open: boolean;
  prompt: string;
  onCancel: () => void;
}

export default function PromptResultPopup({ open, prompt, onCancel }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      message.success(t('moxia.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error(t('moxia.copyFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={<span>💬 {t('moxia.promptGenerated')}</span>}
      onCancel={onCancel}
      width={640}
      footer={[
        <Button key="close" onClick={onCancel}>
          {t('moxia.close')}
        </Button>,
        <Button key="copy" type="primary" onClick={handleCopy}>
          {t('moxia.copyAll')}
        </Button>,
      ]}
    >
      <p style={{ fontSize: 12, color: 'var(--fw-text-tertiary)', marginBottom: 8 }}>{t('moxia.promptResultHint')}</p>
      <TextArea
        value={prompt}
        readOnly
        rows={18}
        style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}
      />
      {copied && <div style={{ marginTop: 8, color: 'var(--fw-accent)', fontSize: 12 }}>✓ {t('moxia.copied')}</div>}
    </Modal>
  );
}
