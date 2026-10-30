import React, { useState, useRef, useEffect } from 'react';
import {
  Scissors,
  FileUp,
  FolderUp,
  MonitorUp,
  MoreHorizontal,
  Smile,
  Image as ImageIcon,
  Paperclip,
  History,
  Send,
  Users,
  Radio,
  FileText,
  Check,
  FolderOpen,
  Trash2,
  Download,
  Info,
  Search,
  ArrowLeft,
  CircleAlert,
} from 'lucide-react';
import { ChatMessage, Contact } from '../types';
import { history, searchHistory, HistoryMsg } from '../lib/wailsBridge';
import { STATUS_COLORS, STATUS_LABELS } from '../data/mockData';

interface ChatPanelProps {
  activeConvId: string;
  contact: Contact;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onTyping?: () => void; // 输入停顿 500ms 触发一次（T-M2-5）
  onPickFiles?: () => void;    // Wails 选盘发文件（桌面形态）
  onPickFolder?: () => void;   // Wails 选盘发文件夹
  onSendFile: (fileName: string, fileSize: string) => void; // 浏览器形态回退
  onSendImage: (imgCap: string) => void;
  onOpenScreenshot: () => void;
  onOpenRemoteAssist: () => void;
  onOpenContactProfile: (contactId: string) => void;
  onClearHistory: () => void;
  selfUser: Contact;
  onBack?: () => void;
  isMobile?: boolean;
}

