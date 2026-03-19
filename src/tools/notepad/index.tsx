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
      form.resetFields();
      setDialogMode('create');
      return;
    }

    if (typeof targetKey === 'string') {
      handleRemoveTab(targetKey);
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
    monaco.editor.defineTheme('firewood-one-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '5C6370', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'C678DD' },
        { token: 'number', foreground: 'D19A66' },
        { token: 'string', foreground: '98C379' },
        { token: 'regexp', foreground: '56B6C2' },
        { token: 'type.identifier', foreground: 'E5C07B' },
      ],
      colors: {
        'editor.background': '#1E222A',
        'editor.foreground': '#ABB2BF',
        'editorCursor.foreground': '#61AFEF',
        'editorLineNumber.foreground': '#3F4451',
        'editor.selectionBackground': '#3E4451',
        'editor.inactiveSelectionBackground': '#2C313C',
        'editorIndentGuide.background1': '#2C313C',
      },
    });
  }, []);

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    monaco.editor.setTheme('firewood-one-dark');

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
  }, [isMac]);

  const editorOptions = {
    minimap: { enabled: false },
    fontSize,
    lineNumbers: 'off' as const,
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
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
          <Editor
            height="100%"
            language="markdown"
            value={content}
            onChange={(value) => onContentChange(value ?? '')}
            beforeMount={handleEditorBeforeMount}
            onMount={handleEditorMount}
            theme="firewood-one-dark"
            options={editorOptions}
          />
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
