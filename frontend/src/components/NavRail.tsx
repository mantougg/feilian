import React from 'react';
import { MessageCircle, Users, Settings } from 'lucide-react';
import { ActiveView, Contact } from '../types';

interface NavRailProps {
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  totalUnread: number;
  selfUser: Contact;
  onOpenSelfProfile?: () => void;
}

export const NavRail: React.FC<NavRailProps> = ({
  activeView,
  onChangeView,
  totalUnread,
  selfUser,
  onOpenSelfProfile,
}) => {
  return (
    <nav
      className="w-16 flex-none bg-[var(--panel)] border-r border-[var(--line)] flex flex-col items-center py-3 gap-1.5 select-none z-10"
      aria-label="主导航"
    >
      {/* App Logo */}
      <div
        className="w-[30px] h-[30px] rounded-[9px] bg-[var(--acc)] text-white text-[13px] font-bold flex items-center justify-center mb-1.5 shadow-sm"
        aria-hidden="true"
      >
        飞
      </div>

      {/* 消息 */}
      <button
        type="button"
        onClick={() => onChangeView('chats')}
        aria-label={`消息${totalUnread > 0 ? `，${totalUnread}条未读` : ''}`}
        className={`relative w-[54px] py-1.5 px-0 rounded-xl flex flex-col items-center gap-0.5 transition-colors cursor-pointer ${
          activeView === 'chats'
            ? 'text-[var(--acc)] bg-[var(--accsoft)] font-medium'
            : 'text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)]'
        }`}
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-[10px] leading-tight">消息</span>
        {totalUnread > 0 && (
          <span
            className="absolute top-0.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--danger)] text-white text-[9px] font-bold flex items-center justify-center leading-none"
            aria-hidden="true"
          >
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* 联系人 */}
      <button
        type="button"
        onClick={() => onChangeView('contacts')}
        aria-label="联系人"
        className={`relative w-[54px] py-1.5 px-0 rounded-xl flex flex-col items-center gap-0.5 transition-colors cursor-pointer ${
          activeView === 'contacts'
            ? 'text-[var(--acc)] bg-[var(--accsoft)] font-medium'
            : 'text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)]'
        }`}
      >
        <Users className="w-5 h-5" />
        <span className="text-[10px] leading-tight">联系人</span>
      </button>

      <div className="flex-1" />

      {/* 设置 */}
      <button
        type="button"
        onClick={() => onChangeView('settings')}
        aria-label="设置"
        className={`relative w-[54px] py-1.5 px-0 rounded-xl flex flex-col items-center gap-0.5 transition-colors cursor-pointer mb-2 ${
          activeView === 'settings'
            ? 'text-[var(--acc)] bg-[var(--accsoft)] font-medium'
            : 'text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)]'
        }`}
      >
        <Settings className="w-5 h-5" />
        <span className="text-[10px] leading-tight">设置</span>
      </button>

      {/* 我的头像 */}
      <button
        type="button"
        onClick={onOpenSelfProfile}
        aria-label={`我的资料：${selfUser.name}`}
        title={`我的资料：${selfUser.name} (${selfUser.ip})`}
        className="relative w-10 h-10 rounded-xl bg-[#8b5cf6] text-white text-sm font-semibold flex items-center justify-center cursor-pointer shadow-xs hover:opacity-95 transition-opacity"
      >
        {selfUser.char}
        <i
          className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--panel)] bg-[var(--ok)]"
          aria-hidden="true"
        />
      </button>
    </nav>
  );
};
