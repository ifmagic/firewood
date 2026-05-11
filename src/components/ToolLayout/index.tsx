import type { ReactNode } from 'react';
import { Typography } from 'antd';
import styles from './ToolLayout.module.css';

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function ToolLayout({ title, children }: Props) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <Typography.Text className={styles.breadcrumb}>
          Firewood / {title}
        </Typography.Text>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
