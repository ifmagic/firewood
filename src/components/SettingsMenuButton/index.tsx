import { Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, GlobalOutlined, InfoCircleOutlined, SettingOutlined, SyncOutlined } from '@ant-design/icons';
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

/**
 * App settings menu.
 *
 * This deliberately uses Ant Design's Dropdown — the same primitive as the
 * sidebar view menu — instead of a hand-rolled fixed-position panel: menus get
 * Esc/arrow-key handling, focus return to the trigger and correct menu
 * semantics for free. The visual treatment stays on the dark sidebar popover
 * through `fw-sidebar-popover` (see App.css).
 */
export default function SettingsMenuButton({ onOpenAbout }: SettingsMenuButtonProps) {
  const { t, i18n } = useTranslation();

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
    try {
      await emit('app://check-for-updates', {});
    } catch {
      // Ignore when not running inside Tauri runtime.
    }
  };

  const items: MenuProps['items'] = [
    {
      key: 'language',
      icon: <GlobalOutlined />,
      label: t('settings.language'),
      children: LANGUAGE_OPTIONS.map((option) => ({
        key: `language:${option.value}`,
        label: option.label,
        icon: i18n.language === option.value ? <CheckOutlined className={styles.languageCheck} /> : undefined,
      })),
    },
    { type: 'divider' },
    {
      key: 'updates',
      icon: <SyncOutlined />,
      label: t('settings.checkForUpdates'),
    },
    {
      key: 'about',
      icon: <InfoCircleOutlined />,
      label: t('settings.aboutApp'),
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('language:')) {
      void handleLanguageChange(key.slice('language:'.length));
      return;
    }

    if (key === 'updates') {
      void handleCheckForUpdates();
      return;
    }

    if (key === 'about') {
      onOpenAbout?.();
    }
  };

  return (
    <Tooltip title={t('label.settings')} placement="right">
      <Dropdown
        menu={{ items, onClick: handleMenuClick }}
        placement="topLeft"
        trigger={['click']}
        overlayClassName="fw-sidebar-popover"
      >
        <button type="button" className={styles.settingsButton} aria-label={t('label.settings')}>
          <SettingOutlined />
        </button>
      </Dropdown>
    </Tooltip>
  );
}
