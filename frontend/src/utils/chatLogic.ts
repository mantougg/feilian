import { ChatMessage, Contact, ConversationMeta } from '../types';
import { avatarColor } from '../data/mockData';

/** 引擎 peer 的最小字段（wailsBridge.EngineEvent['peer'] 同构）。 */
export interface PeerLike {
  nick: string;
  host: string;
  ip: string;
  port: number;
  dept: string;
  status: string;
}

/** 联系人 id = 引擎用户表主键 nick@host。 */
export function peerId(peer: PeerLike): string {
  return `${peer.nick}@${peer.host}`;
}

/** 引擎状态 → UI UserStatus（away 归入 busy：均为不可打扰态）。 */
export function peerStatusToUi(status: string): Contact['status'] {
  if (status === 'online') return 'ok';
  if (status === 'busy' || status === 'away') return 'busy';
  return 'off';
}

/** 引擎 peer → UI Contact（昵称首字符作头像字，颜色由昵称稳定生成）。 */
export function peerToContact(peer: PeerLike): Contact {
  return {
    id: peerId(peer),
    char: peer.nick.slice(0, 1) || '?',
    color: avatarColor(peer.nick + '@' + peer.host),
    name: peer.nick,
    host: peer.host,
    ip: peer.ip,
    dept: peer.dept || '未分组',
    status: peerStatusToUi(peer.status),
  };
}

/** 联系人按部门分组（self 并入自身部门；广播/群聊通道除外），部门名稳定排序。 */
export function groupContactsByDept(contacts: Record<string, Contact>): Array<{ dept: string; members: Contact[] }> {
  const groups = new Map<string, Contact[]>();
  for (const c of Object.values(contacts)) {
    if (c.isBroadcast || c.isGroup) continue;
    const dept = c.dept || '未分组';
    if (!groups.has(dept)) groups.set(dept, []);
    groups.get(dept)!.push(c);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([dept, members]) => ({ dept, members }));
}

/**
 * Bump active conversation ID to the beginning of the list without duplicates.
 */
export function bumpConversationOrder(order: string[], activeId: string): string[] {
  return [activeId, ...order.filter((id) => id !== activeId)];
}

/**
 * Calculate total unread count across all conversations.
 */
export function calculateTotalUnread(metaMap: Record<string, ConversationMeta>): number {
  return Object.values(metaMap).reduce((total, meta) => total + (meta.unread || 0), 0);
}

/**
 * Format current timestamp as HH:MM
 */
export function formatCurrentTime(date: Date = new Date()): string {
  const hours = ('0' + date.getHours()).slice(-2);
  const minutes = ('0' + date.getMinutes()).slice(-2);
  return `${hours}:${minutes}`;
}

/**
 * Generate preview string for a conversation based on its latest meaningful message.
 */
export function getConversationPreview(
  messages: ChatMessage[],
  contactsMap: Record<string, Contact>,
  convId: string
): string {
  if (!messages || messages.length === 0) return '';

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.t === 'chip' || msg.t === 'typing') continue;

    if (msg.t === 'file') {
      return `[文件] ${msg.fileName || '未知文件'}`;
    }
    if (msg.t === 'img') {
      const cap = msg.imgCap || '';
      return `[图片] ${cap.split(' · ')[0] || '图片'}`;
    }

    if (msg.t === 'me') {
      return `我: ${msg.text || ''}`;
    }

    if (msg.t === 'them') {
      if (convId === 'group' && msg.who && contactsMap[msg.who]) {
        return `${contactsMap[msg.who].name}: ${msg.text || ''}`;
      }
      return msg.text || '';
    }
  }

  return '';
}

/**
 * Filter contacts and conversations by search keyword.
 */
export function filterContacts(contacts: Contact[], query: string): Contact[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return contacts;

  return contacts.filter((c) => {
    return (
      c.name.toLowerCase().includes(trimmed) ||
      c.ip.toLowerCase().includes(trimmed) ||
      c.dept.toLowerCase().includes(trimmed) ||
      c.host.toLowerCase().includes(trimmed) ||
      (c.sign && c.sign.toLowerCase().includes(trimmed))
    );
  });
}

/** 会话三态（消息表/元数据/排序）整体快照，applyIncomingMessage 的输入输出。 */
export interface ConversationState {
  conversations: Record<string, ChatMessage[]>;
  meta: Record<string, ConversationMeta>;
  order: string[];
}

/**
 * 应用一条入站消息（T-M2-3）：追加气泡（清掉对端 typing 残留）、
 * 会话置顶、时间预览刷新；未读只在「会话未打开」时累加。
 */
export function applyIncomingMessage(
  state: ConversationState,
  convId: string,
  msg: ChatMessage,
  activeConvId: string
): ConversationState {
  const list = (state.conversations[convId] || []).filter((m) => m.t !== 'typing');
  const prevMeta = state.meta[convId] || { time: '', unread: 0 };
  return {
    conversations: { ...state.conversations, [convId]: [...list, msg] },
    meta: {
      ...state.meta,
      [convId]: {
        time: msg.time || prevMeta.time,
        unread: activeConvId === convId ? 0 : prevMeta.unread + 1,
      },
    },
    order: bumpConversationOrder(state.order, convId),
  };
}

/** UI UserStatus → 引擎 status（SetSelf 用；off 不是可广播状态，映射为 away）。 */
export function uiStatusToPeer(status: Contact['status']): string {
  if (status === 'ok') return 'online';
  if (status === 'busy') return 'busy';
  return 'away';
}
