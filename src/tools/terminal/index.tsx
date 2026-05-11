import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Tabs,
  Tag,
} from 'antd';
import type { InputRef, TabsProps } from 'antd';
import {
  ClearOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import ToolLayout from '../../components/ToolLayout';
import StatusBar from '../../components/StatusBar';
import FontSizeControl from '../../components/FontSizeControl';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { TERMINAL_FONT_STACK } from './settings';
import { useTerminalSessions } from './hooks';
import type { TerminalSession } from './types';
import './terminal.css';

function renderSessionLabel(session: TerminalSession, shellLabel: string) {
  return (
    <span className="firewood-terminal-tabLabel">
      <span>{session.title}</span>
      <span className="firewood-terminal-tabMeta">{shellLabel}</span>
    </span>
  );
}

export default function Terminal() {
  const {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    closeSession,
    clearSession,
    setSessionInput,
    setSessionShell,
    navigateHistory,
    runCommand,
    interruptSession,
    availableShells,
    availableShellIds,
    availableShellOptions,
    detectingShells,
    defaultShellId,
    setDefaultShellId,
    shellLookup,
  } = useTerminalSessions();
  const { fontSize, increase, decrease } = useEditorFontSize();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<InputRef | null>(null);

  const activeShellLabel = activeSession ? (shellLookup.get(activeSession.shellId)?.label ?? activeSession.shellId) : '';
  const activeShellAvailable = activeSession ? availableShellIds.includes(activeSession.shellId) : false;

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    outputRef.current?.scrollTo({
      top: outputRef.current.scrollHeight,
      behavior: 'auto',
    });
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession?.running) {
      inputRef.current?.focus();
    }
  }, [activeSession?.id, activeSession?.running]);

  const tabItems = useMemo<TabsProps['items']>(() => sessions.map((session) => {
    const shellLabel = shellLookup.get(session.shellId)?.label ?? session.shellId;
    const shellInstalled = availableShellIds.includes(session.shellId);

    return {
      key: session.id,
      closable: sessions.length > 1,
      label: renderSessionLabel(session, shellLabel),
      children: (
        <div className="firewood-terminal-session">
          {!shellInstalled && (
            <Alert
              type="warning"
              showIcon
              message={`${shellLabel} is not installed or not available.`}
            />
          )}
          {session.error && (
            <Alert
              type="error"
              showIcon
              message={session.error}
            />
          )}
          <div
            ref={session.id === activeSessionId ? outputRef : undefined}
            className="firewood-terminal-output"
            style={{ fontSize, fontFamily: TERMINAL_FONT_STACK }}
            onClick={() => {
              inputRef.current?.focus();
            }}
          >
            {session.output.length ? session.output.map((entry) => (
              <div
                key={entry.id}
                className={`firewood-terminal-line is-${entry.kind}`}
              >
                {entry.text}
              </div>
            )) : (
              <div className="firewood-terminal-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Terminal is ready."
                />
              </div>
            )}
          </div>
          <div className="firewood-terminal-inputRow">
            <span className="firewood-terminal-prompt">{shellLabel}</span>
            <Input
              ref={session.id === activeSessionId ? inputRef : undefined}
              className="firewood-terminal-input"
              value={session.input}
              readOnly={session.running}
              placeholder={shellInstalled ? 'Enter a command and press Enter' : `Switch to an available shell to continue`}
              onChange={(event) => {
                setSessionInput(session.id, event.target.value);
              }}
              onKeyDown={(event) => {
                const isModifierActive = event.ctrlKey || event.metaKey;
                const key = event.key.toLowerCase();

                if (isModifierActive && key === 'l') {
                  event.preventDefault();
                  clearSession(session.id);
                  return;
                }

                if (event.ctrlKey && key === 'c' && session.running) {
                  event.preventDefault();
                  void interruptSession(session.id);
                  return;
                }

                if (session.running) {
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  navigateHistory(session.id, 'up');
                  return;
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  navigateHistory(session.id, 'down');
                  return;
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  void runCommand(session.id);
                }
              }}
            />
            <Button
              type="default"
              icon={<CloseCircleOutlined />}
              disabled={!session.running}
              onClick={() => {
                void interruptSession(session.id);
              }}
            >
              Ctrl+C
            </Button>
          </div>
          <StatusBar
            left={(
              <Space size={12}>
                <span>{session.running ? 'Running' : 'Idle'}</span>
                <span>Shell: {shellLabel}</span>
                <span>CWD: {session.cwd}</span>
                {session.lastExitCode !== null && !session.running ? (
                  <span>Exit: {session.lastExitCode}</span>
                ) : null}
              </Space>
            )}
            right={(
              <>
                <span className="firewood-terminal-shortcuts">Enter run · ↑↓ history · Ctrl+L clear</span>
                <FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />
              </>
            )}
          />
        </div>
      ),
    };
  }), [
    activeSessionId,
    availableShellIds,
    clearSession,
    decrease,
    fontSize,
    increase,
    interruptSession,
    navigateHistory,
    runCommand,
    sessions,
    setSessionInput,
    shellLookup,
  ]);

  return (
    <ToolLayout title="Terminal" description="Embedded local shell terminal">
      <div className="firewood-terminal">
        <div className="firewood-terminal-toolbar">
          <div className="firewood-terminal-toolbarMeta">
            <Select
              value={activeSession?.shellId}
              className="firewood-terminal-shellSelect"
              options={availableShellOptions}
              loading={detectingShells}
              disabled={!activeSession}
              onChange={(value) => {
                if (activeSession) {
                  setSessionShell(activeSession.id, value);
                }
              }}
            />
            <div className="firewood-terminal-cwdPill" title={activeSession?.cwd}>
              {activeSession?.cwd ?? 'Resolving…'}
            </div>
            {activeSession ? (
              <Tag color={activeShellAvailable ? 'orange' : 'default'}>{activeShellLabel}</Tag>
            ) : null}
          </div>
          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={() => createSession()}>
              New session
            </Button>
            <Button
              icon={<ClearOutlined />}
              disabled={!activeSession}
              onClick={() => {
                if (activeSession) {
                  clearSession(activeSession.id);
                }
              }}
            >
              Clear
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
              Settings
            </Button>
          </Space>
        </div>

        <div className="firewood-terminal-shell">
          <Tabs
            activeKey={activeSessionId}
            type="editable-card"
            className="firewood-terminal-tabs"
            onChange={setActiveSessionId}
            onEdit={(targetKey, action) => {
              if (action === 'add') {
                createSession();
                return;
              }

              if (action === 'remove' && typeof targetKey === 'string') {
                closeSession(targetKey);
              }
            }}
            items={tabItems}
          />
        </div>
      </div>

      <Modal
        title="Terminal Settings"
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        onOk={() => setSettingsOpen(false)}
        okText="Done"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <div className="firewood-terminal-settings">
          <div className="firewood-terminal-settingsSection">
            <div className="firewood-terminal-settingsLabel">Default shell</div>
            <Select
              value={defaultShellId}
              className="firewood-terminal-settingsSelect"
              options={availableShellOptions}
              onChange={(value) => setDefaultShellId(value)}
            />
          </div>
          <div className="firewood-terminal-settingsSection">
            <div className="firewood-terminal-settingsLabel">Detected shells</div>
            <div className="firewood-terminal-shellGrid">
              {availableShells.map((shell) => (
                <div key={shell.id} className="firewood-terminal-shellCard">
                  <div className="firewood-terminal-shellCardHeader">
                    <span>{shell.label}</span>
                    <Tag color={shell.available ? 'orange' : 'default'}>
                      {shell.available ? 'Available' : 'Missing'}
                    </Tag>
                  </div>
                  <div className="firewood-terminal-shellCardBody">
                    {shell.available ? 'Ready to use.' : shell.error || 'Not found on this system.'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </ToolLayout>
  );
}
