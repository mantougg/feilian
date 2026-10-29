import React, { useState, useRef } from 'react';
import { Check, X, Crop, Send } from 'lucide-react';

interface ScreenshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imgName: string) => void;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>({
    x: 180,
    y: 120,
    w: 520,
    h: 340,
  });

  const overlayRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.screenshot-actions')) return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setBox({ x, y, w: 0, h: 0 });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !startPos) return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const x = Math.min(startPos.x, currentX);
    const y = Math.min(startPos.y, currentY);
    const w = Math.abs(currentX - startPos.x);
    const h = Math.abs(currentY - startPos.y);

    setBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setStartPos(null);
  };

  const handleComplete = () => {
    const w = box ? Math.round(box.w) : 520;
    const h = box ? Math.round(box.h) : 340;
    onCapture(`屏幕截图_${w}x${h}.png · 280 KB`);
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
      {/* Top Banner Tip */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs flex items-center gap-2 shadow-lg pointer-events-none">
        <Crop className="w-3.5 h-3.5 text-[var(--acc)]" />
        <span>拖动鼠标框选截图区域，双击或点击确认发送</span>
        <span className="text-white/60">按 ESC 退出</span>
      </div>

      {/* Selected Box cutout */}
      {box && (
        <div
          className="absolute border-2 border-[var(--acc)] bg-white/5 shadow-2xl"
          style={{
            left: `${box.x}px`,
            top: `${box.y}px`,
            width: `${Math.max(box.w, 40)}px`,
            height: `${Math.max(box.h, 40)}px`,
          }}
        >
          {/* Dimension tag */}
          <div className="absolute -top-6 left-0 bg-[var(--acc)] text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow-xs">
            {Math.round(box.w)} × {Math.round(box.h)}
          </div>

          {/* Action Toolbar */}
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
              title="完成并复制"
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
