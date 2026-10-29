import React from 'react';
import { Moon, Sun, Minus, Square, X } from 'lucide-react';

interface TitleBarProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  darkMode,
  onToggleTheme,
  onMinimize,
  onMaximize,
  onClose,
}) => {
  return (
    <header
      className="h-[42px] flex-none flex items-center justify-between px-3.5 bg-[var(--panel)] border-b border-[var(--line)] select-none"
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5 font-medium">
        <span className="w-5 h-5 rounded-[6px] bg-[var(--acc)] text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
          飞
        </span>
        <span className="text-xs text-[var(--mut)] tracking-wide font-normal">
          飞联 LANChat — 局域网即时通讯
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={darkMode ? '切换浅色模式' : '切换深色模式'}
          className="w-[30px] h-[28px] rounded-[7px] flex items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          title={darkMode ? '切换浅色模式' : '切换深色模式'}
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onMinimize}
          aria-label="最小化窗口"
          className="w-[30px] h-[28px] rounded-[7px] flex items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          title="最小化"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onMaximize}
          aria-label="最大化窗口"
          className="w-[30px] h-[28px] rounded-[7px] flex items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          title="最大化"
        >
          <Square className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="关闭窗口"
          className="w-[30px] h-[28px] rounded-[7px] flex items-center justify-center text-[var(--mut)] hover:bg-[#e81123] hover:text-white transition-colors cursor-pointer"
          title="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
