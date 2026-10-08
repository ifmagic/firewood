import { useEffect, useRef, useState } from 'react';
import { Layout, Button, Dropdown, Checkbox, Tooltip } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { FireOutlined, MenuOutlined, HolderOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MenuProps } from 'antd';
import type { ToolMeta } from '../../types/tool';
import SettingsMenuButton from '../SettingsMenuButton';
import PinToggle from '../PinToggle';
import { isMacPlatform, isWindowsPlatform } from '../../utils/platform';
import styles from './Sidebar.module.css';

interface SidebarProps {
  tools: ToolMeta[];
  visibility: Record<string, boolean>;
  onToggleToolVisibility: (toolId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onOpenAbout?: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const { Sider } = Layout;

export default function Sidebar({
  tools,
  visibility,
  onToggleToolVisibility,
  onReorder,
  onOpenAbout,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentKey = location.pathname.replace('/', '') || tools[0]?.id;
  const getToolLabel = (tool: ToolMeta) => t(`toolName.${tool.id}`, { defaultValue: tool.name });
  const logoTitle = collapsed ? t('sidebar.expand') : t('sidebar.collapse');

  const pointerOriginRef = useRef<{ toolId: string; x: number; y: number } | null>(null);
  const draggingToolIdRef = useRef<string | null>(null);
  const dragOverToolIdRef = useRef<string | null>(null);
  const cleanupPointerRef = useRef<(() => void) | null>(null);
  const [draggingToolId, setDraggingToolId] = useState<string | null>(null);
  const [dragOverToolId, setDragOverToolId] = useState<string | null>(null);

  // Filter visible tools
  const visibleTools = tools.filter((t) => visibility[t.id] ?? true);

  // View menu
  const viewMenuItems: MenuProps['items'] = [
    ...tools.map((tool) => ({
      key: tool.id,
      label: (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Checkbox checked={visibility[tool.id] ?? true} onChange={() => onToggleToolVisibility(tool.id)} />
          {tool.icon}
          <span>{getToolLabel(tool)}</span>
        </div>
      ),
    })),
    {
      type: 'divider' as const,
    },
    {
      key: 'show-all',
      label: t('sidebar.showAll'),
      onClick: () => {
        tools.forEach((tool) => {
          if (!visibility[tool.id]) {
            onToggleToolVisibility(tool.id);
          }
        });
      },
    },
    {
      key: 'hide-all',
      label: t('sidebar.hideAll'),
      onClick: () => {
        tools.forEach((tool) => {
          if (visibility[tool.id]) {
            onToggleToolVisibility(tool.id);
          }
        });
      },
    },
  ];

  const clearPointerDrag = () => {
    cleanupPointerRef.current?.();
    cleanupPointerRef.current = null;
    pointerOriginRef.current = null;
    draggingToolIdRef.current = null;
    dragOverToolIdRef.current = null;
    setDraggingToolId(null);
    setDragOverToolId(null);
  };

  const handlePointerDown = (event: React.PointerEvent, toolId: string) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    clearPointerDrag();
    pointerOriginRef.current = { toolId, x: event.clientX, y: event.clientY };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const origin = pointerOriginRef.current;
      if (!origin) {
        return;
      }

      if (!draggingToolIdRef.current) {
        const deltaX = moveEvent.clientX - origin.x;
        const deltaY = moveEvent.clientY - origin.y;
        if (Math.abs(deltaX) + Math.abs(deltaY) <= 4) {
          return;
        }

        draggingToolIdRef.current = origin.toolId;
        setDraggingToolId(origin.toolId);
      }

      const targetElement = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest('[data-tool-id]') as HTMLElement | null;
      const targetToolId = targetElement?.dataset.toolId ?? null;
      if (dragOverToolIdRef.current !== targetToolId) {
        dragOverToolIdRef.current = targetToolId;
        setDragOverToolId(targetToolId);
      }
    };

    const handlePointerUp = () => {
      const fromToolId = draggingToolIdRef.current;
      const toToolId = dragOverToolIdRef.current;

      if (fromToolId && toToolId && fromToolId !== toToolId) {
        const fromIndex = tools.findIndex((tool) => tool.id === fromToolId);
        const toIndex = tools.findIndex((tool) => tool.id === toToolId);
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          onReorder(fromIndex, toIndex);
        }
      }

      clearPointerDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
    cleanupPointerRef.current = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  };

  useEffect(() => () => clearPointerDrag(), []);

  useEffect(() => {
    if (!draggingToolId) return;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [draggingToolId]);

  // The pin only lives in the sidebar on Linux: macOS hosts it in the overlay
  // TitleBar strip and Windows in the custom titlebar's caption row. Without
  // it the header carries brand + view menu only and keeps the 200px sider;
  // with it the sider widens to 220px so "Firewood" is not clipped (see .logo
  // in Sidebar.module.css and AGENTS.md).
  const showWindowPin = !isMacPlatform() && !isWindowsPlatform();
  return (
    <Sider
      width={collapsed ? 56 : showWindowPin ? 220 : 200}
      className={`${styles.sider} ${collapsed ? styles.siderCollapsed : ''}`}
    >
      <div className={`${styles.logo} ${showWindowPin ? styles.logoWithPin : ''}`}>
        <button
          type="button"
          className={styles.logoButton}
          onClick={onToggleCollapsed}
          aria-label={logoTitle}
          title={logoTitle}
        >
          <span className={styles.logoBadge}>
            <FireOutlined className={styles.logoIcon} />
          </span>
          {!collapsed && <span className={styles.logoText}>Firewood</span>}
        </button>
        {!collapsed && (
          <Dropdown menu={{ items: viewMenuItems }} placement="bottomRight" trigger={['click']}>
            <Button
              type="text"
              size="small"
              icon={<MenuOutlined />}
              aria-label={t('sidebar.viewMenu')}
              className={styles.viewButton}
            />
          </Dropdown>
        )}
        {/* Window-level pin, Linux only (native title bar stays there): the sidebar
            header is the app's first webview row, so the pin belongs in this
            top chrome row — trailing the view menu — and deliberately not in
            the settings footer (a window toggle reads as a second settings
            button next to Settings; see AGENTS.md). Collapsed, the 56px rail
            cannot hold brand and pin side by side, so the pin stacks under the
            brand (see .siderCollapsed .logoWithPin) instead of relocating to
            the footer. */}
        {showWindowPin && <PinToggle variant="sidebar" placement={collapsed ? 'right' : 'bottom'} />}
      </div>
      <div className={styles.toolList}>
        {visibleTools.map((tool) => {
          const isSelected = tool.id === currentKey;
          const isDragOver = dragOverToolId === tool.id && draggingToolId !== tool.id;
          const isDragging = draggingToolId === tool.id;
          const toolItem = (
            <div
              key={tool.id}
              data-tool-id={tool.id}
              role="button"
              tabIndex={0}
              aria-current={isSelected ? 'page' : undefined}
              className={`${styles.toolItem} ${isSelected ? styles.toolItemSelected : ''} ${isDragOver ? styles.toolItemDragOver : ''} ${isDragging ? styles.toolItemDragging : ''} ${collapsed ? styles.toolItemCollapsed : ''}`}
              onClick={() => {
                if (draggingToolIdRef.current) {
                  return;
                }
                navigate(`/${tool.id}`);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(`/${tool.id}`);
                }
              }}
            >
              {!collapsed && (
                <span
                  className={styles.dragHandle}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(event) => handlePointerDown(event, tool.id)}
                >
                  <HolderOutlined />
                </span>
              )}
              <span className={styles.toolIcon}>{tool.icon}</span>
              {!collapsed && <span className={styles.toolName}>{getToolLabel(tool)}</span>}
            </div>
          );
          return collapsed ? (
            <Tooltip key={tool.id} title={getToolLabel(tool)} placement="right">
              {toolItem}
            </Tooltip>
          ) : (
            toolItem
          );
        })}
        {visibleTools.length === 0 && !collapsed && (
          <div className={styles.toolListEmpty}>{t('sidebar.allToolsHidden')}</div>
        )}
      </div>
      <div className={styles.siderFooter}>
        {/* App-settings zone only: the window pin lives in the header's top
            chrome row (see above), and macOS hosts it in the overlay TitleBar
            strip — exactly one PinToggle may mount per platform. */}
        <SettingsMenuButton onOpenAbout={onOpenAbout} />
      </div>
    </Sider>
  );
}
