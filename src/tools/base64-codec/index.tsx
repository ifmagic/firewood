import { useEffect } from 'react';
import { Input, Button, Radio } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
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

  useEffect(() => {
    if (!input) {
      setOutput('');
      return;
    }

    try {
      if (mode === 'encode') {
        setOutput(toBase64(input));
      } else {
        setOutput(fromBase64(input));
      }
    } catch {
      setOutput(t('base64.decodeFailed'));
    }
  }, [input, mode, setOutput, t]);

  const swap = () => {
    setInput(output);
    setOutput('');
    setMode(mode === 'encode' ? 'decode' : 'encode');
  };

  return (
    <ToolLayout title={t('base64.title')}>
      <div className="fw-tool-stack">
        <div className="fw-tool-toolbar">
          <div className="fw-tool-toolbarMain">
            <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
              <Radio.Button value="encode">{t('action.encode')}</Radio.Button>
              <Radio.Button value="decode">{t('action.decode')}</Radio.Button>
            </Radio.Group>
            <Button onClick={swap}>{t('action.swap')}</Button>
          </div>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            className="fw-tool-iconDangerButton"
            title={t('action.clear')}
            aria-label={t('action.clear')}
            onClick={() => { setInput(''); setOutput(''); }}
          />
        </div>

        <div className="fw-tool-grid fw-tool-gridTwo">
          <div className="fw-tool-panel">
            <div className="fw-tool-panelHeader">
              <h4 className="fw-tool-panelTitle">{t('label.text')}</h4>
            </div>
            <div className="fw-tool-panelBody">
              <TextArea
                className="fw-tool-textarea fw-tool-mono"
                rows={10}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === 'encode' ? t('base64.enterPlainText') : t('base64.enterBase64')}
              />
            </div>
          </div>
          <div className="fw-tool-panel">
            <div className="fw-tool-panelHeader">
              <h4 className="fw-tool-panelTitle">{t('label.result')}</h4>
            </div>
            <div className="fw-tool-panelBody">
              <TextArea
                className="fw-tool-textarea fw-tool-mono"
                rows={10}
                value={output}
                readOnly
                placeholder={t('base64.resultPlaceholder')}
              />
            </div>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
