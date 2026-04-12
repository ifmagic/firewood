import { lazy } from 'react';
import {
  CodeOutlined,
  DiffOutlined,
  FileTextOutlined,
  LockOutlined,
  LinkOutlined,
  FieldTimeOutlined,
  KeyOutlined,
  FilePdfOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import type { ToolMeta } from '../types/tool';

const tools: ToolMeta[] = [
  {
    id: 'json-formatter',
    name: 'JSON Formatter',
    icon: <CodeOutlined />,
    description: 'Format, minify & validate JSON',
    component: lazy(() => import('../tools/json-formatter/index.tsx')),
  },
  {
    id: 'timestamp',
    name: 'Timestamp',
    icon: <FieldTimeOutlined />,
    description: 'Convert between Unix timestamps and dates',
    component: lazy(() => import('../tools/timestamp/index.tsx')),
  },
  {
    id: 'text-diff',
    name: 'Text Diff',
    icon: <DiffOutlined />,
    description: 'Compare two texts line by line',
    component: lazy(() => import('../tools/text-diff/index.tsx')),
  },
  {
    id: 'notepad',
    name: 'Notepad',
    icon: <FileTextOutlined />,
    description: 'Multi-tab local notepad',
    component: lazy(() => import('../tools/notepad/index.tsx')),
  },
  {
    id: 'base64-codec',
    name: 'Base64 Codec',
    icon: <LockOutlined />,
    description: 'Base64 encode & decode',
    component: lazy(() => import('../tools/base64-codec/index.tsx')),
  },
  {
    id: 'url-codec',
    name: 'URL Codec',
    icon: <LinkOutlined />,
    description: 'URL encode & decode',
    component: lazy(() => import('../tools/url-codec/index.tsx')),
  },
  {
    id: 'hash',
    name: 'Hash',
    icon: <KeyOutlined />,
    description: 'Calculate MD5 / SHA-1 / SHA-256 for text or files',
    component: lazy(() => import('../tools/hash/index.tsx')),
  },
  {
    id: 'img-to-pdf',
    name: 'Image to PDF',
    icon: <FilePdfOutlined />,
    description: 'Arrange images and export as A4 PDF',
    component: lazy(() => import('../tools/img-to-pdf/index.tsx')),
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: <TranslationOutlined />,
    description: 'Translate via Tencent Cloud / Baidu API',
    component: lazy(() => import('../tools/translate/index.tsx')),
  },
];

export default tools;
