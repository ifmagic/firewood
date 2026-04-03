import { useState, useCallback } from 'react';
import { Input, Button, Select, message, Tooltip, Space, Tag, Empty } from 'antd';
import {
  SwapOutlined,
  CopyOutlined,
  SettingOutlined,
  DeleteOutlined,
  SwapRightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoke } from '@tauri-apps/api/tauri';
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
  { value: 'zh', label: '中文', tencentCode: 'zh', baiduCode: 'zh' },
  { value: 'en', label: '英语', tencentCode: 'en', baiduCode: 'en' },
  { value: 'ja', label: '日语', tencentCode: 'ja', baiduCode: 'jp' },
  { value: 'ko', label: '韩语', tencentCode: 'ko', baiduCode: 'kor' },
  { value: 'fr', label: '法语', tencentCode: 'fr', baiduCode: 'fra' },
  { value: 'de', label: '德语', tencentCode: 'de', baiduCode: 'de' },
  { value: 'es', label: '西班牙语', tencentCode: 'es', baiduCode: 'spa' },
  { value: 'ru', label: '俄语', tencentCode: 'ru', baiduCode: 'ru' },
  { value: 'pt', label: '葡萄牙语', tencentCode: 'pt', baiduCode: 'pt' },
  { value: 'it', label: '意大利语', tencentCode: 'it', baiduCode: 'it' },
  { value: 'vi', label: '越南语', tencentCode: 'vi', baiduCode: 'vie' },
  { value: 'th', label: '泰语', tencentCode: 'th', baiduCode: 'th' },
  { value: 'ar', label: '阿拉伯语', tencentCode: 'ar', baiduCode: 'ara' },
];

const AUTO_OPTION = { value: 'auto', label: '自动检测' };

const SOURCE_LANGS = [AUTO_OPTION, ...LANGUAGES];
const TARGET_LANGS = LANGUAGES;

function getLangCode(value: string, provider: Provider): string {
  if (value === 'auto') return 'auto';
  const lang = LANGUAGES.find((l) => l.value === value);
  if (!lang) return value;
  return provider === 'tencent' ? lang.tencentCode : lang.baiduCode;
}

function getLangLabel(value: string): string {
  if (value === 'auto') return '自动';
  return LANGUAGES.find((l) => l.value === value)?.label ?? value;
}

function formatHistoryForCopy(record: TranslateHistoryRecord) {
  const engine = record.provider === 'tencent' ? '腾讯翻译' : '百度翻译';
  const from = getLangLabel(record.sourceLang);
  const to = getLangLabel(record.targetLang);
  return `${engine}（${from} → ${to}）\n原文: ${record.input}\n译文: ${record.output}`;
}

