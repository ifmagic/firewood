import type { ReactNode } from 'react';
import styles from '../Moxia.module.css';

interface Props {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** solid = filled accent (primary action); ghost = outlined (secondary). Defaults to 'ghost'. */
  variant?: 'solid' | 'ghost';
}

/**
 * Reusable AI tool trigger chip. Pill-shaped to harmonize with PillTag.
 * Drop into any page/toolbar to trigger an AI generator flow.
 */
export default function AiToolButton({ icon, label, onClick, disabled = false, variant = 'ghost' }: Props) {
  const variantClass = variant === 'solid' ? styles.aiToolBtnSolid : styles.aiToolBtnGhost;

  return (
    <button type="button" className={`${styles.aiToolBtn} ${variantClass}`} onClick={onClick} disabled={disabled}>
      <span className={styles.aiToolBtnIcon}>{icon}</span>
      <span className={styles.aiToolBtnLabel}>{label}</span>
    </button>
  );
}
