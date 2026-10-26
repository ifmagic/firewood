import type { CSSProperties } from 'react';

interface Props {
  style?: CSSProperties;
  className?: string;
}

/** Numbox icon: a hash mark in a box — "numbers in a box", pairing with Moxia's
 *  ink-box glyph in the same outline family (1.8 stroke, rounded caps). */
export default function NumboxIcon({ style, className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      <rect x="3.5" y="3" width="17" height="18" rx="3.5" />
      <path d="M10 7.5v9" />
      <path d="M14 7.5v9" />
      <path d="M7.5 10.5h9" />
      <path d="M7.5 13.5h9" />
    </svg>
  );
}
