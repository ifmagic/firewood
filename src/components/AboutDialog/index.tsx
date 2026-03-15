import { useEffect, useMemo, useState } from 'react';
import { AppstoreOutlined, CodeOutlined, RocketOutlined } from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { Modal, Tag, Typography } from 'antd';
import styles from './AboutDialog.module.css';

export default function AboutDialog() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState('');

  const metaTags = useMemo(
    () => ['Tauri', 'React', 'TypeScript'],
    [],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen('app://about-firewood', async () => {
        const currentVersion = await getVersion();
        setVersion(currentVersion);
        setOpen(true);
      });
    };

    void setup();

    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <Modal
      open={open}
      title={null}
      width={520}
      footer={null}
      centered
      onCancel={() => setOpen(false)}
      className={styles.modal}
      styles={{ body: { padding: 0 } }}
    >
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.badge}>
            <RocketOutlined />
          </div>
          <div>
            <Typography.Title level={3} className={styles.title}>
              Firewood
            </Typography.Title>
            <Typography.Text className={styles.subtitle}>
              A compact toolbox that keeps everyday dev workflows fast and focused.
            </Typography.Text>
          </div>
        </div>

        <div className={styles.infoRow}>
          <div className={styles.infoItem}>
            <CodeOutlined />
            <span>Version {version || '0.0.0'}</span>
          </div>
          <div className={styles.infoItem}>
            <AppstoreOutlined />
            <span>Desktop Utility Suite</span>
          </div>
        </div>

        <div className={styles.tags}>
          {metaTags.map((tag) => (
            <Tag key={tag} className={styles.tag}>
              {tag}
            </Tag>
          ))}
        </div>
      </div>
    </Modal>
  );
}
