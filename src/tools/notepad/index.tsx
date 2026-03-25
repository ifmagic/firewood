import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react';
import { Button, Dropdown, Empty, Form, Input, Modal, Space, Tabs, message } from 'antd';
import type { InputRef } from 'antd';
import { open as openExternal } from '@tauri-apps/api/shell';
import FontSizeControl from '../../components/FontSizeControl';
import ToolLayout from '../../components/ToolLayout';
import { useEditorFontSize } from '../../hooks/useEditorFontSize';
import { usePersistentState } from '../../hooks/usePersistentState';

interface NoteTab {
  id: string;
  name: string;
}

const STORAGE_TABS_KEY = 'tool:notepad:tabs';
const STORAGE_ACTIVE_KEY = 'tool:notepad:active';
const MAX_TABS = 8;

function getContentKey(tabId: string) {
  return `tool:notepad:content:${tabId}`;
}

function createTabId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_NAME_POOL = [
  '草稿', '笔记', '备忘', '随记', '摘录',
  '待办', '想法', '灵感', '片段', '临时',
  '剑来', '雪中悍刀行', '庆余年', '诡秘之主',
];

function randomDefaultName() {
  const base = DEFAULT_NAME_POOL[Math.floor(Math.random() * DEFAULT_NAME_POOL.length)];
  const suffix = Math.random().toString(36).slice(2, 5);
  return `${base}-${suffix}`;
}

function getUrlAtColumn(line: string, column: number) {
  const urlRegex = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/g;
  let match = urlRegex.exec(line);
  while (match) {
    const start = match.index + 1;
    const end = start + match[0].length;
    if (column >= start && column <= end) {
      return match[0];
    }
    match = urlRegex.exec(line);
  }
  return null;
}

function normalizeUrl(raw: string) {
  const trimmed = raw.trim().replace(/[),.;:!?\]\}]+$/g, '');
  return trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
}

/**
 * Best-effort JSON formatter: tries strict parse first, falls back to a
 * character-level pretty-printer that tolerates invalid / partial JSON.
 */
function bestEffortFormatJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  // Fast path: valid JSON
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    // fall through
  }

  // Slow path: character-level scanner
  let result = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  const indent = () => '  '.repeat(depth);

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      result += ch;
      continue;
    }

    // Skip existing whitespace outside strings
    if (/\s/.test(ch)) continue;

    if (ch === '{' || ch === '[') {
      result += ch;
      depth++;
      result += '\n' + indent();
    } else if (ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
      result += '\n' + indent() + ch;
    } else if (ch === ',') {
      result += ',\n' + indent();
    } else if (ch === ':') {
      result += ': ';
    } else {
      result += ch;
    }
  }

  return result;
}

function getCharacterCount(text: string) {
  return Array.from(text).length;
}

function getCharacterCountWithoutLineBreaks(text: string) {
  return getCharacterCount(text.replace(/\r?\n/g, ''));
}

