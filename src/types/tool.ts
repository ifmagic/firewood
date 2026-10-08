import type { ReactNode, LazyExoticComponent, FC } from 'react';

export interface ToolMeta {
  id: string;
  name: string;
  icon: ReactNode;
  component: LazyExoticComponent<FC>;
}
