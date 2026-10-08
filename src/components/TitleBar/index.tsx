import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import PinToggle from '../PinToggle';
import { isMacPlatform, isWindowsPlatform } from '../../utils/platform';
import styles from './TitleBar.module.css';

/**
 * Pointer handling on the strips deliberately does NOT rely on Tauri's injected
 * drag.js (`data-tauri-drag-region`):
 *
 * On macOS, drag.js starts a native drag (`performWindowDragWithEvent`) on the
 * FIRST mousedown of a double-click. That call reaches AppKit only after a
 * JS→IPC→Rust round-trip, so it routinely starts AFTER the first mouseup has
 * already been delivered. A performDrag started while the button is already
 * up keeps waiting for the next mousedown/mouseup pair — which is exactly the
 * second click of the double-click — and swallows both. The second click never
 * reaches the webview, so drag.js's mouseup leg (detail === 2 + position match
 * → internal_toggle_maximize) never fires: double-click-to-zoom is dead, while
 * dragging still works because a held drag outlives the IPC latency.
 *
 * Windows runs the same logic for uniformity (and because an IPC-delayed
 * `start_dragging` has the same "drag starts with the button already up" race
 * there too). So the strips take over:
 * - every direct left mousedown stops propagation (drag.js's document-level
 *   listener never runs → no performDrag racing a bare click, and no double
 *   toggle if its mouseup leg ever fires);
 * - dragging starts only after the pointer moves ≥ DRAG_THRESHOLD_PX while the
 *   button is held (tao's drag_window explicitly supports being invoked from a
 *   mouseDragged event — it synthesizes the LeftMouseDown itself);
 * - double-click zooms via the native dblclick event + toggleMaximize(), which
 *   lands in the native window zoom/maximize and restores the previous frame.
 */
const DRAG_THRESHOLD_PX = 4;

type WindowHandle = ReturnType<typeof getCurrentWindow>;

function runWindowAction(action: (win: WindowHandle) => Promise<unknown>, failureMessage: string) {
  try {
    // getCurrentWindow throws outside the Tauri runtime (plain browser dev).
    void action(getCurrentWindow()).catch((err) => console.error(failureMessage, err));
  } catch {
    // Not running inside Tauri — nothing to control.
  }
}

const startWindowDrag = () => runWindowAction((win) => win.startDragging(), 'Failed to start window drag');
const toggleWindowZoom = () => runWindowAction((win) => win.toggleMaximize(), 'Failed to toggle window zoom');
const minimizeWindow = () => runWindowAction((win) => win.minimize(), 'Failed to minimize window');
const closeWindow = () => runWindowAction((win) => win.close(), 'Failed to close window');

/** Drag surface + double-click zoom, shared by the macOS and Windows strips. */
function useStripPointerHandlers() {
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

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only the strip itself is the drag surface; child controls (the pin,
      // the caption buttons in the Windows strip) handle their own clicks.
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

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    // Belt and suspenders: without a matching mousedown, drag.js's module
    // state (initialX/initialY) stays 0 and its mouseup leg self-disarms —
    // but stopping propagation makes that guaranteed instead of incidental.
    e.stopPropagation();
  }, []);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    toggleWindowZoom();
  }, []);

  return { onMouseDown, onMouseUp, onDoubleClick };
}

/**
 * Window chrome per platform (see AGENTS.md → Window Titlebar):
 * - macOS: the webview extends under the transparent native titlebar
 *   (titleBarStyle "Overlay"), so the strip spans the window top; native
 *   traffic lights and the native title keep the left side, and the pin is the
 *   trailing control.
 * - Windows: the window is undecorated (tauri.windows.conf.json), so the strip
 *   IS the title bar and provides the caption controls; the pin sits
 *   immediately left of minimize.
 * - Linux: native decorations stay and the pin surfaces in the sidebar header
 *   (see Sidebar), so this renders nothing.
 */
export default function TitleBar() {
  if (isMacPlatform()) return <MacTitleBarStrip />;
  if (isWindowsPlatform()) return <WindowsTitleBarStrip />;
  return null;
}

function MacTitleBarStrip() {
  const stripPointer = useStripPointerHandlers();

  return (
    <div className={styles.strip} data-tauri-drag-region {...stripPointer}>
      {/* placement="left": a default "top" popup overflows the viewport edge
          during rc-trigger's align phase and WKWebView flashes its scroll
          indicators (whole-window shake). See AGENTS.md → Window Titlebar. */}
      <PinToggle variant="titleBar" placement="left" />
    </div>
  );
}

const GLYPH_PROPS = {
  width: 10,
  height: 10,
  viewBox: '0 0 10 10',
  'aria-hidden': true,
  focusable: 'false',
} as const;

/** Windows caption glyphs, drawn at the 10px size Windows uses at 100% DPI. */
function MinimizeGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

function MaximizeGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M0.5 0.5l9 9m0-9l-9 9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

interface CaptionButtonProps {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}

function CaptionButton({ label, onClick, danger = false, children }: CaptionButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.captionButton} ${danger ? styles.captionClose : ''}`}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function WindowsTitleBarStrip() {
  const { t } = useTranslation();
  const stripPointer = useStripPointerHandlers();
  const [maximized, setMaximized] = useState(false);

  // Track the maximize state so the middle button shows maximize vs restore.
  // onResized also fires for snap and Aero-Snap drags, so the icon follows
  // every way the window can change state.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    try {
      const win = getCurrentWindow();
      const refresh = () => {
        void win
          .isMaximized()
          .then((value) => {
            if (!disposed) setMaximized(value);
          })
          .catch(() => {});
      };
      refresh();
      void win
        .onResized(() => refresh())
        .then((stop) => {
          if (disposed) stop();
          else unlisten = stop;
        })
        .catch(() => {});
    } catch {
      // Not running inside Tauri — keep the plain maximize glyph.
    }
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <div className={styles.windowsStrip} data-tauri-drag-region {...stripPointer}>
      {/* placement="bottom": the pin is ~140px from the right edge here, so a
          centered popup cannot overflow the viewport (contrast: the macOS
          strip pin, which sits at the edge and needs "left"). */}
      <PinToggle variant="caption" placement="bottom" />
      <CaptionButton label={t('titleBar.minimize')} onClick={minimizeWindow}>
        <MinimizeGlyph />
      </CaptionButton>
      <CaptionButton label={maximized ? t('titleBar.restore') : t('titleBar.maximize')} onClick={toggleWindowZoom}>
        {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
      </CaptionButton>
      {/* The app hides to the tray on close (see main.rs on_window_event), so
          this behaves exactly like the old native caption button. */}
      <CaptionButton label={t('titleBar.close')} onClick={closeWindow} danger>
        <CloseGlyph />
      </CaptionButton>
    </div>
  );
}
