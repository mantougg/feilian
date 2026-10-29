import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bumpConversationOrder,
  calculateTotalUnread,
  getConversationPreview,
  filterContacts,
} from './chatLogic';
import { ChatMessage, Contact } from '../types';

test('bumpConversationOrder moves target to index 0 without duplicates', () => {
  const initial = ['group', 'zhang', 'li', 'bc', 'chen'];
  const updated = bumpConversationOrder(initial, 'li');
  assert.deepEqual(updated, ['li', 'group', 'zhang', 'bc', 'chen']);

  const updatedTop = bumpConversationOrder(updated, 'li');
  assert.deepEqual(updatedTop, ['li', 'group', 'zhang', 'bc', 'chen']);
});

test('calculateTotalUnread sums unread counts across all conversations', () => {
  const meta = {
    group: { time: '14:22', unread: 3 },
    zhang: { time: '14:06', unread: 0 },
    li: { time: '11:22', unread: 1 },
    bc: { time: '10:00', unread: 0 },
  };
  assert.equal(calculateTotalUnread(meta), 4);

  // Cleared conversation
  meta.li.unread = 0;
  meta.group.unread = 0;
  assert.equal(calculateTotalUnread(meta), 0);
});

test('getConversationPreview formats text, file and image correctly', () => {
  const contactsMap: Record<string, Contact> = {
    zhang: {
      id: 'zhang',
      char: '张',
      name: '张伟',
      color: '#6366f1',
      ip: '192.168.1.23',
      dept: '研发中心',
      status: 'ok',
      host: 'PC-ZHANG',
    },
  };

  const msgs1: ChatMessage[] = [
    { id: '1', t: 'chip', text: '今天 14:02' },
    { id: '2', t: 'them', who: 'zhang', text: '接口联调顺利' },
  ];
  assert.equal(getConversationPreview(msgs1, contactsMap, 'zhang'), '接口联调顺利');

  const msgsFile: ChatMessage[] = [
    { id: '1', t: 'file', fileName: '项目说明.docx', fileSize: '1.2MB' },
  ];
  assert.equal(getConversationPreview(msgsFile, contactsMap, 'zhang'), '[文件] 项目说明.docx');

  const msgsImg: ChatMessage[] = [
    { id: '1', t: 'img', imgCap: '截图.png · 450 KB' },
  ];
  assert.equal(getConversationPreview(msgsImg, contactsMap, 'zhang'), '[图片] 截图.png');

  const msgsMe: ChatMessage[] = [
    { id: '1', t: 'me', text: '测试发送' },
  ];
  assert.equal(getConversationPreview(msgsMe, contactsMap, 'zhang'), '我: 测试发送');
});

test('filterContacts matches name, IP, dept, and hostname', () => {
  const contacts: Contact[] = [
    { id: 'zhang', char: '张', name: '张伟', color: '#6366f1', ip: '192.168.1.23', dept: '研发中心', status: 'ok', host: 'PC-ZHANG' },
    { id: 'li', char: '李', name: '李婷', color: '#10b981', ip: '192.168.1.31', dept: '产品部', status: 'ok', host: 'PC-LI' },
    { id: 'wang', char: '王', name: '王强', color: '#f59e0b', ip: '192.168.1.41', dept: '研发中心', status: 'busy', host: 'PC-WANG' },
  ];

  assert.equal(filterContacts(contacts, '张伟').length, 1);
  assert.equal(filterContacts(contacts, '192.168.1.31').length, 1);
  assert.equal(filterContacts(contacts, '研发中心').length, 2);
  assert.equal(filterContacts(contacts, 'PC-WANG').length, 1);
  assert.equal(filterContacts(contacts, '不存在').length, 0);
  assert.equal(filterContacts(contacts, '').length, 3);
});
