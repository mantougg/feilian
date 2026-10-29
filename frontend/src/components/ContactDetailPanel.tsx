import React from 'react';
import { MessageCircle, FileUp, MonitorUp, Users, Radio } from 'lucide-react';
import { Contact } from '../types';
import { STATUS_COLORS, STATUS_LABELS } from '../data/mockData';

interface ContactDetailPanelProps {
  contact: Contact;
  onStartChat: (contactId: string) => void;
  onSendFile: () => void;
  onRemoteAssist: () => void;
}

export const ContactDetailPanel: React.FC<ContactDetailPanelProps> = ({
  contact,
  onStartChat,
  onSendFile,
  onRemoteAssist,
}) => {
  return (
    <section
      className="flex-1 min-w-0 overflow-y-auto bg-[var(--bg)] p-6 md:p-8 flex flex-col justify-center items-center select-none"
      aria-label="联系人资料面板"
    >
      <div className="w-full max-w-[520px] flex flex-col gap-4 animate-v1in">
        {/* Header */}
        <div className="flex gap-4 items-center px-1">
          <div
            className="w-16 h-16 rounded-[18px] flex items-center justify-center text-white text-2xl font-semibold flex-none shadow-sm"
            style={{ backgroundColor: contact.color }}
          >
            {contact.isGroup ? (
              <Users className="w-7 h-7" />
            ) : contact.isBroadcast ? (
              <Radio className="w-7 h-7" />
            ) : (
              contact.char
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-medium text-[var(--text)] tracking-tight">
              {contact.name}
            </h2>
            <div className="text-xs text-[var(--mut)] mt-1 flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block flex-none"
                style={{ backgroundColor: STATUS_COLORS[contact.status] || 'var(--mut)' }}
                aria-hidden="true"
              />
              <span>{STATUS_LABELS[contact.status] || '在线'}</span>
              <span>·</span>
              <span>{contact.dept}</span>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[13px] p-1 shadow-2xs divide-y divide-[var(--line)] text-[13px]">
          <div className="flex gap-3.5 px-3 py-2.5">
            <span className="w-16 text-[var(--mut)] flex-none">部门</span>
            <span className="text-[var(--text)] font-normal">{contact.dept || '—'}</span>
          </div>

          <div className="flex gap-3.5 px-3 py-2.5">
            <span className="w-16 text-[var(--mut)] flex-none">IP 地址</span>
            <span className="text-[var(--text)] font-mono tabular-nums">
              {contact.ip || '—'}
            </span>
          </div>

          <div className="flex gap-3.5 px-3 py-2.5">
            <span className="w-16 text-[var(--mut)] flex-none">主机名</span>
            <span className="text-[var(--text)] font-mono">{contact.host || '—'}</span>
          </div>

          <div className="flex gap-3.5 px-3 py-2.5">
            <span className="w-16 text-[var(--mut)] flex-none">个性签名</span>
            <span className="text-[var(--text)] italic opacity-90">
              {contact.sign || '（暂无个性签名）'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2.5 flex-wrap pt-1">
          <button
            type="button"
            onClick={() => onStartChat(contact.id)}
            className="h-9 px-4 rounded-[10px] bg-[var(--acc)] text-white text-[13px] font-medium flex items-center gap-2 hover:brightness-105 active:scale-98 transition-all cursor-pointer shadow-xs"
          >
            <MessageCircle className="w-4 h-4" />
            <span>发消息</span>
          </button>

          <button
            type="button"
            onClick={onSendFile}
            className="h-9 px-3.5 rounded-[10px] border border-[var(--line)] bg-[var(--panel)] text-[var(--text)] text-[13px] font-medium flex items-center gap-2 hover:bg-[var(--panel2)] active:scale-98 transition-all cursor-pointer shadow-2xs"
          >
            <FileUp className="w-4 h-4 text-[var(--mut)]" />
            <span>发文件</span>
          </button>

          <button
            type="button"
            onClick={onRemoteAssist}
            className="h-9 px-3.5 rounded-[10px] border border-[var(--line)] bg-[var(--panel)] text-[var(--text)] text-[13px] font-medium flex items-center gap-2 hover:bg-[var(--panel2)] active:scale-98 transition-all cursor-pointer shadow-2xs"
          >
            <MonitorUp className="w-4 h-4 text-[var(--mut)]" />
            <span>远程协助</span>
          </button>
        </div>

        {/* Helpful hint */}
        <p className="text-[11px] text-[var(--mut)] text-center pt-2">
          双击左侧联系人，可直接进入与 TA 的会话
        </p>
      </div>
    </section>
  );
};
