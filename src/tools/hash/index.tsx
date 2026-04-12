import { useState, useRef, useCallback } from 'react';
import { Input, Button, Space, Table, Tabs, Spin } from 'antd';
import { FileOutlined, InboxOutlined, DeleteOutlined } from '@ant-design/icons';
import SparkMD5 from 'spark-md5';
import { sha1 } from 'js-sha1';
import { sha256 } from 'js-sha256';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';
import styles from './Hash.module.css';

const { TextArea } = Input;

interface HashRow {
  algorithm: string;
  value: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

async function hashFileBuffer(buffer: ArrayBuffer): Promise<HashRow[]> {
  const spark = new SparkMD5.ArrayBuffer();
  spark.append(buffer);
  const md5 = spark.end();

  const sha1Buf = await crypto.subtle.digest('SHA-1', buffer);
  const sha1Hex = Array.from(new Uint8Array(sha1Buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const sha256Buf = await crypto.subtle.digest('SHA-256', buffer);
  const sha256Hex = Array.from(new Uint8Array(sha256Buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return [
    { algorithm: 'MD5', value: md5 },
    { algorithm: 'SHA-1', value: sha1Hex },
    { algorithm: 'SHA-256', value: sha256Hex },
  ];
}

const columns = [
  { title: 'Algorithm', dataIndex: 'algorithm', width: 120 },
  {
    title: 'Hash',
    dataIndex: 'value',
    render: (v: string) => (
      <code style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</code>
    ),
  },
];

function TextHash() {
  const { t } = useTranslation();
  const [input, setInput] = usePersistentState('tool:hash:input', '');
  const [rows, setRows] = usePersistentState<HashRow[]>('tool:hash:rows', []);

  const calculate = () => {
    setRows([
      { algorithm: 'MD5', value: SparkMD5.hash(input) },
      { algorithm: 'SHA-1', value: sha1(input) },
      { algorithm: 'SHA-256', value: sha256(input) },
    ]);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <TextArea
        rows={6}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t('hash.enterText')}
        style={{ fontFamily: 'monospace' }}
      />
      <Space>
        <Button type="primary" onClick={calculate}>{t('action.calculate')}</Button>
        <Button danger onClick={() => { setInput(''); setRows([]); }}>{t('action.clear')}</Button>
      </Space>
      {rows.length > 0 && (
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="algorithm"
          pagination={false}
          size="small"
        />
      )}
    </Space>
  );
}

function FileHash() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<HashRow[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (f: File) => {
    setFile(f);
    setRows([]);
    setCalculating(true);
    try {
      const buffer = await f.arrayBuffer();
      const result = await hashFileBuffer(buffer);
      setRows(result);
    } finally {
      setCalculating(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) processFile(f);
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleClick = () => inputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = '';
  };

  const clear = () => {
    setFile(null);
    setRows([]);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <div className={styles.dropIcon}><InboxOutlined /></div>
        <div>{t('hash.dropFile')}</div>
        <div className={styles.dropHint}>{t('hash.supportAllTypes')}</div>
        <input
          ref={inputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {file && (
        <div className={styles.fileInfo}>
          <FileOutlined />
          <code>{file.name}</code>
          <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={clear}
          />
        </div>
      )}

      {calculating && (
        <div className={styles.calculating}>
          <Spin size="small" />
          <span>{t('hash.calculating')}</span>
        </div>
      )}

      {rows.length > 0 && (
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="algorithm"
          pagination={false}
          size="small"
        />
      )}
    </Space>
  );
}

export default function HashCalculator() {
  const { t } = useTranslation();
  return (
    <ToolLayout title={t('hash.title')} description={t('hash.description')}>
      <Tabs
        className={styles.tabs}
        defaultActiveKey="file"
        items={[
          { key: 'file', label: t('label.file'), children: <FileHash /> },
          { key: 'text', label: t('label.text'), children: <TextHash /> },
        ]}
      />
    </ToolLayout>
  );
}
