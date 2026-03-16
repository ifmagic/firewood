import { Input, Button, Space, Radio } from 'antd';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';

const { TextArea } = Input;

export default function UrlCodec() {
  const [input, setInput] = usePersistentState('tool:url-codec:input', '');
  const [output, setOutput] = usePersistentState('tool:url-codec:output', '');
  const [mode, setMode] = usePersistentState<'encode' | 'decode'>('tool:url-codec:mode', 'encode');

  const convert = () => {
    try {
      if (mode === 'encode') {
        setOutput(encodeURIComponent(input));
      } else {
        setOutput(decodeURIComponent(input));
      }
    } catch {
      setOutput('解码失败，请检查输入是否为合法的 URL 编码字符串');
    }
  };

  return (
    <ToolLayout title="URL 编解码" description="URLEncode / URLDecode">
      <Space style={{ marginBottom: 12 }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio.Button value="encode">编码</Radio.Button>
          <Radio.Button value="decode">解码</Radio.Button>
        </Radio.Group>
        <Button type="primary" onClick={convert}>
          {mode === 'encode' ? '编码' : '解码'}
        </Button>
        <Button danger onClick={() => { setInput(''); setOutput(''); }}>清空</Button>
      </Space>

      <Space direction="vertical" style={{ width: '100%' }}>
        <TextArea
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'encode' ? '请输入原始 URL...' : '请输入 URL 编码字符串...'}
          style={{ fontFamily: 'monospace' }}
        />
        <TextArea
          rows={8}
          value={output}
          readOnly
          placeholder="结果..."
          style={{ fontFamily: 'monospace', background: '#fafafa' }}
        />
      </Space>
    </ToolLayout>
  );
}
