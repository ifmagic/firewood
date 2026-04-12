import { Input, Button, Select, DatePicker, message, Tooltip, Tag, Empty } from 'antd';
import { CopyOutlined, DeleteOutlined, SwapRightOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';
import styles from './Timestamp.module.css';

type TimestampUnit = 'milliseconds' | 'seconds';

interface HistoryRecord {
  id: string;
  type: 'ts-to-date' | 'date-to-ts';
  timestamp: string;
  date: string;
  unit: TimestampUnit;
  convertedAt: number;
}

const MAX_HISTORY = 50;

// Unit options are built inside the component for i18n

function toTimestamp(value: Dayjs, unit: TimestampUnit) {
  return unit === 'milliseconds' ? String(value.valueOf()) : String(value.unix());
}

function parseTimestamp(ts: string, unit: TimestampUnit) {
  const num = Number(ts);
  if (isNaN(num)) return null;
  return unit === 'seconds' ? dayjs.unix(num) : dayjs(num);
}

function formatHistoryForCopy(record: HistoryRecord, t: (key: string) => string) {
  const typeLabel =
    record.type === 'ts-to-date'
      ? t('timestamp.formatCopyTsToDate')
      : t('timestamp.formatCopyDateToTs');

  const lines = [
    typeLabel,
    `${t('timestamp.formatCopyDate')}: ${record.date}`,
    `${t('timestamp.formatCopyTs')}: ${record.timestamp}（${record.unit === 'seconds' ? 's' : 'ms'}）`
  ];
  if (record.type === 'ts-to-date') {
    [lines[1], lines[2]] = [lines[2], lines[1]];
  }
  return lines.join('\n');
}

export default function Timestamp() {
  const { t } = useTranslation();
  const [ts, setTs] = usePersistentState('tool:timestamp:ts', '');
  const [tsUnit, setTsUnit] = usePersistentState<TimestampUnit>('tool:timestamp:ts-unit', 'seconds');
  const [dateValue, setDateValue] = usePersistentState<string | null>('tool:timestamp:date', null);
  const [tsResult, setTsResult] = usePersistentState('tool:timestamp:ts-result', '');
  const [dateResult, setDateResult] = usePersistentState('tool:timestamp:date-result', '');
  const [dateUnit, setDateUnit] = usePersistentState<TimestampUnit>('tool:timestamp:date-unit', 'milliseconds');
  const [history, setHistory] = usePersistentState<HistoryRecord[]>('tool:timestamp:history', []);
  const date: Dayjs | null = dateValue ? dayjs(dateValue) : null;

  const addHistory = (record: Omit<HistoryRecord, 'id' | 'convertedAt'>) => {
    const newRecord: HistoryRecord = {
      ...record,
      id: crypto.randomUUID(),
      convertedAt: Date.now(),
    };
    setHistory((prev) => [newRecord, ...prev].slice(0, MAX_HISTORY));
  };

  const clearHistory = () => setHistory([]);

  const tsToDate = () => {
    const d = parseTimestamp(ts, tsUnit);
    if (!d) return;
    const result = d.format('YYYY-MM-DD HH:mm:ss');
    setTsResult(result);
    addHistory({ type: 'ts-to-date', timestamp: ts, date: result, unit: tsUnit });
  };

  const dateToTs = () => {
    if (!date) return;
    const result = toTimestamp(date, dateUnit);
    setDateResult(result);
    addHistory({ type: 'date-to-ts', timestamp: result, date: date.format('YYYY-MM-DD HH:mm:ss'), unit: dateUnit });
  };

  const now = () => {
    setTs(tsUnit === 'seconds' ? String(dayjs().unix()) : String(dayjs().valueOf()));
    setTsResult(dayjs().format('YYYY-MM-DD HH:mm:ss'));
  };

  const today = () => {
    const todayStart = dayjs().startOf('second');
    setDateValue(todayStart.toISOString());
    setDateResult(toTimestamp(todayStart, dateUnit));
  };

  const handleTsUnitChange = (value: TimestampUnit) => {
    setTsUnit(value);
    if (ts) {
      const d = parseTimestamp(ts, value);
      if (d) setTsResult(d.format('YYYY-MM-DD HH:mm:ss'));
    }
  };

  const handleDateUnitChange = (value: TimestampUnit) => {
    setDateUnit(value);
    if (date) {
      setDateResult(toTimestamp(date, value));
    }
  };

  const unitOpts = [
    { value: 'seconds', label: 's' },
    { value: 'milliseconds', label: 'ms' },
  ];

  return (
    <ToolLayout title={t('timestamp.title')} description={t('timestamp.description')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Timestamp → Date */}
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('timestamp.tsToDate')}</h4>
          <div className={styles.row}>
            <div className={styles.label}>
              <span>{t('label.timestamp')}</span>
              <Select
                value={tsUnit}
                onChange={handleTsUnitChange}
                options={unitOpts}
                size="small"
                style={{ width: 90 }}
              />
            </div>
            <div className={styles.value}>
              <Input
                value={ts}
                onChange={(e) => setTs(e.target.value)}
                placeholder={t('timestamp.enterTs')}
                onPressEnter={tsToDate}
              />
              <Button type="primary" onClick={tsToDate}>{t('action.convert')}</Button>
              <Button onClick={now}>{t('timestamp.currentTime')}</Button>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.label}>{t('label.result')}</div>
            <div className={styles.value}>
              <Input value={tsResult} readOnly />
              <Tooltip title={t('action.copy')}>
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  disabled={!tsResult}
                  onClick={() => { navigator.clipboard.writeText(tsResult); message.success(t('action.copied')); }}
                />
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Date → Timestamp */}
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('timestamp.dateToTs')}</h4>
          <div className={styles.row}>
            <div className={styles.label}>{t('timestamp.selectDate')}</div>
            <div className={styles.value}>
              <DatePicker
                value={date}
                showTime={{ defaultOpenValue: dayjs().startOf('day') }}
                onChange={(d) => setDateValue(d ? d.toISOString() : null)}
                style={{ flex: 1 }}
              />
              <Button type="primary" onClick={dateToTs}>{t('action.convert')}</Button>
              <Button onClick={today}>{t('timestamp.currentDate')}</Button>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.label}>
              <span>{t('label.timestamp')}</span>
              <Select
                value={dateUnit}
                onChange={handleDateUnitChange}
                options={unitOpts}
                size="small"
                style={{ width: 90 }}
              />
            </div>
            <div className={styles.value}>
              <Input value={dateResult} readOnly />
              <Tooltip title={t('action.copy')}>
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  disabled={!dateResult}
                  onClick={() => { navigator.clipboard.writeText(dateResult); message.success(t('action.copied')); }}
                />
              </Tooltip>
            </div>
          </div>
        </div>

        {/* History */}
        <div className={styles.section}>
          <div className={styles.historyHeader}>
            <h4 className={styles.sectionTitle} style={{ flex: 1, borderBottom: 'none' }}>
              {t('timestamp.history')}
              {history.length > 0 && <span className={styles.historyCount}>{history.length}</span>}
            </h4>
            {history.length > 0 && (
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={clearHistory}
                className={styles.clearBtn}
              >
                {t('action.clear')}
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <div className={styles.historyEmpty}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('timestamp.noHistory')} />
            </div>
          ) : (
            <div className={styles.historyList}>
              {history.map((record) => (
                <div key={record.id} className={styles.historyItem}>
                  <div className={styles.historyItemMain}>
                    <Tag
                      color={record.type === 'ts-to-date' ? 'blue' : 'green'}
                      className={styles.historyTag}
                    >
                      {record.type === 'ts-to-date' ? t('timestamp.tsToDateTag') : t('timestamp.dateToTsTag')}
                    </Tag>
                    <div className={styles.historyDetail}>
                      {record.type === 'ts-to-date' ? (
                        <>
                          <span className={styles.historyTs}>{record.timestamp}</span>
                          <SwapRightOutlined className={styles.historyArrow} />
                          <span className={styles.historyDate}>{record.date}</span>
                        </>
                      ) : (
                        <>
                          <span className={styles.historyDate}>{record.date}</span>
                          <SwapRightOutlined className={styles.historyArrow} />
                          <span className={styles.historyTs}>{record.timestamp}</span>
                        </>
                      )}
                    </div>
                    <span className={styles.historyUnit}>{record.unit === 'seconds' ? 's' : 'ms'}</span>
                    <span className={styles.historyTime}>
                      {dayjs(record.convertedAt).format('HH:mm:ss')}
                    </span>
                  </div>
                  <Tooltip title={t('timestamp.copyDetails')}>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      className={styles.historyCopyBtn}
                      onClick={() => {
                        navigator.clipboard.writeText(formatHistoryForCopy(record, t));
                        message.success(t('action.copied'));
                      }}
                    />
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ToolLayout>
  );
}
