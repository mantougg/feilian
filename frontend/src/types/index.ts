export type UserStatus = 'ok' | 'busy' | 'off' | 'bc' | 'grp';

export interface Contact {
  id: string;
  char: string;
  name: string;
  color: string;
  ip: string;
  dept: string;
  status: UserStatus;
  host: string;
  sign?: string;
  isSelf?: boolean;
  isGroup?: boolean;
  isBroadcast?: boolean;
  memberCount?: number;
}

export type MessageType = 'chip' | 'them' | 'me' | 'file' | 'img' | 'typing';

export interface ChatMessage {
  id: string;
  t: MessageType;
  text?: string;
  who?: string;
  name?: string;
  from?: 'me' | 'them';
  time?: string;
  // File props
  fileName?: string;
  fileSize?: string;
  fileDone?: boolean;
  filePct?: number;
  fileSpeed?: string;
  // Image props
  imgCap?: string;
}

export interface ConversationMeta {
  time: string;
  unread: number;
}

export type ActiveView = 'chats' | 'contacts' | 'settings';
export type SettingsPage = 'general' | 'file' | 'keys' | 'about';

export interface AppSettings {
  darkMode: boolean;
  systemNotification: boolean;
  autoLaunch: boolean;
  language: string;
  saveDirectory: string;
  openFolderAfterTransfer: boolean;
  speedLimit: string;
}

export interface IPMsgPacket {
  version: number;
  packetNo: number;
  senderNick: string;
  senderHost: string;
  command: number;
  extra: string;
}
