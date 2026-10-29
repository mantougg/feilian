import React, { useState } from 'react';
import { Monitor, X, Wifi, ShieldCheck, Power, Folder, RefreshCw } from 'lucide-react';
import { Contact } from '../types';

interface RemoteAssistModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
}

export const RemoteAssistModal: React.FC<RemoteAssistModalProps> = ({
  isOpen,
  onClose,
  contact,
}) => {
  const [status, setStatus] = useState<'connecting' | 'connected'>('connected');
  const latency = 2;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="远程协助会话"
    >
      <div className="w-[840px] max-w-full bg-[var(--panel)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[560px]">
        {/* Title bar */}
        <div className="h-10 px-4 bg-[var(--panel2)] border-b border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[var(--acc)]" />
            <span className="text-xs font-medium text-[var(--text)]">
              远程协助 — {contact.name} ({contact.ip || '192.168.1.x'})
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--ok)]/15 text-[var(--ok)] font-medium flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              局域网点对点直连
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--mut)] flex items-center gap-1 tabular-nums font-mono">
              <Wifi className="w-3 h-3 text-[var(--ok)]" />
              {latency} ms
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[var(--mut)] hover:text-[var(--danger)] hover:bg-[var(--panel)] rounded cursor-pointer"
              aria-label="关闭远程连接"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewport content */}
        <div className="flex-1 bg-slate-900 relative flex items-center justify-center overflow-hidden">
          {status === 'connecting' ? (
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <RefreshCw className="w-8 h-8 text-[var(--acc)]" />
              <p className="text-xs">正在等待对端主机 [{contact.name}] 授权同意...</p>
            </div>
          ) : (
            <div className="w-full h-full relative flex flex-col bg-slate-800 text-slate-200">
              {/* Simulated remote desktop top bar */}
              <div className="h-6 bg-slate-950/80 px-3 flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-700">
                <span>{contact.host} · Windows 11 Pro · 1920 × 1080</span>
                <span>帧率: 60 FPS · 压缩率: 无损</span>
              </div>

              {/* Simulated desktop workspace */}
              <div className="flex-1 p-6 grid grid-cols-6 gap-6 relative">
                <div className="flex flex-col items-center gap-1 cursor-pointer">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-300">
                    <Monitor className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] text-slate-300">此电脑</span>
                </div>

                <div className="flex flex-col items-center gap-1 cursor-pointer">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                    <Folder className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] text-slate-300">项目代码</span>
                </div>

                <div className="flex flex-col items-center gap-1 cursor-pointer">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 font-bold">
                    飞
                  </div>
                  <span className="text-[11px] text-slate-300">飞联客户端</span>
                </div>

                {/* Remote prompt banner */}
                <div className="absolute inset-x-8 bottom-8 p-3 rounded-xl bg-slate-900/90 border border-slate-700 backdrop-blur-md flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>已获取被控端控制权，按键盘与鼠标直接操控远程桌面</span>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Power className="w-3 h-3" />
                    <span>断开连接</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
