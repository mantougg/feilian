import React, { useState, useEffect, useRef } from 'react';
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
import { getConversationPreview, groupContactsByDept } from '../utils/chatLogic';
import { getEngineStats, getUnparsedSamples, probePeers, EngineStats } from '../lib/wailsBridge';

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
  // 引擎自诊断轮询（10s）：空态展示监听端口与收发包数，
  // 用户无需工具即可判断「收不到任何包」还是「收到但无对端」
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const pullStatsRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const s = await getEngineStats();
      if (!alive) return;
      setStats(s);
      if (s.rxUnparsed > 0) setSamples(await getUnparsedSamples());
    };
    pullStatsRef.current = pull;
    pull();
    const timer = window.setInterval(pull, 10000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  // 复制诊断信息（统计 + 样例）：Wails webview 可能禁用 async clipboard，
  // 先试标准 API，失败退回 execCommand 兜底
  const handleCopyDiag = () => {
    const lines = [
      `引擎 UDP:${stats?.listenPort ?? '-'} 收:${stats?.rxPackets ?? '-'} 发:${stats?.txPackets ?? '-'} 未解析:${stats?.rxUnparsed ?? '-'}`,
      ...samples,
    ];
    const text = lines.join('\n');
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    navigator.clipboard
      ?.writeText(text)
      .then(done)
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
      });
  };

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
            {/* Section: Broadcast */}
            <div className="text-[11px] text-[var(--mut)] px-2.5 pt-2 pb-1 font-medium">
              群聊与广播
            </div>
            {['bc'].map((id) => {
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
                    <Radio className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-normal truncate text-[var(--text)]">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-[var(--mut)] truncate flex items-center gap-1 mt-0.5">
                      {c.ip} · 全员
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Sections: peers grouped by dept（引擎数据驱动） */}
            {groupContactsByDept(contacts).map(({ dept, members }) => (
              <div key={dept}>
                <div className="text-[11px] text-[var(--mut)] px-2.5 pt-3 pb-1 font-medium">
                  {dept} · {members.length}
                </div>
                {members.map((c) => {
                  if (
                    searchQuery &&
                    !c.name.includes(searchQuery) &&
                    !c.dept.includes(searchQuery) &&
                    !c.ip.includes(searchQuery) &&
                    !c.host.toLowerCase().includes(searchQuery.toLowerCase())
                  ) {
                    return null;
                  }
                  const isSelected = selectedContactId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelectContact(c.id)}
                      onDoubleClick={() => onOpenContactChat(c.id)}
                      className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left transition-colors cursor-pointer ${
                        isSelected ? 'bg-[var(--accsoft)]' : 'hover:bg-[var(--panel2)]'
                      }`}
                      aria-label={`${c.name} 资料`}
                    >
                      <div
                        className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-white text-xs font-semibold relative flex-none"
                        style={{ backgroundColor: c.color }}
                      >
                        {c.isSelf ? c.char : c.char}
                        {renderStatusDot(c.isSelf ? selfUser.status : c.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-normal truncate text-[var(--text)]">
                          {c.name}
                          {c.isSelf ? '（我）' : ''}
                        </div>
                        <div className="text-[11px] text-[var(--mut)] truncate flex items-center gap-1 mt-0.5">
                          {renderInlineDot(c.isSelf ? selfUser.status : c.status)}
                          <span className="tabular-nums">{c.ip}</span>
                          <span>·</span>
                          <span>{c.isSelf ? '本机' : STATUS_LABELS[c.isSelf ? selfUser.status : c.status]}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}

            {/* Empty state：局域网暂无其他在线用户 */}
            {groupContactsByDept(contacts).every(({ members }) => members.every((m) => m.isSelf)) && (
              <div className="mx-2.5 mt-4 p-4 rounded-xl bg-[var(--panel2)] text-center">
                <Users className="w-6 h-6 mx-auto mb-2 text-[var(--mut)] opacity-60" />
                <p className="text-xs text-[var(--mut)] leading-relaxed">
                  正在探测局域网在线同事…
                  <br />
                  本机 IP：<span className="tabular-nums">{selfUser.ip || '获取中'}</span>
                </p>
                {stats && stats.started ? (
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--mut)] tabular-nums">
                    引擎 UDP:{stats.listenPort}
                    {stats.listenPort !== 2425 && '（标准端口被占已避让）'}
                    <br />
                    已收 {stats.rxPackets} 包 / 已发 {stats.txPackets} 包
                    {stats.rxUnparsed > 0 && (
                      <>
                        <br />
                        其中 <span className="text-[var(--acc)] font-medium">{stats.rxUnparsed}</span> 包无法解析
                      </>
                    )}
                  </p>
                ) : (
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--danger)]">
                    网络引擎未启动（UDP 2425 附近端口均被占用）
                  </p>
                )}
                {stats && stats.started && stats.rxPackets === 0 && (
                  <p className="mt-2 text-[10px] leading-relaxed opacity-80 text-[var(--mut)]">
                    长时间 0 收包：请放行防火墙入站 UDP 2425
                  </p>
                )}

                {/* 诊断样例：内联展示最近无法解析的报文（来源 + hex），
                    供截图/复制远程排查格式兼容问题 */}
                {samples.length > 0 && (
                  <div className="mt-2.5 p-2 rounded-lg bg-[var(--panel)] border border-[var(--line)] text-left">
                    {samples.slice(0, 3).map((s, i) => (
                      <p key={i} className="text-[9px] leading-relaxed text-[var(--mut)] font-mono break-all">
                        {s}
                      </p>
                    ))}
                    {samples.length > 3 && (
                      <p className="text-[9px] text-[var(--mut)] opacity-70">…等 {samples.length} 条</p>
                    )}
                  </div>
                )}

                <div className="mt-2.5 flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      probePeers();
                      window.setTimeout(() => pullStatsRef.current?.(), 600);
                    }}
                    className="px-3 py-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[10px] text-[var(--text)] hover:bg-[var(--accsoft)] hover:border-[var(--acc)] cursor-pointer"
                  >
                    重新探测
                  </button>
                  {samples.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCopyDiag}
                      className="px-3 py-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[10px] text-[var(--text)] hover:bg-[var(--accsoft)] hover:border-[var(--acc)] cursor-pointer"
                    >
                      {copied ? '已复制' : '复制诊断'}
                    </button>
                  )}
                </div>
              </div>
            )}
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
