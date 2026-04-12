import { useState } from 'react';
import { Tooltip } from 'antd';
import { CheckOutlined, GlobalOutlined, InfoCircleOutlined, RightOutlined, SettingOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { setStoredLanguage } from '../../i18n';
import { emit } from '@tauri-apps/api/event';
import styles from './SettingsMenuButton.module.css';

interface SettingsMenuButtonProps {
  onOpenAbout?: () => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
] as const;

export default function SettingsMenuButton({ onOpenAbout }: SettingsMenuButtonProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  const handleLanguageChange = async (lang: string) => {
    await i18n.changeLanguage(lang);
    setStoredLanguage(lang);
    try {
      await emit('app://language-changed', lang);
    } catch {
      // Ignore when not running inside Tauri runtime.
    }
  };

  const handleCheckForUpdates = async () => {
    setOpen(false);
    try {
      await emit('app://check-for-updates', {});
    } catch {
      // Ignore when not running inside Tauri runtime.
    }
  };

  const handleOpenAbout = () => {
    setOpen(false);
    onOpenAbout?.();
  };

  return (
    <>
      {open && <div className={styles.overlay} onClick={() => { setOpen(false); setLanguageOpen(false); }} />}
      <Tooltip title={t('label.settings')} placement="right">
        <button
          type="button"
          className={`${styles.settingsButton} ${open ? styles.settingsButtonActive : ''}`}
          aria-label={t('label.settings')}
          onClick={() => {
            setOpen((prev) => {
              const next = !prev;
              if (!next) setLanguageOpen(false);
              return next;
            });
          }}
        >
          <SettingOutlined />
        </button>
      </Tooltip>

      {open && (
        <div className={styles.menuPanel}>
          <div className={styles.menuItemWrap}>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => setLanguageOpen((prev) => !prev)}
            >
              <span className={styles.menuIcon}><GlobalOutlined /></span>
              <span className={styles.menuLabel}>{t('settings.language')}</span>
              <span className={`${styles.menuArrow} ${languageOpen ? styles.menuArrowOpen : ''}`}>
                <RightOutlined />
              </span>
            </button>

            {languageOpen && (
              <div className={styles.submenuPanel}>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={styles.submenuItem}
                    onClick={() => {
                      setLanguageOpen(false);
                      void handleLanguageChange(opt.value);
                    }}
                  >
                    <span className={styles.checkIcon}>
                      {i18n.language === opt.value ? <CheckOutlined /> : null}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.menuDivider} />

          <button type="button" className={styles.menuItem} onClick={() => { void handleCheckForUpdates(); }}>
            <span className={styles.menuIcon}><SyncOutlined /></span>
            <span className={styles.menuLabel}>{t('settings.checkForUpdates')}</span>
          </button>

          <button type="button" className={styles.menuItem} onClick={handleOpenAbout}>
            <span className={styles.menuIcon}><InfoCircleOutlined /></span>
            <span className={styles.menuLabel}>{t('settings.aboutApp')}</span>
          </button>
        </div>
      )}
    </>
  );
}
