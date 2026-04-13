import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { notification, Button, Progress, Space } from 'antd';
import ReactMarkdown from 'react-markdown';
import i18n from '../../i18n';
import { cacheUpdateNotes, extractChangelog } from '../../utils/updateNotes';

interface UpdateInfo {
  version: string;
  body: string | null;
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 13, lineHeight: 1.6 }}>
      <ReactMarkdown
        components={{
          h2: ({ children }) => (
            <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8, marginBottom: 4 }}>
              {children}
            </div>
          ),
          h3: ({ children }) => (
            <div style={{ fontWeight: 600, fontSize: 12, marginTop: 6, marginBottom: 2, color: '#555' }}>
              {children}
            </div>
          ),
          ul: ({ children }) => (
            <ul style={{ paddingLeft: 16, margin: '2px 0' }}>{children}</ul>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: 2 }}>{children}</li>
          ),
          p: ({ children }) => (
            <p style={{ margin: '2px 0' }}>{children}</p>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600 }}>{children}</strong>
          ),
          hr: () => null,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function Updater() {
  const pendingUpdate = useRef<Update | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => checkForUpdate(), 3000);
    const interval = setInterval(() => checkForUpdate(), 5 * 60 * 60 * 1000);

    const unlistenPromise = listen('app://check-for-updates', async () => {
      await checkForUpdate(true);
    });

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  const checkForUpdate = async (manual = false) => {
    try {
      const update = await check();
      if (update) {
        if (update.body) {
          cacheUpdateNotes({
            version: update.version,
            body: extractChangelog(update.body),
            checkedAt: Date.now(),
          });
        }
        pendingUpdate.current = update;
        showUpdateNotification({
          version: update.version,
          body: update.body ?? null,
        });
      } else if (manual) {
        notification.success({
          message: i18n.t('updater.upToDate'),
          placement: 'bottomRight',
        });
      }
    } catch {
      if (manual) {
        notification.error({
          message: i18n.t('updater.checkFailed'),
          description: i18n.t('updater.checkFailedDesc'),
          placement: 'bottomRight',
        });
      }
    }
  };

  const showUpdateNotification = (info: UpdateInfo) => {
    const key = 'firewood-update';
    const changelog = extractChangelog(info.body);
    const description = changelog ? (
      <MarkdownBody content={changelog} />
    ) : (
      <div style={{ fontSize: 13 }}>
        {i18n.t('updater.upToDate') || 'A new version is available. Update now to get the latest features and improvements.'}
      </div>
    );
    notification.info({
      key,
      message: i18n.t('updater.newVersion', { version: info.version }),
      description,
      duration: 0,
      placement: 'bottomRight',
      style: { width: 360 },
      btn: (
        <Space>
          <Button size="small" onClick={() => notification.destroy(key)}>
            {i18n.t('updater.laterBtn')}
          </Button>
          <Button type="primary" size="small" onClick={() => startUpdate(key)}>
            {i18n.t('updater.updateBtn')}
          </Button>
        </Space>
      ),
    });
  };

  const startUpdate = async (notifKey: string) => {
    const update = pendingUpdate.current;
    if (!update) return;

    notification.destroy(notifKey);
    const downloadKey = 'firewood-downloading';

    const showProgress = (pct: number) => {
      notification.open({
        key: downloadKey,
        message: i18n.t('updater.downloading'),
        description: <Progress percent={Math.round(pct)} size="small" />,
        duration: 0,
        placement: 'bottomRight',
      });
    };

    showProgress(0);

    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              showProgress(Math.min((downloaded / contentLength) * 100, 99));
            }
            break;
          case 'Finished':
            showProgress(100);
            break;
        }
      });

      notification.destroy(downloadKey);
      notification.success({
        message: i18n.t('updater.updateComplete'),
        description: i18n.t('updater.restarting'),
        duration: 2,
        placement: 'bottomRight',
      });

      setTimeout(() => relaunch(), 2000);
    } catch (e) {
      notification.destroy(downloadKey);
      notification.error({
        message: i18n.t('updater.updateFailed'),
        description: String(e),
        placement: 'bottomRight',
      });
    }
  };

  return null;
}
