import { Modal, Slider, Button } from 'antd';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  fontSize: number;
  contentMaxWidth: number;
  widthMin: number;
  widthMax: number;
  widthStep: number;
  onFontSizeChange: (v: number) => void;
  onContentWidthChange: (v: number) => void;
  onCancel: () => void;
}

export default function SettingsPopup({
  open,
  fontSize,
  contentMaxWidth,
  widthMin,
  widthMax,
  widthStep,
  onFontSizeChange,
  onContentWidthChange,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      title={t('moxia.settings')}
      onCancel={onCancel}
      footer={[
        <Button key="ok" type="primary" onClick={onCancel}>
          {t('moxia.done')}
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 24, marginTop: 16 }}>
        <div style={{ marginBottom: 8, fontSize: 13 }}>
          {t('moxia.editorFontSize')}: {fontSize}px
        </div>
        <Slider min={12} max={24} step={1} value={fontSize} onChange={onFontSizeChange} />
      </div>
      <div>
        <div style={{ marginBottom: 8, fontSize: 13 }}>
          {t('moxia.contentMaxWidth')}: {contentMaxWidth}px
        </div>
        <Slider
          min={widthMin}
          max={widthMax}
          step={widthStep}
          value={contentMaxWidth}
          onChange={onContentWidthChange}
        />
      </div>
    </Modal>
  );
}
