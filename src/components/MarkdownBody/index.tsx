import ReactMarkdown from 'react-markdown';
import styles from './MarkdownBody.module.css';

interface MarkdownBodyProps {
  content: string;
  maxBlockSize?: 'auto' | 'dialog';
}

const MAX_HEIGHT_BY_BLOCK: Record<NonNullable<MarkdownBodyProps['maxBlockSize']>, string> = {
  auto: '420px',
  dialog: '200px',
};

export default function MarkdownBody({ content, maxBlockSize = 'auto' }: MarkdownBodyProps) {
  return (
    <div className={styles.body} style={{ maxHeight: MAX_HEIGHT_BY_BLOCK[maxBlockSize] }}>
      <ReactMarkdown
        components={{
          h2: ({ children }) => <div className={styles.h2}>{children}</div>,
          h3: ({ children }) => <div className={styles.h3}>{children}</div>,
          ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
          li: ({ children }) => <li className={styles.li}>{children}</li>,
          p: ({ children }) => <p className={styles.p}>{children}</p>,
          strong: ({ children }) => <strong className={styles.strong}>{children}</strong>,
          hr: () => null,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
