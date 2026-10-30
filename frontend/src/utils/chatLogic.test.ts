import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bumpConversationOrder,
  calculateTotalUnread,
  getConversationPreview,
  filterContacts,
  peerId,
  peerStatusToUi,
  peerToContact,
  groupContactsByDept,
  applyIncomingMessage,
  type ConversationState,
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

// ---- M2：引擎 peer → 联系人派生 ----

test('peerId 拼接 nick@host 主键', () => {
  assert.equal(peerId({ nick: '张伟', host: 'PC-A', ip: '', port: 2425, dept: '', status: '' }), '张伟@PC-A');
});

test('peerStatusToUi 映射：online→ok，busy/away→busy，其余→off', () => {
  assert.equal(peerStatusToUi('online'), 'ok');
  assert.equal(peerStatusToUi('busy'), 'busy');
  assert.equal(peerStatusToUi('away'), 'busy');
  assert.equal(peerStatusToUi('offline'), 'off');
  assert.equal(peerStatusToUi(''), 'off');
});

test('peerToContact 生成完整 Contact（首字符头像/稳定底色/部门兜底）', () => {
  const c = peerToContact({ nick: '张伟', host: 'PC-ZHANG', ip: '192.168.1.23', port: 2425, dept: '', status: 'online' });
  assert.equal(c.id, '张伟@PC-ZHANG');
  assert.equal(c.name, '张伟');
  assert.equal(c.char, '张');
  assert.equal(c.dept, '未分组');
  assert.equal(c.status, 'ok');
  // 同一昵称+主机多次派生颜色稳定
  const c2 = peerToContact({ nick: '张伟', host: 'PC-ZHANG', ip: 'x', port: 1, dept: '', status: '' });
  assert.equal(c.color, c2.color);
});

test('groupContactsByDept 按部门分组并排除广播/群聊', () => {
  const contacts: Record<string, Contact> = {
    bc: { id: 'bc', char: '播', name: '广播', color: '#000', ip: '', dept: '全员', status: 'bc', host: '' , isBroadcast: true },
    a: { id: 'a', char: '张', name: '张伟', color: '#000', ip: '', dept: '研发中心', status: 'ok', host: '' },
    b: { id: 'b', char: '王', name: '王强', color: '#000', ip: '', dept: '研发中心', status: 'busy', host: '' },
    c: { id: 'c', char: '李', name: '李婷', color: '#000', ip: '', dept: '产品部', status: 'ok', host: '' },
    d: { id: 'd', char: '陈', name: '陈晨', color: '#000', ip: '', dept: '', status: 'off', host: '' },
  };
  const groups = groupContactsByDept(contacts);
  assert.deepEqual(groups.map((g) => g.dept), ['产品部', '未分组', '研发中心']); // zh-Hans-CN 排序
  assert.equal(groups.find((g) => g.dept === '研发中心')!.members.length, 2);
  assert.equal(groups.find((g) => g.dept === '未分组')!.members[0].name, '陈晨');
  assert.ok(!groups.some((g) => g.dept === '全员'));
});

// ---- M2：入站消息应用（T-M2-3 验收：未读+置顶+预览更新；打开清零） ----

function emptyConvState(): ConversationState {
  return { conversations: {}, meta: {}, order: ['bc'] };
}

test('applyIncomingMessage 新会话：追加消息、置顶、未读+1、时间预览', () => {
  const r = applyIncomingMessage(emptyConvState(), '张伟@PC-A', { id: 'm1', t: 'them', text: '在吗', time: '10:00' }, '');
  assert.deepEqual(r.order, ['张伟@PC-A', 'bc']); // 置顶
  assert.equal(r.conversations['张伟@PC-A'].length, 1);
  assert.equal(r.meta['张伟@PC-A'].unread, 1);
  assert.equal(r.meta['张伟@PC-A'].time, '10:00'); // 预览时间
});

test('applyIncomingMessage 会话打开时不计未读，未打开累加', () => {
  let s = applyIncomingMessage(emptyConvState(), 'a@A', { id: 'm1', t: 'them', text: '1', time: '10:00' }, '');
  s = applyIncomingMessage(s, 'a@A', { id: 'm2', t: 'them', text: '2', time: '10:01' }, 'a@A'); // 已打开
  assert.equal(s.meta['a@A'].unread, 0); // 打开会话期间收消息清零（正看着）
  assert.equal(s.meta['a@A'].time, '10:01');
  s = applyIncomingMessage(s, 'a@A', { id: 'm3', t: 'them', text: '3', time: '10:02' }, 'b@B'); // 切走后
  assert.equal(s.meta['a@A'].unread, 1);
});

test('applyIncomingMessage 清除对端 typing 残留', () => {
  let s = emptyConvState();
  s.conversations['a@A'] = [
    { id: 'm1', t: 'them', text: '1', time: '10:00' },
    { id: 'typing_a@A', t: 'typing', who: 'a@A' },
  ];
  s = applyIncomingMessage(s, 'a@A', { id: 'm2', t: 'them', text: '2', time: '10:01' }, '');
  assert.equal(s.conversations['a@A'].length, 2); // typing 被替换
  assert.ok(!s.conversations['a@A'].some((m) => m.t === 'typing'));
});

test('打开会话即清零未读（handleSelectConv 语义的纯函数表达）', () => {
  let s = applyIncomingMessage(emptyConvState(), 'a@A', { id: 'm1', t: 'them', text: '1', time: '10:00' }, '');
  s.meta['a@A'] = { ...s.meta['a@A'], unread: 0 };
  assert.equal(s.meta['a@A'].unread, 0);
});
