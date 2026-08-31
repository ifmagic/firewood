import { useCallback, useEffect, useRef, useState } from 'react';
import { Input, message, Tag, Tooltip, Button, type InputRef } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import {
  create,
  evaluateDependencies,
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  modDependencies,
  powDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  piDependencies,
  eDependencies,
  tauDependencies,
  phiDependencies,
  sqrtDependencies,
  cbrtDependencies,
  absDependencies,
  expDependencies,
  logDependencies,
  log2Dependencies,
  log10Dependencies,
  sinDependencies,
  cosDependencies,
  tanDependencies,
  asinDependencies,
  acosDependencies,
  atanDependencies,
  atan2Dependencies,
  sinhDependencies,
  coshDependencies,
  tanhDependencies,
  floorDependencies,
  ceilDependencies,
  roundDependencies,
  minDependencies,
  maxDependencies,
  factorialDependencies,
  gcdDependencies,
  lcmDependencies,
  hypotDependencies,
} from 'mathjs/number';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { usePersistentState } from '../../hooks/usePersistentState';
import { type CalcRecord, formatRecordForCopy, useCalcHistory } from './history';
import HistorySection from './HistorySection';
import styles from './Numbox.module.css';

const math = create({
  ...evaluateDependencies,
  ...addDependencies,
  ...subtractDependencies,
  ...multiplyDependencies,
  ...divideDependencies,
  ...modDependencies,
  ...powDependencies,
  ...unaryMinusDependencies,
  ...unaryPlusDependencies,
  ...piDependencies,
  ...eDependencies,
  ...tauDependencies,
  ...phiDependencies,
  ...sqrtDependencies,
  ...cbrtDependencies,
  ...absDependencies,
  ...expDependencies,
  ...logDependencies,
  ...log2Dependencies,
  ...log10Dependencies,
  ...sinDependencies,
  ...cosDependencies,
  ...tanDependencies,
  ...asinDependencies,
  ...acosDependencies,
  ...atanDependencies,
  ...atan2Dependencies,
  ...sinhDependencies,
  ...coshDependencies,
  ...tanhDependencies,
  ...floorDependencies,
  ...ceilDependencies,
  ...roundDependencies,
  ...minDependencies,
  ...maxDependencies,
  ...factorialDependencies,
  ...gcdDependencies,
  ...lcmDependencies,
  ...hypotDependencies,
});
const DEBOUNCE_MS = 300;
const HOLD_DELAY_MS = 500;
const HOLD_REPEAT_MS = 100;
const ANS_RE = /\bans\b/;
const INCOMPLETE_RE = /[+\-*/%^(]$/;

type KeyKind = 'num' | 'op' | 'fn' | 'sci' | 'eq';

interface KeyDef {
  label: string;
  kind: KeyKind;
  append?: string;
  action?: 'clear' | 'equals';
  aria?: string;
}

function formatBase(r: number, base: 'hex' | 'bin'): string {
  if (base === 'hex') return r < 0 ? '-0x' + Math.abs(r).toString(16) : '0x' + r.toString(16);
  return r < 0 ? '-0b' + Math.abs(r).toString(2) : '0b' + r.toString(2);
}

function keyClass(kind: KeyKind): string {
  switch (kind) {
    case 'num':
      return styles.keyNum;
    case 'op':
      return styles.keyOp;
    case 'fn':
      return styles.keyFn;
    case 'sci':
      return styles.keySci;
    case 'eq':
      return styles.keyEq;
  }
}

export default function CalculatorPanel() {
  const { t } = useTranslation();
  const [expr, setExpr] = usePersistentState('tool:numbox:calc:expr', '');
  const [lastResult, setLastResult] = usePersistentState<number | null>('tool:numbox:calc:last-result', null);
  const [numResult, setNumResult] = useState<number | null>(null);
  const [rawResult, setRawResult] = useState('');
  const [hasError, setHasError] = useState(false);
  const [browseIdx, setBrowseIdx] = useState(-1);
  const [equalsPulsing, setEqualsPulsing] = useState(false);
  const [clearConfirming, setClearConfirming] = useState(false);
  const pulseTimer = useRef<number | undefined>(undefined);
  const exprInputRef = useRef<InputRef | null>(null);

  const { records: calcHistory, add: addHistory, clear: clearHistory } = useCalcHistory();

  // Focus the expression input on mount (keyboard-first, like the macOS calculator).
  useEffect(() => {
    exprInputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (pulseTimer.current !== undefined) window.clearTimeout(pulseTimer.current);
    };
  }, []);

  // Keep a ref to the latest `ans` so the debounce effect does not re-run when ans updates.
  const lastResultRef = useRef(lastResult);
  useEffect(() => {
    lastResultRef.current = lastResult;
  }, [lastResult]);

  // Real-time preview (debounced). Does NOT write to history; only commit does.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = expr.trim();
      if (!trimmed) {
        setNumResult(null);
        setRawResult('');
        setHasError(false);
        return;
      }
      const scope = lastResultRef.current != null ? { ans: lastResultRef.current } : {};
      try {
        const r = math.evaluate(trimmed, scope);
        if (typeof r === 'number' && !Number.isNaN(r)) {
          setNumResult(r);
          setRawResult(String(r));
          setHasError(false);
          // Update `ans` live, but never while the expression references ans (avoids feedback loop).
          if (!ANS_RE.test(trimmed)) setLastResult(r);
        } else {
          setNumResult(null);
          setRawResult(String(r));
          setHasError(false);
        }
      } catch {
        if (INCOMPLETE_RE.test(trimmed)) {
          // Trailing operator / open paren, e.g. "1+": show "…" instead of an error.
          setNumResult(null);
          setRawResult('');
          setHasError(false);
        } else {
          setNumResult(null);
          setRawResult('');
          setHasError(true);
        }
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [expr, t, setLastResult]);

  const isInteger = numResult != null && Number.isSafeInteger(numResult);
  const mainResult = numResult != null ? String(numResult) : rawResult;
  const resultClickable = !!mainResult && !hasError;

  const commit = () => {
    const trimmed = expr.trim();
    if (!trimmed) return;
    const scope = lastResultRef.current != null ? { ans: lastResultRef.current } : {};
    let r: unknown;
    try {
      r = math.evaluate(trimmed, scope);
    } catch {
      setNumResult(null);
      setRawResult('');
      setHasError(true);
      return;
    }
    const resultStr = String(r);
    if (typeof r === 'number' && !Number.isNaN(r)) setLastResult(r);
    addHistory({ kind: 'calc', expr: trimmed, result: resultStr });
    message.success(t('calculator.savedToHistory'), 1);
    setExpr('');
    setNumResult(null);
    setRawResult('');
    setHasError(false);
    setBrowseIdx(-1);
  };

  const clearInput = () => {
    setExpr('');
    setNumResult(null);
    setRawResult('');
    setHasError(false);
    setBrowseIdx(-1);
  };

  const backspace = useCallback(() => {
    setExpr((e) => e.slice(0, -1));
  }, [setExpr]);

  // Long-press hold-to-repeat for ⌫.
  const holdTimer = useRef<{ timeout?: number; interval?: number }>({});
  const stopHold = useCallback(() => {
    if (holdTimer.current.timeout !== undefined) window.clearTimeout(holdTimer.current.timeout);
    if (holdTimer.current.interval !== undefined) window.clearInterval(holdTimer.current.interval);
    holdTimer.current = {};
  }, []);
  const startHold = useCallback(() => {
    stopHold();
    backspace();
    holdTimer.current.timeout = window.setTimeout(() => {
      holdTimer.current.interval = window.setInterval(() => setExpr((e) => e.slice(0, -1)), HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  }, [stopHold, backspace, setExpr]);
  useEffect(() => stopHold, [stopHold]);

  const copyResult = () => {
    if (!resultClickable) return;
    navigator.clipboard.writeText(mainResult);
    message.success(t('calculator.copiedWith', { value: mainResult }), 1.5);
  };

  const append = useCallback((text: string) => setExpr((e) => e + text), [setExpr]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      clearInput();
      return;
    }
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (calcHistory.length > 0) setClearConfirming(true);
      return;
    }
    if (e.key === 'Enter' && !mod) {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      clearInput();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const browsing = browseIdx >= 0;
      if (expr === '' || browsing) {
        if (calcHistory.length === 0) return;
        e.preventDefault();
        let idx = browseIdx;
        if (e.key === 'ArrowUp') idx = Math.min(idx + 1, calcHistory.length - 1);
        else idx -= 1;
        if (idx < 0) {
          setExpr('');
          setBrowseIdx(-1);
        } else {
          setExpr(calcHistory[idx].expr);
          setBrowseIdx(idx);
        }
      }
    }
  };

  const handleEquals = () => {
    setEqualsPulsing(true);
    if (pulseTimer.current !== undefined) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setEqualsPulsing(false), 220);
    commit();
  };

  const handleKeyClick = (k: KeyDef) => {
    if (k.action === 'clear') {
      clearInput();
      return;
    }
    if (k.action === 'equals') {
      handleEquals();
      return;
    }
    if (k.append) {
      append(k.append);
    } else if (k.kind === 'num') {
      append(k.label);
    }
  };

  const handleClearConfirm = () => {
    clearHistory();
    setClearConfirming(false);
  };

  const renderCalcRow = (rec: CalcRecord) => (
    <>
      <Tag color="blue" className={styles.histTag}>
        {t('numbox.tagCalc')}
      </Tag>
      <button
        type="button"
        className={styles.histMain}
        onClick={() => {
          setExpr(rec.expr);
          setBrowseIdx(-1);
          exprInputRef.current?.focus();
        }}
        title={t('numbox.refillHint')}
        aria-label={`${t('numbox.refillHint')}: ${rec.expr}`}
      >
        <span className={styles.histTextLeft}>{rec.expr}</span>
        <span className={styles.histArrow}>→</span>
        <span className={styles.histTextRight}>{rec.result}</span>
      </button>
      <span className={styles.histTime}>{dayjs(rec.at).format('HH:mm:ss')}</span>
      <Tooltip title={t('numbox.copyDetails')}>
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          className={styles.histCopyBtn}
          onClick={() => {
            navigator.clipboard.writeText(formatRecordForCopy(rec, t));
            message.success(t('action.copied'));
          }}
        />
      </Tooltip>
    </>
  );

  const keyDefs: KeyDef[] = [
    { label: 'C', kind: 'fn', action: 'clear', aria: t('calculator.ariaClear') },
    { label: '(', kind: 'fn', append: '(', aria: t('calculator.ariaOpenParen') },
    { label: ')', kind: 'fn', append: ')', aria: t('calculator.ariaCloseParen') },
    { label: '%', kind: 'fn', append: '%', aria: t('calculator.ariaMod') },
    { label: '÷', kind: 'op', append: '/', aria: t('calculator.ariaDivide') },
    { label: '7', kind: 'num' },
    { label: '8', kind: 'num' },
    { label: '9', kind: 'num' },
    { label: '×', kind: 'op', append: '*', aria: t('calculator.ariaMultiply') },
    { label: '√', kind: 'sci', append: 'sqrt(', aria: t('calculator.ariaSqrt') },
    { label: '4', kind: 'num' },
    { label: '5', kind: 'num' },
    { label: '6', kind: 'num' },
    { label: '−', kind: 'op', append: '-', aria: t('calculator.ariaMinus') },
    { label: 'x²', kind: 'sci', append: '^2', aria: t('calculator.ariaSquare') },
    { label: '1', kind: 'num' },
    { label: '2', kind: 'num' },
    { label: '3', kind: 'num' },
    { label: '+', kind: 'op', append: '+', aria: t('calculator.ariaPlus') },
    { label: 'xʸ', kind: 'sci', append: '^', aria: t('calculator.ariaPower') },
    { label: '0', kind: 'num' },
    { label: '.', kind: 'num' },
    { label: 'π', kind: 'sci', append: 'pi', aria: t('calculator.ariaPi') },
    { label: 'e', kind: 'sci', append: 'e', aria: t('calculator.ariaE') },
    { label: '=', kind: 'eq', action: 'equals', aria: t('calculator.ariaEquals') },
  ];

  return (
    <div className={styles.calcLayout}>
      <div className={styles.calcCard}>
        {/* Expression input: a single always-editable field, like macOS Calculator */}
        <div className={styles.exprArea}>
          <Input
            ref={exprInputRef}
            value={expr}
            onChange={(e) => {
              setExpr(e.target.value);
              setBrowseIdx(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('calculator.placeholder')}
            className={styles.exprInput}
            aria-label={t('calculator.expression')}
          />
          <button
            type="button"
            className={styles.backspaceBtn}
            aria-label={t('calculator.ariaBackspace')}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
          >
            ⌫
          </button>
        </div>

        {/* Result display: large, right-aligned, click to copy */}
        <div className={styles.resultArea} key={numResult == null ? 'none' : String(numResult)}>
          <div className={styles.resultMain}>
            <span className={styles.resultEquals}>=</span>
            <span
              className={`${styles.resultValue}${resultClickable ? ` ${styles.resultFlash} ${styles.resultValueClickable}` : ''}`}
              onClick={resultClickable ? copyResult : undefined}
              title={resultClickable ? t('action.copy') : undefined}
            >
              {hasError ? (
                <span className={styles.resultError}>{t('calculator.invalidExpression')}</span>
              ) : mainResult ? (
                mainResult
              ) : expr.trim() ? (
                <span className={styles.resultEllipsis}>…</span>
              ) : null}
            </span>
          </div>
          {isInteger && (
            <div className={styles.resultBases}>
              {formatBase(numResult as number, 'hex')} · {formatBase(numResult as number, 'bin')}
            </div>
          )}
        </div>

        {/* Keypad: flexible grid filling the remaining space */}
        <div className={styles.keypad} onMouseDown={(e) => e.preventDefault()}>
          {keyDefs.map((def) => (
            <button
              key={def.label}
              type="button"
              className={`${styles.keyBtn} ${keyClass(def.kind)}${
                def.kind === 'eq' && equalsPulsing ? ` ${styles.keyEqPulse}` : ''
              }`}
              onClick={() => handleKeyClick(def)}
              aria-label={def.aria ?? t('calculator.ariaDigit', { digit: def.label })}
            >
              {def.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inline calculation history (isolated from the timestamp panel's) */}
      <div className={styles.calcHistory}>
        <HistorySection
          records={calcHistory}
          clearConfirming={clearConfirming}
          onRequestClear={() => setClearConfirming(true)}
          onClearConfirm={handleClearConfirm}
          onClearCancel={() => setClearConfirming(false)}
          renderRow={renderCalcRow}
        />
      </div>
    </div>
  );
}
