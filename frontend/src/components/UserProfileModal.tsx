import React, { useState } from 'react';
import { X, Check, UserCheck, Shield } from 'lucide-react';
import { Contact, UserStatus } from '../types';
import { STATUS_COLORS, STATUS_LABELS } from '../data/mockData';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  selfUser: Contact;
  onUpdateSelfUser: (updated: Partial<Contact>) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  selfUser,
  onUpdateSelfUser,
}) => {
  const [name, setName] = useState(selfUser.name);
  const [status, setStatus] = useState<UserStatus>(selfUser.status);
  const [sign, setSign] = useState(selfUser.sign || '');
  const [broadcasted, setBroadcasted] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    onUpdateSelfUser({
      name: name.trim(),
      char: name.trim().slice(0, 1),
      status,
      sign: sign.trim(),
    });
    setBroadcasted(true);
    setTimeout(() => {
      setBroadcasted(false);
      onClose();
    }, 600);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="修改个人资料"
    >
      <div className="w-[420px] max-w-full bg-[var(--panel)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[var(--acc)]" />
            <h3 className="text-sm font-medium text-[var(--text)]">本机用户设置 (周舟)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--mut)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          {/* Avatar and basic info */}
          <div className="flex items-center gap-3 p-3 bg-[var(--panel2)] rounded-xl border border-[var(--line)]">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-xs relative flex-none"
              style={{ backgroundColor: selfUser.color }}
            >
              {name.slice(0, 1) || '周'}
              <i
                className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-[var(--panel)]"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="font-mono text-[11px] text-[var(--mut)]">
                IP: <span className="tabular-nums text-[var(--text)] font-semibold">{selfUser.ip}</span>
              </div>
              <div className="font-mono text-[11px] text-[var(--mut)]">
                主机名: <span className="text-[var(--text)]">{selfUser.host}</span>
              </div>
              <div className="text-[11px] text-[var(--mut)]">
                部门: <span className="text-[var(--text)]">{selfUser.dept}</span>
              </div>
            </div>
          </div>

          {/* Nickname input */}
          <div className="space-y-1">
            <label className="text-[11px] text-[var(--mut)] font-medium">我的昵称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel2)] text-xs text-[var(--text)] outline-none focus:border-[var(--acc)]"
              placeholder="请输入您的昵称"
            />
          </div>

          {/* Status radio selection */}
          <div className="space-y-1">
            <label className="text-[11px] text-[var(--mut)] font-medium">在线状态 (即时广播)</label>
            <div className="grid grid-cols-3 gap-2">
              {(['ok', 'busy', 'off'] as UserStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatus(st)}
                  className={`h-8 rounded-lg border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    status === st
                      ? 'border-[var(--acc)] bg-[var(--accsoft)] text-[var(--acc)] font-medium'
                      : 'border-[var(--line)] bg-[var(--panel2)] text-[var(--text)] hover:bg-[var(--line)]/50'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-none"
                    style={{ backgroundColor: STATUS_COLORS[st] }}
                  />
                  <span>{STATUS_LABELS[st]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Personal signature */}
          <div className="space-y-1">
            <label className="text-[11px] text-[var(--mut)] font-medium">个性签名</label>
            <input
              type="text"
              value={sign}
              onChange={(e) => setSign(e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel2)] text-xs text-[var(--text)] outline-none focus:border-[var(--acc)]"
              placeholder="设置个性签名..."
            />
          </div>

          <div className="p-2.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 rounded-xl flex items-center gap-2 text-[11px] text-blue-700 dark:text-blue-300">
            <Shield className="w-3.5 h-3.5 flex-none" />
            <span>修改后将通过 UDP 2425 自动向局域网广播新状态</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-4 py-3 bg-[var(--panel2)] border-t border-[var(--line)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--text)] text-xs hover:bg-[var(--panel2)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-1.5 rounded-lg bg-[var(--acc)] text-white text-xs font-medium flex items-center gap-1.5 hover:brightness-105 active:scale-98 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{broadcasted ? '已广播更新！' : '保存并广播'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
