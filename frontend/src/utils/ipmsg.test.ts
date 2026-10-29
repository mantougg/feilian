import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIPMsgPacket,
  serializeIPMsgPacket,
  IPMSG_BR_ENTRY,
  IPMSG_SENDMSG,
  createOnlineBroadcastPacket,
  createMessagePacket,
} from './ipmsg';

test('IPMsg protocol serialize and parse roundtrip', () => {
  const original = {
    version: 1,
    packetNo: 12345678,
    senderNick: '周舟',
    senderHost: 'PC-ZHOU',
    command: IPMSG_SENDMSG,
    extra: '你好，局域网测试消息:with:colons',
  };

  const wireString = serializeIPMsgPacket(original);
  assert.equal(wireString, '1:12345678:周舟:PC-ZHOU:32:你好，局域网测试消息:with:colons');

  const parsed = parseIPMsgPacket(wireString);
  assert.notEqual(parsed, null);
  assert.equal(parsed?.version, 1);
  assert.equal(parsed?.packetNo, 12345678);
  assert.equal(parsed?.senderNick, '周舟');
  assert.equal(parsed?.senderHost, 'PC-ZHOU');
  assert.equal(parsed?.command, IPMSG_SENDMSG);
  assert.equal(parsed?.extra, '你好，局域网测试消息:with:colons');
});

test('parseIPMsgPacket handles invalid strings gracefully', () => {
  assert.equal(parseIPMsgPacket(''), null);
  assert.equal(parseIPMsgPacket('1:2:3'), null);
  assert.equal(parseIPMsgPacket('abc:def:gh:ij:kl:mn'), null);
});

test('createOnlineBroadcastPacket builds correct structure', () => {
  const packet = createOnlineBroadcastPacket('周舟', 'PC-ZHOU', '研发中心');
  assert.equal(packet.version, 1);
  assert.equal(packet.senderNick, '周舟');
  assert.equal(packet.senderHost, 'PC-ZHOU');
  assert.equal(packet.command, IPMSG_BR_ENTRY);
  assert.equal(packet.extra, '研发中心');
  assert.ok(packet.packetNo > 0);
});

test('createMessagePacket sets broadcast flag when isBroadcast is true', () => {
  const normalMsg = createMessagePacket('周舟', 'PC-ZHOU', '单聊测试', false);
  const broadcastMsg = createMessagePacket('周舟', 'PC-ZHOU', '全网广播', true);

  assert.equal((broadcastMsg.command & 0x00000400) !== 0, true);
  assert.equal((normalMsg.command & 0x00000400) !== 0, false);
});
