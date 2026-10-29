import React from 'react';
import {
  Search,
  Users,
  Radio,
  SlidersHorizontal,
  Folder,
  Keyboard,
  Info,
  X,
} from 'lucide-react';
import {
  ActiveView,
  Contact,
  ConversationMeta,
  SettingsPage,
  ChatMessage,
} from '../types';
import { STATUS_COLORS, STATUS_LABELS } from '../data/mockData';
import { getConversationPreview } from '../utils/chatLogic';

interface MiddleColumnProps {
  activeView: ActiveView;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // Chats
  order: string[];
  activeConvId: string;
  onSelectConv: (convId: string) => void;
  conversations: Record<string, ChatMessage[]>;
  conversationMeta: Record<string, ConversationMeta>;
  contacts: Record<string, Contact>;
  // Contacts view
  selectedContactId: string;
  onSelectContact: (contactId: string) => void;
  onOpenContactChat: (contactId: string) => void;
  // Settings view
  activeSettingsPage: SettingsPage;
  onSelectSettingsPage: (page: SettingsPage) => void;
  selfUser: Contact;
}

export const MiddleColumn: React.FC<MiddleColumnProps> = ({
  activeView,
  searchQuery,
  onSearchChange,
  order,
  activeConvId,
  onSelectConv,
  conversations,
  conversationMeta,
  contacts,
  selectedContactId,
  onSelectContact,
  onOpenContactChat,
  activeSettingsPage,
  onSelectSettingsPage,
  selfUser,
}) => {
  // Render status badge dot
  const renderStatusDot = (status: string) => {
    if (status === 'off' || status === 'grp' || status === 'bc') return null;
    return (
      <i
        className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--panel)]"
        style={{ backgroundColor: STATUS_COLORS[status] || 'var(--ok)' }}
        aria-hidden="true"
      />
    );
  };

  // Render small inline dot
  const renderInlineDot = (status: string) => {
    return (
      <span
        className="w-1.5 h-1.5 rounded-full inline-block flex-none"
        style={{ backgroundColor: STATUS_COLORS[status] || 'var(--mut)' }}
        aria-hidden="true"
      />
    );
  };

  return (
    <aside
      className="w-[258px] max-[920px]:w-[220px] max-[660px]:hidden flex-none bg-[var(--panel)] border-r border-[var(--line)] flex flex-col min-h-0 select-none"
      aria-label="会话与联系人列表"
    >
      {/* Search Bar */}
      <div className="mx-2.5 mt-2.5 mb-1.5 h-8 rounded-lg bg-[var(--panel2)] flex items-center gap-1.5 px-2.5 text-[var(--mut)] text-xs flex-none border border-transparent focus-within:border-[var(--acc)] transition-colors">
        <Search className="w-3.5 h-3.5 flex-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索"
          className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--text)] placeholder:text-[var(--mut)]"
          aria-label="搜索联系人或会话"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="text-[var(--mut)] hover:text-[var(--text)] p-0.5 rounded cursor-pointer"
            aria-label="清除搜索"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* CHATS VIEW */}
      {activeView === 'chats' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="text-[11px] text-[var(--mut)] px-3.5 py-2 font-medium flex-none">
            最近会话
          </div>
          <div className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-0.5">
            {order
              .filter((convId) => {
                if (!searchQuery.trim()) return true;
                const c = contacts[convId];
                if (!c) return false;
                const q = searchQuery.toLowerCase();
                const preview = getConversationPreview(
                  conversations[convId] || [],
                  contacts,
                  convId
                ).toLowerCase();
                return (
                  c.name.toLowerCase().includes(q) ||
                  c.dept.toLowerCase().includes(q) ||
                  c.ip.toLowerCase().includes(q) ||
                  preview.includes(q)
                );
              })
              .map((convId) => {
                const c = contacts[convId];
                if (!c) return null;
                const meta = conversationMeta[convId] || { time: '', unread: 0 };
                const isSelected = activeConvId === convId;
                const preview = getConversationPreview(
                  conversations[convId] || [],
                  contacts,
                  convId
                );

                return (
                  <button
                    key={convId}
                    type="button"
                    onClick={() => onSelectConv(convId)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left relative transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accsoft)] text-[var(--text)]'
                        : 'hover:bg-[var(--panel2)] text-[var(--text)]'
                    }`}
                    aria-label={`${c.name}，${meta.unread ? `${meta.unread}条未读，` : ''}${preview}`}
                  >
                    {/* Avatar */}
                    <div
                      className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-white text-sm font-semibold relative flex-none shadow-2xs"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.isGroup ? (
                        <Users className="w-4 h-4" />
                      ) : c.isBroadcast ? (
                        <Radio className="w-4 h-4" />
                      ) : (
                        c.char
                      )}
                      {renderStatusDot(c.status)}
                    </div>

                    {/* Main Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[13px] font-medium truncate text-[var(--text)]">
                          {c.name}
                        </span>
                        <span className="text-[10px] text-[var(--mut)] flex-none">
                          {meta.time}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--mut)] truncate mt-0.5">
                        {preview || '暂无消息'}
                      </div>
                    </div>

                    {/* Unread badge */}
                    {meta.unread > 0 && (
                      <span
                        className="absolute right-2 bottom-2 min-w-[17px] h-[17px] px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-bold flex items-center justify-center leading-none"
                        aria-hidden="true"
                      >
                        {meta.unread}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* CONTACTS VIEW */}
      {activeView === 'contacts' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-1.5 pt-1 pb-2 space-y-0.5">
            {/* Section: Groups & Broadcast */}
            <div className="text-[11px] text-[var(--mut)] px-2.5 pt-2 pb-1 font-medium">
              群聊与广播
            </div>
            {['group', 'bc'].map((id) => {
              const c = contacts[id];
              if (!c) return null;
              if (
                searchQuery &&
                !c.name.includes(searchQuery) &&
                !c.dept.includes(searchQuery) &&
                !c.ip.includes(searchQuery)
              ) {
                return null;
              }
              const isSelected = selectedContactId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectContact(id)}
                  onDoubleClick={() => onOpenContactChat(id)}
                  className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-[var(--accsoft)]' : 'hover:bg-[var(--panel2)]'
                  }`}
                  aria-label={`${c.name} 资料`}
                >
                  <div
                    className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-white flex-none"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.isGroup ? <Users className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-normal truncate text-[var(--text)]">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-[var(--mut)] truncate flex items-center gap-1 mt-0.5">
                      {c.isGroup ? '12 人 · 局域网群聊' : '192.168.1.255 · 全员'}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Section: R&D Dept */}
            <div className="text-[11px] text-[var(--mut)] px-2.5 pt-3 pb-1 font-medium">
              研发中心 · 3
            </div>
            {['zhang', 'wang'].map((id) => {
              const c = contacts[id];
              if (!c) return null;
              if (
                searchQuery &&
                !c.name.includes(searchQuery) &&
                !c.dept.includes(searchQuery) &&
                !c.ip.includes(searchQuery)
              ) {
                return null;
              }
              const isSelected = selectedContactId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectContact(id)}
                  onDoubleClick={() => onOpenContactChat(id)}
                  className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-[var(--accsoft)]' : 'hover:bg-[var(--panel2)]'
                  }`}
                  aria-label={`${c.name} 资料`}
                >
                  <div
                    className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-white text-xs font-semibold relative flex-none"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.char}
                    {renderStatusDot(c.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-normal truncate text-[var(--text)]">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-[var(--mut)] truncate flex items-center gap-1 mt-0.5">
                      {renderInlineDot(c.status)}
                      <span className="tabular-nums">{c.ip}</span>
                      <span>·</span>
                      <span>{STATUS_LABELS[c.status]}</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Self entry in R&D */}
            {(!searchQuery ||
              selfUser.name.includes(searchQuery) ||
              selfUser.ip.includes(searchQuery)) && (
              <div
                className="w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left opacity-90 cursor-default"
                aria-label="周舟（我）"
              >
                <div
                  className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-white text-xs font-semibold relative flex-none"
                  style={{ backgroundColor: selfUser.color }}
                >
                  {selfUser.char}
                  {renderStatusDot(selfUser.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-normal truncate text-[var(--text)]">
                    {selfUser.name}（我）
                  </div>
                  <div className="text-[11px] text-[var(--mut)] truncate flex items-center gap-1 mt-0.5">
                    {renderInlineDot(selfUser.status)}
                    <span className="tabular-nums">{selfUser.ip}</span>
                    <span>·</span>
                    <span>本机</span>
                  </div>
                </div>
              </div>
            )}

            {/* Section: Product Dept */}
            <div className="text-[11px] text-[var(--mut)] px-2.5 pt-3 pb-1 font-medium">
              产品部 · 2
            </div>
            {['li', 'chen'].map((id) => {
              const c = contacts[id];
              if (!c) return null;
              if (
                searchQuery &&
                !c.name.includes(searchQuery) &&
                !c.dept.includes(searchQuery) &&
                !c.ip.includes(searchQuery)
              ) {
                return null;
              }
              const isSelected = selectedContactId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectContact(id)}
                  onDoubleClick={() => onOpenContactChat(id)}
                  className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-[var(--accsoft)]' : 'hover:bg-[var(--panel2)]'
                  }`}
                  aria-label={`${c.name} 资料`}
                >
                  <div
                    className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-white text-xs font-semibold relative flex-none"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.char}
                    {renderStatusDot(c.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-normal truncate text-[var(--text)]">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-[var(--mut)] truncate flex items-center gap-1 mt-0.5">
                      {renderInlineDot(c.status)}
                      <span className="tabular-nums">{c.ip}</span>
                      <span>·</span>
                      <span>{STATUS_LABELS[c.status]}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-[var(--mut)] text-center py-2 px-2.5 border-t border-[var(--line)] flex-none">
            单击查看资料 · 双击直接进入会话
          </div>
        </div>
      )}

      {/* SETTINGS VIEW */}
      {activeView === 'settings' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* User Profile Summary */}
          <div className="m-3 p-3 rounded-xl bg-[var(--panel2)] flex items-center gap-2.5 flex-none border border-[var(--line)]">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-semibold relative flex-none"
              style={{ backgroundColor: selfUser.color }}
            >
              {selfUser.char}
              {renderStatusDot(selfUser.status)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--text)] truncate">
                {selfUser.name}
              </div>
              <div className="text-[11px] text-[var(--mut)] truncate mt-0.5 tabular-nums">
                {selfUser.host} · {selfUser.ip}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-[var(--mut)] px-3.5 pb-1 font-medium flex-none">
            设置
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            <button
              type="button"
              onClick={() => onSelectSettingsPage('general')}
              className={`w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                activeSettingsPage === 'general'
                  ? 'bg-[var(--accsoft)] text-[var(--acc)] font-medium'
                  : 'hover:bg-[var(--panel2)] text-[var(--text)]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 flex-none" />
              <span className="text-[13px]">通用</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectSettingsPage('file')}
              className={`w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                activeSettingsPage === 'file'
                  ? 'bg-[var(--accsoft)] text-[var(--acc)] font-medium'
                  : 'hover:bg-[var(--panel2)] text-[var(--text)]'
              }`}
            >
              <Folder className="w-4 h-4 flex-none" />
              <span className="text-[13px]">文件与传输</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectSettingsPage('keys')}
              className={`w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                activeSettingsPage === 'keys'
                  ? 'bg-[var(--accsoft)] text-[var(--acc)] font-medium'
                  : 'hover:bg-[var(--panel2)] text-[var(--text)]'
              }`}
            >
              <Keyboard className="w-4 h-4 flex-none" />
              <span className="text-[13px]">快捷键</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectSettingsPage('about')}
              className={`w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                activeSettingsPage === 'about'
                  ? 'bg-[var(--accsoft)] text-[var(--acc)] font-medium'
                  : 'hover:bg-[var(--panel2)] text-[var(--text)]'
              }`}
            >
              <Info className="w-4 h-4 flex-none" />
              <span className="text-[13px]">关于</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
