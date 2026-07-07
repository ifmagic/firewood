import { useTranslation } from 'react-i18next';
import styles from '../Moxia.module.css';

export default function EmptyPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.emptyPage}>
      <blockquote className={styles.emptyQuote}>{t('moxia.emptyQuote')}</blockquote>
      <cite className={styles.emptyAuthor}>{t('moxia.emptyAuthor')}</cite>
    </div>
  );
}
