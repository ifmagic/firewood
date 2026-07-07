import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../Moxia.module.css';

export interface CommandPaletteCommand {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface Props {
  open: boolean;
  commands: CommandPaletteCommand[];
  onClose: () => void;
}

/**
 * Lightweight command palette (Cmd+K pattern). Rendered as a top-anchored overlay
 * rather than an Ant Modal so the feel stays closer to Linear/VS Code/Raycast.
 *
 * ARIA: implements the WAI-ARIA combobox + listbox pattern. The search input owns
 * focus and exposes the active option via `aria-activedescendant`; items are not in
 * the tab order (use arrow keys to move the active highlight).
 *
 * Keyboard:
 *  - ↑/↓      move selection (skips disabled)
 *  - Enter    trigger selected
 *  - Esc      close + restore focus to trigger
 *  - Cmd/Ctrl+K when open → refocus search (no close)
 */
export default function CommandPalette({ open, commands, onClose }: Props) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Remember the element that had focus before the palette opened so we can restore it.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Reset keyword + selection when the palette transitions to open.
  // "Adjust state during render" pattern (React docs) — avoids setState-in-effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setKeyword('');
      setActiveIndex(0);
    }
  }

  // On open: remember the active element + focus the search input.
  // On close: restore focus to the trigger.
  useEffect(() => {
    if (!open) {
      // Restore focus on close (WCAG 2.4.3 Focus Order).
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
        previouslyFocusedRef.current = null;
      }
      return;
    }
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(kw) || (c.description?.toLowerCase().includes(kw) ?? false),
    );
  }, [keyword, commands]);

  // Clamp activeIndex to the filtered range — derived during render, no effect needed.
  const safeIndex = filtered.length === 0 ? 0 : Math.min(activeIndex, filtered.length - 1);
  if (safeIndex !== activeIndex) setActiveIndex(safeIndex);

  // Scroll the active item into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[safeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [safeIndex]);

  if (!open) return null;

  const moveActive = (delta: number) => {
    const n = filtered.length;
    if (n === 0) return;
    // Skip disabled items when moving.
    let next = safeIndex;
    for (let i = 0; i < n; i++) {
      next = (next + delta + n) % n;
      if (!filtered[next].disabled) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const triggerActive = () => {
    const cmd = filtered[safeIndex];
    if (cmd && !cmd.disabled) cmd.onSelect();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl+K while open → refocus search, don't close.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    // Trap Tab inside the palette so focus doesn't escape into the underlying page.
    if (e.key === 'Tab') {
      e.preventDefault();
      inputRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      triggerActive();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const activeOptionId = filtered.length > 0 ? `moxia-palette-opt-${filtered[safeIndex].id}` : undefined;

  return (
    <div
      className={styles.commandPaletteOverlay}
      onMouseDown={(e) => {
        // Only close on left-click outside the panel.
        if (e.button === 0) onClose();
      }}
      role="presentation"
    >
      <div
        className={styles.commandPalette}
        role="dialog"
        aria-modal="true"
        aria-label={t('moxia.commandPaletteTitle')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          className={styles.commandPaletteInput}
          role="combobox"
          aria-expanded="true"
          aria-controls="moxia-palette-list"
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label={t('moxia.commandPalettePlaceholder')}
          placeholder={t('moxia.commandPalettePlaceholder')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className={styles.commandPaletteList} id="moxia-palette-list" role="listbox" ref={listRef}>
          {filtered.length === 0 && (
            <div className={styles.commandPaletteEmpty} role="status">
              {t('moxia.commandPaletteEmpty')}
            </div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              id={`moxia-palette-opt-${cmd.id}`}
              type="button"
              role="option"
              aria-selected={i === safeIndex}
              aria-disabled={cmd.disabled || undefined}
              tabIndex={-1}
              className={`${styles.commandPaletteItem} ${i === safeIndex ? styles.commandPaletteItemActive : ''} ${cmd.disabled ? styles.commandPaletteItemDisabled : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => !cmd.disabled && setActiveIndex(i)}
              onClick={() => {
                if (!cmd.disabled) cmd.onSelect();
              }}
            >
              <span className={styles.commandPaletteItemIcon} aria-hidden="true">
                {cmd.icon}
              </span>
              <span className={styles.commandPaletteItemLabel}>{cmd.label}</span>
              {cmd.description && <span className={styles.commandPaletteItemDesc}>{cmd.description}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
