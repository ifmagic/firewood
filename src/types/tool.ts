import type { ReactNode, LazyExoticComponent, FC } from 'react';

export interface ToolMeta {
  id: string;
  name: string;
  icon: ReactNode;
  description: string;
  component: LazyExoticComponent<FC>;
}
