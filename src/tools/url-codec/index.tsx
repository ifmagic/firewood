import { Input, Button, Space, Radio } from 'antd';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';

const { TextArea } = Input;

export default function UrlCodec() {
  const { t } = useTranslation();
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
      setOutput(t('urlCodec.decodeFailed'));
    }
  };

  return (
    <ToolLayout title={t('urlCodec.title')} description={t('urlCodec.description')}>
      <Space style={{ marginBottom: 12 }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio.Button value="encode">{t('action.encode')}</Radio.Button>
          <Radio.Button value="decode">{t('action.decode')}</Radio.Button>
        </Radio.Group>
        <Button type="primary" onClick={convert}>
          {mode === 'encode' ? t('action.encode') : t('action.decode')}
        </Button>
        <Button danger onClick={() => { setInput(''); setOutput(''); }}>{t('action.clear')}</Button>
      </Space>

      <Space direction="vertical" style={{ width: '100%' }}>
        <TextArea
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'encode' ? t('urlCodec.enterUrl') : t('urlCodec.enterEncoded')}
          style={{ fontFamily: 'monospace' }}
        />
        <TextArea
          rows={8}
          value={output}
          readOnly
          placeholder={t('urlCodec.resultPlaceholder')}
          style={{ fontFamily: 'monospace', background: '#fafafa' }}
        />
      </Space>
    </ToolLayout>
  );
}
