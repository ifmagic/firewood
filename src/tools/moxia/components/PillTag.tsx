import { useState } from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { CaretDownOutlined } from '@ant-design/icons';
import styles from '../Moxia.module.css';

interface PillTagProps {
  label?: string;
  value: string;
  options?: readonly string[];
  readOnly?: boolean;
  onChange?: (value: string) => void;
}

/**
 * Pill tag. Ports the original moxia QML PillTag.qml.
 * - readOnly=true: renders "label value" text
 * - readOnly=false: opens a dropdown on click
 */
export default function PillTag({ label, value, options, readOnly = false, onChange }: PillTagProps) {
  const [open, setOpen] = useState(false);

  if (readOnly || !options || options.length === 0) {
    return (
      <div className={styles.pill}>
        {label && <span className={styles.pillLabel}>{label}</span>}
        <span className={styles.pillValue}>{value}</span>
      </div>
    );
  }

  const items: MenuProps['items'] = options.map((opt) => ({
    key: opt,
    label: opt,
    onClick: () => {
      onChange?.(opt);
      setOpen(false);
    },
  }));

  return (
    <Dropdown menu={{ items, selectedKeys: [value] }} trigger={['click']} open={open} onOpenChange={setOpen}>
      <div
        className={`${styles.pill} ${styles.pillClickable} ${open ? styles.pillActive : ''}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        {label && <span className={styles.pillLabel}>{label}</span>}
        <span className={styles.pillValue}>{value}</span>
        <span className={styles.pillCaret}>
          <CaretDownOutlined />
        </span>
      </div>
    </Dropdown>
  );
}