const COMMON_EMOJIS = [
  '👍', '👌', '😊', '🎉', '☕', '🔥', '💻', '🤝', '🚀', '❤️',
  '👏', '⭐', '⚡', '💡', '✅', '📝', '🏃', '🔍', '🙌', '😎'
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  activeConvId,
  contact,
  messages,
  onSendMessage,
  onTyping,
  onPickFiles,
  onPickFolder,
  onSendFile,
  onSendImage,
  onOpenScreenshot,
  onOpenRemoteAssist,
  onOpenContactProfile,
  onClearHistory,
  selfUser,
  onBack,
  isMobile,
}) => {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyMsgs, setHistoryMsgs] = useState<HistoryMsg[]>([]);

  // 聊天记录弹窗打开/搜索词变化时查 SQLite（T-M5-3；空关键词=最近 100 条）
  useEffect(() => {
    if (!showHistoryModal) return;
    const kw = historySearch.trim();
    const t = setTimeout(() => {
      (kw ? searchHistory(activeConvId, kw) : history(activeConvId, '', 100))
        .then(setHistoryMsgs)
        .catch(() => setHistoryMsgs([]));
    }, 200); // 防抖
    return () => clearTimeout(t);
  }, [showHistoryModal, historySearch, activeConvId]);
  const [folderNotification, setFolderNotification] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when changing conversation
  useEffect(() => {
    textareaRef.current?.focus();
    setShowEmojiPicker(false);
    setShowMoreMenu(false);
  }, [activeConvId]);

  // 卸载清理 typing 计时器
  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, []);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    onSendMessage(text);
    setInputText('');
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 10);
  };

  // 输入变化：停顿 500ms 触发 onTyping（对端显示三点动画），继续输入则重置计时
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (!onTyping) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => onTyping(), 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAddEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handlePickFile = () => {
    if (onPickFiles) {
      onPickFiles();
      return;
    }
    fileInputRef.current?.click(); // 浏览器预览形态回退
  };
  const handlePickFolder = () => {
    if (onPickFolder) {
      onPickFolder();
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;
      onSendFile(file.name, sizeStr);
    }
    e.target.value = '';
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;
      onSendImage(`${file.name} · ${sizeStr}`);
    }
    e.target.value = '';
  };

  const handleOpenFolder = async (msg: ChatMessage) => {
    const p = msg.imgCap; // file_done 时引擎写入的落盘路径
    if (p) {
      const { openPath } = await import('../lib/wailsBridge');
      await openPath(p).catch(() => undefined);
      setFolderNotification(`已打开: ${p}`);
      setTimeout(() => setFolderNotification(null), 3500);
    }
  };

  return (
    <section
      className="flex-1 flex flex-col min-w-0 bg-[var(--bg)] h-full relative"
      aria-label="聊天会话主区域"
    >
      {/* Toast Notification for Folder open */}
      {folderNotification && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[var(--panel)] border border-[var(--line)] shadow-lg rounded-xl text-xs text-[var(--text)] flex items-center gap-2 animate-v1in">
          <FolderOpen className="w-4 h-4 text-[var(--acc)]" />
          <span>{folderNotification}</span>
        </div>
      )}

      {/* Hidden file & image pickers */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*"
        onChange={handleImageChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="h-[54px] flex-none flex items-center gap-2.5 px-3 md:px-4 bg-[var(--panel)] border-b border-[var(--line)] select-none z-10">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="hidden max-[660px]:flex w-8 h-8 rounded-lg items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer mr-0.5 flex-none"
            aria-label="返回会话列表"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        <div
          className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-white text-sm font-semibold flex-none shadow-xs"
          style={{ backgroundColor: contact.color }}
        >
          {contact.isGroup ? (
            <Users className="w-4 h-4" />
          ) : contact.isBroadcast ? (
            <Radio className="w-4 h-4" />
          ) : (
            contact.char
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--text)] truncate">
            {contact.name}
          </div>
          <div className="text-[11px] text-[var(--mut)] flex items-center gap-1.5 truncate mt-0.5">
            {contact.status !== 'off' && contact.status !== 'grp' && contact.status !== 'bc' && (
              <span
                className="w-1.5 h-1.5 rounded-full inline-block flex-none"
                style={{ backgroundColor: STATUS_COLORS[contact.status] || 'var(--ok)' }}
                aria-hidden="true"
              />
            )}
            {contact.ip && <span className="tabular-nums">{contact.ip} · </span>}
            <span>{contact.dept}</span>
            <span>·</span>
            <span>{STATUS_LABELS[contact.status] || '在线'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenScreenshot}
            className="h-[30px] px-2.5 rounded-lg flex items-center gap-1.5 text-xs text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="屏幕截图 (Ctrl+Alt+A)"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">截图</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-[30px] px-2.5 rounded-lg flex items-center gap-1.5 text-xs text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="发送文件"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">发文件</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSendFile('测试文件夹.zip', '45.8 MB');
            }}
            className="h-[30px] px-2.5 rounded-lg flex items-center gap-1.5 text-xs text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="发送文件夹"
          >
            <FolderUp className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">发文件夹</span>
          </button>

          <button
            type="button"
            onClick={onOpenRemoteAssist}
            className="h-[30px] px-2.5 rounded-lg flex items-center gap-1.5 text-xs text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="请求远程协助"
          >
            <MonitorUp className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">远程协助</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              aria-label="更多操作"
              className="h-[30px] w-[30px] rounded-lg flex items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showMoreMenu && (
              <div
                className="absolute right-0 top-8 w-44 bg-[var(--panel)] border border-[var(--line)] shadow-xl rounded-xl py-1 z-50 animate-v1in"
                role="menu"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenContactProfile(activeConvId);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-[var(--panel2)] flex items-center gap-2 cursor-pointer"
                  role="menuitem"
                >
                  <Info className="w-3.5 h-3.5 text-[var(--mut)]" />
                  <span>查看详细资料</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowHistoryModal(true);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-[var(--panel2)] flex items-center gap-2 cursor-pointer"
                  role="menuitem"
                >
                  <History className="w-3.5 h-3.5 text-[var(--mut)]" />
                  <span>查找聊天记录</span>
                </button>
                <div className="h-px bg-[var(--line)] my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onClearHistory();
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-[var(--danger)] hover:bg-[var(--panel2)] flex items-center gap-2 cursor-pointer"
                  role="menuitem"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空当前会话记录</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0"
        role="log"
        aria-live="polite"
        aria-label="聊天记录"
      >
        {messages.map((m) => {
          // Date / System Chip
          if (m.t === 'chip') {
            return (
              <div
                key={m.id}
                className="self-center text-[11px] text-[var(--mut)] bg-[var(--panel)] border border-[var(--line)] rounded-full px-3 py-0.5 shadow-2xs select-none"
              >
                {m.text}
              </div>
            );
          }

          // Typing Indicator
          if (m.t === 'typing') {
            return (
              <div key={m.id} className="flex gap-2.5 items-start animate-v1in">
                <div
                  className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-white text-xs font-semibold flex-none shadow-2xs mt-4"
                  style={{ backgroundColor: contact.color }}
                >
                  {contact.char}
                </div>
                <div className="flex gap-1 items-center px-3 py-2.5 bg-[var(--panel)] border border-[var(--line)] rounded-[13px] rounded-tl-[5px] shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--mut)] typing-dot-1" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--mut)] typing-dot-2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--mut)] typing-dot-3" />
                </div>
              </div>
            );
          }

          const isMine = m.t === 'me' || m.from === 'me';
          const avatarChar = isMine ? selfUser.char : contact.char;
          const avatarColor = isMine ? selfUser.color : contact.color;

          return (
            <div
              key={m.id}
              className={`flex gap-2.5 items-start animate-v1in ${
                isMine ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-white text-xs font-semibold flex-none shadow-2xs mt-4 select-none"
                style={{ backgroundColor: avatarColor }}
              >
                {avatarChar}
              </div>

              {/* Message Content Body */}
              <div
                className={`max-w-[65%] max-md:max-w-[80%] flex flex-col gap-1 ${
                  isMine ? 'items-end' : 'items-start'
                }`}
              >
                {/* Meta Name/Time for counterpart */}
                {!isMine && m.name && (
                  <div className="text-[11px] text-[var(--mut)] px-1 select-none">
                    {m.name}
                  </div>
                )}

                {/* Text Bubble */}
                {(m.t === 'them' || m.t === 'me') && (
                  <div
                    className={`px-3 py-2 rounded-[13px] text-[13px] leading-relaxed break-words shadow-2xs select-text ${
                      isMine
                        ? 'bg-[var(--acc)] text-[var(--accfg)] rounded-tr-[5px]'
                        : 'bg-[var(--panel)] text-[var(--text)] border border-[var(--line)] rounded-tl-[5px]'
                    }`}
                  >
                    {m.text}
                  </div>
                )}

                {/* 发送失败行内提示（T-M2-4）：气泡下红字，标注原因 */}
                {m.t === 'me' && m.delivered === false && (
                  <div className="text-[11px] text-[var(--danger)] mt-1 flex items-center gap-1 justify-end">
                    <CircleAlert className="w-3 h-3" />
                    {m.name || '发送失败，对方可能已离线'}
                  </div>
                )}
                {/* 已送达标记（receipt 事件命中后显示） */}
                {m.t === 'me' && m.delivered === true && (
                  <div className="text-[10px] text-[var(--mut)] mt-0.5 flex items-center gap-0.5 justify-end">
                    <Check className="w-3 h-3" />
                    已送达
                  </div>
                )}

                {/* File Transfer Card */}
                {m.t === 'file' && (
                  <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[13px] p-2.5 flex items-center gap-2.5 min-w-[240px] max-w-[320px] shadow-2xs">
                    <div className="w-9 h-9 rounded-lg bg-[var(--panel2)] flex items-center justify-center text-[var(--acc)] flex-none">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[var(--text)] truncate">
                        {m.fileName}
                      </div>
                      {m.fileDone ? (
                        <div className="text-[11px] text-[var(--mut)] mt-1 flex items-center gap-1.5">
                          <span className="text-[var(--ok)] flex items-center gap-0.5 font-medium">
                            <Check className="w-3 h-3" />
                            已接收
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">{m.fileSize}</span>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => handleOpenFolder(m)}
                            className="text-[var(--acc)] hover:underline cursor-pointer"
                          >
                            打开文件夹
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[11px] text-[var(--mut)] mt-1 flex items-center justify-between">
                            <span className="tabular-nums">{m.fileSize}</span>
                            <span className="tabular-nums text-[var(--acc)] font-medium">
                              {m.fileSpeed || '3.5 MB/s'}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-[var(--panel2)] mt-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--acc)] transition-all duration-300"
                              style={{ width: `${m.filePct || 50}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Image Message */}
                {m.t === 'img' && (
                  <div className="w-[190px] rounded-[13px] overflow-hidden border border-[var(--line)] shadow-2xs bg-[var(--panel)]">
                    <div className="h-[118px] bg-gradient-to-br from-indigo-200 via-sky-200 to-teal-200 dark:from-indigo-950 dark:via-sky-900 dark:to-teal-950 flex flex-col items-center justify-center text-indigo-700 dark:text-sky-300 gap-1.5">
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-[10px] opacity-80">图片预览</span>
                    </div>
                    <div className="text-[11px] text-[var(--mut)] px-2.5 py-1.5 bg-[var(--panel)] truncate">
                      {m.imgCap}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Input Area */}
      <div className="flex-none bg-[var(--panel)] border-t border-[var(--line)] p-2.5 relative z-10">
        {/* Emoji popover */}
        {showEmojiPicker && (
          <div
            className="absolute bottom-16 left-3 bg-[var(--panel)] border border-[var(--line)] shadow-xl rounded-xl p-2.5 grid grid-cols-5 gap-1.5 z-50 animate-v1in"
            aria-label="选择表情"
          >
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleAddEmoji(emoji)}
                className="w-8 h-8 rounded-lg hover:bg-[var(--panel2)] text-base flex items-center justify-center cursor-pointer transition-transform hover:scale-115"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1 mb-1.5">
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            aria-label="插入表情"
            title="表情"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <Smile className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            aria-label="发送图片"
            title="发送图片"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onOpenScreenshot}
            aria-label="屏幕截图"
            title="屏幕截图 (Ctrl+Alt+A)"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <Scissors className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="发送文件"
            title="发送文件"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            aria-label="查看聊天记录"
            title="聊天记录"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <History className="w-4 h-4" />
          </button>
        </div>

        {/* Input box and Send button */}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，Enter 发送 / Shift+Enter 换行"
            rows={2}
            className="flex-1 min-h-[42px] max-h-[100px] rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 text-[13px] text-[var(--text)] resize-none outline-none leading-relaxed focus:border-[var(--acc)] transition-colors"
            aria-label="消息输入框"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!inputText.trim()}
            className={`h-[42px] px-4 rounded-xl flex items-center gap-1.5 text-[13px] font-medium transition-all cursor-pointer shadow-xs ${
              inputText.trim()
                ? 'bg-[var(--acc)] text-white hover:brightness-105 active:scale-98'
                : 'bg-[var(--panel2)] text-[var(--mut)] opacity-60 cursor-not-allowed'
            }`}
          >
            <span>发送</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* History Search Modal */}
      {showHistoryModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="聊天记录搜索"
        >
          <div className="w-[520px] max-w-full bg-[var(--panel)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[var(--acc)]" />
                <span className="text-sm font-medium text-[var(--text)]">
                  与 {contact.name} 的本地聊天记录
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-[var(--mut)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            <div className="p-3 border-b border-[var(--line)] bg-[var(--panel2)]">
              <div className="h-8 rounded-lg bg-[var(--panel)] border border-[var(--line)] flex items-center gap-2 px-2.5">
                <Search className="w-3.5 h-3.5 text-[var(--mut)]" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="搜索历史消息内容..."
                  className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--text)]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(historyMsgs.length > 0
                ? historyMsgs.map((h): ChatMessage => ({
                    id: `db_${h.id}`,
                    t: (h.isMine ? 'me' : 'them') as ChatMessage['t'],
                    text: h.text,
                    time: new Date(h.sentAt * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                    fileName: h.kind === 'file' ? h.text : undefined,
                  }))
                : messages
                    .filter((m) => {
                      if (m.t === 'chip' || m.t === 'typing') return false;
                      if (!historySearch.trim()) return true;
                      const query = historySearch.toLowerCase();
                      if (m.text && m.text.toLowerCase().includes(query)) return true;
                      if (m.fileName && m.fileName.toLowerCase().includes(query)) return true;
                      return false;
                    })
              )
                .map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel2)] text-xs text-[var(--text)] flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-[var(--mut)]">
                      <span>{m.t === 'me' ? '我' : contact.name}</span>
                      <span>{m.time || '记录'}</span>
                    </div>
                    <div>
                      {m.text && <p>{m.text}</p>}
                      {m.fileName && <p>[文件] {m.fileName} ({m.fileSize})</p>}
                      {m.imgCap && <p>[图片] {m.imgCap}</p>}
                    </div>
                  </div>
                ))}
            </div>

            <div className="px-4 py-2.5 bg-[var(--panel2)] border-t border-[var(--line)] flex justify-between items-center text-xs text-[var(--mut)]">
              <span>共 {messages.filter((m) => m.t !== 'chip' && m.t !== 'typing').length} 条记录</span>
              <button
                type="button"
                onClick={() => {
                  const content = messages
                    .map((m) => `${m.t === 'me' ? '我' : contact.name}: ${m.text || m.fileName || ''}`)
                    .join('\n');
                  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `飞联聊天记录_${contact.name}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1 bg-[var(--panel)] border border-[var(--line)] hover:bg-[var(--panel2)] text-[var(--text)] rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出记录 (TXT)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
