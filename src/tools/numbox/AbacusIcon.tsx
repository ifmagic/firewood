import type { CSSProperties } from 'react';

interface Props {
  style?: CSSProperties;
  className?: string;
}

/** Abacus icon: a time-honoured calculation tool, fitting both the calculator
 *  and the timestamp conventions (beads as digits & ticks). */
export default function AbacusIcon({ style, className }: Props) {
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
      <path d="M6 7.8h12" />
      <path d="M6 11.4h12" />
      <path d="M6 15h12" />
      <path d="M6 18.6h12" />
      <g fill="currentColor" stroke="none">
        <rect x="7.6" y="6.4" width="2.2" height="2.8" rx="1.1" />
        <rect x="11.5" y="6.4" width="2.2" height="2.8" rx="1.1" />
        <rect x="15.4" y="6.4" width="2.2" height="2.8" rx="1.1" />
        <rect x="9.5" y="10" width="2.2" height="2.8" rx="1.1" />
        <rect x="13.4" y="10" width="2.2" height="2.8" rx="1.1" />
        <rect x="7.6" y="13.6" width="2.2" height="2.8" rx="1.1" />
        <rect x="11.5" y="13.6" width="2.2" height="2.8" rx="1.1" />
        <rect x="15.4" y="13.6" width="2.2" height="2.8" rx="1.1" />
        <rect x="9.5" y="17.2" width="2.2" height="2.8" rx="1.1" />
        <rect x="13.4" y="17.2" width="2.2" height="2.8" rx="1.1" />
      </g>
    </svg>
  );
}
