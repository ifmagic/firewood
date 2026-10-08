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
    component: lazy(() => import('../tools/terminal/index.tsx')),
  },
  {
    id: 'json-formatter',
    name: 'JSON',
    icon: <NodeIndexOutlined />,
    component: lazy(() => import('../tools/json-formatter/index.tsx')),
  },
  {
    id: 'numbox',
    name: 'Abacus',
    icon: <AbacusIcon />,
    component: lazy(() => import('../tools/numbox/index.tsx')),
  },
  {
    id: 'text-diff',
    name: 'DIFF',
    icon: <DiffOutlined />,
    component: lazy(() => import('../tools/text-diff/index.tsx')),
  },
  {
    id: 'notepad',
    name: 'Notepad',
    icon: <FileTextOutlined />,
    component: lazy(() => import('../tools/notepad/index.tsx')),
  },
  {
    id: 'img-to-pdf',
    name: 'Image to PDF',
    icon: <FilePdfOutlined />,
    component: lazy(() => import('../tools/img-to-pdf/index.tsx')),
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: <TranslationOutlined />,
    component: lazy(() => import('../tools/translate/index.tsx')),
  },
  {
    id: 'moxia',
    name: 'Moxia',
    icon: <BookOutlined />,
    component: lazy(() => import('../tools/moxia/index.tsx')),
  },
];

export default tools;
