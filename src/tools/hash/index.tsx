import { Input, Button, Space, Table } from 'antd';
import SparkMD5 from 'spark-md5';
import { sha1 } from 'js-sha1';
import { sha256 } from 'js-sha256';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';

const { TextArea } = Input;

interface HashRow {
  algorithm: string;
  value: string;
}

export default function HashCalculator() {
  const [input, setInput] = usePersistentState('tool:hash:input', '');
  const [rows, setRows] = usePersistentState<HashRow[]>('tool:hash:rows', []);

  const calculate = () => {
    setRows([
      { algorithm: 'MD5', value: SparkMD5.hash(input) },
      { algorithm: 'SHA-1', value: sha1(input) },
      { algorithm: 'SHA-256', value: sha256(input) },
    ]);
  };

  const columns = [
    { title: '算法', dataIndex: 'algorithm', width: 120 },
    {
      title: '哈希值',
      dataIndex: 'value',
      render: (v: string) => (
        <code style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</code>
      ),
    },
  ];

  return (
    <ToolLayout title="Hash 计算" description="计算文本的 MD5 / SHA-1 / SHA-256">
      <Space direction="vertical" style={{ width: '100%' }}>
        <TextArea
          rows={6}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="请输入要计算哈希值的文本..."
          style={{ fontFamily: 'monospace' }}
        />
        <Space>
          <Button type="primary" onClick={calculate}>计算</Button>
          <Button danger onClick={() => { setInput(''); setRows([]); }}>清空</Button>
        </Space>
        {rows.length > 0 && (
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="algorithm"
            pagination={false}
            size="small"
          />
        )}
      </Space>
    </ToolLayout>
  );
}
