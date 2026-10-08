import { Tooltip } from 'antd';
import { PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { TooltipProps } from 'antd';
import { useAlwaysOnTop } from '../../hooks/useAlwaysOnTop';
import styles from './PinToggle.module.css';

interface PinToggleProps {
  /**
   * Required on purpose: antd's default "top" centers the popup, and on a
   * button near a viewport edge that is exactly the WKWebView scrollbar-flash
   * footgun AGENTS.md documents. Every consumer knows its own safe side.
   */
  placement: TooltipProps['placement'];
  /**
   * "titleBar": 24px on the macOS light titlebar strip; "caption": 46x32
   * caption-row footprint on the Windows custom titlebar (flush with
   * min/max/close); "sidebar": 32px on the dark sidebar surfaces (header row /
   * rail).
   */
  variant: 'titleBar' | 'sidebar' | 'caption';
}

/**
 * Global always-on-top pin toggle (persisted via useAlwaysOnTop). Must mount
 * exactly once per platform: in the macOS overlay TitleBar strip (far right,
 * clear of the traffic lights), in the Windows custom titlebar immediately
 * left of the minimize button, or in the sidebar header on Linux (which keeps
 * the native title bar). All three are top-chrome slots, never the settings
 * footer, because this is a window-level control. Two mounted instances would
 * fight over one window state. The platform gate lives in the consumers, so
 * this component stays platform-agnostic.
 */
export default function PinToggle({ placement, variant }: PinToggleProps) {
  const { t } = useTranslation();
  const { pinned, toggle } = useAlwaysOnTop();
  const label = pinned ? t('titleBar.unpin') : t('titleBar.pin');
  const variantClass = { titleBar: styles.titleBar, sidebar: styles.sidebar, caption: styles.caption }[variant];

  return (
    <Tooltip title={label} placement={placement}>
      <button
        type="button"
        className={`${styles.pinButton} ${variantClass} ${pinned ? styles.pinButtonActive : ''}`}
        aria-pressed={pinned}
        aria-label={label}
        onClick={toggle}
      >
        {pinned ? <PushpinFilled /> : <PushpinOutlined />}
      </button>
    </Tooltip>
  );
}
