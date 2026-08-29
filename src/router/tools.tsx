import { lazy } from 'react';
import {
  CodeOutlined,
  DiffOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  TranslationOutlined,
  NodeIndexOutlined,
  BookOutlined,
} from '@ant-design/icons';
import AbacusIcon from '../tools/numbox/AbacusIcon';
import type { ToolMeta } from '../types/tool';

const tools: ToolMeta[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    icon: <CodeOutlined />,
    description: 'Embedded local shell terminal',
    component: lazy(() => import('../tools/terminal/index.tsx')),
  },
  {
    id: 'json-formatter',
    name: 'JSON',
    icon: <NodeIndexOutlined />,
    description: 'Format, minify & unescape JSON',
    component: lazy(() => import('../tools/json-formatter/index.tsx')),
  },
  {
    id: 'numbox',
    name: 'Abacus',
    icon: <AbacusIcon />,
    description: 'Calculations & time conversion',
    component: lazy(() => import('../tools/numbox/index.tsx')),
  },
  {
    id: 'text-diff',
    name: 'DIFF',
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
  {
    id: 'moxia',
    name: 'Moxia',
    icon: <BookOutlined />,
    description: 'Novel writing workspace',
    component: lazy(() => import('../tools/moxia/index.tsx')),
  },
];

export default tools;
