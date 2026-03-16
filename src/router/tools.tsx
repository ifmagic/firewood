import { lazy } from 'react';
import {
  CodeOutlined,
  DiffOutlined,
  FileTextOutlined,
  LockOutlined,
  LinkOutlined,
  FieldTimeOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import type { ToolMeta } from '../types/tool';

const tools: ToolMeta[] = [
  {
    id: 'json-formatter',
    name: 'JSON 格式化',
    icon: <CodeOutlined />,
    description: 'JSON 格式化、压缩与校验',
    component: lazy(() => import('../tools/json-formatter/index.tsx')),
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    icon: <FieldTimeOutlined />,
    description: 'Unix 时间戳与日期互转',
    component: lazy(() => import('../tools/timestamp/index.tsx')),
  },
  {
    id: 'text-diff',
    name: '文本 Diff',
    icon: <DiffOutlined />,
    description: '文本差异对比（左右双栏）',
    component: lazy(() => import('../tools/text-diff/index.tsx')),
  },
  {
    id: 'notepad',
    name: '记事本',
    icon: <FileTextOutlined />,
    description: '本地多标签记事（支持新建与关闭标签）',
    component: lazy(() => import('../tools/notepad/index.tsx')),
  },
  {
    id: 'base64-codec',
    name: 'Base64 编解码',
    icon: <LockOutlined />,
    description: 'Base64 编码与解码',
    component: lazy(() => import('../tools/base64-codec/index.tsx')),
  },
  {
    id: 'url-codec',
    name: 'URL 编解码',
    icon: <LinkOutlined />,
    description: 'URL 编码与解码',
    component: lazy(() => import('../tools/url-codec/index.tsx')),
  },
  {
    id: 'hash',
    name: 'Hash 计算',
    icon: <KeyOutlined />,
    description: 'MD5 / SHA1 / SHA256 计算',
    component: lazy(() => import('../tools/hash/index.tsx')),
  },
];

export default tools;
