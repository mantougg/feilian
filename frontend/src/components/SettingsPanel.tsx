import React, { useState } from 'react';
import {
  Moon,
  Bell,
  Power,
  Globe,
  Folder,
  FolderOpen,
  Gauge,
  Scissors,
  Send,
  CornerDownLeft,
  Search,
  Radio,
  Layers,
  Download,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { AppSettings, SettingsPage } from '../types';

interface SettingsPanelProps {
  activePage: SettingsPage;
  settings: AppSettings;
  onUpdateSettings: (updater: (prev: AppSettings) => AppSettings) => void;
  onToggleTheme: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  activePage,
  settings,
  onUpdateSettings,
  onToggleTheme,
}) => {
  const [editingPath, setEditingPath] = useState(false);
  const [newPath, setNewPath] = useState(settings.saveDirectory);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const handleSavePath = () => {
    if (newPath.trim()) {
      onUpdateSettings((prev) => ({ ...prev, saveDirectory: newPath.trim() }));
    }
    setEditingPath(false);
  };

  const handleCheckUpdate = () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    setTimeout(() => {
      setCheckingUpdate(false);
      setUpdateStatus('当前已是最新版本 (v0.1.0-release)');
    }, 1200);
  };

  return (
    <section
      className="flex-1 min-w-0 overflow-y-auto bg-[var(--bg)] p-6 md:p-8 select-none"
      aria-label="设置面板"
    >
      <div className="w-full max-w-[620px] mx-auto animate-v1in">
        {/* GENERAL PAGE */}
        {activePage === 'general' && (
          <div>
            <h2 className="text-base font-medium text-[var(--text)] mb-3">通用</h2>
            <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[13px] shadow-2xs divide-y divide-[var(--line)]">
              {/* Dark mode switch */}
              <button
                type="button"
                onClick={onToggleTheme}
                className="w-full flex items-center justify-between p-3.5 hover:bg-[var(--panel2)] transition-colors text-left cursor-pointer"
                aria-label="深色模式切换"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Moon className="w-4 h-4" />
                  </div>
                  <span className="text-[13px] text-[var(--text)]">深色模式</span>
                </div>
                <div
                  className={`w-9 h-[21px] rounded-full relative transition-colors border ${
                    settings.darkMode
                      ? 'bg-[var(--acc)] border-[var(--acc)]'
                      : 'bg-slate-300 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                  }`}
                  role="switch"
                  aria-checked={settings.darkMode}
                >
                  <span
                    className={`absolute top-[2px] w-[15px] h-[15px] rounded-full transition-transform bg-white ${
                      settings.darkMode ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`}
                  />
                </div>
              </button>

              {/* Message notifications */}
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    systemNotification: !prev.systemNotification,
                  }))
                }
                className="w-full flex items-center justify-between p-3.5 hover:bg-[var(--panel2)] transition-colors text-left cursor-pointer"
                aria-label="消息通知开关"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Bell className="w-4 h-4" />
                  </div>
                  <span className="text-[13px] text-[var(--text)]">消息通知</span>
                </div>
                <div
                  className={`w-9 h-[21px] rounded-full relative transition-colors border ${
                    settings.systemNotification
                      ? 'bg-[var(--acc)] border-[var(--acc)]'
                      : 'bg-slate-300 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                  }`}
                  role="switch"
                  aria-checked={settings.systemNotification}
                >
                  <span
                    className={`absolute top-[2px] w-[15px] h-[15px] rounded-full transition-transform bg-white ${
                      settings.systemNotification ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`}
                  />
                </div>
              </button>

              {/* Auto launch */}
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    autoLaunch: !prev.autoLaunch,
                  }))
                }
                className="w-full flex items-center justify-between p-3.5 hover:bg-[var(--panel2)] transition-colors text-left cursor-pointer"
                aria-label="开机自启动开关"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Power className="w-4 h-4" />
                  </div>
                  <span className="text-[13px] text-[var(--text)]">开机自启动</span>
                </div>
                <div
                  className={`w-9 h-[21px] rounded-full relative transition-colors border ${
                    settings.autoLaunch
                      ? 'bg-[var(--acc)] border-[var(--acc)]'
                      : 'bg-slate-300 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                  }`}
                  role="switch"
                  aria-checked={settings.autoLaunch}
                >
                  <span
                    className={`absolute top-[2px] w-[15px] h-[15px] rounded-full transition-transform bg-white ${
                      settings.autoLaunch ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`}
                  />
                </div>
              </button>

              {/* Language */}
              <div className="flex items-center justify-between p-3.5 text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Globe className="w-4 h-4" />
                  </div>
                  <span className="text-[var(--text)]">语言</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--mut)]">
                  <span>{settings.language}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FILE & TRANSFER PAGE */}
        {activePage === 'file' && (
          <div>
            <h2 className="text-base font-medium text-[var(--text)] mb-3">文件与传输</h2>
            <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[13px] shadow-2xs divide-y divide-[var(--line)]">
              {/* Save directory */}
              <div className="p-3.5 flex items-center justify-between text-[13px] gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)] flex-none">
                    <Folder className="w-4 h-4" />
                  </div>
                  <span className="text-[var(--text)] flex-none">接收文件保存到</span>
                </div>

                {editingPath ? (
                  <div className="flex items-center gap-2 flex-1 max-w-[280px]">
                    <input
                      type="text"
                      value={newPath}
                      onChange={(e) => setNewPath(e.target.value)}
                      className="px-2 py-1 text-xs border border-[var(--line)] rounded bg-[var(--panel2)] flex-1 text-[var(--text)]"
                    />
                    <button
                      type="button"
                      onClick={handleSavePath}
                      className="text-xs text-[var(--acc)] font-medium cursor-pointer"
                    >
                      确定
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-[var(--mut)] truncate max-w-[180px] font-mono">
                      {settings.saveDirectory}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingPath(true)}
                      className="text-xs text-[var(--acc)] hover:underline flex-none cursor-pointer"
                    >
                      修改
                    </button>
                  </div>
                )}
              </div>

              {/* Open folder when completed */}
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    openFolderAfterTransfer: !prev.openFolderAfterTransfer,
                  }))
                }
                className="w-full flex items-center justify-between p-3.5 hover:bg-[var(--panel2)] transition-colors text-left cursor-pointer"
                aria-label="传输完成后自动打开文件夹"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <FolderOpen className="w-4 h-4" />
                  </div>
                  <span className="text-[13px] text-[var(--text)]">传输完成后打开文件夹</span>
                </div>
                <div
                  className={`w-9 h-[21px] rounded-full relative transition-colors border ${
                    settings.openFolderAfterTransfer
                      ? 'bg-[var(--acc)] border-[var(--acc)]'
                      : 'bg-slate-300 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                  }`}
                  role="switch"
                  aria-checked={settings.openFolderAfterTransfer}
                >
                  <span
                    className={`absolute top-[2px] w-[15px] h-[15px] rounded-full transition-transform bg-white ${
                      settings.openFolderAfterTransfer
                        ? 'translate-x-[18px]'
                        : 'translate-x-[2px]'
                    }`}
                  />
                </div>
              </button>

              {/* Speed limit */}
              <div className="flex items-center justify-between p-3.5 text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Gauge className="w-4 h-4" />
                  </div>
                  <span className="text-[var(--text)]">传输限速</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--mut)]">
                  <span>{settings.speedLimit}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SHORTCUTS PAGE */}
        {activePage === 'keys' && (
          <div>
            <h2 className="text-base font-medium text-[var(--text)] mb-3">快捷键</h2>
            <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[13px] shadow-2xs divide-y divide-[var(--line)]">
              <div className="flex items-center justify-between p-3.5 text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Scissors className="w-4 h-4" />
                  </div>
                  <span className="text-[var(--text)]">屏幕截图</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[var(--panel2)] border border-[var(--line)] text-[var(--mut)]">
                  Ctrl+Alt+A
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Send className="w-4 h-4" />
                  </div>
                  <span className="text-[var(--text)]">发送消息</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[var(--panel2)] border border-[var(--line)] text-[var(--mut)]">
                  Enter
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <CornerDownLeft className="w-4 h-4" />
                  </div>
                  <span className="text-[var(--text)]">消息内换行</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[var(--panel2)] border border-[var(--line)] text-[var(--mut)]">
                  Shift+Enter
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Search className="w-4 h-4" />
                  </div>
                  <span className="text-[var(--text)]">全局搜索</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[var(--panel2)] border border-[var(--line)] text-[var(--mut)]">
                  Ctrl+F
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ABOUT PAGE */}
        {activePage === 'about' && (
          <div>
            <h2 className="text-base font-medium text-[var(--text)] mb-3">关于</h2>
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-[var(--acc)] text-white text-2xl font-bold flex items-center justify-center mx-auto mb-3 shadow-md">
                飞
              </div>
              <h3 className="text-base font-semibold text-[var(--text)]">飞联 LANChat</h3>
              <p className="text-xs text-[var(--mut)] mt-1">v0.1.0 · 局域网即时通讯客户端</p>
            </div>

            <div className="bg-[var(--panel)] border border-[var(--line)] rounded-[13px] shadow-2xs divide-y divide-[var(--line)] mt-4">
              <div className="flex items-center justify-between p-3.5 text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Radio className="w-4 h-4" />
                  </div>
                  <span className="text-[var(--text)]">通讯协议</span>
                </div>
                <span className="text-xs text-[var(--mut)]">
                  IPMsg 兼容 (UDP/TCP 2425)
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-[var(--mut)]">
                    <Layers className="w-4 h-4" />
                  </div>
                  <span className="text-[var(--text)]">技术栈</span>
                </div>
                <span className="text-xs text-[var(--mut)]">Go + Wails + React 19</span>
              </div>
            </div>

            <div className="text-center mt-6 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="h-9 px-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] text-[var(--text)] text-[13px] font-medium flex items-center gap-2 hover:bg-[var(--panel2)] active:scale-98 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-[var(--acc)]" />
                <span>{checkingUpdate ? '正在检查...' : '检查更新'}</span>
              </button>
              {updateStatus && (
                <div className="text-xs text-[var(--ok)] flex items-center gap-1.5 animate-v1in">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{updateStatus}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
