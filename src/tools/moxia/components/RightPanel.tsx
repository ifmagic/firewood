import { SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import styles from '../Moxia.module.css';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onSettings: () => void;
  onGenerateCharacterCard: () => void;
}

export default function RightPanel({ collapsed, onToggle, onSettings, onGenerateCharacterCard }: Props) {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <div className={`${styles.rightPanel} ${styles.rightPanelCollapsed}`}>
        <button className={styles.collapsedExpandBtn} onClick={onToggle} title={t('moxia.expand')}>
          ◂
        </button>
        <div style={{ flex: 1 }} />
        <button className={styles.iconBtn} onClick={onSettings} title={t('moxia.settings')}>
          <SettingOutlined />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.rightPanel}>
      <div className={styles.rightPanelHeader}>
        <span className={styles.rightPanelTitle}>{t('moxia.aiTools')}</span>
        <button className={styles.iconBtn} onClick={onToggle} title={t('moxia.collapse')}>
          ▸
        </button>
      </div>
      <div className={styles.rightPanelBody}>
        <div
          className={styles.toolCard}
          role="button"
          tabIndex={0}
          onClick={onGenerateCharacterCard}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onGenerateCharacterCard();
            }
          }}
        >
          <div className={styles.toolCardIcon}>✨</div>
          <div className={styles.toolCardTitle}>{t('moxia.generateCharacterCard')}</div>
          <div className={styles.toolCardDesc}>{t('moxia.generateCharacterCardDesc')}</div>
          <span className={styles.toolCardAction}>{t('moxia.generate')}</span>
        </div>
      </div>
      <div className={styles.rightPanelFooter}>
        <button className={styles.iconBtn} onClick={onSettings} title={t('moxia.settings')}>
          <SettingOutlined />
        </button>
      </div>
    </div>
  );
}