export default function Translate() {
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
      message.warning('请先配置 API 密钥');
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
    <ToolLayout title="文本翻译" description="支持腾讯云 / 百度翻译 API">
      <div className={styles.container}>
        {/* Settings bar */}
        <div className={styles.settingsBar}>
          <span>翻译引擎</span>
          <Select
            value={provider}
            onChange={setProvider}
            style={{ width: 130 }}
            size="small"
            options={[
              { value: 'tencent', label: '腾讯翻译' },
              { value: 'baidu', label: '百度翻译' },
            ]}
          />
          <Select
            value={sourceLang}
            onChange={setSourceLang}
            style={{ width: 120 }}
            size="small"
            options={SOURCE_LANGS}
          />
          <Tooltip title="交换语言">
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
            options={TARGET_LANGS}
          />
          <div style={{ flex: 1 }} />
          <span
            className={styles.configToggle}
            onClick={() => setShowConfig(!showConfig)}
          >
            <SettingOutlined />
            {showConfig ? '收起配置' : 'API 配置'}
          </span>
        </div>

        {/* Config panel */}
        {showConfig && (
          <div className={styles.configSection}>
            {provider === 'tencent' ? (
              <>
                <div className={styles.configGuide} style={{ borderLeftColor: '#1677ff', background: 'rgba(22, 119, 255, 0.04)' }}>
                  前往{' '}
                  <a href="https://console.cloud.tencent.com/cam/capi" target="_blank" rel="noreferrer">
                    腾讯云 API 密钥管理
                  </a>
                  {' '}页面获取 SecretId 和 SecretKey（每月免费额度 500 万字符）
                </div>
                <div className={styles.configRow}>
                  <label>SecretId</label>
                  <Input
                    size="small"
                    value={tencentSecretId}
                    onChange={(e) => setTencentSecretId(e.target.value)}
                    placeholder="腾讯云 SecretId"
                  />
                </div>
                <div className={styles.configRow}>
                  <label>SecretKey</label>
                  <Input.Password
                    size="small"
                    value={tencentSecretKey}
                    onChange={(e) => setTencentSecretKey(e.target.value)}
                    placeholder="腾讯云 SecretKey"
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
                      { value: 'ap-guangzhou', label: '广州' },
                      { value: 'ap-shanghai', label: '上海' },
                      { value: 'ap-beijing', label: '北京' },
                      { value: 'ap-chengdu', label: '成都' },
                      { value: 'ap-hongkong', label: '香港' },
                    ]}
                  />
                </div>
              </>
            ) : (
              <>
                <div className={styles.configGuide} style={{ borderLeftColor: '#f5a623', background: 'rgba(245, 166, 35, 0.04)' }}>
                  前往{' '}
                  <a href="https://fanyi-api.baidu.com/manage/developer" target="_blank" rel="noreferrer">
                    百度翻译开放平台 → 开发者信息
                  </a>
                  {' '}页面获取 APPID 和密钥（标准版每月免费 5 万字符）
                </div>
                <div className={styles.configRow}>
                  <label>App ID</label>
                  <Input
                    size="small"
                    value={baiduAppId}
                    onChange={(e) => setBaiduAppId(e.target.value)}
                    placeholder="百度翻译 APPID"
                  />
                </div>
                <div className={styles.configRow}>
                  <label>密钥</label>
                  <Input.Password
                    size="small"
                    value={baiduSecret}
                    onChange={(e) => setBaiduSecret(e.target.value)}
                    placeholder="百度翻译密钥"
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
              <span className={styles.panelLabel}>原文</span>
              <Space size={4}>
                <Button
                  type="primary"
                  size="small"
                  onClick={handleTranslate}
                  loading={loading}
                  disabled={!input.trim()}
                >
                  翻 译
                </Button>
                <Button
                  size="small"
                  onClick={() => { setInput(''); setOutput(''); }}
                  disabled={!input && !output}
                >
                  清空
                </Button>
              </Space>
            </div>
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入要翻译的文本…"
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
              <span className={styles.panelLabel}>译文</span>
              <Tooltip title="复制">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  disabled={!output}
                  onClick={() => {
                    navigator.clipboard.writeText(output);
                    message.success('已复制');
                  }}
                />
              </Tooltip>
            </div>
            <TextArea value={output} readOnly placeholder="翻译结果" style={{ fontSize }} />
          </div>
          <FontSizeControl fontSize={fontSize} onIncrease={increaseFontSize} onDecrease={decreaseFontSize} />
        </div>

        {/* 翻译历史 */}
        <div className={styles.historySection}>
          <div className={styles.historyHeader}>
            <h4 className={styles.historyTitle}>
              翻译历史
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
                清空
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <div className={styles.historyEmpty}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无翻译记录" />
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
                      {record.provider === 'tencent' ? '腾讯' : '百度'}
                    </Tag>
                    <span className={styles.historyLang}>
                      {getLangLabel(record.sourceLang)}
                      <SwapRightOutlined className={styles.historyArrow} />
                      {getLangLabel(record.targetLang)}
                    </span>
                    <span className={styles.historyText} title={record.input}>
                      {record.input}
                    </span>
                    <SwapRightOutlined className={styles.historyArrow} />
                    <span className={styles.historyText} title={record.output}>
                      {record.output}
                    </span>
                    <span className={styles.historyTime}>
                      {dayjs(record.convertedAt).format('HH:mm:ss')}
                    </span>
                  </div>
                  <Tooltip title="复制翻译详情">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      className={styles.historyCopyBtn}
                      onClick={() => {
                        navigator.clipboard.writeText(formatHistoryForCopy(record));
                        message.success('已复制');
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
