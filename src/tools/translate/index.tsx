import { useState, useCallback, useLayoutEffect, useRef } from 'react';
import { Input, Button, Select, message, Tooltip, Space, Tag, Empty } from 'antd';
import {
  SwapOutlined,
  CopyOutlined,
  SettingOutlined,
  DeleteOutlined,
  SwapRightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import FontSizeControl from '../../components/FontSizeControl';
import { usePersistentState } from '../../hooks/usePersistentState';
import styles from './Translate.module.css';

const { TextArea } = Input;

type Provider = 'tencent' | 'baidu';

interface LangOption {
  value: string;
  label: string;
  tencentCode: string;
  baiduCode: string;
}

interface TranslateHistoryRecord {
  id: string;
  provider: Provider;
  sourceLang: string;
  targetLang: string;
  input: string;
  output: string;
  convertedAt: number;
}

const MAX_HISTORY = 50;

const LANGUAGES: LangOption[] = [
  { value: 'zh', label: 'lang.zh', tencentCode: 'zh', baiduCode: 'zh' },
  { value: 'en', label: 'lang.en', tencentCode: 'en', baiduCode: 'en' },
  { value: 'ja', label: 'lang.ja', tencentCode: 'ja', baiduCode: 'jp' },
  { value: 'ko', label: 'lang.ko', tencentCode: 'ko', baiduCode: 'kor' },
  { value: 'fr', label: 'lang.fr', tencentCode: 'fr', baiduCode: 'fra' },
  { value: 'de', label: 'lang.de', tencentCode: 'de', baiduCode: 'de' },
  { value: 'es', label: 'lang.es', tencentCode: 'es', baiduCode: 'spa' },
  { value: 'ru', label: 'lang.ru', tencentCode: 'ru', baiduCode: 'ru' },
  { value: 'pt', label: 'lang.pt', tencentCode: 'pt', baiduCode: 'pt' },
  { value: 'it', label: 'lang.it', tencentCode: 'it', baiduCode: 'it' },
  { value: 'vi', label: 'lang.vi', tencentCode: 'vi', baiduCode: 'vie' },
  { value: 'th', label: 'lang.th', tencentCode: 'th', baiduCode: 'th' },
  { value: 'ar', label: 'lang.ar', tencentCode: 'ar', baiduCode: 'ara' },
];

const AUTO_OPTION = { value: 'auto', label: 'lang.auto' };

const SOURCE_LANG_VALUES = [AUTO_OPTION, ...LANGUAGES];
const TARGET_LANG_VALUES = LANGUAGES;

function getLangCode(value: string, provider: Provider): string {
  if (value === 'auto') return 'auto';
  const lang = LANGUAGES.find((l) => l.value === value);
  if (!lang) return value;
  return provider === 'tencent' ? lang.tencentCode : lang.baiduCode;
}

function getLangLabel(value: string, t: (key: string) => string): string {
  if (value === 'auto') return t('lang.auto');
  const lang = LANGUAGES.find((l) => l.value === value);
  return lang ? t(lang.label) : value;
}

function formatHistoryForCopy(record: TranslateHistoryRecord, t: (key: string) => string) {
  const engine = record.provider === 'tencent' ? t('translate.tencent') : t('translate.baidu');
  const from = getLangLabel(record.sourceLang, t);
  const to = getLangLabel(record.targetLang, t);
  return `${engine}（${from} → ${to}）\n${t('translate.sourceText')}: ${record.input}\n${t('translate.targetText')}: ${record.output}`;
}

function HistoryPreviewText({ content }: { content: string }) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;

    const checkTruncation = () => {
      setIsTruncated(element.scrollWidth - element.clientWidth > 1);
    };

    const frameId = window.requestAnimationFrame(checkTruncation);

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(checkTruncation)
      : null;

    observer?.observe(element);
    window.addEventListener('resize', checkTruncation);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', checkTruncation);
    };
  }, [content]);

  return (
    <Tooltip
      placement="topLeft"
      title={isTruncated ? <div className={styles.historyPreview}>{content}</div> : null}
    >
      <span className={styles.historyTextWrap}>
        <span
          ref={textRef}
          className={`${styles.historyText} ${isTruncated ? styles.historyTextTruncated : ''}`.trim()}
        >
          {content}
        </span>
      </span>
    </Tooltip>
  );
}

