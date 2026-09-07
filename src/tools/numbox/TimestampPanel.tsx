import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Button, DatePicker, message, Tooltip, Tag } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { usePersistentState } from '../../hooks/usePersistentState';
import {
  type NewTsRecord,
  type TsRecord,
  formatRecordForCopy,
  makeTsDeduper,
  recordTag,
  useTsHistory,
} from './history';
import HistorySection from './HistorySection';
import styles from './Numbox.module.css';

type TsUnit = 's' | 'ms';

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

function pad(n: number) {
  return n < 10 ? '0' + n : String(n);
}

function formatLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

function formatUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

function relativeTime(ms: number, now: number, t: TFunc): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const past = diff < 0;
  const sec = Math.round(abs / 1000);
  if (sec < 60) return past ? t('timestamp.justNow') : t('timestamp.inSeconds', { n: sec });
  const min = Math.round(sec / 60);
  if (min < 60) return past ? t('timestamp.minutesAgo', { n: min }) : t('timestamp.inMinutes', { n: min });
  const hr = Math.round(min / 60);
  if (hr < 24) return past ? t('timestamp.hoursAgo', { n: hr }) : t('timestamp.inHours', { n: hr });
  const day = Math.round(hr / 24);
  if (day < 30) return past ? t('timestamp.daysAgo', { n: day }) : t('timestamp.inDays', { n: day });
  const mon = Math.round(day / 30);
  return past ? t('timestamp.monthsAgo', { n: mon }) : t('timestamp.inMonths', { n: mon });
}

