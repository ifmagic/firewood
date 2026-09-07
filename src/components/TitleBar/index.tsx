import { useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import PinToggle from '../PinToggle';
import { isMacPlatform } from '../../utils/platform';
import styles from './TitleBar.module.css';

/**
 * Pointer handling on the strip deliberately does NOT rely on Tauri's injected
 * drag.js (`data-tauri-drag-region`):
 *
 * drag.js starts a native drag (`performWindowDragWithEvent`) on the FIRST
 * mousedown of a double-click. That call reaches AppKit only after a
 * JS→IPC→Rust round-trip, so it routinely starts AFTER the first mouseup has
 * already been delivered. A performDrag started while the button is already
 * up keeps waiting for the next mousedown/mouseup pair — which is exactly the
 * second click of the double-click — and swallows both. The second click never
 * reaches the webview, so drag.js's mouseup leg (detail === 2 + position match
 * → internal_toggle_maximize) never fires: double-click-to-zoom is dead, while
 * dragging still works because a held drag outlives the IPC latency.
 *
 * So the strip takes over:
 * - every direct left mousedown stops propagation (drag.js's document-level
 *   listener never runs → no performDrag racing a bare click, and no double
 *   toggle if its mouseup leg ever fires);
 * - dragging starts only after the pointer moves ≥ DRAG_THRESHOLD_PX while the
 *   button is held (tao's drag_window explicitly supports being invoked from a
 *   mouseDragged event — it synthesizes the LeftMouseDown itself);
 * - double-click zooms via the native dblclick event + toggleMaximize(), which
 *   lands in tao's native NSWindow zoom and restores the pre-zoom frame.
 */
const DRAG_THRESHOLD_PX = 4;

function startWindowDrag() {
  try {
    // getCurrentWindow throws outside the Tauri runtime (plain browser dev).
    void getCurrentWindow()
      .startDragging()
      .catch((err) => console.error('Failed to start window drag', err));
  } catch {
    // Not running inside Tauri — nothing to drag.
  }
}

function toggleWindowZoom() {
  try {
    void getCurrentWindow()
      .toggleMaximize()
      .catch((err) => console.error('Failed to toggle window zoom', err));
  } catch {
    // Not running inside Tauri — nothing to zoom.
  }
}

/**
 * macOS overlay titlebar strip (see src-tauri/tauri.macos.conf.json:
 * titleBarStyle "Overlay" = titlebarAppearsTransparent + FullSizeContentView).
 * The webview extends under the transparent native titlebar, so this strip
 * spans the window top: the native traffic lights and native window title
 * keep their spot on the left (kept clear — Overlay does NOT hide the native
 * title), and the strip doubles as the window drag surface. Full details:
 * AGENTS.md → Window Titlebar.
 *
 * On other platforms the native title bar remains (titleBarStyle is
 * macOS-only) and this renders nothing; the pin surfaces in the sidebar
 * footer instead (see Sidebar). The platform guard lives in this wrapper so
 * no hooks/window-API calls run off macOS.
 */
export default function TitleBar() {
  if (!isMacPlatform()) return null;
  return <MacTitleBarStrip />;
}

function MacTitleBarStrip() {
  const cancelDragTrackRef = useRef<(() => void) | null>(null);

  // Cancel any armed drag tracking on unmount so window listeners never leak.
  useEffect(
    () => () => {
      cancelDragTrackRef.current?.();
    },
    [],
  );

  const beginDragTrack = useCallback((startX: number, startY: number) => {
    const onMouseMove = (e: MouseEvent) => {
      if ((e.buttons & 1) === 0) {
        cancelDragTrack();
        return;
      }
      // Stay quiet below the threshold: a plain click (or the tiny jitter of
      // a double-click) must never reach startDragging, or we reintroduce the
      // performDrag race described above.
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < DRAG_THRESHOLD_PX) {
        return;
      }
      cancelDragTrack();
      startWindowDrag();
    };
    const onMouseUp = () => cancelDragTrack();
    const cancelDragTrack = () => {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      if (cancelDragTrackRef.current === cancelDragTrack) {
        cancelDragTrackRef.current = null;
      }
    };

    cancelDragTrackRef.current?.();
    cancelDragTrackRef.current = cancelDragTrack;
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only the strip itself is the drag surface; the pin button handles its
      // own clicks (target check keeps both drag and zoom off it).
      if (e.button !== 0 || e.target !== e.currentTarget) return;
      // Keep drag.js from ever acting on this strip (see component docs).
      e.stopPropagation();
      // detail === 1: first press of a click/drag.
      // detail === 2: second press of a double-click — arm tracking too, so
      // "double-click, keep holding, drag" moves the window instead of
      // zooming it (the dblclick event won't fire after real movement).
      beginDragTrack(e.clientX, e.clientY);
    },
    [beginDragTrack],
  );

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    // Belt and suspenders: without a matching mousedown, drag.js's module
    // state (initialX/initialY) stays 0 and its mouseup leg self-disarms —
    // but stopping propagation makes that guaranteed instead of incidental.
    e.stopPropagation();
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    toggleWindowZoom();
  }, []);

  return (
    <div
      className={styles.strip}
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* placement="left": a default "top" popup overflows the viewport edge
			      during rc-trigger's align phase and WKWebView flashes its scroll
			      indicators (whole-window shake). See AGENTS.md → Window Titlebar. */}
      <PinToggle variant="titleBar" placement="left" />
    </div>
  );
}
