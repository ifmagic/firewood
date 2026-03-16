import { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Empty, Form, Input, Modal, Space, Tabs, message } from 'antd';
import ToolLayout from '../../components/ToolLayout';
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

export default function Notepad() {
  const [tabs, setTabs] = usePersistentState<NoteTab[]>(STORAGE_TABS_KEY, [
    { id: 'default', name: '未命名' },
  ]);
  const [activeTabId, setActiveTabId] = usePersistentState(STORAGE_ACTIVE_KEY, 'default');
  const [content, setContent] = useState('');
  const [dialogMode, setDialogMode] = useState<'create' | 'rename' | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [form] = Form.useForm<{ name: string }>();

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

  const handleSubmit = async () => {
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
  };

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
      </Space>

      <Tabs
        type="editable-card"
        hideAdd={false}
        onEdit={handleEdit}
        activeKey={effectiveActive}
        items={tabItems}
        onChange={setActiveTabId}
      />

      {activeTabId ? (
        <Input.TextArea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="请输入记事内容..."
          style={{ height: 'calc(100% - 110px)', resize: 'none', fontFamily: 'monospace' }}
        />
      ) : (
        <Empty
          description="当前没有标签页，请点击右侧 + 新建"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 36 }}
        />
      )}

      <Modal
        title={modalTitle}
        open={dialogMode !== null}
        onCancel={() => {
          setDialogMode(null);
          setEditingTabId(null);
          form.resetFields();
        }}
        onOk={() => void handleSubmit()}
        okText={modalOkText}
        cancelText="取消"
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
            <Input placeholder="例如：需求记录.md" maxLength={60} />
          </Form.Item>
        </Form>
      </Modal>
    </ToolLayout>
  );
}
