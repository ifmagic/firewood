import { useTranslation } from 'react-i18next';
import styles from '../Moxia.module.css';

export default function EmptyPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.emptyPage}>
      <div className={styles.emptyIcon}>✏️</div>
      <div>{t('moxia.emptyHint')}</div>
    </div>
  );
}
