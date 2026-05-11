import { useEffect } from 'react';
import { Input, Button, Radio } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';

const { TextArea } = Input;

export default function UrlCodec() {
  const { t } = useTranslation();
  const [input, setInput] = usePersistentState('tool:url-codec:input', '');
  const [output, setOutput] = usePersistentState('tool:url-codec:output', '');
  const [mode, setMode] = usePersistentState<'encode' | 'decode'>('tool:url-codec:mode', 'encode');

  useEffect(() => {
    if (!input) {
      setOutput('');
      return;
    }

    try {
      if (mode === 'encode') {
        setOutput(encodeURIComponent(input));
      } else {
        setOutput(decodeURIComponent(input));
      }
    } catch {
      setOutput(t('urlCodec.decodeFailed'));
    }
  }, [input, mode, setOutput, t]);

  return (
    <ToolLayout title={t('urlCodec.title')} description={t('urlCodec.description')}>
      <div className="fw-tool-stack">
        <div className="fw-tool-toolbar">
          <div className="fw-tool-toolbarMain">
            <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
              <Radio.Button value="encode">{t('action.encode')}</Radio.Button>
              <Radio.Button value="decode">{t('action.decode')}</Radio.Button>
            </Radio.Group>
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
                placeholder={mode === 'encode' ? t('urlCodec.enterUrl') : t('urlCodec.enterEncoded')}
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
                placeholder={t('urlCodec.resultPlaceholder')}
              />
            </div>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
