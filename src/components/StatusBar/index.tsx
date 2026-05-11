import type { ReactNode } from 'react';
import styles from './StatusBar.module.css';

interface StatusBarProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export default function StatusBar({ left, right, className }: StatusBarProps) {
  const classes = className ? `${styles.bar} ${className}` : styles.bar;

  return (
    <div className={classes}>
      <div className={styles.section}>{left}</div>
      <div className={`${styles.section} ${styles.sectionRight}`}>{right}</div>
    </div>
  );
}