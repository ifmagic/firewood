/**
 * Minimal template engine, ported from the original moxia `prompts/engine.py`.
 *
 * Syntax:
 *   {{var}}                 Variable substitution; missing vars degrade to empty string.
 *   {{#if var}}...{{/if}}   Truthy blocks are kept.
 *   {{#if var}}...{{else}}...{{/if}}   Else branch support.
 *
 * Conditional tags must occupy their own line. Nested if blocks are supported via depth counting.
 * Truthiness: non-empty string/array is truthy; undefined/null/empty string/empty collection is falsy.
 */

type Context = Record<string, unknown>;

function isTruthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return Boolean(v);
}

/** Collapses 3+ consecutive newlines into 2, then trims and single-newlines the result. */
function collapseBlankLines(s: string): string {
  return s.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const IF_RE = /^\s*\{\{#if\s+(\w+)\}\}\s*$/;
const ELSE_RE = /^\s*\{\{#else\}\}\s*$/;
const ENDIF_RE = /^\s*\{\{\/if\}\}\s*$/;
const VAR_RE = /\{\{(\w+)\}\}/g;

export function renderTemplate(template: string, ctx: Context): string {
  const lines = template.split('\n');
  const out: string[] = [];

  // Use a stack to handle nested ifs. Each frame tracks whether the current branch is being emitted
  // and whether the enclosing if has already matched a true branch.
  // stack[i] = { active: whether currently emitting, anyTrue: whether this if has matched a true branch }
  const stack: Array<{ active: boolean; anyTrue: boolean; parentActive: boolean }> = [];

  const currentlyActive = () => stack.length === 0 || stack[stack.length - 1].active;

  for (const line of lines) {
    const ifMatch = line.match(IF_RE);
    const elseMatch = line.match(ELSE_RE);
    const endIfMatch = line.match(ENDIF_RE);

    if (ifMatch) {
      const varName = ifMatch[1];
      const parentActive = currentlyActive();
      const cond = parentActive && isTruthy(ctx[varName]);
      stack.push({
        active: cond,
        anyTrue: cond,
        parentActive,
      });
      continue;
    }

    if (elseMatch) {
      if (stack.length === 0) continue;
      const top = stack[stack.length - 1];
      // Else branch is active when the parent is active and the current if has not matched a true branch.
      top.active = top.parentActive && !top.anyTrue;
      continue;
    }

    if (endIfMatch) {
      if (stack.length === 0) continue;
      stack.pop();
      continue;
    }

    // Ordinary lines: only process when currently in emit mode.
    if (!currentlyActive()) continue;

    // Variable substitution
    out.push(
      line.replace(VAR_RE, (_, name: string) => {
        const v = ctx[name];
        if (v === null || v === undefined) return '';
        return String(v);
      }),
    );
  }

  return collapseBlankLines(out.join('\n'));
}
