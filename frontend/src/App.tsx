/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MessageSquare, CircleAlert, Info, X } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { NavRail } from './components/NavRail';
import { MiddleColumn } from './components/MiddleColumn';
import { ChatPanel } from './components/ChatPanel';
import { ContactDetailPanel } from './components/ContactDetailPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ScreenshotModal } from './components/ScreenshotModal';
import { RemoteAssistModal } from './components/RemoteAssistModal';
import { UserProfileModal } from './components/UserProfileModal';

import {
  ActiveView,
  SettingsPage,
  Contact,
  ChatMessage,
  ConversationMeta,
  AppSettings,
} from './types';

import {
  INITIAL_SETTINGS,
  INITIAL_SELF,
  BROADCAST_CONTACT,
} from './data/mockData';

import {
  bumpConversationOrder,
  calculateTotalUnread,
  formatCurrentTime,
  peerToContact,
  peerStatusToUi,
  uiStatusToPeer,
  applyIncomingMessage,
} from './utils/chatLogic';
import {
  isDesktop,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  getPeers,
  getSelf,
  sendText,
  sendTyping,
  broadcastText,
  setSelf as setSelfProfile,
  sendFiles,
  pickFiles,
  pickFolder,
  acceptFiles,
  getRecvDir,
  captureScreen,
  saveScreenshot,
  onEngineEvent,
  setLimitRate,
  type EngineEvent,
  type FileEntryWire,
} from './lib/wailsBridge';
import { useEngineEvents } from './hooks/useEngineEvents';

