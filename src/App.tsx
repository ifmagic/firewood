import { Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Layout, Spin } from 'antd';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import AboutDialog from './components/AboutDialog';
import Updater from './components/Updater';
import tools from './router/tools';
import type { ToolMeta } from './types/tool';
import { useToolVisibility } from './hooks/useToolVisibility';
import { useToolOrder } from './hooks/useToolOrder';
import { useSidebarCollapsed } from './hooks/useSidebarCollapsed';
import './App.css';

const { Content } = Layout;

function App() {
  const toolIds = tools.map((t) => t.id);
  const { visibility, toggleToolVisibility } = useToolVisibility(toolIds);
  const { orderedIds, reorder } = useToolOrder(toolIds);
  const { collapsed, toggle } = useSidebarCollapsed();
  const [aboutOpen, setAboutOpen] = useState(false);

  // Build tool list in user-defined order
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  const orderedTools = orderedIds.map((id) => toolMap.get(id)!).filter(Boolean);

  return (
    <ConfigProvider
      theme={{
        token: {
          // Warm ember & timber palette (see src/index.css tokens). #c2410c is
          // the action tone (~4.6:1 with white text); the brighter --fw-accent
          // (#e8590c) stays a display/border tone only.
          colorPrimary: '#c2410c',
          colorInfo: '#c2410c',
          // Links are small text on white: the vivid accent only reaches ~3.5:1,
          // so link text uses the darker accent ink (see --fw-accent-ink).
          colorLink: '#b54708',
          colorLinkHover: '#c2410c',
          borderRadius: 8,
          fontSize: 14,
          lineWidth: 1,
          colorText: '#2a241e',
          colorTextSecondary: '#5f574d',
          colorBorder: '#d9d2c5',
          colorBorderSecondary: '#e9e4da',
          colorBgContainer: '#fffefb',
          colorBgElevated: '#fffefb',
          colorFillAlter: '#f6f4ee',
          colorFillSecondary: '#f1eee6',
          controlItemBgActive: '#fdeee2',
          controlItemBgActiveHover: '#fadcc6',
          controlOutline: 'rgba(232, 89, 12, 0.18)',
          boxShadowSecondary: '0 12px 32px rgba(46, 36, 25, 0.1)',
        },
      }}
    >
      <BrowserRouter>
        <Updater />
        <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
        {/* Column shell: the per-platform titlebar strip (macOS overlay /
            Windows custom chrome) sits above the sidebar/content layout. */}
        <div className="app-shell">
          <TitleBar />
          <Layout style={{ flex: 1, minHeight: 0 }}>
            <Sidebar
              tools={orderedTools}
              visibility={visibility}
              onToggleToolVisibility={toggleToolVisibility}
              onReorder={reorder}
              onOpenAbout={() => setAboutOpen(true)}
              collapsed={collapsed}
              onToggleCollapsed={toggle}
            />
            <Content style={{ overflow: 'auto', background: 'var(--fw-surface)' }}>
              <ToolRoutes tools={tools} />
            </Content>
          </Layout>
        </div>
      </BrowserRouter>
    </ConfigProvider>
  );
}

/**
 * Tool routes wrapped in a route-keyed page container (`.fw-page`, see
 * App.css): every tool switch remounts the tree and plays one short
 * fade-and-rise enter transition. Only transforms/opacity are animated, so
 * mount-time measurements (terminal fit) are unaffected.
 */
function ToolRoutes({ tools }: { tools: ToolMeta[] }) {
  const location = useLocation();

  return (
    <div key={location.pathname} className="fw-page">
      <Suspense fallback={<Spin style={{ margin: 40 }} />}>
        <Routes>
          <Route path="/" element={<Navigate to={`/${tools[0].id}`} replace />} />
          {tools.map((tool) => (
            <Route key={tool.id} path={`/${tool.id}`} element={<tool.component />} />
          ))}
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
