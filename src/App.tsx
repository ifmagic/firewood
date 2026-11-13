import { Suspense, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Layout, Spin, theme as antdTheme } from 'antd';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import AboutDialog from './components/AboutDialog';
import Updater from './components/Updater';
import tools from './router/tools';
import type { ToolMeta } from './types/tool';
import { useToolVisibility } from './hooks/useToolVisibility';
import { useToolOrder } from './hooks/useToolOrder';
import { useSidebarCollapsed } from './hooks/useSidebarCollapsed';
import { useSystemAppearance } from './hooks/useSystemAppearance';
import { antdThemeFor } from './theme/palette';
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

  // Follow the system appearance. All CSS surfaces use the matching media
  // query in src/index.css; Ant Design needs concrete tokens and derives
  // hover/active steps in JS, hence the shared palette module.
  const appearance = useSystemAppearance();
  const themeConfig = useMemo(
    () => antdThemeFor(appearance, appearance === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm),
    [appearance],
  );

  return (
    <ConfigProvider theme={themeConfig}>
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
