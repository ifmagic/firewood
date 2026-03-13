import styles from './FontSizeControl.module.css';

interface Props {
  fontSize: number;
  onIncrease: () => void;
  onDecrease: () => void;
}

export default function FontSizeControl({ fontSize, onIncrease, onDecrease }: Props) {
  return (
    <div className={styles.control}>
      <button className={styles.btn} onClick={onDecrease} title="缩小字体">−</button>
      <span className={styles.size}>{fontSize}px</span>
      <button className={styles.btn} onClick={onIncrease} title="放大字体">+</button>
    </div>
  );
}
