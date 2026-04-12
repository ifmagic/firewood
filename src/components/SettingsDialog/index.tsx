import { Modal, Select, Button, Divider } from 'antd';
import { InfoCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { setStoredLanguage } from '../../i18n';
import { emit } from '@tauri-apps/api/event';
import styles from './SettingsDialog.module.css';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenAbout?: () => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
];

export default function SettingsDialog({ open, onClose, onOpenAbout }: SettingsDialogProps) {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = async (lang: string) => {
    await i18n.changeLanguage(lang);
    setStoredLanguage(lang);
    // Notify Rust side about language change for tray menu
    try {
      await emit('app://language-changed', lang);
    } catch {
      // ignore if not in Tauri context
    }
  };

  const handleCheckForUpdates = async () => {
    onClose();
    try {
      await emit('app://check-for-updates', {});
    } catch {
      // ignore if not in Tauri context
    }
  };

  const handleAbout = () => {
    onClose();
    onOpenAbout?.();
  };

  return (
    <Modal
      open={open}
      title={t('settings.title')}
      footer={null}
      centered
      onCancel={onClose}
      width={400}
      className={styles.settingsModal}
    >
      <div className={styles.settingRow}>
        <span className={styles.settingLabel}>{t('settings.language')}</span>
        <Select
          value={i18n.language}
          onChange={handleLanguageChange}
          style={{ width: 160 }}
          options={LANGUAGE_OPTIONS}
        />
      </div>
      <Divider style={{ margin: '12px 0' }} />
      <div className={styles.actionRow}>
        <Button
          type="text"
          icon={<SyncOutlined />}
          className={styles.actionButton}
          onClick={handleCheckForUpdates}
        >
          {t('settings.checkForUpdates')}
        </Button>
        <Button
          type="text"
          icon={<InfoCircleOutlined />}
          className={styles.actionButton}
          onClick={handleAbout}
        >
          {t('settings.aboutApp')}
        </Button>
      </div>
    </Modal>
  );
}
