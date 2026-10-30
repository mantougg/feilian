import { Contact, AppSettings } from '../types';

/**
 * M2 起 mock 退场：本文件只保留「我自己」的初始占位（挂载后由 GetSelf 覆盖）
 * 与广播通道的固定联系人；所有其他联系人与会话均由引擎事件驱动构建。
 */

export const INITIAL_SELF: Contact = {
  id: 'self',
  char: '我',
  color: '#8b5cf6',
  name: '我',
  host: 'localhost',
  ip: '127.0.0.1',
  dept: '未分组',
  status: 'ok',
  isSelf: true,
};

/** 广播通道是固定虚拟联系人（非引擎产出），id 恒为 'bc'。 */
export const BROADCAST_CONTACT: Contact = {
  id: 'bc',
  char: '播',
  color: '#0ea5e9',
  ip: '255.255.255.255',
  dept: '全员',
  status: 'bc',
  name: '局域网广播',
  host: '—',
  sign: '面向全网段的消息广播通道',
  isBroadcast: true,
};

export const STATUS_LABELS: Record<string, string> = {
  ok: '在线',
  busy: '勿扰',
  away: '离开',
  off: '离线',
  bc: '广播',
  grp: '群聊',
};

export const STATUS_COLORS: Record<string, string> = {
  ok: '#22c55e',
  busy: '#ef4444',
  away: '#f59e0b',
  off: '#94a3b8',
  bc: '#4f46e5',
  grp: '#0ea5e9',
};

/** 由昵称稳定生成头像底色（同一人每次进入颜色一致）。 */
export function avatarColor(seed: string): string {
  const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export const INITIAL_SETTINGS: AppSettings = {
  darkMode: false,
  systemNotification: true,
  autoLaunch: false,
  language: '简体中文',
  saveDirectory: '',
  openFolderAfterTransfer: false,
  speedLimit: '不限速',
};
