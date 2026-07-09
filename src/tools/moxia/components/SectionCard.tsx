import { useState, type ReactNode } from 'react';
import { CaretRightOutlined } from '@ant-design/icons';
import styles from '../Moxia.module.css';

interface SectionCardProps {
  title: string;
  icon?: ReactNode;
  extra?: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

/**
 * Unified card container for moxia detail pages. Every "titled content block"
 * (book description / worldbuilding, chapter notes, character sections &
 * relations) renders through this component for consistent visual treatment
 * and optional collapse.
 */
export default function SectionCard({
  title,
  icon,
  extra,
  collapsible = true,
  defaultCollapsed = false,
  children,
}: SectionCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const canToggle = collapsible;

  const handleToggle = () => {
    if (canToggle) setCollapsed((c) => !c);
  };

  return (
    <div className={styles.sectionCard}>
      <div
        className={styles.sectionCardHeader}
        role={canToggle ? 'button' : undefined}
        tabIndex={canToggle ? 0 : undefined}
        aria-expanded={canToggle ? !collapsed : undefined}
        onClick={handleToggle}
        onKeyDown={(e) => {
          // Let nested interactive elements (e.g. the `extra` button) own their
          // own key handling — otherwise Enter/Space would toggle the card and
          // preventDefault() would cancel the button's synthesized click.
          if (e.target !== e.currentTarget) return;
          if (canToggle && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
      >
        {canToggle && (
          <span className={`${styles.chevron} ${collapsed ? '' : styles.chevronOpen}`}>
            <CaretRightOutlined />
          </span>
        )}
        {icon && <span className={styles.sectionCardIcon}>{icon}</span>}
        <span className={styles.sectionCardTitle}>{title}</span>
        {extra && <div className={styles.sectionCardExtra}>{extra}</div>}
      </div>
      {/*
				Keep the body mounted (hidden via the `hidden` attribute) instead of
				unmounting on collapse. Unmounting would tear down nested CodeMirror
				views and wipe their undo history — a writer who collapses "Notes"
				then re-expands would lose Ctrl+Z. `hidden` sets display:none without
				destroying the DOM or its editor state.
			*/}
      <div className={styles.sectionCardBody} hidden={collapsed}>
        {children}
      </div>
    </div>
  );
}
