import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
import { relaunch } from '@tauri-apps/api/process';
import { notification, Button, Progress, Space } from 'antd';
import ReactMarkdown from 'react-markdown';

interface UpdateInfo {
  version: string;
  body: string | null;
}

/** 只保留 release notes 中"新功能"部分，去掉下载/安装说明 */
function extractChangelog(body: string | null): string {
  if (!body) return '包含最新功能与问题修复。';
  // 截取到"---"分隔线或"## 下载"之前的内容
  const cutoff = body.search(/^---+$/m);
  const section = cutoff > 0 ? body.slice(0, cutoff) : body;
  return section.trim();
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
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 启动后 3 秒检查一次
    const timer = setTimeout(() => checkForUpdate(), 3000);
    // 之后每 5 小时检查一次
    const interval = setInterval(() => checkForUpdate(), 5 * 60 * 60 * 1000);

    let unlisten: (() => void) | undefined;
    listen('app://check-for-updates', async () => {
      await checkForUpdate(true);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      unlisten?.();
    };
  }, []);

  const checkForUpdate = async (manual = false) => {
    try {
      const { shouldUpdate, manifest } = await checkUpdate();
      if (shouldUpdate && manifest) {
        showUpdateNotification({ version: manifest.version, body: manifest.body ?? null });
      } else if (manual) {
        notification.success({
          message: '当前已是最新版本',
          placement: 'bottomRight',
        });
      }
    } catch {
      // 网络不可达时静默忽略
      if (manual) {
        notification.error({
          message: '检查更新失败',
          description: '请稍后重试或检查网络连接。',
          placement: 'bottomRight',
        });
      }
    }
  };

  const showUpdateNotification = (info: UpdateInfo) => {
    const key = 'firewood-update';
    const changelog = extractChangelog(info.body);
    notification.info({
      key,
      message: `🎉 发现新版本 v${info.version}`,
      description: <MarkdownBody content={changelog} />,
      duration: 0,
      placement: 'bottomRight',
      style: { width: 360 },
      btn: (
        <Space>
          <Button size="small" onClick={() => notification.destroy(key)}>
            稍后更新
          </Button>
          <Button
            type="primary"
            size="small"
            loading={downloading}
            onClick={() => startUpdate(key)}
          >
            立即更新
          </Button>
        </Space>
      ),
    });
  };

  const startUpdate = async (notifKey: string) => {
    notification.destroy(notifKey);
    setDownloading(true);
    setProgress(0);

    // 显示下载进度通知
    const downloadKey = 'firewood-downloading';
    notification.open({
      key: downloadKey,
      message: '正在下载更新…',
      description: <ProgressBar progress={progress} />,
      duration: 0,
      placement: 'bottomRight',
    });

    try {
      // 模拟进度（Tauri v1 updater 不暴露进度事件，用动画代替）
      const progressTimer = setInterval(() => {
        setProgress((p) => {
          const next = p + Math.random() * 8;
          if (next >= 95) {
            clearInterval(progressTimer);
            return 95;
          }
          notification.open({
            key: downloadKey,
            message: '正在下载更新…',
            description: <ProgressBar progress={next} />,
            duration: 0,
            placement: 'bottomRight',
          });
          return next;
        });
      }, 300);

      await installUpdate();
      clearInterval(progressTimer);

      notification.destroy(downloadKey);
      notification.success({
        message: '更新完成',
        description: '即将重启应用以完成更新…',
        duration: 2,
        placement: 'bottomRight',
      });

      setTimeout(() => relaunch(), 2000);
    } catch (e) {
      setDownloading(false);
      notification.destroy(downloadKey);
      notification.error({
        message: '更新失败',
        description: String(e),
        placement: 'bottomRight',
      });
    }
  };

  return null;
}

function ProgressBar({ progress }: { progress: number }) {
  return <Progress percent={Math.round(progress)} size="small" />;
}
