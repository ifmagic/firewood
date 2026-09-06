import PinToggle from '../PinToggle';
import { isMacPlatform } from '../../utils/platform';
import styles from './TitleBar.module.css';

/**
 * macOS overlay titlebar strip (see src-tauri/tauri.macos.conf.json:
 * titleBarStyle "Overlay" = titlebarAppearsTransparent + FullSizeContentView).
 * The webview extends under the transparent native titlebar, so this strip
 * spans the window top: the native traffic lights and native window title
 * keep their spot on the left (kept clear — Overlay does NOT hide the native
 * title), and the strip doubles as the window drag region
 * (data-tauri-drag-region). Full details: AGENTS.md → Window Titlebar.
 *
 * On other platforms the native title bar remains (titleBarStyle is
 * macOS-only) and this renders nothing; the pin surfaces in the sidebar
 * footer instead (see Sidebar). The guard lives in this wrapper so no hooks
 * and no window-API calls run off macOS.
 */
export default function TitleBar() {
  if (!isMacPlatform()) return null;
  return (
    <div className={styles.strip} data-tauri-drag-region>
      {/* placement="left": a default "top" popup overflows the viewport edge
			      during rc-trigger's align phase and WKWebView flashes its scroll
			      indicators (whole-window shake). See AGENTS.md → Window Titlebar. */}
      <PinToggle variant="titleBar" placement="left" />
    </div>
  );
}
