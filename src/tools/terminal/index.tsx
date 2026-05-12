import { useEffect, useRef, useState, useMemo } from 'react';
import { Input, Button, Spin } from 'antd';
import type { InputRef } from 'antd';
import { ConsoleSqlOutlined, SwapRightOutlined, SyncOutlined, ClockCircleOutlined } from '@ant-design/icons';
import ToolLayout from '../../components/ToolLayout';
import { useTerminal } from './hooks';
import { TERMINAL_FONT_STACK } from './settings';
import './terminal.css';

export default function Terminal() {
  const {
    session,
    availableShells,
    detecting,
    currentShell,
    setInput,
    sendCommand,
    navigateHistory,
    clearOutput,
    changeShell,
    interruptShell,
    historyList,
    selectHistoryCommand,
  } = useTerminal();

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputRef>(null);
  const searchInputRef = useRef<InputRef>(null);
  const [showShellSelector, setShowShellSelector] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
  }, [session.output]);

  useEffect(() => {
    if (!session.running) {
      inputRef.current?.focus();
    }
  }, [session.running]);

  useEffect(() => {
    if (showHistoryPanel) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showHistoryPanel]);

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) {
      return historyList;
    }
    const searchTerm = historySearch.toLowerCase();
    return historyList.filter(cmd => cmd.toLowerCase().includes(searchTerm));
  }, [historyList, historySearch]);

  const handleSelectHistory = (cmd: string) => {
    selectHistoryCommand(cmd);
    setShowHistoryPanel(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCommand(session.input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHistory('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory('down');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      clearOutput();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      void interruptShell();
    }
  };

  const availableOptions = availableShells
    .filter(s => s.available)
    .map(s => ({ value: s.id, label: s.label }));

  return (
    <ToolLayout title="Terminal" description="Embedded shell terminal">
      <div className="firewood-terminal">
        <div className="firewood-terminal-header">
          <div className="firewood-terminal-shell-selector" onClick={() => setShowShellSelector(!showShellSelector)}>
            <span className="firewood-terminal-shell-label">
              {currentShell?.label || 'Select shell'}
            </span>
            <SwapRightOutlined className={`firewood-terminal-chevron ${showShellSelector ? 'rotated' : ''}`} />
            
            {showShellSelector && availableOptions.length > 0 && (
              <div className="firewood-terminal-shell-dropdown">
                {availableOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`firewood-terminal-shell-option ${session.shellId === opt.value ? 'active' : ''}`}
                    onClick={() => {
                      changeShell(opt.value);
                      setShowShellSelector(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="firewood-terminal-cwd">
            {session.cwd}
          </div>

          <div className="firewood-terminal-actions">
            <Button
              icon={<ClockCircleOutlined />}
              onClick={() => setShowHistoryPanel(!showHistoryPanel)}
              size="small"
            >
              History
            </Button>
            <Button
              icon={<SyncOutlined />}
              onClick={clearOutput}
              size="small"
            >
              Clear
            </Button>
          </div>

          {showHistoryPanel && (
            <div className="firewood-terminal-history-dropdown">
              <div className="firewood-terminal-history-header">
                <span>Command History</span>
                <Button
                  type="text"
                  size="small"
                  onClick={() => setShowHistoryPanel(false)}
                >
                  ×
                </Button>
              </div>
              <Input
                ref={searchInputRef}
                className="firewood-terminal-history-search"
                placeholder="Search commands..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowHistoryPanel(false);
                  }
                }}
                autoFocus
              />
              <div className="firewood-terminal-history-list">
                {filteredHistory.length === 0 ? (
                  <div className="firewood-terminal-history-empty">
                    {historyList.length === 0 
                      ? 'No commands yet' 
                      : 'No matching commands'}
                  </div>
                ) : (
                  filteredHistory.map((cmd, idx) => (
                    <button
                      key={idx}
                      className="firewood-terminal-history-item"
                      onClick={() => handleSelectHistory(cmd)}
                    >
                      <span className="firewood-terminal-history-index">#{historyList.length - idx}</span>
                      <span className="firewood-terminal-history-cmd">{cmd}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="firewood-terminal-body">
          {detecting ? (
            <div className="firewood-terminal-loading">
              <Spin size="large" />
              <span>Detecting shells...</span>
            </div>
          ) : !currentShell?.available ? (
            <div className="firewood-terminal-no-shell">
                <ConsoleSqlOutlined className="firewood-terminal-no-shell-icon" />
              <p>No shell available</p>
              <p className="firewood-terminal-no-shell-hint">Please install a shell or check your system configuration</p>
            </div>
          ) : (
            <>
              <div
                ref={outputRef}
                className="firewood-terminal-output"
                style={{ fontFamily: TERMINAL_FONT_STACK }}
              >
                {session.output.map(entry => (
                  <div key={entry.id} className={`firewood-terminal-line firewood-terminal-${entry.kind}`}>
                    {entry.text}
                  </div>
                ))}
                {session.output.length === 0 && (
                  <div className="firewood-terminal-welcome">
                    <p>Welcome to Firewood Terminal</p>
                    <p className="firewood-terminal-welcome-hint">Type a command and press Enter</p>
                  </div>
                )}
              </div>

              <div className="firewood-terminal-input-area">
                <span className="firewood-terminal-prompt">
                  {session.cwd.split('/').pop() || session.cwd}
                </span>
                <Input
                  ref={inputRef}
                  className="firewood-terminal-input"
                  value={session.input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter command..."
                  disabled={session.running}
                  style={{ fontFamily: TERMINAL_FONT_STACK }}
                />
              </div>

              <div className="firewood-terminal-status">
                <span className={`firewood-terminal-status-indicator ${session.running ? 'running' : 'idle'}`}>
                  {session.running ? 'Running' : 'Ready'}
                </span>
                <span className="firewood-terminal-status-shell">
                  Shell: {currentShell.label}
                </span>
                {session.lastExitCode !== null && (
                  <span className={`firewood-terminal-status-exit ${session.lastExitCode === 0 ? 'success' : 'error'}`}>
                    Exit: {session.lastExitCode}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </ToolLayout>
  );
}
