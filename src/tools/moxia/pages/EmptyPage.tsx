import styles from '../Moxia.module.css';

export default function EmptyPage() {
  return (
    <div className={styles.emptyPage}>
      <blockquote className={styles.emptyQuote}>
        “There is no greater agony than bearing an untold story inside you.”
      </blockquote>
      <cite className={styles.emptyAuthor}>— Maya Angelou</cite>
    </div>
  );
}
