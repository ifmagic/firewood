/** Shared charcoal palette for the terminal.
 *  Mirrors the CSS tokens --fw-charcoal-* in src/index.css (bg, line, header,
 *  hover, active, muted, soft, lighter, pale, bright, ink, text, amber,
 *  amberDeep, error, success, lock, action, actionHover, actionPressed).
 *  The xterm theme object in src/tools/terminal/index.tsx consumes this, and
 *  src/tools/terminal/terminal.css reads the matching tokens — keep the CSS
 *  and this module in sync when either changes. */
export const charcoal = {
  bg: '#221d18',
  header: '#2a241d',
  line: '#3b342b',
  hover: '#2f2921',
  active: '#4d453a',
  muted: '#8f8577',
  soft: '#9c9181',
  lighter: '#a89d8d',
  pale: '#b0a595',
  bright: '#cec4b4',
  ink: '#fdfbf7',
  text: '#ded5c6',
  amber: '#f5b36b',
  amberDeep: '#c98a4b',
  error: '#ff9d85',
  success: '#7fce9a',
  lock: '#e8c273',
  action: '#c2410c',
  actionHover: '#d4551a',
  actionPressed: '#a63a10',
} as const;
