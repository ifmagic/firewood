import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Radio, Upload, message, Typography, Slider, Switch, Input } from 'antd';
import { FilePdfOutlined, PlusOutlined, LeftOutlined, RightOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import jsPDF from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import dayjs from 'dayjs';
import styles from './ImgToPdf.module.css';

const { Text } = Typography;

/** A4 dimensions (mm) */
const A4_W = 210;
const A4_H = 297;
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
  return { w, h, dx: (cw - w) / 2, dy: (ch - h) / 2, s };
}

function calcPagePlacements(
  items: ImageItem[],
  cellW: number,
  cellH: number,
  imageScaleRatio: number,
  lockUniform: boolean,
) {
  const fitted = items.map((item) => fitInCell(item.naturalW, item.naturalH, cellW, cellH));

  if (!lockUniform || items.length <= 1) {
    return fitted.map((f) => {
      const w = f.w * imageScaleRatio;
      const h = f.h * imageScaleRatio;
      return { w, h, dx: (cellW - w) / 2, dy: (cellH - h) / 2 };
    });
  }

  // Uniform scale for two images: normalize to same visual long edge, then apply user scale.
  const targetLongEdge = Math.min(...fitted.map((f) => Math.max(f.w, f.h)));
  return fitted.map((f) => {
    const currentLongEdge = Math.max(f.w, f.h) || 1;
    const normalizeRatio = targetLongEdge / currentLongEdge;
    const w = f.w * normalizeRatio * imageScaleRatio;
    const h = f.h * normalizeRatio * imageScaleRatio;
    return { w, h, dx: (cellW - w) / 2, dy: (cellH - h) / 2 };
  });
}

/** Re-encode image dataUrl to JPEG at given quality */
function compressImageToJpeg(dataUrl: string, naturalW: number, naturalH: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = naturalW;
      canvas.height = naturalH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, naturalW, naturalH);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
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

