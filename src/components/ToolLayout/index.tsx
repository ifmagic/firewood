import type { ReactNode } from 'react';
import { Typography } from 'antd';
import styles from './ToolLayout.module.css';

interface Props {
  title: string;
  /** Custom header slot. When provided, the default breadcrumb is skipped. */
  header?: ReactNode;
  children: ReactNode;
}

export default function ToolLayout({ title, header, children }: Props) {
  return (
    <div className={`${styles.wrapper} ${header ? styles.wrapperCustomHeader : ''}`}>
      <div className={`${styles.header} ${header ? styles.headerCustom : ''}`}>
        {header ?? <DefaultBreadcrumb title={title} />}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

function DefaultBreadcrumb({ title }: { title: string }) {
  return <Typography.Text className={styles.breadcrumb}>Firewood / {title}</Typography.Text>;
}