export default function App() {
  // Application view state
  const [activeView, setActiveView] = useState<ActiveView>('chats');
  const [activeSettingsPage, setActiveSettingsPage] = useState<SettingsPage>('general');
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [selectedContactId, setSelectedContactId] = useState<string>('bc');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data states（M2：mock 退场，self 占位由 GetSelf 覆盖，联系人由引擎事件构建）
  const [selfUser, setSelfUser] = useState<Contact>(INITIAL_SELF);
  const [contacts, setContacts] = useState<Record<string, Contact>>({
    self: INITIAL_SELF,
    bc: BROADCAST_CONTACT,
  });
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>({});
  const [conversationMeta, setConversationMeta] = useState<Record<string, ConversationMeta>>({});
  const [order, setOrder] = useState<string[]>(['bc']);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [recvDir, setRecvDirState] = useState<string>('');

  // Modals state
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [shotUrl, setShotUrl] = useState<string>('');
  const [isRemoteAssistOpen, setIsRemoteAssistOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'chat'>('chat');
  const [engineError, setEngineError] = useState<string>('');

  // 挂载时拉取本机资料与当前在线用户快照（后续增量靠引擎事件，见 useEngineEvents）
  useEffect(() => {
    (async () => {
      const s = await getSelf();
      setSelfUser((prev) => ({
        ...prev,
        name: s.nick,
        char: s.nick.slice(0, 1) || '我',
        host: s.hostname,
        ip: s.ip,
        dept: s.dept || '未分组',
        status: peerStatusToUi(s.status),
      }));
      // 联系人列表里的「我」条目同步真实资料（否则残留 127.0.0.1 占位，
      // 给自己发消息会打到回环地址——真机排查 T-M2 冒烟时发现）
      setContacts((prev) => ({
        ...prev,
        self: { ...prev.self, name: s.nick, char: s.nick.slice(0, 1) || '我', host: s.hostname, ip: s.ip, dept: s.dept || '未分组' },
      }));
      setRecvDirState(await getRecvDir());
      const peers = await getPeers();
      if (peers.length > 0) {
        setContacts((prev) => {
          const next = { ...prev };
          for (const p of peers) next[p.nick + '@' + p.host] = peerToContact(p);
          return next;
        });
      }
    })();
  }, []);

  // ---- 引擎事件处理（T-M2-2/T-M2-3）----

  // peer 上线/资料变更：upsert 联系人（保留旧字段，如签名等 UI 侧数据）；
  // 同 IP 的飞秋占位条目（登录名@IP）在真昵称入库后顺手清理
  const handlePeerPresence = (ev: EngineEvent) => {
    const c = peerToContact(ev.peer);
    setContacts((prev) => {
      const next = { ...prev };
      for (const [id, old] of Object.entries(next)) {
        if (id !== c.id && old.ip === c.ip && !old.isSelf && !old.isBroadcast) {
          delete next[id];
        }
      }
      next[c.id] = { ...(next[c.id] || {}), ...c };
      return next;
    });
  };

  // peer 下线：仅标记离线（保留在列表，飞秋语义：离线用户仍可见）
  const handlePeerOffline = (ev: EngineEvent) => {
    const id = `${ev.peer.nick}@${ev.peer.host}`;
    setContacts((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], status: 'off' } } : prev));
  };

  // 收到文本消息：单聊按发送者建会话，广播统一路由到 bc 会话（T-M2-7 按来源人显示）；
  // 补全联系人 → 追加气泡 → 置顶/未读/预览（applyIncomingMessage 纯函数）
  const handleIncomingMessage = (ev: EngineEvent) => {
    const c = peerToContact(ev.peer);
    const convId = ev.broadcast ? 'bc' : `${ev.peer.nick}@${ev.peer.host}`;
    if (!ev.broadcast) {
      setContacts((prev) => ({ ...prev, [convId]: { ...(prev[convId] || c), ...c } }));
    }

    const time = ev.time ? formatCurrentTime(new Date(ev.time)) : formatCurrentTime();
    const next = applyIncomingMessage(
      { conversations, meta: conversationMeta, order },
      convId,
      { id: ev.msgId || `r_${Date.now()}`, t: 'them', who: convId, name: `${c.name} · ${time}`, text: ev.text, time },
      activeConvId
    );
    setConversations(next.conversations);
    setConversationMeta(next.meta);
    setOrder(next.order);
  };

  // 对端正在输入：显示 typing 指示，5 秒无后续自动消退
  const handleTyping = (ev: EngineEvent) => {
    const convId = `${ev.peer.nick}@${ev.peer.host}`;
    setConversations((prev) => {
      const list = (prev[convId] || []).filter((m) => m.t !== 'typing');
      return { ...prev, [convId]: [...list, { id: `typing_${convId}`, t: 'typing', who: convId }] };
    });
    setTimeout(() => {
      setConversations((prev) => {
        if (!(prev[convId] || []).some((m) => m.id === `typing_${convId}`)) return prev;
        return { ...prev, [convId]: prev[convId].filter((m) => m.id !== `typing_${convId}`) };
      });
    }, 5000);
  };

  // 对端回执：按报文序号命中我方消息，标记已送达
  const handleReceipt = (ev: EngineEvent) => {
    if (!ev.msgId) return;
    setConversations((prev) => {
      for (const [cid, list] of Object.entries(prev)) {
        const idx = list.findIndex((m) => m.id === ev.msgId);
        if (idx >= 0) {
          const nl = [...list];
          nl[idx] = { ...nl[idx], delivered: true };
          return { ...prev, [cid]: nl };
        }
      }
      return prev;
    });
  };

  // 收到文件请求：请求方会话插入传输卡片，随即自动接受（落盘到接收目录，重名自动改名）
  const handleFileRequest = (ev: EngineEvent) => {
    if (!ev.files?.length) return;
    const convId = `${ev.peer.nick}@${ev.peer.host}`;
    const c = peerToContact(ev.peer);
    setContacts((prev) => ({ ...prev, [convId]: { ...(prev[convId] || c), ...c } }));

    const time = ev.time ? formatCurrentTime(new Date(ev.time)) : formatCurrentTime();
    const totalSize = ev.files.reduce((sum: number, fe: FileEntryWire) => sum + (fe.size || 0), 0);
    const sizeStr = totalSize > 1024 * 1024 ? `${(totalSize / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(totalSize / 1024)} KB`;
    const dirEntry = ev.files.find((fe) => fe.attr === 19); // 0x13 目录
    const name = dirEntry?.name || ev.files[0]?.name || '文件';

    const s2 = applyIncomingMessage(
      { conversations, meta: conversationMeta, order },
      convId,
      { id: `req_${ev.msgId}`, t: 'file', from: 'them', who: convId, name: `${c.name} · ${time}`, fileName: name, fileSize: sizeStr, time },
      activeConvId
    );
    setConversations(s2.conversations);
    setConversationMeta(s2.meta);
    setOrder(s2.order);

    acceptFiles(ev.msgId).catch(() => undefined);
  };

  // 传输进度：按 reqId 命中卡片刷新百分比（引擎 500ms 节流）
  const handleFileProgress = (ev: EngineEvent) => {
    const cardId = `req_${ev.msgId}`;
    setConversations((prev) => {
      for (const [cid, list] of Object.entries(prev)) {
        const idx = list.findIndex((m) => m.id === cardId);
        if (idx >= 0) {
          const nl = [...list];
          nl[idx] = { ...nl[idx], filePct: ev.progress, fileDone: false };
          return { ...prev, [cid]: nl };
        }
      }
      return prev;
    });
  };

  // 传输完成：卡片置已完成，imgCap 暂存落盘路径
  const handleFileDone = (ev: EngineEvent) => {
    const cardId = `req_${ev.msgId}`;
    setConversations((prev) => {
      for (const [cid, list] of Object.entries(prev)) {
        const idx = list.findIndex((m) => m.id === cardId);
        if (idx >= 0) {
          const nl = [...list];
          nl[idx] = { ...nl[idx], fileDone: true, imgCap: ev.text };
          return { ...prev, [cid]: nl };
        }
      }
      return prev;
    });
  };

  // 全局热键触发的截图（Go 侧 Ctrl+Alt+A → ui:screenshot 事件）
  useEffect(() => {
    const openShot = () => {
      captureScreen().then(setShotUrl).catch(() => setShotUrl(''));
      setIsScreenshotOpen(true);
    };
    window.addEventListener('ui:screenshot', openShot);
    const off = onEngineEvent('ui:screenshot', openShot);
    return () => {
      window.removeEventListener('ui:screenshot', openShot);
      off();
    };
  }, []);

  // 引擎错误（启动失败/传输失败）：顶部横幅提示
  const handleEngineError = (ev: EngineEvent) => {
    if (ev.text) setEngineError(ev.text);
  };

  // 引擎提示（如端口被占自动避让）：蓝色横幅，20 秒自动消失
  const [engineNotice, setEngineNotice] = useState<string>('');
  const handleEngineNotice = (ev: EngineEvent) => {
    if (!ev.text) return;
    setEngineNotice(ev.text);
    window.setTimeout(() => setEngineNotice(''), 20000);
  };

  useEngineEvents({
    error: handleEngineError,
    notice: handleEngineNotice,
    peer_online: handlePeerPresence,
    peer_update: handlePeerPresence,
    peer_offline: handlePeerOffline,
    message: handleIncomingMessage,
    typing: handleTyping,
    receipt: handleReceipt,
    file_request: handleFileRequest,
    file_progress: handleFileProgress,
    file_done: handleFileDone,
  });

  // Apply dark mode to document element
  useEffect(() => {
    const isDark = settings.darkMode;
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.dataset.theme = 'dark';
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.dataset.theme = 'light';
      root.style.colorScheme = 'light';
    }
  }, [settings.darkMode]);

  // Global shortcut listeners (e.g., Ctrl+Alt+A for screenshot, Ctrl+F for search)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Alt+A: Screenshot
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setIsScreenshotOpen(true);
      }
      // Ctrl+F: Focus search
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder="搜索"]') as HTMLInputElement;
        searchInput?.focus();
      }
      // Escape closes open modals
      if (e.key === 'Escape') {
        setIsScreenshotOpen(false);
        setIsRemoteAssistOpen(false);
        setIsProfileModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Calculate unread count
  const totalUnread = calculateTotalUnread(conversationMeta);

  // Toggle dark/light theme
  const handleToggleTheme = () => {
    setSettings((prev) => ({
      ...prev,
      darkMode: !prev.darkMode,
    }));
  };

  // Open conversation and mark as read
  const handleSelectConv = (convId: string) => {
    setActiveConvId(convId);
    setMobilePane('chat');
    if (conversationMeta[convId] && conversationMeta[convId].unread > 0) {
      setConversationMeta((prev) => ({
        ...prev,
        [convId]: {
          ...prev[convId],
          unread: 0,
        },
      }));
    }
  };

  // Open conversation from contact list or profile（自己不与自己开会话）
  const handleOpenContactChat = (contactId: string) => {
    if (contactId === 'self') return;
    setActiveView('chats');
    handleSelectConv(contactId);
    setMobilePane('chat');
  };

  // Send message（T-M2-4 发送链路）：本地先出气泡，引擎返回 msgID 回填，
  // receipt 事件命中后标「已送达」；发送失败（离线/引擎未启动）行内标红。
  const handleSendMessage = async (text: string) => {
    const targetId = activeConvId;
    if (!targetId) return;
    const currentTime = formatCurrentTime();
    const newMsgId = `m_${Date.now()}`;

    // Append my message and remove typing indicator if present
    setConversations((prev) => {
      const currentList = (prev[targetId] || []).filter((m) => m.t !== 'typing');
      return {
        ...prev,
        [targetId]: [
          ...currentList,
          {
            id: newMsgId,
            t: 'me',
            text,
            time: currentTime,
          },
        ],
      };
    });

    // Bump conversation to top
    setOrder((prev) => bumpConversationOrder(prev, targetId));
    setConversationMeta((prev) => ({
      ...prev,
      [targetId]: {
        time: currentTime,
        unread: 0,
      },
    }));

    // 广播会话走 BroadcastText（无回执）；单聊走 SendText（要求回执）
    const contact = contacts[targetId];
    if (contact?.isBroadcast) {
      try {
        await broadcastText(text);
      } catch {
        markMessage(newMsgId, '发送失败：引擎未启动');
      }
      return;
    }
    try {
      const msgId = await sendText(contact?.ip || targetId, text);
      // msgID 即回执关联凭据；浏览器形态返回空串则无回执
      if (msgId) {
        rekeyMessage(newMsgId, msgId);
      }
    } catch (err) {
      markMessage(newMsgId, `发送失败：${err instanceof Error ? err.message : '对方可能已离线'}`);
    }
  };

  /** 把消息 id 换成报文 PacketNo（receipt 事件按它匹配）。 */
  const rekeyMessage = (oldId: string, msgId: string) => {
    setConversations((prev) => {
      for (const [cid, list] of Object.entries(prev)) {
        const idx = list.findIndex((m) => m.id === oldId);
        if (idx >= 0) {
          const nl = [...list];
          nl[idx] = { ...nl[idx], id: msgId };
          return { ...prev, [cid]: nl };
        }
      }
      return prev;
    });
  };

  /** 标记某条我方消息发送失败（行内提示）。 */
  const markMessage = (msgId: string, reason: string) => {
    setConversations((prev) => {
      for (const [cid, list] of Object.entries(prev)) {
        const idx = list.findIndex((m) => m.id === msgId);
        if (idx >= 0) {
          const nl = [...list];
          nl[idx] = { ...nl[idx], delivered: false, name: reason };
          return { ...prev, [cid]: nl };
        }
      }
      return prev;
    });
  };

  // 发送文件/文件夹（T-M3-5）：Wails 选盘 → 引擎 SendFiles → 本地出卡片
  const handlePickAndSendFiles = async (kind: 'file' | 'folder') => {
    if (!activeConvId) return;
    const paths = kind === 'file' ? await pickFiles() : [await pickFolder()].filter(Boolean);
    if (!paths.length) return;
    const targetId = activeConvId;
    const contact = contacts[targetId];
    if (contact?.isBroadcast) return; // 广播通道不发文件

    const msgId = await sendFiles(contact?.ip || targetId, '', paths).catch(() => '');
    const first = paths[0];
    const name = first.split(/[\/]/).pop() || first;
    const currentTime = formatCurrentTime();
    setConversations((prev) => ({
      ...prev,
      [targetId]: [...(prev[targetId] || []), {
        id: msgId ? `sent_${msgId}` : `f_${Date.now()}`,
        t: 'file',
        from: 'me',
        fileName: name + (paths.length > 1 ? ` 等 ${paths.length} 项` : ''),
        fileDone: true,
        time: currentTime,
      } as ChatMessage],
    }));
    setOrder((prev) => bumpConversationOrder(prev, targetId));
  };

  // 发送截图（T-M4-1）：PNG 落盘（接收目录/screenshots）→ 文件通道发给对方 → 本地出图片卡片
  const handleSendImage = async (pngData: string) => {
    if (!pngData || !activeConvId) return;
    const targetId = activeConvId;
    const currentTime = formatCurrentTime();

    setConversations((prev) => ({
      ...prev,
      [targetId]: [
        ...(prev[targetId] || []),
        { id: `img_${Date.now()}`, t: 'img', from: 'me', imgCap: '屏幕截图', time: currentTime } as ChatMessage,
      ],
    }));
    setOrder((prev) => bumpConversationOrder(prev, targetId));

    const contact = contacts[targetId];
    if (contact?.isBroadcast) return;
    try {
      const p = await saveScreenshot(pngData);
      await sendFiles(contact?.ip || targetId, '屏幕截图', [p]);
    } catch {
      // 落盘/发送失败：卡片保留，用户可重试
    }
  };

  // Clear current conversation history
  const handleClearHistory = () => {
    setConversations((prev) => ({
      ...prev,
      [activeConvId]: [
        {
          id: `chip_${Date.now()}`,
          t: 'chip',
          text: `聊天记录已于 ${formatCurrentTime()} 清空`,
        },
      ],
    }));
  };

  // Update self profile（T-M2-6）：本地即时生效 + SetSelf 全网广播
  // （引擎侧语义：昵称/部门变更重广播 Entry，状态变更广播 Absence）
  const handleUpdateSelfUser = (updated: Partial<Contact>) => {
    const newSelf = { ...selfUser, ...updated };
    setSelfUser(newSelf);
    setContacts((prev) => ({ ...prev, self: newSelf }));
    setSelfProfile(newSelf.name, newSelf.dept, uiStatusToPeer(newSelf.status)).catch(() => undefined);
  };

  const activeContact = activeConvId ? contacts[activeConvId] : undefined;
  const currentContactDetail = contacts[selectedContactId] || BROADCAST_CONTACT;

  return (
    <div
      className={`w-full h-screen bg-[var(--bg)] flex items-center justify-center select-none ${
        isDesktop() ? 'p-0' : 'p-0 md:p-3'
      }`}
    >
      {/* Main Window Frame */}
      <div
        className={`w-full h-full bg-[var(--bg)] text-[var(--text)] flex flex-col overflow-hidden ${
          isDesktop() ? '' : 'max-w-[1280px] max-h-[820px] rounded-2xl border border-[var(--line)] shadow-2xl'
        }`}
      >
        {/* 引擎错误横幅：可关闭 */}
        {engineError && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-[var(--danger)]/10 border-b border-[var(--danger)]/30 text-[var(--danger)] text-xs" role="alert">
            <CircleAlert className="w-3.5 h-3.5 flex-none" />
            <span className="flex-1 truncate" title={engineError}>{engineError}</span>
            <button type="button" onClick={() => setEngineError('')} className="p-0.5 hover:opacity-70 cursor-pointer flex-none" aria-label="关闭错误提示">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 引擎提示横幅（端口避让等）：可关闭，20 秒自动消失 */}
        {!engineError && engineNotice && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-[var(--acc)]/10 border-b border-[var(--acc)]/30 text-[var(--acc)] text-xs" role="status">
            <Info className="w-3.5 h-3.5 flex-none" />
            <span className="flex-1 truncate" title={engineNotice}>{engineNotice}</span>
            <button type="button" onClick={() => setEngineNotice('')} className="p-0.5 hover:opacity-70 cursor-pointer flex-none" aria-label="关闭提示">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Custom Title Bar */}
        <TitleBar
          darkMode={settings.darkMode}
          onToggleTheme={handleToggleTheme}
          onMinimize={minimizeWindow}
          onMaximize={toggleMaximizeWindow}
          onClose={closeWindow}
        />

        {/* Main Body with 3 columns */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Column 1: Navigation Rail (64px) */}
          <NavRail
            activeView={activeView}
            onChangeView={(v) => setActiveView(v)}
            totalUnread={totalUnread}
            selfUser={selfUser}
            onOpenSelfProfile={() => setIsProfileModalOpen(true)}
          />

          {/* Column 2: Middle Column (258px) */}
          <MiddleColumn
            activeView={activeView}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            order={order}
            activeConvId={activeConvId}
            onSelectConv={handleSelectConv}
            conversations={conversations}
            conversationMeta={conversationMeta}
            contacts={contacts}
            selectedContactId={selectedContactId}
            onSelectContact={setSelectedContactId}
            onOpenContactChat={handleOpenContactChat}
            activeSettingsPage={activeSettingsPage}
            onSelectSettingsPage={setActiveSettingsPage}
            selfUser={selfUser}
          />

          {/* Column 3: Main Area (Dynamic based on activeView) */}
          <main className="flex-1 flex min-w-0 h-full overflow-hidden" role="main">
            {activeView === 'chats' &&
              (activeContact ? (
                <ChatPanel
                  activeConvId={activeConvId}
                  contact={activeContact}
                  messages={conversations[activeConvId] || []}
                  onSendMessage={handleSendMessage}
                  onTyping={() => {
                    const c = contacts[activeConvId];
                    if (c && !c.isBroadcast && !c.isGroup) sendTyping(c.ip).catch(() => undefined);
                  }}
                  onPickFiles={() => handlePickAndSendFiles('file')}
                  onPickFolder={() => handlePickAndSendFiles('folder')}
                  onSendFile={() => handlePickAndSendFiles('file')} // 浏览器形态无路径，退化为选盘
                  onSendImage={handleSendImage}
                  onOpenScreenshot={() => {
                    captureScreen().then(setShotUrl).catch(() => setShotUrl(''));
                    setIsScreenshotOpen(true);
                  }}
                  onOpenRemoteAssist={() => setIsRemoteAssistOpen(true)}
                  onOpenContactProfile={(cid) => {
                    setSelectedContactId(cid);
                    setActiveView('contacts');
                  }}
                  onClearHistory={handleClearHistory}
                  selfUser={selfUser}
                  onBack={() => setMobilePane('list')}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-[var(--mut)] select-none">
                  <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">从左侧选择一个会话开始聊天</p>
                </div>
              ))}

            {activeView === 'contacts' && (
              <ContactDetailPanel
                contact={currentContactDetail}
                onStartChat={(cid) => handleOpenContactChat(cid)}
                onSendFile={() => handleOpenContactChat(selectedContactId)}
                onRemoteAssist={() => setIsRemoteAssistOpen(true)}
              />
            )}

            {activeView === 'settings' && (
              <SettingsPanel
                activePage={activeSettingsPage}
                settings={settings}
                onUpdateSettings={(updater) => {
                  setSettings((prev) => {
                    const next = updater(prev);
                    if (next.speedLimit !== prev.speedLimit) {
                      setLimitRate(next.speedLimit).catch(() => undefined);
                    }
                    return next;
                  });
                }}
                onToggleTheme={handleToggleTheme}
              />
            )}
          </main>
        </div>
      </div>

      {/* Screen Capture Interactive Tool Modal */}
      <ScreenshotModal
        isOpen={isScreenshotOpen}
        shotUrl={shotUrl}
        onClose={() => setIsScreenshotOpen(false)}
        onCapture={(pngData) => handleSendImage(pngData)}
      />

      {/* Remote Assistance Simulation Modal */}
      <RemoteAssistModal
        isOpen={isRemoteAssistOpen}
        onClose={() => setIsRemoteAssistOpen(false)}
        contact={activeView === 'contacts' ? currentContactDetail : activeContact ?? currentContactDetail}
      />

      {/* User Profile / Status Broadcast Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        selfUser={selfUser}
        onUpdateSelfUser={handleUpdateSelfUser}
      />
    </div>
  );
}
