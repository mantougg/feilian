import { ChatMessage, Contact, ConversationMeta } from '../types';

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