/** Build A4 PDF from images with layout settings and JPEG quality compression */
async function buildPDF(
  items: ImageItem[],
  perPage: number,
  dir: LayoutDir,
  imageScaleRatio: number,
  pageMargin: number,
  lockUniformWhenTwo: boolean,
  jpegQuality: number = 0.75,
): Promise<Uint8Array> {
  const { cols, rows } = getGrid(perPage, dir);
  const usableW = A4_W - 2 * pageMargin;
  const usableH = A4_H - 2 * pageMargin;
  const cellW = (usableW - (cols - 1) * GAP) / cols;
  const cellH = (usableH - (rows - 1) * GAP) / rows;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  for (let p = 0; p < items.length; p += perPage) {
    if (p > 0) doc.addPage();
    const pageItems = items.slice(p, p + perPage);
    const pagePlacements = calcPagePlacements(
      pageItems,
      cellW,
      cellH,
      imageScaleRatio,
      lockUniformWhenTwo && perPage === 2,
    );
    for (let k = 0; k < perPage; k++) {
      const item = items[p + k];
      if (!item) break;
      const col = k % cols;
      const row = Math.floor(k / cols);
      const ox = pageMargin + col * (cellW + GAP);
      const oy = pageMargin + row * (cellH + GAP);
      const { w, h, dx, dy } = pagePlacements[k];
      // Compress all images to JPEG to reduce file size
      const imgData = await compressImageToJpeg(item.dataUrl, item.naturalW, item.naturalH, jpegQuality);
      doc.addImage(imgData, 'JPEG', ox + dx, oy + dy, w, h);
    }
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/** Parse user-entered size limit string, return bytes or null if invalid */
function parseMaxSizeMB(input: string): number | null {
  const trimmed = input.trim().toLowerCase().replace(/m[b]?$/, '');
  if (!trimmed) return null;
  const num = parseFloat(trimmed);
  if (isNaN(num) || num <= 0) return null;
  return num * 1024 * 1024;
}

/** Binary search for JPEG quality to meet file size limit */
async function buildPDFWithSizeLimit(
  builder: (quality: number) => Promise<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  // Try default quality 0.75 first
  let result = await builder(0.75);
  if (result.byteLength <= maxBytes) return result;

  // Binary search for suitable quality
  let lo = 0.1;
  let hi = 0.75;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    result = await builder(mid);
    if (result.byteLength <= maxBytes) {
      lo = mid;  // quality can be higher
    } else {
      hi = mid;  // quality needs to be lower
    }
  }
  // Use lo as final result (highest quality that stays <= maxBytes)
  result = await builder(lo);
  if (result.byteLength > maxBytes) {
    // Min quality still exceeds limit, output at lowest quality and warn
    result = await builder(0.1);
  }
  return result;
}

export default function ImgToPdf() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ImageItem[]>([]);
  const [perPage, setPerPage] = useState<number>(2);
  const [layoutDir, setLayoutDir] = useState<LayoutDir>('col');
  const [imageScalePct, setImageScalePct] = useState<number>(82);
  const [pageMargin, setPageMargin] = useState<number>(20);
  const [lockUniformWhenTwo, setLockUniformWhenTwo] = useState<boolean>(true);
  const [generating, setGenerating] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([]);
  const [maxSizeInput, setMaxSizeInput] = useState<string>('');
  const pointerOrigin = useRef<{ idx: number; x: number; y: number } | null>(null);
  const processedUploadUidsRef = useRef<Set<string>>(new Set());

  const applyPhonePreset = () => {
    setImageScalePct(78);
    setPageMargin(24);
    setLockUniformWhenTwo(true);
  };

  const applyReceiptPreset = () => {
    setImageScalePct(68);
    setPageMargin(28);
    setLockUniformWhenTwo(true);
  };

  const resetLayoutPreset = () => {
    setImageScalePct(82);
    setPageMargin(20);
    setLockUniformWhenTwo(true);
  };

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
    setUploadFileList(fileList);
    const pendingFiles = fileList.filter(
      (f) => f.status !== 'removed' && f.originFileObj && !processedUploadUidsRef.current.has(f.uid),
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
      if (failCount > 0) message.error(t('hash.readFailed', { count: failCount }));
    });
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    setItems([]);
    setUploadFileList([]);
    processedUploadUidsRef.current.clear();
  };

  const handleGenerate = async () => {
    if (items.length === 0) { message.warning(t('imgToPdf.addImagesFirst')); return; }
    const defaultName = `images-${dayjs().format('YYYYMMDD-HHmmss')}.pdf`;
    let savePath: string | null;
    try {
      savePath = (await save({
        defaultPath: defaultName,
        filters: [{ name: t('imgToPdf.pdfFilter'), extensions: ['pdf'] }],
      })) as string | null;
    } catch { return; }
    if (!savePath) return;

    setGenerating(true);
    try {
      const maxBytes = parseMaxSizeMB(maxSizeInput);
      let pdfBytes: Uint8Array;
      if (maxBytes) {
        pdfBytes = await buildPDFWithSizeLimit(
          (q) => buildPDF(items, perPage, layoutDir, imageScalePct / 100, pageMargin, lockUniformWhenTwo, q),
          maxBytes,
        );
        const actualMB = (pdfBytes.byteLength / 1024 / 1024).toFixed(2);
        if (pdfBytes.byteLength > maxBytes) {
          message.warning(t('imgToPdf.minSize', { size: actualMB }));
        } else {
          message.info(t('imgToPdf.actualSize', { size: actualMB }));
        }
      } else {
        pdfBytes = await buildPDF(items, perPage, layoutDir, imageScalePct / 100, pageMargin, lockUniformWhenTwo);
      }
      await writeFile(savePath, pdfBytes);
      message.success(t('imgToPdf.pdfSaved'));
    } catch (e) {
      message.error(t('imgToPdf.generateFailed', { error: (e as Error).message }));
    } finally {
      setGenerating(false);
    }
  };

  const showLayoutOption = perPage > 1 && perPage < 4;
  const pageCount = Math.ceil(items.length / perPage) || 0;
  const { cols: previewCols, rows: previewRows } = getGrid(perPage, layoutDir);
  const previewStart = (previewPage - 1) * perPage;
  const previewItems = items.slice(previewStart, previewStart + perPage);
  const previewUsableW = A4_W - 2 * pageMargin;
  const previewUsableH = A4_H - 2 * pageMargin;
  const previewCellW = (previewUsableW - (previewCols - 1) * GAP) / previewCols;
  const previewCellH = (previewUsableH - (previewRows - 1) * GAP) / previewRows;
  const previewPlacements = calcPagePlacements(
    previewItems,
    previewCellW,
    previewCellH,
    imageScalePct / 100,
    lockUniformWhenTwo && perPage === 2,
  );

  useEffect(() => {
    if (pageCount === 0) { setPreviewPage(1); return; }
    if (previewPage > pageCount) setPreviewPage(pageCount);
  }, [pageCount, previewPage]);

  const hasImages = items.length > 0;

  return (
    <ToolLayout title={t('imgToPdf.title')} description={t('imgToPdf.description')}>
      <div className={styles.mainLayout}>
        {/* ── Left control panel ── */}
        <div className={styles.controlPanel}>
          {/* Upload */}
          <Upload.Dragger
            className={styles.uploadArea}
            accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
            multiple
            showUploadList={false}
            fileList={uploadFileList}
            beforeUpload={() => false}
            onChange={handleUploadChange}
          >
            <div className={styles.uploadHint}>
              <PlusOutlined className={styles.uploadIcon} />
              <span className={styles.uploadText}>{t('imgToPdf.addImages')}</span>
              <span className={styles.uploadSubText}>{t('imgToPdf.clickOrDrag')}</span>
            </div>
          </Upload.Dragger>

          {/* Thumbnails */}
          {hasImages && (
            <div className={styles.thumbSection}>
              <div className={styles.thumbHeader}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('imgToPdf.imageCount', { count: items.length })}
                </Text>
                <Button type="link" size="small" danger onClick={handleClearAll} icon={<DeleteOutlined />}>
                  {t('action.clear')}
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
                    <button className={styles.thumbRemove} onClick={() => handleRemove(item.id)} title={t('imgToPdf.remove')}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          {hasImages && (
            <div className={styles.settingsSection}>
              <div className={styles.settingRow}>
                <Text className={styles.settingLabel}>{t('imgToPdf.perPage')}</Text>
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
                <Text className={styles.settingLabel}>{t('imgToPdf.images')}</Text>
              </div>
              {showLayoutOption && (
                <div className={styles.settingRow}>
                  <Text className={styles.settingLabel}>{t('imgToPdf.layout')}</Text>
                  <Radio.Group
                    value={layoutDir}
                    onChange={(e) => setLayoutDir(e.target.value as LayoutDir)}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                    options={[
                      { label: t('imgToPdf.vertical'), value: 'col' },
                      { label: t('imgToPdf.horizontal'), value: 'row' },
                    ]}
                  />
                </div>
              )}
              <div className={styles.settingCol}>
                <div className={styles.settingRow}>
                  <Text className={styles.settingLabel}>{t('imgToPdf.imageScale')}</Text>
                  <Text className={styles.settingValue}>{imageScalePct}%</Text>
                </div>
                <Slider
                  min={55}
                  max={100}
                  step={1}
                  value={imageScalePct}
                  onChange={setImageScalePct}
                  tooltip={{ formatter: (value) => `${value}%` }}
                />
              </div>
              <div className={styles.settingCol}>
                <div className={styles.settingRow}>
                  <Text className={styles.settingLabel}>{t('imgToPdf.pageMargin')}</Text>
                  <Text className={styles.settingValue}>{pageMargin}mm</Text>
                </div>
                <Slider
                  min={12}
                  max={32}
                  step={1}
                  value={pageMargin}
                  onChange={setPageMargin}
                  tooltip={{ formatter: (value) => `${value}mm` }}
                />
              </div>
              {perPage === 2 && (
                <div className={styles.settingRow}>
                  <Text className={styles.settingLabel}>{t('imgToPdf.uniformScale')}</Text>
                  <Switch size="small" checked={lockUniformWhenTwo} onChange={setLockUniformWhenTwo} />
                </div>
              )}
              <div className={styles.settingActions}>
                <Button size="small" onClick={applyPhonePreset}>
                  {t('imgToPdf.phonePreset')}
                </Button>
                <Button size="small" onClick={applyReceiptPreset}>
                  {t('imgToPdf.receiptPreset')}
                </Button>
                <Button size="small" type="text" onClick={resetLayoutPreset}>
                  {t('imgToPdf.resetDefault')}
                </Button>
              </div>
              <Text type="secondary" className={styles.settingTip}>
                {t('imgToPdf.previewTip')}
              </Text>
            </div>
          )}

          {/* Size limit */}
          {hasImages && (
            <div className={styles.settingsSection}>
              <div className={styles.settingRow}>
                <Text className={styles.settingLabel}>{t('imgToPdf.sizeLimit')}</Text>
                <Input
                  className={styles.sizeInput}
                  size="small"
                  placeholder={t('imgToPdf.sizePlaceholder')}
                  value={maxSizeInput}
                  onChange={(e) => setMaxSizeInput(e.target.value)}
                  suffix="MB"
                  allowClear
                />
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {t('imgToPdf.sizeHint')}
              </Text>
            </div>
          )}

          {/* Export */}
          {hasImages && (
            <div className={styles.exportGroup}>
              <Button
                className={styles.exportBtn}
                type="primary"
                size="large"
                icon={<FilePdfOutlined />}
                onClick={handleGenerate}
                loading={generating}
                block
              >
                {t('imgToPdf.exportPdf', { count: pageCount })}
              </Button>
            </div>
          )}
        </div>

        {/* ── Right preview ── */}
        <div className={styles.previewPanel}>
          {!hasImages ? (
            <div className={styles.previewEmpty}>
              <FilePdfOutlined className={styles.previewEmptyIcon} />
              <Text type="secondary">{t('imgToPdf.previewHint')}</Text>
            </div>
          ) : (
            <>
              <div className={styles.previewPaper}>
                <div className={styles.previewCanvas}>
                  {previewItems.map((item, idx) => {
                    const col = idx % previewCols;
                    const row = Math.floor(idx / previewCols);
                    const ox = pageMargin + col * (previewCellW + GAP);
                    const oy = pageMargin + row * (previewCellH + GAP);
                    const placement = previewPlacements[idx];
                    const imgW = placement.w;
                    const imgH = placement.h;
                    const dx = (previewCellW - imgW) / 2;
                    const dy = (previewCellH - imgH) / 2;
                    return (
                      <div
                        key={item.id}
                        className={styles.previewCell}
                        style={{
                          width: `${(previewCellW / A4_W) * 100}%`,
                          height: `${(previewCellH / A4_H) * 100}%`,
                          left: `${(ox / A4_W) * 100}%`,
                          top: `${(oy / A4_H) * 100}%`,
                        }}
                      >
                        <img
                          src={item.dataUrl}
                          alt={`preview-${idx + 1}`}
                          className={styles.previewImage}
                          style={{
                            width: `${(imgW / previewCellW) * 100}%`,
                            height: `${(imgH / previewCellH) * 100}%`,
                            left: `${(dx / previewCellW) * 100}%`,
                            top: `${(dy / previewCellH) * 100}%`,
                          }}
                        />
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
