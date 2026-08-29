import { useState, type ReactNode } from 'react';
import { Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import styles from './Numbox.module.css';

interface Props<T> {
  records: T[];
  /** How many records to show before the "show all" toggle. */
  visibleCount?: number;
  clearConfirming: boolean;
  onRequestClear: () => void;
  onClearConfirm: () => void;
  onClearCancel: () => void;
  renderRow: (rec: T) => ReactNode;
}

export default function HistorySection<T extends { id: string }>({
  records,
  visibleCount = 10,
  clearConfirming,
  onRequestClear,
  onClearConfirm,
  onClearCancel,
  renderRow,
}: Props<T>) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const count = records.length;
  const hasMore = count > visibleCount;
  const shown = expanded || !hasMore ? records : records.slice(0, visibleCount);

  return (
    <section className={styles.histSection} aria-label={t('numbox.history')}>
      <div className={styles.histHeader}>
        {clearConfirming ? (
          <>
            <span className={styles.histConfirmText}>{t('numbox.clearConfirm')}</span>
            <div className={styles.histConfirmActions}>
              <Button size="small" danger onClick={onClearConfirm}>
                {t('numbox.confirmClear')}
              </Button>
              <Button size="small" onClick={onClearCancel}>
                {t('action.cancel')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h4 className={styles.histTitle}>{t('numbox.history')}</h4>
            {count > 0 && <span className={styles.histCount}>{count}</span>}
            <div className={styles.histHeaderSpacer} />
            {hasMore && (
              <button
                type="button"
                className={styles.histToggle}
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
              >
                {expanded ? t('numbox.historyCollapse') : t('numbox.historyExpand', { count })}
              </button>
            )}
            {count > 0 && (
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={onRequestClear}
                className={styles.histClearBtn}
                title={t('numbox.clearHistory')}
                aria-label={t('numbox.clearHistory')}
              />
            )}
          </>
        )}
      </div>
      {count === 0 ? (
        <div className={styles.histEmpty}>{t('numbox.noHistory')}</div>
      ) : (
        <div className={styles.histList}>
          {shown.map((rec) => (
            <div key={rec.id} className={styles.histItem}>
              {renderRow(rec)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
