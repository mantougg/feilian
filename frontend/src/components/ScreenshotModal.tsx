import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Crop, Send } from 'lucide-react';

interface ScreenshotModalProps {
  isOpen: boolean;
  /** 屏幕底图（data URL，Go CaptureScreen 产出）；空串 = 截屏失败占位。 */
  shotUrl: string;
  onClose: () => void;
  /** 确认：携带裁剪后的 PNG data URL（浏览器形态回退传文件名文本）。 */
  onCapture: (pngData: string) => void;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({
  isOpen,
  shotUrl,
  onClose,
  onCapture,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (isOpen) {
      setBox(null);
      setStartPos(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const rel = (e: React.MouseEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0) };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.screenshot-actions')) return;
    setStartPos(rel(e));
    setBox({ ...rel(e), w: 0, h: 0 });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !startPos) return;
    const c = rel(e);
    setBox({
      x: Math.min(startPos.x, c.x),
      y: Math.min(startPos.y, c.y),
      w: Math.abs(c.x - startPos.x),
      h: Math.abs(c.y - startPos.y),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setStartPos(null);
  };

  // 确认：把选区从底图裁剪为 PNG data URL；无底图（截屏失败/浏览器形态）退化为文本描述
  const handleComplete = () => {
    if (!shotUrl || !box || box.w < 4 || box.h < 4) {
      onCapture(box ? `屏幕截图_${Math.round(box.w)}x${Math.round(box.h)}.png` : '');
      onClose();
      return;
    }
    const img = imgRef.current;
    if (!img || !img.naturalWidth) {
      onClose();
      return;
    }
    // 选区坐标是视口坐标，底图按窗口铺满，换算到原始截图分辨率
    const sx = (box.x / window.innerWidth) * img.naturalWidth;
    const sy = (box.y / window.innerHeight) * img.naturalHeight;
    const sw = (box.w / window.innerWidth) * img.naturalWidth;
    const sh = (box.h / window.innerHeight) * img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    canvas.getContext('2d')?.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/png'));
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="fixed inset-0 z-50 bg-black/50 select-none cursor-crosshair overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="屏幕截图工具"
    >
      {/* 真实屏幕底图（铺满视口） */}
      {shotUrl ? (
        <img
          ref={imgRef}
          src={shotUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
          无法获取屏幕画面（浏览器预览形态）
        </div>
      )}

      {/* Top Banner Tip */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs flex items-center gap-2 shadow-lg pointer-events-none">
        <Crop className="w-3.5 h-3.5 text-[var(--acc)]" />
        <span>拖动鼠标框选截图区域，点击发送</span>
        <span className="text-white/60">按 ESC 退出</span>
      </div>

      {/* Selected Box cutout */}
      {box && (
        <div
          className="absolute border-2 border-[var(--acc)] bg-white/5 shadow-2xl"
          style={{
            left: `${box.x}px`,
            top: `${box.y}px`,
            width: `${Math.max(box.w, 4)}px`,
            height: `${Math.max(box.h, 4)}px`,
          }}
        >
          <div className="absolute -top-6 left-0 bg-[var(--acc)] text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow-xs">
            {Math.round(box.w)} × {Math.round(box.h)}
          </div>

          <div className="screenshot-actions absolute right-0 -bottom-10 bg-[var(--panel)] border border-[var(--line)] shadow-xl rounded-lg p-1 flex items-center gap-1">
            <button
              type="button"
              onClick={handleComplete}
              className="px-2.5 py-1 bg-[var(--acc)] text-white text-xs rounded-md flex items-center gap-1 hover:brightness-105 cursor-pointer font-medium"
            >
              <Send className="w-3 h-3" />
              <span>发送</span>
            </button>
            <button
              type="button"
              onClick={handleComplete}
              className="p-1 text-[var(--ok)] hover:bg-[var(--panel2)] rounded cursor-pointer"
              title="完成并保存"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[var(--mut)] hover:text-[var(--danger)] hover:bg-[var(--panel2)] rounded cursor-pointer"
              title="取消"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