export default function Translate() {
  const { t } = useTranslation();
  const [provider, setProvider] = usePersistentState<Provider>('tool:translate:provider', 'tencent');
  const [sourceLang, setSourceLang] = usePersistentState('tool:translate:source', 'auto');
  const [targetLang, setTargetLang] = usePersistentState('tool:translate:target', 'en');
  const [input, setInput] = usePersistentState('tool:translate:input', '');
  const [output, setOutput] = usePersistentState('tool:translate:output', '');
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = usePersistentState('tool:translate:showConfig', true);
  const [history, setHistory] = usePersistentState<TranslateHistoryRecord[]>('tool:translate:history', []);

  // Tencent config
  const [tencentSecretId, setTencentSecretId] = usePersistentState('tool:translate:tencent:secretId', '');
  const [tencentSecretKey, setTencentSecretKey] = usePersistentState('tool:translate:tencent:secretKey', '');
  const [tencentRegion, setTencentRegion] = usePersistentState('tool:translate:tencent:region', 'ap-guangzhou');

  // Baidu config
  const [baiduAppId, setBaiduAppId] = usePersistentState('tool:translate:baidu:appId', '');
  const [baiduSecret, setBaiduSecret] = usePersistentState('tool:translate:baidu:secret', '');

  const [fontSize, setFontSize] = usePersistentState('tool:translate:fontSize', 20);
  const increaseFontSize = useCallback(() => setFontSize((s: number) => Math.min(s + 1, 32)), [setFontSize]);
  const decreaseFontSize = useCallback(() => setFontSize((s: number) => Math.max(s - 1, 10)), [setFontSize]);

  const isConfigured = provider === 'tencent'
    ? tencentSecretId && tencentSecretKey
    : baiduAppId && baiduSecret;

  const addHistory = (record: Omit<TranslateHistoryRecord, 'id' | 'convertedAt'>) => {
    const newRecord: TranslateHistoryRecord = {
      ...record,
      id: crypto.randomUUID(),
      convertedAt: Date.now(),
    };
    setHistory((prev) => [newRecord, ...prev].slice(0, MAX_HISTORY));
  };

  const clearHistory = () => setHistory([]);

  const handleTranslate = async () => {
    if (!input.trim()) return;
    if (!isConfigured) {
      message.warning(t('translate.configureKeys'));
      setShowConfig(true);
      return;
    }

    setLoading(true);
    try {
      const from = getLangCode(sourceLang, provider);
      const to = getLangCode(targetLang, provider);

      let resultText = '';
      if (provider === 'tencent') {
        const result = await invoke<{ text: string }>('tencent_translate', {
          text: input,
          from,
          to,
          secretId: tencentSecretId,
          secretKey: tencentSecretKey,
          region: tencentRegion,
        });
        resultText = result.text;
      } else {
        const result = await invoke<{ text: string }>('baidu_translate', {
          text: input,
          from,
          to,
          appid: baiduAppId,
          secret: baiduSecret,
        });
        resultText = result.text;
      }
      setOutput(resultText);
      addHistory({
        provider,
        sourceLang,
        targetLang,
        input: input.trim(),
        output: resultText,
      });
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const swapLanguages = () => {
    if (sourceLang === 'auto') return;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInput(output);
    setOutput(input);
  };

  return (
    <ToolLayout title={t('translate.title')} description={t('translate.description')}>
      <div className={styles.container}>
        {/* Settings bar */}
        <div className={styles.settingsBar}>
          <span>{t('translate.engine')}</span>
          <Select
            value={provider}
            onChange={setProvider}
            style={{ width: 130 }}
            size="small"
            options={[
              { value: 'tencent', label: t('translate.tencent') },
              { value: 'baidu', label: t('translate.baidu') },
            ]}
          />
          <Select
            value={sourceLang}
            onChange={setSourceLang}
            style={{ width: 120 }}
            size="small"
            options={SOURCE_LANG_VALUES.map((l) => ({ value: l.value, label: t(l.label) }))}
          />
          <Tooltip title={t('translate.swapLang')}>
            <Button
              type="text"
              size="small"
              icon={<SwapOutlined />}
              onClick={swapLanguages}
              disabled={sourceLang === 'auto'}
            />
          </Tooltip>
          <Select
            value={targetLang}
            onChange={setTargetLang}
            style={{ width: 120 }}
            size="small"
            options={TARGET_LANG_VALUES.map((l) => ({ value: l.value, label: t(l.label) }))}
          />
          <div style={{ flex: 1 }} />
          <span
            className={styles.configToggle}
            onClick={() => setShowConfig(!showConfig)}
          >
            <SettingOutlined />
            {showConfig ? t('translate.collapseConfig') : t('translate.apiConfig')}
          </span>
        </div>

        {/* Config panel */}
        {showConfig && (
          <div className={styles.configSection}>
            {provider === 'tencent' ? (
              <>
                <div className={styles.configGuide} style={{ borderLeftColor: '#1677ff', background: 'rgba(22, 119, 255, 0.04)' }}>
                  {t('translate.tencentGuide', { link: '' }).split('{link}')[0]}
                  <a href="https://console.cloud.tencent.com/cam/capi" target="_blank" rel="noreferrer">
                    {t('translate.tencentLink')}
                  </a>
                  {t('translate.tencentGuide', { link: '' }).split('{link}')[1]}
                </div>
                <div className={styles.configRow}>
                  <label>SecretId</label>
                  <Input
                    size="small"
                    value={tencentSecretId}
                    onChange={(e) => setTencentSecretId(e.target.value)}
                    placeholder="SecretId"
                  />
                </div>
                <div className={styles.configRow}>
                  <label>SecretKey</label>
                  <Input.Password
                    size="small"
                    value={tencentSecretKey}
                    onChange={(e) => setTencentSecretKey(e.target.value)}
                    placeholder="SecretKey"
                  />
                </div>
                <div className={styles.configRow}>
                  <label>Region</label>
                  <Select
                    size="small"
                    value={tencentRegion}
                    onChange={setTencentRegion}
                    style={{ width: 180 }}
                    options={[
                      { value: 'ap-guangzhou', label: t('region.ap-guangzhou') },
                      { value: 'ap-shanghai', label: t('region.ap-shanghai') },
                      { value: 'ap-beijing', label: t('region.ap-beijing') },
                      { value: 'ap-chengdu', label: t('region.ap-chengdu') },
                      { value: 'ap-hongkong', label: t('region.ap-hongkong') },
                    ]}
                  />
                </div>
              </>
            ) : (
              <>
                <div className={styles.configGuide} style={{ borderLeftColor: '#f5a623', background: 'rgba(245, 166, 35, 0.04)' }}>
                  {t('translate.baiduGuide', { link: '' }).split('{link}')[0]}
                  <a href="https://fanyi-api.baidu.com/manage/developer" target="_blank" rel="noreferrer">
                    {t('translate.baiduLink')}
                  </a>
                  {t('translate.baiduGuide', { link: '' }).split('{link}')[1]}
                </div>
                <div className={styles.configRow}>
                  <label>App ID</label>
                  <Input
                    size="small"
                    value={baiduAppId}
                    onChange={(e) => setBaiduAppId(e.target.value)}
                    placeholder="App ID"
                  />
                </div>
                <div className={styles.configRow}>
                  <label>{t('translate.secretLabel')}</label>
                  <Input.Password
                    size="small"
                    value={baiduSecret}
                    onChange={(e) => setBaiduSecret(e.target.value)}
                    placeholder={t('translate.secretLabel')}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Translation panels */}
        <div className={styles.editorArea} style={{ position: 'relative' }}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelLabel}>{t('translate.sourceText')}</span>
              <Space size={4}>
                <Button
                  type="primary"
                  size="small"
                  onClick={handleTranslate}
                  loading={loading}
                  disabled={!input.trim()}
                >
                  {t('action.translate')}
                </Button>
                <Button
                  size="small"
                  onClick={() => { setInput(''); setOutput(''); }}
                  disabled={!input && !output}
                >
                  {t('action.clear')}
                </Button>
              </Space>
            </div>
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('translate.enterText')}
              style={{ fontSize }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handleTranslate();
                }
              }}
            />
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelLabel}>{t('translate.targetText')}</span>
              <Tooltip title={t('action.copy')}>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  disabled={!output}
                  onClick={() => {
                    navigator.clipboard.writeText(output);
                    message.success(t('action.copied'));
                  }}
                />
              </Tooltip>
            </div>
            <TextArea value={output} readOnly placeholder={t('translate.translationResult')} style={{ fontSize }} />
          </div>
          <FontSizeControl fontSize={fontSize} onIncrease={increaseFontSize} onDecrease={decreaseFontSize} />
        </div>

        {/* Translation history */}
        <div className={styles.historySection}>
          <div className={styles.historyHeader}>
            <h4 className={styles.historyTitle}>
              {t('translate.history')}
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('translate.noHistory')} />
            </div>
          ) : (
            <div className={styles.historyList}>
              {history.map((record) => (
                <div key={record.id} className={styles.historyItem}>
                  <div className={styles.historyItemMain}>
                    <Tag
                      color={record.provider === 'tencent' ? 'blue' : 'orange'}
                      className={styles.historyTag}
                    >
                      {record.provider === 'tencent' ? t('translate.tencent') : t('translate.baidu')}
                    </Tag>
                    <span className={styles.historyLang}>
                      {getLangLabel(record.sourceLang, t)}
                      <SwapRightOutlined className={styles.historyArrow} />
                      {getLangLabel(record.targetLang, t)}
                    </span>
                    <HistoryPreviewText content={record.input} />
                    <SwapRightOutlined className={styles.historyArrow} />
                    <HistoryPreviewText content={record.output} />
                    <span className={styles.historyTime}>
                      {dayjs(record.convertedAt).format('HH:mm:ss')}
                    </span>
                  </div>
                  <Tooltip title={t('translate.copyDetails')}>
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
