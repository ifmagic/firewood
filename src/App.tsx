import { Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Layout, Spin } from 'antd';
import Sidebar from './components/Sidebar';
import AboutDialog from './components/AboutDialog';
import Updater from './components/Updater';
import tools from './router/tools';
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
          colorPrimary: '#ff7a45',
          colorInfo: '#ff7a45',
          colorLink: '#ff7a45',
          borderRadius: 8,
          fontSize: 14,
          lineWidth: 1,
          colorText: '#1f1f1f',
          colorTextSecondary: '#666666',
          colorBorder: '#eeeeee',
          colorBorderSecondary: '#eeeeee',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorFillAlter: '#f7f7f8',
          colorFillSecondary: '#f2f3f5',
          controlItemBgActive: '#fff4ef',
          controlItemBgActiveHover: '#fff1ea',
          controlOutline: 'rgba(255, 122, 69, 0.18)',
          boxShadowSecondary: '0 12px 32px rgba(15, 23, 42, 0.08)',
        },
      }}
    >
      <BrowserRouter>
        <Updater />
        <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
        <Layout style={{ height: '100vh' }}>
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
            <Suspense fallback={<Spin style={{ margin: 40 }} />}>
              <Routes>
                <Route path="/" element={<Navigate to={`/${tools[0].id}`} replace />} />
                {tools.map((tool) => (
                  <Route
                    key={tool.id}
                    path={`/${tool.id}`}
                    element={<tool.component />}
                  />
                ))}
              </Routes>
            </Suspense>
          </Content>
        </Layout>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