function startOfWeekMonday(d: Dayjs): Dayjs {
  const day = d.day(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  return d.subtract(diff, 'day').startOf('day');
}

export default function TimestampPanel() {
  const { t } = useTranslation();
  const [ts, setTs] = usePersistentState('tool:numbox:ts:ts', '');
  const [dateValue, setDateValue] = usePersistentState<string | null>('tool:numbox:ts:date', null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [clearConfirming, setClearConfirming] = useState(false);
  const deduperRef = useRef(makeTsDeduper());
  const didMountRef = useRef(false);

  const { records: tsHistory, add: addTsHistory, clear: clearTsHistory } = useTsHistory();

  // Live current-timestamp ticker (1s).
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const tsOutputs = useMemo(() => {
    const trimmed = ts.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const unit: TsUnit = trimmed.length >= 13 ? 'ms' : 's';
    const num = Number(trimmed);
    const ms = unit === 's' ? num * 1000 : num;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return { local: formatLocal(d), utc: formatUTC(d), ms, unit };
  }, [ts]);

  const date: Dayjs | null = useMemo(() => (dateValue ? dayjs(dateValue) : null), [dateValue]);
  const dateMs = date ? date.valueOf() : null;
  const dateOutputs = useMemo(() => {
    if (dateMs == null) return null;
    const d = new Date(dateMs);
    return { s: String(Math.floor(dateMs / 1000)), ms: String(dateMs), local: formatLocal(d) };
  }, [dateMs]);

  const maybeRecordTs = (r: NewTsRecord) => {
    if (!deduperRef.current.shouldRecord(r)) return;
    addTsHistory(r);
  };

  // Record date-to-ts after the user settles on a date (debounced, skip mount).
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!dateOutputs) return;
    const id = window.setTimeout(() => {
      maybeRecordTs({ kind: 'date-to-ts', left: dateOutputs.local, right: dateOutputs.s, unit: 's' });
    }, 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateOutputs]);

  const commitTsToDate = () => {
    if (!tsOutputs) return;
    maybeRecordTs({ kind: 'ts-to-date', left: ts.trim(), right: tsOutputs.local, unit: tsOutputs.unit });
  };

  const copy = (text: string, rec?: NewTsRecord) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (rec) maybeRecordTs(rec);
    message.success(t('action.copied'));
  };

  const nowSec = Math.floor(nowTick / 1000);
  const nowMs = nowTick;
  const nowLocal = formatLocal(new Date(nowTick));

  const quickItems = useMemo(() => {
    const now = dayjs(nowTick);
    return [
      { label: t('timestamp.quickNow'), value: String(now.unix()) },
      { label: t('timestamp.quickTodayStart'), value: String(now.startOf('day').unix()) },
      { label: t('timestamp.quickTodayEnd'), value: String(now.endOf('day').unix()) },
      { label: t('timestamp.quickWeekStart'), value: String(startOfWeekMonday(now).unix()) },
      { label: t('timestamp.quickMonthStart'), value: String(now.startOf('month').unix()) },
    ];
  }, [t, nowTick]);

  const tsRel = tsOutputs ? relativeTime(tsOutputs.ms, nowTick, t) : '';

  const renderOutput = (label: string, value: string, rec?: NewTsRecord) => (
    <div className={styles.tsOutput}>
      <span className={styles.tsOutputLabel}>{label}</span>
      <code className={styles.tsOutputValue}>{value}</code>
      <Tooltip title={t('action.copy')}>
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          className={styles.tsOutputCopy}
          disabled={!value}
          onClick={() => copy(value, rec)}
          aria-label={`${t('action.copy')} ${label}`}
        />
      </Tooltip>
    </div>
  );

  const renderTsRow = (rec: TsRecord) => {
    const tag = recordTag(rec, t);
    return (
      <>
        <Tag color={tag.color} className={styles.histTag}>
          {tag.label}
        </Tag>
        <div className={styles.histMain}>
          <span className={styles.histTextLeft}>{rec.left}</span>
          <span className={styles.histArrow}>→</span>
          <span className={styles.histTextRight}>{rec.right}</span>
        </div>
        <span className={styles.histMeta}>{rec.unit}</span>
        <span className={styles.histTime}>{new Date(rec.at).toLocaleTimeString([], { hour12: false })}</span>
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
  };

  return (
    <div className={styles.panel}>
      <div className={styles.tsContent}>
        {/* Live current timestamp */}
        <div className={styles.section}>
          <div className={styles.nowHeader}>
            <div className={styles.nowMain}>
              <span className={styles.nowLabel}>{t('timestamp.currentTs')}</span>
              <span className={styles.nowSeconds}>{nowSec}</span>
              <Tooltip title={t('action.copy')}>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  className={styles.nowCopy}
                  onClick={() => copy(String(nowSec))}
                  aria-label={`${t('action.copy')} ${t('timestamp.currentTs')}`}
                />
              </Tooltip>
            </div>
            <div className={styles.nowMeta}>
              <span>
                {t('timestamp.msShort')}: {nowMs}
              </span>
              <span>{nowLocal}</span>
            </div>
          </div>
        </div>

        {/* Quick timestamp pills (copy on click) */}
        <div className={styles.section}>
          <div className={styles.quickPills}>
            {quickItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={styles.quickPill}
                onClick={() => copy(item.value)}
                title={`${t('action.copy')} ${item.label}`}
                aria-label={`${t('action.copy')} ${item.label}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timestamp <-> Date converters, side by side on wide panels */}
        <div className={styles.tsColumns}>
          {/* Timestamp -> Date */}
          <div className={styles.tsColumn}>
            <div className={styles.section}>
              <div className={styles.tsInputRow}>
                <Input
                  value={ts}
                  onChange={(e) => setTs(e.target.value)}
                  placeholder={t('timestamp.enterTsHint')}
                  onPressEnter={commitTsToDate}
                  className={styles.monoInput}
                  title={t('timestamp.tsToDate')}
                  aria-label={t('timestamp.enterTs')}
                />
                {tsOutputs && (
                  <span className={styles.unitBadge}>
                    {tsOutputs.unit === 's' ? t('timestamp.secondsShort') : t('timestamp.msShort')}
                  </span>
                )}
              </div>
              {tsOutputs ? (
                <div className={styles.tsOutputs}>
                  {renderOutput(t('timestamp.localTime'), tsOutputs.local, {
                    kind: 'ts-to-date',
                    left: ts.trim(),
                    right: tsOutputs.local,
                    unit: tsOutputs.unit,
                  })}
                  {renderOutput(t('timestamp.utcTime'), tsOutputs.utc)}
                  {renderOutput(t('timestamp.relativeTime'), tsRel)}
                </div>
              ) : (
                <div className={styles.tsHint}>{t('timestamp.enterTsHint')}</div>
              )}
            </div>
          </div>

          {/* Date -> Timestamp */}
          <div className={styles.tsColumn}>
            <div className={styles.section}>
              <div className={styles.tsInputRow}>
                <DatePicker
                  value={date}
                  showTime={{ defaultOpenValue: dayjs().startOf('day') }}
                  getPopupContainer={() => document.body}
                  onChange={(d) => setDateValue(d ? d.toISOString() : null)}
                  style={{ flex: 1 }}
                  title={t('timestamp.dateToTs')}
                  aria-label={t('timestamp.selectDate')}
                />
              </div>
              {dateOutputs ? (
                <div className={styles.tsOutputs}>
                  {renderOutput(t('timestamp.secondsShort'), dateOutputs.s, {
                    kind: 'date-to-ts',
                    left: dateOutputs.local,
                    right: dateOutputs.s,
                    unit: 's',
                  })}
                  {renderOutput(t('timestamp.msShort'), dateOutputs.ms, {
                    kind: 'date-to-ts',
                    left: dateOutputs.local,
                    right: dateOutputs.s,
                    unit: 's',
                  })}
                  {renderOutput(t('timestamp.localTime'), dateOutputs.local)}
                </div>
              ) : (
                <div className={styles.tsHint}>{t('timestamp.selectDate')}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inline timestamp history (isolated from the calculator's) */}
      <HistorySection
        records={tsHistory}
        clearConfirming={clearConfirming}
        onRequestClear={() => setClearConfirming(true)}
        onClearConfirm={() => {
          clearTsHistory();
          deduperRef.current.reset();
          setClearConfirming(false);
        }}
        onClearCancel={() => setClearConfirming(false)}
        renderRow={renderTsRow}
      />
    </div>
  );
}
