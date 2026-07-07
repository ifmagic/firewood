import { useState } from 'react';
import { Modal, Button, message as antdMessage } from 'antd';
import { useTranslation } from 'react-i18next';

interface ConfirmPopupProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmPopup({
  open,
  title,
  message,
  confirmText,
  cancelText,
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmPopupProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } catch (e) {
      void antdMessage.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          {cancelText ?? t('moxia.cancel')}
        </Button>,
        <Button key="confirm" type="primary" danger={danger} loading={loading} onClick={handleConfirm}>
          {confirmText ?? t('moxia.confirmDelete')}
        </Button>,
      ]}
      width={400}
    >
      <p>{message}</p>
    </Modal>
  );
}
