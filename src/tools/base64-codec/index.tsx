import { Input, Button, Space, Radio } from 'antd';
import { fromBase64, toBase64 } from 'js-base64';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';

const { TextArea } = Input;

export default function Base64Codec() {
  const { t } = useTranslation();
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
      setOutput(t('base64.decodeFailed'));
    }
  };

  const swap = () => {
    setInput(output);
    setOutput('');
    setMode(mode === 'encode' ? 'decode' : 'encode');
  };

  return (
    <ToolLayout title={t('base64.title')} description={t('base64.description')}>
      <Space style={{ marginBottom: 12 }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio.Button value="encode">{t('action.encode')}</Radio.Button>
          <Radio.Button value="decode">{t('action.decode')}</Radio.Button>
        </Radio.Group>
        <Button type="primary" onClick={convert}>
          {mode === 'encode' ? t('action.encode') : t('action.decode')}
        </Button>
        <Button onClick={swap}>{t('action.swap')}</Button>
        <Button danger onClick={() => { setInput(''); setOutput(''); }}>{t('action.clear')}</Button>
      </Space>

      <Space direction="vertical" style={{ width: '100%' }}>
        <TextArea
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'encode' ? t('base64.enterPlainText') : t('base64.enterBase64')}
          style={{ fontFamily: 'monospace' }}
        />
        <TextArea
          rows={8}
          value={output}
          readOnly
          placeholder={t('base64.resultPlaceholder')}
          style={{ fontFamily: 'monospace', background: '#fafafa' }}
        />
      </Space>
    </ToolLayout>
  );
}
