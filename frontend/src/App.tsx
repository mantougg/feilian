/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
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
  type EngineEvent,
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

  // Modals state
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [isRemoteAssistOpen, setIsRemoteAssistOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'chat'>('chat');

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

  // peer 上线/资料变更：upsert 联系人（保留旧字段，如签名等 UI 侧数据）
  const handlePeerPresence = (ev: EngineEvent) => {
    const c = peerToContact(ev.peer);
    setContacts((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), ...c } }));
  };

  // peer 下线：仅标记离线（保留在列表，飞秋语义：离线用户仍可见）
  const handlePeerOffline = (ev: EngineEvent) => {
    const id = `${ev.peer.nick}@${ev.peer.host}`;
    setContacts((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], status: 'off' } } : prev));
  };

  // 收到文本消息：补全联系人 → 追加气泡 → 置顶/未读/预览（applyIncomingMessage 纯函数）
  const handleIncomingMessage = (ev: EngineEvent) => {
    const convId = `${ev.peer.nick}@${ev.peer.host}`;
    const c = peerToContact(ev.peer);
    setContacts((prev) => ({ ...prev, [convId]: { ...(prev[convId] || c), ...c } }));

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

  useEngineEvents({
    peer_online: handlePeerPresence,
    peer_update: handlePeerPresence,
    peer_offline: handlePeerOffline,
    message: handleIncomingMessage,
    typing: handleTyping,
    receipt: handleReceipt,
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

  // Open conversation from contact list or profile
  const handleOpenContactChat = (contactId: string) => {
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

  // Send file card
  const handleSendFile = (fileName: string, fileSize: string) => {
    const targetId = activeConvId;
    const currentTime = formatCurrentTime();
    const newMsgId = `f_${Date.now()}`;

    setConversations((prev) => {
      const currentList = prev[targetId] || [];
      return {
        ...prev,
        [targetId]: [
          ...currentList,
          {
            id: newMsgId,
            t: 'file',
            from: 'me',
            fileName,
            fileSize,
            fileDone: true,
            time: currentTime,
          },
        ],
      };
    });

    setOrder((prev) => bumpConversationOrder(prev, targetId));
    setConversationMeta((prev) => ({
      ...prev,
      [targetId]: {
        time: currentTime,
        unread: 0,
      },
    }));
  };

  // Send image message
  const handleSendImage = (imgCap: string) => {
    const targetId = activeConvId;
    const currentTime = formatCurrentTime();
    const newMsgId = `img_${Date.now()}`;

    setConversations((prev) => {
      const currentList = prev[targetId] || [];
      return {
        ...prev,
        [targetId]: [
          ...currentList,
          {
            id: newMsgId,
            t: 'img',
            from: 'me',
            imgCap,
            time: currentTime,
          },
        ],
      };
    });

    setOrder((prev) => bumpConversationOrder(prev, targetId));
    setConversationMeta((prev) => ({
      ...prev,
      [targetId]: {
        time: currentTime,
        unread: 0,
      },
    }));
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
                  onSendFile={handleSendFile}
                  onSendImage={handleSendImage}
                  onOpenScreenshot={() => setIsScreenshotOpen(true)}
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
                onUpdateSettings={setSettings}
                onToggleTheme={handleToggleTheme}
              />
            )}
          </main>
        </div>
      </div>

      {/* Screen Capture Interactive Tool Modal */}
      <ScreenshotModal
        isOpen={isScreenshotOpen}
        onClose={() => setIsScreenshotOpen(false)}
        onCapture={(imgCap) => handleSendImage(imgCap)}
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
