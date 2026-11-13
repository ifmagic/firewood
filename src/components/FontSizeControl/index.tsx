import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './FontSizeControl.module.css';

interface Props {
  fontSize: number;
  onIncrease: () => void;
  onDecrease: () => void;
}

export default function FontSizeControl({ fontSize, onIncrease, onDecrease }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  // Keep refs to callbacks so the wheel listener never needs to be re-registered
  const increaseRef = useRef(onIncrease);
  const decreaseRef = useRef(onDecrease);
  useEffect(() => {
    increaseRef.current = onIncrease;
  }, [onIncrease]);
  useEffect(() => {
    decreaseRef.current = onDecrease;
  }, [onDecrease]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) increaseRef.current();
      else decreaseRef.current();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return (
    <div ref={ref} className={styles.control}>
      <button
        type="button"
        className={styles.btn}
        onClick={onDecrease}
        title={t('fontSizeControl.decrease')}
        aria-label={t('fontSizeControl.decrease')}
      >
        −
      </button>
      <span className={styles.size} aria-live="polite">
        {fontSize}px
      </span>
      <button
        type="button"
        className={styles.btn}
        onClick={onIncrease}
        title={t('fontSizeControl.increase')}
        aria-label={t('fontSizeControl.increase')}
      >
        +
      </button>
    </div>
  );
}
