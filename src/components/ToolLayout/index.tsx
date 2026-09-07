import type { ReactNode } from 'react';
import styles from './ToolLayout.module.css';

interface Props {
  /** Custom header slot (e.g. moxia's menu bar). When absent, the content fills the whole area. */
  header?: ReactNode;
  children: ReactNode;
}

export default function ToolLayout({ header, children }: Props) {
  return (
    <div className={`${styles.wrapper} ${header ? styles.wrapperCustomHeader : ''}`}>
      {header ? <div className={styles.headerCustom}>{header}</div> : null}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
