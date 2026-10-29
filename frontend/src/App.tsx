/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  INITIAL_CONTACTS,
  INITIAL_CONVERSATIONS,
  INITIAL_CONVERSATION_META,
  INITIAL_ORDER,
  INITIAL_SETTINGS,
  INITIAL_SELF,
  AUTOMATIC_REPLIES,
} from './data/mockData';

import {
  bumpConversationOrder,
  calculateTotalUnread,
  formatCurrentTime,
} from './utils/chatLogic';
import { isDesktop, minimizeWindow, toggleMaximizeWindow, closeWindow } from './lib/wailsBridge';

export default function App() {
  // Application view state
  const [activeView, setActiveView] = useState<ActiveView>('chats');
  const [activeSettingsPage, setActiveSettingsPage] = useState<SettingsPage>('general');
  const [activeConvId, setActiveConvId] = useState<string>('zhang');
  const [selectedContactId, setSelectedContactId] = useState<string>('zhang');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data states
  const [selfUser, setSelfUser] = useState<Contact>(INITIAL_SELF);
  const [contacts, setContacts] = useState<Record<string, Contact>>(INITIAL_CONTACTS);
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>(
    INITIAL_CONVERSATIONS
  );
  const [conversationMeta, setConversationMeta] = useState<Record<string, ConversationMeta>>(
    INITIAL_CONVERSATION_META
  );
  const [order, setOrder] = useState<string[]>(INITIAL_ORDER);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);

  // Modals state
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [isRemoteAssistOpen, setIsRemoteAssistOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'chat'>('chat');

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

  // Send message
  const handleSendMessage = (text: string) => {
    const targetId = activeConvId;
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

    // Realistic auto-reply simulation
    setTimeout(() => {
      const replyPool = AUTOMATIC_REPLIES[targetId] || AUTOMATIC_REPLIES.zhang;
      const randomReply = replyPool[Math.floor(Math.random() * replyPool.length)];
      const who = targetId === 'group' ? 'zhang' : targetId;
      const replySender = contacts[who] || contacts.zhang;
      const replyTime = formatCurrentTime();
      const replyMsgId = `r_${Date.now()}`;

      setConversations((prev) => {
        const list = prev[targetId] || [];
        return {
          ...prev,
          [targetId]: [
            ...list,
            {
              id: replyMsgId,
              t: 'them',
              who,
              name: `${replySender.name} · ${replyTime}`,
              text: randomReply,
              time: replyTime,
            },
          ],
        };
      });

      // Update meta and bump
      setOrder((prev) => bumpConversationOrder(prev, targetId));
      setConversationMeta((prev) => ({
        ...prev,
        [targetId]: {
          time: replyTime,
          unread: activeConvId === targetId ? 0 : (prev[targetId]?.unread || 0) + 1,
        },
      }));
    }, 1100);
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

  // Update self profile
  const handleUpdateSelfUser = (updated: Partial<Contact>) => {
    const newSelf = { ...selfUser, ...updated };
    setSelfUser(newSelf);
    setContacts((prev) => ({
      ...prev,
      self: newSelf,
    }));
  };

  const activeContact = contacts[activeConvId] || contacts.zhang;
  const currentContactDetail = contacts[selectedContactId] || contacts.zhang;

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
            {activeView === 'chats' && (
              <ChatPanel
                activeConvId={activeConvId}
                contact={activeContact}
                messages={conversations[activeConvId] || []}
                onSendMessage={handleSendMessage}
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
            )}

            {activeView === 'contacts' && (
              <ContactDetailPanel
                contact={currentContactDetail}
                onStartChat={(cid) => handleOpenContactChat(cid)}
                onSendFile={() => {
                  handleOpenContactChat(selectedContactId);
                  setTimeout(() => {
                    handleSendFile('资料清单.pdf', '2.4 MB');
                  }, 300);
                }}
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
        contact={activeView === 'contacts' ? currentContactDetail : activeContact}
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
