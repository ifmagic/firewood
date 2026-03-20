import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Radio, Upload, message, Typography } from 'antd';
import { FilePdfOutlined, PlusOutlined, LeftOutlined, RightOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import jsPDF from 'jspdf';
import { save } from '@tauri-apps/api/dialog';
import { writeBinaryFile } from '@tauri-apps/api/fs';
import ToolLayout from '../../components/ToolLayout';
import dayjs from 'dayjs';
import styles from './ImgToPdf.module.css';

const { Text } = Typography;

/** A4 尺寸 (mm) */
const A4_W = 210;
const A4_H = 297;
const MARGIN = 12;
const GAP = 6;

interface ImageItem {
  id: string;
  file: File;
  dataUrl: string;
  naturalW: number;
  naturalH: number;
}

type LayoutDir = 'col' | 'row';

function getGrid(perPage: number, dir: LayoutDir): { cols: number; rows: number } {
  if (perPage === 1) return { cols: 1, rows: 1 };
  if (perPage === 4) return { cols: 2, rows: 2 };
  return dir === 'row' ? { cols: perPage, rows: 1 } : { cols: 1, rows: perPage };
}

function fitInCell(iw: number, ih: number, cw: number, ch: number) {
  const s = Math.min(cw / iw, ch / ih);
  const w = iw * s;
  const h = ih * s;
  return { w, h, dx: (cw - w) / 2, dy: (ch - h) / 2 };
}

function readImageFile(file: File): Promise<ImageItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target!.result as string;
      const img = new Image();
      img.onload = () => {
        resolve({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          dataUrl,
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
        });
      };
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function buildPDF(items: ImageItem[], perPage: number, dir: LayoutDir): Promise<Uint8Array> {
  const { cols, rows } = getGrid(perPage, dir);
  const usableW = A4_W - 2 * MARGIN;
  const usableH = A4_H - 2 * MARGIN;
  const cellW = (usableW - (cols - 1) * GAP) / cols;
  const cellH = (usableH - (rows - 1) * GAP) / rows;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let p = 0; p < items.length; p += perPage) {
    if (p > 0) doc.addPage();
    for (let k = 0; k < perPage; k++) {
      const item = items[p + k];
      if (!item) break;
      const col = k % cols;
      const row = Math.floor(k / cols);
      const ox = MARGIN + col * (cellW + GAP);
      const oy = MARGIN + row * (cellH + GAP);
      const { w, h, dx, dy } = fitInCell(item.naturalW, item.naturalH, cellW, cellH);
      const fmt = item.file.type === 'image/png' ? 'PNG' : 'JPEG';
      doc.addImage(item.dataUrl, fmt, ox + dx, oy + dy, w, h);
    }
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

export default function ImgToPdf() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [perPage, setPerPage] = useState<number>(2);
  const [layoutDir, setLayoutDir] = useState<LayoutDir>('col');
  const [generating, setGenerating] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const pointerOrigin = useRef<{ idx: number; x: number; y: number } | null>(null);
  const processedUploadUidsRef = useRef<Set<string>>(new Set());

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    pointerOrigin.current = { idx, x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerOrigin.current) return;
    const dx = e.clientX - pointerOrigin.current.x;
    const dy = e.clientY - pointerOrigin.current.y;
    if (draggingIdx === null && Math.abs(dx) + Math.abs(dy) > 4) {
      setDraggingIdx(pointerOrigin.current.idx);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (draggingIdx === null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-thumb-idx]') as HTMLElement | null;
    if (el) {
      const targetIdx = Number(el.dataset.thumbIdx);
      if (!isNaN(targetIdx)) setOverIdx(targetIdx);
    }
  }, [draggingIdx]);

  const handlePointerUp = useCallback(() => {
    if (draggingIdx !== null && overIdx !== null && draggingIdx !== overIdx) {
      setItems((prev) => {
        const next = [...prev];
        const [moved] = next.splice(draggingIdx, 1);
        next.splice(overIdx, 0, moved);
        return next;
      });
    }
    pointerOrigin.current = null;
    setDraggingIdx(null);
    setOverIdx(null);
  }, [draggingIdx, overIdx]);

  const handleUploadChange: UploadProps['onChange'] = ({ fileList }) => {
    const pendingFiles = fileList.filter(
      (f) => f.originFileObj && !processedUploadUidsRef.current.has(f.uid),
    );
    if (pendingFiles.length === 0) return;
    pendingFiles.forEach((f) => processedUploadUidsRef.current.add(f.uid));
    Promise.allSettled(
      pendingFiles.map((f) => readImageFile(f.originFileObj as File)),
    ).then((results) => {
      const okItems = results
        .filter((r): r is PromiseFulfilledResult<ImageItem> => r.status === 'fulfilled')
        .map((r) => r.value);
      const failCount = results.length - okItems.length;
      if (okItems.length > 0) setItems((prev) => [...prev, ...okItems]);
      if (failCount > 0) message.error(`有 ${failCount} 张图片读取失败`);
    });
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    setItems([]);
    processedUploadUidsRef.current.clear();
  };

  const handleGenerate = async () => {
    if (items.length === 0) { message.warning('请先添加图片'); return; }
    const defaultName = `images-${dayjs().format('YYYYMMDD-HHmmss')}.pdf`;
    let savePath: string | null;
    try {
      savePath = (await save({
        defaultPath: defaultName,
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      })) as string | null;
    } catch { return; }
    if (!savePath) return;

    setGenerating(true);
    try {
      const pdfBytes = await buildPDF(items, perPage, layoutDir);
      await writeBinaryFile(savePath, pdfBytes);
      message.success('PDF 已保存');
    } catch (e) {
      message.error(`生成失败：${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  const showLayoutOption = perPage > 1 && perPage < 4;
  const pageCount = Math.ceil(items.length / perPage) || 0;
  const { cols: previewCols, rows: previewRows } = getGrid(perPage, layoutDir);
  const previewStart = (previewPage - 1) * perPage;
  const previewItems = items.slice(previewStart, previewStart + perPage);

  useEffect(() => {
    if (pageCount === 0) { setPreviewPage(1); return; }
    if (previewPage > pageCount) setPreviewPage(pageCount);
  }, [pageCount, previewPage]);

  const hasImages = items.length > 0;

  return (
    <ToolLayout title="图片排版" description="选择图片，设定每页布局，一键导出为 A4 尺寸 PDF">
      <div className={styles.mainLayout}>
        {/* ── 左侧控制面板 ── */}
        <div className={styles.controlPanel}>
          {/* 上传 */}
          <Upload.Dragger
            className={styles.uploadArea}
            accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
            multiple
            showUploadList={false}
            beforeUpload={() => false}
            onChange={handleUploadChange}
          >
            <div className={styles.uploadHint}>
              <PlusOutlined className={styles.uploadIcon} />
              <span className={styles.uploadText}>添加图片</span>
              <span className={styles.uploadSubText}>点击或拖拽，支持批量</span>
            </div>
          </Upload.Dragger>

          {/* 缩略图 */}
          {hasImages && (
            <div className={styles.thumbSection}>
              <div className={styles.thumbHeader}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {items.length} 张图片 · 拖拽排序
                </Text>
                <Button type="link" size="small" danger onClick={handleClearAll} icon={<DeleteOutlined />}>
                  清空
                </Button>
              </div>
              <div
                className={styles.thumbGrid}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    data-thumb-idx={idx}
                    onPointerDown={(e) => handlePointerDown(e, idx)}
                    className={styles.thumbCard}
                    style={{
                      borderColor: overIdx === idx && draggingIdx !== null && draggingIdx !== idx
                        ? '#1677ff' : undefined,
                      borderWidth: overIdx === idx && draggingIdx !== null && draggingIdx !== idx
                        ? 2 : undefined,
                      transform: draggingIdx === idx ? 'scale(0.90)' : undefined,
                      opacity: draggingIdx === idx ? 0.45 : undefined,
                    }}
                  >
                    <img src={item.dataUrl} alt={`img-${idx + 1}`} draggable={false} className={styles.thumbImg} />
                    <span className={styles.thumbIdx}>{idx + 1}</span>
                    <button className={styles.thumbRemove} onClick={() => handleRemove(item.id)} title="移除">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 设置 */}
          {hasImages && (
            <div className={styles.settingsSection}>
              <div className={styles.settingRow}>
                <Text className={styles.settingLabel}>每页</Text>
                <Radio.Group
                  value={perPage}
                  onChange={(e) => setPerPage(e.target.value as number)}
                  optionType="button"
                  buttonStyle="solid"
                  size="small"
                  options={[
                    { label: '1', value: 1 },
                    { label: '2', value: 2 },
                    { label: '3', value: 3 },
                    { label: '4', value: 4 },
                  ]}
                />
                <Text className={styles.settingLabel}>张</Text>
              </div>
              {showLayoutOption && (
                <div className={styles.settingRow}>
                  <Text className={styles.settingLabel}>排列</Text>
                  <Radio.Group
                    value={layoutDir}
                    onChange={(e) => setLayoutDir(e.target.value as LayoutDir)}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                    options={[
                      { label: '上下', value: 'col' },
                      { label: '左右', value: 'row' },
                    ]}
                  />
                </div>
              )}
            </div>
          )}

          {/* 导出 */}
          {hasImages && (
            <Button
              className={styles.exportBtn}
              type="primary"
              size="large"
              icon={<FilePdfOutlined />}
              onClick={handleGenerate}
              loading={generating}
              block
            >
              导出 PDF · {pageCount} 页
            </Button>
          )}
        </div>

        {/* ── 右侧预览 ── */}
        <div className={styles.previewPanel}>
          {!hasImages ? (
            <div className={styles.previewEmpty}>
              <FilePdfOutlined className={styles.previewEmptyIcon} />
              <Text type="secondary">添加图片后预览排版效果</Text>
            </div>
          ) : (
            <>
              <div className={styles.previewPaper}>
                <div className={styles.previewCanvas}>
                  {previewItems.map((item, idx) => {
                    const col = idx % previewCols;
                    const row = Math.floor(idx / previewCols);
                    const cellW = `(100% - ${(previewCols - 1) * 2}%) / ${previewCols}`;
                    const cellH = `(100% - ${(previewRows - 1) * 2}%) / ${previewRows}`;
                    return (
                      <div
                        key={item.id}
                        className={styles.previewCell}
                        style={{
                          width: `calc(${cellW})`,
                          height: `calc(${cellH})`,
                          left: `calc(${col} * ((${cellW}) + 2%))`,
                          top: `calc(${row} * ((${cellH}) + 2%))`,
                        }}
                      >
                        <img src={item.dataUrl} alt={`preview-${idx + 1}`} className={styles.previewImage} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className={styles.previewPager}>
                <Button
                  size="small"
                  type="text"
                  icon={<LeftOutlined />}
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  disabled={previewPage <= 1}
                />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {previewPage} / {pageCount}
                </Text>
                <Button
                  size="small"
                  type="text"
                  icon={<RightOutlined />}
                  onClick={() => setPreviewPage((p) => Math.min(pageCount, p + 1))}
                  disabled={previewPage >= pageCount}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </ToolLayout>
  );
}
