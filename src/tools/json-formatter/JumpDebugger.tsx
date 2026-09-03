/**
 * DEV-ONLY diagnostic overlay for the json-formatter "click after scroll jumps back"
 * bug. Never renders in production builds (`import.meta.env.DEV`). The data source
 * and CM extension live in jumpDebuggerExtension.ts.
 */
import { useEffect, useState } from 'react';
import { buffer, listeners } from './jumpDebuggerExtension';

export default function JumpDebugger() {
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const poll = setInterval(l, 400);
    return () => {
      listeners.delete(l);
      clearInterval(poll);
    };
  }, []);

  if (!import.meta.env.DEV) return null;

  const text = buffer.map((e) => `${e.t} [${e.tag}] ${e.msg}`).join('\n');

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 44,
        zIndex: 9999,
        fontFamily: 'monospace',
        fontSize: 11,
        maxWidth: 520,
        maxHeight: open ? '42vh' : 84,
        overflow: 'auto',
        background: 'rgba(255, 255, 0, 0.92)',
        color: '#111',
        padding: '6px 8px',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'auto',
      }}
      onClick={() => setOpen((o) => !o)}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontWeight: 700 }}>
        <span>jump-debugger {open ? '▾' : '▸'} (click to expand)</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(text).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                },
                () => undefined,
              );
            }}
          >
            {copied ? 'copied' : 'copy'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              buffer.length = 0;
              force((n) => n + 1);
            }}
          >
            clear
          </button>
        </span>
      </div>
      {text || '(no events yet — scroll the editor and click)'}
    </div>
  );
}
