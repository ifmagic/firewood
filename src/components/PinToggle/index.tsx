import { Tooltip } from 'antd';
import { PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { TooltipProps } from 'antd';
import { useAlwaysOnTop } from '../../hooks/useAlwaysOnTop';
import styles from './PinToggle.module.css';

interface PinToggleProps {
  placement?: TooltipProps['placement'];
  /** "titleBar": 24px on the light titlebar strip; "sidebar": 32px on the dark sidebar footer. */
  variant: 'titleBar' | 'sidebar';
}

/**
 * Global always-on-top pin toggle (persisted via useAlwaysOnTop). Must mount
 * exactly once per platform: in the macOS overlay TitleBar strip (far right,
 * clear of the traffic lights) or in the sidebar footer on Windows/Linux —
 * two mounted instances would fight over one window state. The platform gate
 * lives in the consumers, so this component stays platform-agnostic.
 */
export default function PinToggle({ placement = 'top', variant }: PinToggleProps) {
  const { t } = useTranslation();
  const { pinned, toggle } = useAlwaysOnTop();
  const label = pinned ? t('titleBar.unpin') : t('titleBar.pin');

  return (
    <Tooltip title={label} placement={placement}>
      <button
        type="button"
        className={`${styles.pinButton} ${variant === 'titleBar' ? styles.titleBar : styles.sidebar} ${pinned ? styles.pinButtonActive : ''}`}
        aria-pressed={pinned}
        aria-label={label}
        onClick={toggle}
      >
        {pinned ? <PushpinFilled /> : <PushpinOutlined />}
      </button>
    </Tooltip>
  );
}