export default function Notepad() {
  const [tabs, setTabs] = usePersistentState<NoteTab[]>(STORAGE_TABS_KEY, [
    { id: 'default', name: '未命名' },
  ]);
  const [activeTabId, setActiveTabId] = usePersistentState(STORAGE_ACTIVE_KEY, 'default');
  const [content, setContent] = useState('');
  const [dialogMode, setDialogMode] = useState<'create' | 'rename' | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [submittingDialog, setSubmittingDialog] = useState(false);
  const [form] = Form.useForm<{ name: string }>();
  const nameInputRef = useRef<InputRef>(null);
  const { fontSize, increase, decrease } = useEditorFontSize();
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const [currentLineCharCount, setCurrentLineCharCount] = useState(0);
  const [selectedCharCount, setSelectedCharCount] = useState(0);

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabId('');
      setContent('');
      return;
    }

    const hasActive = tabs.some((tab) => tab.id === activeTabId);
    const resolvedActive = hasActive ? activeTabId : tabs[0].id;
    if (resolvedActive !== activeTabId) {
      setActiveTabId(resolvedActive);
      return;
    }

    const saved = localStorage.getItem(getContentKey(resolvedActive));
    setContent(saved ?? '');
  }, [activeTabId, setActiveTabId, tabs]);

  const tabItems = useMemo(
    () =>
      tabs.map((tab) => ({
        key: tab.id,
        label: (
          <Dropdown
            trigger={["contextMenu"]}
            menu={{
              items: [{ key: 'rename', label: '重命名' }],
              onClick: () => {
                setEditingTabId(tab.id);
                form.setFieldsValue({ name: tab.name });
                setDialogMode('rename');
              },
            }}
          >
            <span
              onDoubleClick={() => {
                setEditingTabId(tab.id);
                form.setFieldsValue({ name: tab.name });
                setDialogMode('rename');
              }}
            >
              {tab.name}
            </span>
          </Dropdown>
        ),
        closable: true,
        children: null,
      })),
    [form, tabs],
  );

  const handleSubmit = useCallback(async () => {
    if (submittingDialog) {
      return;
    }

    setSubmittingDialog(true);

    try {
      const values = await form.validateFields();
      const name = values.name.trim();

      if (dialogMode === 'rename' && editingTabId) {
        setTabs(
          tabs.map((tab) => (tab.id === editingTabId ? { ...tab, name } : tab)),
        );
        form.resetFields();
        setEditingTabId(null);
        setDialogMode(null);
        return;
      }

      if (tabs.length >= MAX_TABS) {
        message.warning(`最多只能创建 ${MAX_TABS} 个标签页`);
        return;
      }

      const id = createTabId();

      const nextTabs = [...tabs, { id, name }];
      setTabs(nextTabs);
      setActiveTabId(id);
      localStorage.setItem(getContentKey(id), '');
      setContent('');

      form.resetFields();
      setEditingTabId(null);
      setDialogMode(null);
    } finally {
      setSubmittingDialog(false);
    }
  }, [dialogMode, editingTabId, form, setActiveTabId, setTabs, submittingDialog, tabs]);

  const handleRemoveTab = (targetKey: string) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === targetKey);
    if (currentIndex < 0) return;

    const nextTabs = tabs.filter((tab) => tab.id !== targetKey);
    setTabs(nextTabs);
    localStorage.removeItem(getContentKey(targetKey));

    if (activeTabId === targetKey) {
      const fallback = nextTabs[currentIndex] ?? nextTabs[currentIndex - 1];
      setActiveTabId(fallback?.id ?? '');
      setContent('');
    }
  };

  const handleEdit = (targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
    if (action === 'add') {
      if (tabs.length >= MAX_TABS) {
        message.warning(`最多只能创建 ${MAX_TABS} 个标签页`);
        return;
      }
      setEditingTabId(null);
      form.setFieldsValue({ name: randomDefaultName() });
      setDialogMode('create');
      return;
    }

    if (typeof targetKey === 'string') {
      const tab = tabs.find((t) => t.id === targetKey);
      Modal.confirm({
        title: '删除标签页',
        content: `确定要删除「${tab?.name ?? '未命名'}」吗？删除后内容无法恢复。`,
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => handleRemoveTab(targetKey),
      });
    }
  };

  const onContentChange = (value: string) => {
    setContent(value);
    if (!activeTabId) return;
    localStorage.setItem(getContentKey(activeTabId), value);
  };

  const activeExists = tabs.some((tab) => tab.id === activeTabId);
  const effectiveActive = activeExists ? activeTabId : undefined;
  const modalTitle = dialogMode === 'rename' ? '重命名标签页' : '新建标签页';
  const modalOkText = dialogMode === 'rename' ? '保存' : '创建';

  const focusNameInput = useCallback(() => {
    requestAnimationFrame(() => {
      const input = nameInputRef.current?.input;
      if (!input) {
        return;
      }

      input.focus();

      if (dialogMode === 'rename') {
        const extensionIndex = input.value.lastIndexOf('.');
        const selectionEnd = extensionIndex > 0 ? extensionIndex : input.value.length;
        input.setSelectionRange(0, selectionEnd);
      }
    });
  }, [dialogMode]);

  const handleEditorBeforeMount = useCallback<BeforeMount>((monaco) => {
    monaco.editor.defineTheme('firewood-contrast-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7C3AED' },
        { token: 'number', foreground: 'B45309' },
        { token: 'string', foreground: '047857' },
        { token: 'regexp', foreground: '0369A1' },
        { token: 'type.identifier', foreground: '1D4ED8' },
      ],
      colors: {
        'editor.background': '#F8FAFC',
        'editor.foreground': '#0F172A',
        'editorCursor.foreground': '#EF4444',
        'editorCursor.background': '#FFFFFF',
        'editorMultiCursor.primary.foreground': '#EF4444',
        'editorMultiCursor.secondary.foreground': '#DC2626',
        'editorLineNumber.foreground': '#94A3B8',
        'editorLineNumber.activeForeground': '#334155',
        'editor.selectionBackground': '#CBD5E199',
        'editor.inactiveSelectionBackground': '#E2E8F099',
        'editor.selectionHighlightBackground': '#E2E8F055',
        'editor.selectionHighlightBorder': '#94A3B8',
        'editor.lineHighlightBackground': '#F1F5F9',
        'editorIndentGuide.background1': '#E2E8F0',
      },
    });
  }, []);

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    monaco.editor.setTheme('firewood-contrast-light');

    const updateCursorStats = () => {
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) {
        setCurrentLineCharCount(0);
        setSelectedCharCount(0);
        return;
      }

      const currentLineText = model.getLineContent(position.lineNumber);
      setCurrentLineCharCount(getCharacterCount(currentLineText));

      const selections = editor.getSelections() ?? [];
      const selectedLength = selections.reduce((total, selection) => {
        if (selection.isEmpty()) {
          return total;
        }
        return total + getCharacterCountWithoutLineBreaks(model.getValueInRange(selection));
      }, 0);
      setSelectedCharCount(selectedLength);
    };

    updateCursorStats();
    const cursorPositionDisposable = editor.onDidChangeCursorPosition(updateCursorStats);
    const cursorSelectionDisposable = editor.onDidChangeCursorSelection(updateCursorStats);
    const contentDisposable = editor.onDidChangeModelContent(updateCursorStats);

    editor.onMouseDown(async (event) => {
      const isModifierPressed = isMac ? event.event.metaKey : event.event.ctrlKey;
      if (!event.event.leftButton || !isModifierPressed) return;
      if (!event.target.position) return;
      const model = editor.getModel();
      if (!model) return;

      const line = model.getLineContent(event.target.position.lineNumber);
      const matched = getUrlAtColumn(line, event.target.position.column);
      if (!matched) return;

      const normalized = normalizeUrl(matched);
      try {
        await openExternal(normalized);
      } catch (error) {
        message.error(`链接打开失败：${String(error)}`);
      }
    });

    editor.onDidDispose(() => {
      cursorPositionDisposable.dispose();
      cursorSelectionDisposable.dispose();
      contentDisposable.dispose();
    });

    editor.addAction({
      id: 'firewood.formatJson',
      label: 'Format JSON',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1,
      run: (ed) => {
        const model = ed.getModel();
        if (!model) return;
        const fullRange = model.getFullModelRange();
        const text = model.getValue();
        const formatted = bestEffortFormatJson(text);
        if (formatted !== text) {
          ed.executeEdits('firewood.formatJson', [
            { range: fullRange, text: formatted },
          ]);
        }
      },
    });
  }, [isMac]);

  const editorOptions = {
    minimap: { enabled: false },
    fontSize,
    cursorStyle: 'line' as const,
    cursorWidth: 3,
    cursorBlinking: 'solid' as const,
    lineNumbers: 'on' as const,
    glyphMargin: false,
    folding: true,
    lineDecorationsWidth: 8,
    lineNumbersMinChars: 3,
    wordWrap: 'on' as const,
    links: true,
    smoothScrolling: true,
    scrollBeyondLastLine: false,
  };

  return (
    <ToolLayout title="记事本" description="支持多标签页的本地记事工具（内容仅保存在本机）">
      <Space style={{ marginBottom: 12 }}>
        <Button
          danger
          onClick={() => {
            if (!activeTabId) return;
            localStorage.removeItem(getContentKey(activeTabId));
            setContent('');
          }}
          disabled={!activeTabId}
        >
          清空当前标签内容
        </Button>
        <span style={{ color: '#8f9bb3', fontSize: 12 }}>
          提示：按住 {isMac ? 'Cmd' : 'Ctrl'} 并左键单击链接可直接在浏览器打开
        </span>
      </Space>

      <Tabs
        type="editable-card"
        hideAdd={false}
        onEdit={handleEdit}
        activeKey={effectiveActive}
        items={tabItems}
        onChange={setActiveTabId}
      />

      <div style={{ position: 'relative', height: 'calc(100% - 110px)' }}>
        {activeTabId ? (
          <>
            <Editor
              height="calc(100% - 34px)"
              language="markdown"
              value={content}
              onChange={(value) => onContentChange(value ?? '')}
              beforeMount={handleEditorBeforeMount}
              onMount={handleEditorMount}
              theme="firewood-contrast-light"
              options={editorOptions}
            />
            <div
              style={{
                height: 34,
                borderTop: '1px solid #e2e8f0',
                background: '#f1f5f9',
                color: '#334155',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '0 140px 0 12px',
              }}
            >
              <span>
                当前行字符数：{currentLineCharCount} ｜ 已选中字符数：{selectedCharCount}
              </span>
            </div>
          </>
        ) : (
          <Empty
            description="当前没有标签页，请点击右侧 + 新建"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 36 }}
          />
        )}
        <FontSizeControl fontSize={fontSize} onIncrease={increase} onDecrease={decrease} />
      </div>

      <Modal
        title={modalTitle}
        open={dialogMode !== null}
        afterOpenChange={(open) => {
          if (open) {
            focusNameInput();
          }
        }}
        onCancel={() => {
          setDialogMode(null);
          setEditingTabId(null);
          form.resetFields();
        }}
        onOk={() => void handleSubmit()}
        okText={modalOkText}
        cancelText="取消"
        confirmLoading={submittingDialog}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            label="文件名"
            name="name"
            rules={[
              { required: true, whitespace: true, message: '请输入文件名' },
              { max: 60, message: '文件名最多 60 个字符' },
            ]}
          >
            <Input
              ref={nameInputRef}
              placeholder="例如：需求记录.md"
              maxLength={60}
              onPressEnter={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </ToolLayout>
  );
}
