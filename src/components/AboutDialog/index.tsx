import { useEffect, useMemo, useState } from 'react';
import { AppstoreOutlined, CodeOutlined, RocketOutlined } from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl as openExternal } from '@tauri-apps/plugin-opener';
import { Modal, Tag, Typography } from 'antd';
import ReactMarkdown from 'react-markdown';
import { getLocalReleaseNotes } from '../../utils/updateNotes';
import buildYmlRaw from '../../../.github/workflows/build.yml?raw';
import styles from './AboutDialog.module.css';

const GITHUB_HOMEPAGE_URL = 'https://github.com/ifmagic/firewood';

export default function AboutDialog() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesVersion, setNotesVersion] = useState('');
  const [notesBody, setNotesBody] = useState('');

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

  const openVersionNotes = async () => {
    const currentVersion = version || (await getVersion());
    const releaseNotes = getLocalReleaseNotes(buildYmlRaw, currentVersion);
    setNotesVersion(releaseNotes.version);
    setNotesBody(releaseNotes.body);
    setNotesOpen(true);
  };

  const openGithubHomepage = async () => {
    await openExternal(GITHUB_HOMEPAGE_URL);
  };

  return (
    <>
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
            <button type="button" className={`${styles.infoItem} ${styles.infoItemButton}`} onClick={openVersionNotes}>
              <CodeOutlined />
              <span>Version {version || '0.0.0'}</span>
              <span className={styles.infoHint}>查看修改点</span>
            </button>
            <button
              type="button"
              className={`${styles.infoItem} ${styles.infoItemButton}`}
              onClick={openGithubHomepage}
              aria-label="Open Firewood GitHub homepage"
            >
              <AppstoreOutlined />
              <span>Desktop Utility Suite</span>
            </button>
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

      <Modal
        open={notesOpen}
        title={`版本更新说明 · v${notesVersion || version || '0.0.0'}`}
        width={640}
        footer={null}
        centered
        onCancel={() => setNotesOpen(false)}
      >
        <div className={styles.notesBody}>
          <ReactMarkdown>{notesBody}</ReactMarkdown>
        </div>
      </Modal>
    </>
  );
}
