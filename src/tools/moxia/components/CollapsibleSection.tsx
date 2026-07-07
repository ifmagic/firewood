import { useState, type ReactNode } from 'react';
import { CaretRightOutlined } from '@ant-design/icons';
import styles from '../Moxia.module.css';

interface CollapsibleSectionProps {
  title: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
  /** Optional extra actions on the right side. */
  extra?: ReactNode;
}

/**
 * Collapsible section. Ports the original moxia QML CollapsibleSection.qml.
 */
export default function CollapsibleSection({
  title,
  defaultCollapsed = false,
  children,
  extra,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={styles.collapsible}>
      <div
        className={styles.collapsibleHeader}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
      >
        <span className={`${styles.chevron} ${collapsed ? '' : styles.chevronOpen}`}>
          <CaretRightOutlined />
        </span>
        <span className={styles.collapsibleTitle}>{title}</span>
        {extra && <div className={styles.collapsibleExtra}>{extra}</div>}
      </div>
      {!collapsed && <div className={styles.collapsibleBody}>{children}</div>}
    </div>
  );
}
