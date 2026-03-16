import { Input, Button, Space, Radio } from 'antd';
import { fromBase64, toBase64 } from 'js-base64';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';

const { TextArea } = Input;

export default function Base64Codec() {
  const [input, setInput] = usePersistentState('tool:base64-codec:input', '');
  const [output, setOutput] = usePersistentState('tool:base64-codec:output', '');
  const [mode, setMode] = usePersistentState<'encode' | 'decode'>('tool:base64-codec:mode', 'encode');

  const convert = () => {
    try {
      if (mode === 'encode') {
        setOutput(toBase64(input));
      } else {
        setOutput(fromBase64(input));
      }
    } catch {
      setOutput('解码失败，请检查输入是否为合法的 Base64 字符串');
    }
  };

  const swap = () => {
    setInput(output);
    setOutput('');
    setMode(mode === 'encode' ? 'decode' : 'encode');
  };

  return (
    <ToolLayout title="Base64 编解码" description="文本 Base64 编码与解码">
      <Space style={{ marginBottom: 12 }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio.Button value="encode">编码</Radio.Button>
          <Radio.Button value="decode">解码</Radio.Button>
        </Radio.Group>
        <Button type="primary" onClick={convert}>
          {mode === 'encode' ? '编码' : '解码'}
        </Button>
        <Button onClick={swap}>互换</Button>
        <Button danger onClick={() => { setInput(''); setOutput(''); }}>清空</Button>
      </Space>

      <Space direction="vertical" style={{ width: '100%' }}>
        <TextArea
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'encode' ? '请输入原始文本...' : '请输入 Base64 字符串...'}
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
