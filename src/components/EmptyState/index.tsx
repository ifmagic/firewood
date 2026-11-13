import type { ReactNode } from 'react';
import { FireOutlined } from '@ant-design/icons';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: ReactNode;
}

/**
 * Shared empty state: one quiet ember mark, a short instruction, and at most
 * one action. Replaces Ant Design's default illustrated Empty, whose artwork
 * belongs to a different visual system.
 */
export default function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.mark} aria-hidden="true">
        <FireOutlined />
      </span>
      <div className={styles.title}>{title}</div>
      {hint ? <div className={styles.hint}>{hint}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
