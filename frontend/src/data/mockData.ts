import { Contact, ChatMessage, ConversationMeta, AppSettings } from '../types';

export const INITIAL_SELF: Contact = {
  id: 'self',
  char: '周',
  color: '#8b5cf6',
  name: '周舟',
  host: 'PC-ZHOU',
  ip: '192.168.1.8',
  dept: '研发中心',
  status: 'ok',
  sign: '持续交付，追求极简',
  isSelf: true,
};

export const INITIAL_CONTACTS: Record<string, Contact> = {
  self: INITIAL_SELF,
  group: {
    id: 'group',
    char: '群',
    color: '#0ea5e9',
    ip: '',
    dept: '研发团队',
    status: 'grp',
    name: '研发一群',
    host: '—',
    sign: '日常研发沟通群',
    isGroup: true,
    memberCount: 12,
  },
  bc: {
    id: 'bc',
    char: '播',
    color: '#0ea5e9',
    ip: '192.168.1.255',
    dept: '全员',
    status: 'bc',
    name: '局域网广播',
    host: '—',
    sign: '面向全网段的消息广播通道',
    isBroadcast: true,
  },
  zhang: {
    id: 'zhang',
    char: '张',
    color: '#6366f1',
    ip: '192.168.1.23',
    dept: '研发中心',
    status: 'ok',
    name: '张伟',
    host: 'PC-ZHANG',
    sign: '代码在精不在多',
  },
  wang: {
    id: 'wang',
    char: '王',
    color: '#f59e0b',
    ip: '192.168.1.41',
    dept: '研发中心',
    status: 'busy',
    name: '王强',
    host: 'PC-WANG',
    sign: '勿扰时段 14:00 - 18:00',
  },
  li: {
    id: 'li',
    char: '李',
    color: '#10b981',
    ip: '192.168.1.31',
    dept: '产品部',
    status: 'ok',
    name: '李婷',
    host: 'PC-LI',
    sign: '设计稿迭代中',
  },
  chen: {
    id: 'chen',
    char: '陈',
    color: '#94a3b8',
    ip: '192.168.1.55',
    dept: '产品部',
    status: 'off',
    name: '陈晨',
    host: 'PC-CHEN',
    sign: '',
  },
};

export const STATUS_LABELS: Record<string, string> = {
  ok: '在线',
  busy: '勿扰',
  off: '离线',
  bc: '广播',
  grp: '群聊',
};

export const STATUS_COLORS: Record<string, string> = {
  ok: '#22c55e',
  busy: '#ef4444',
  off: '#94a3b8',
  bc: '#4f46e5',
  grp: '#0ea5e9',
};

export const INITIAL_CONVERSATIONS: Record<string, ChatMessage[]> = {
  group: [
    { id: 'g1', t: 'chip', text: '今天 14:21' },
    { id: 'g2', t: 'them', who: 'wang', name: '王强 · 14:21', text: '提测分支我锁了，别往 dev 推代码' },
    { id: 'g3', t: 'them', who: 'zhang', name: '张伟 · 14:22', text: '知道了，我这边还剩两个 commit' },
    { id: 'g4', t: 'me', text: '收到，我下午跑一轮回归' },
  ],
  zhang: [
    { id: 'z1', t: 'chip', text: '今天 14:02' },
    { id: 'z2', t: 'them', who: 'zhang', name: '张伟 · 14:02', text: '联调环境我起好了，数据库指向 192.168.1.50 的测试库' },
    { id: 'z3', t: 'me', text: '收到。接口还差个分页参数，十分钟后提交' },
    { id: 'z4', t: 'file', from: 'them', who: 'zhang', fileName: '接口联调说明.docx', fileSize: '1.8 MB', fileDone: true },
    { id: 'z5', t: 'img', from: 'me', imgCap: '验收页面截图.png · 320 KB' },
    { id: 'z6', t: 'them', who: 'zhang', name: '张伟 · 14:06', text: '👍 这版样式没问题，可以提测了' },
    { id: 'z7', t: 'typing', who: 'zhang' },
  ],
  li: [
    { id: 'l1', t: 'chip', text: '今天 11:20' },
    { id: 'l2', t: 'them', who: 'li', name: '李婷 · 11:20', text: '新版视觉稿出了，你过一遍再提评审' },
    { id: 'l3', t: 'me', text: '正在收，下午给你反馈' },
    { id: 'l4', t: 'file', from: 'them', who: 'li', fileName: '视觉稿 v3.fig', fileSize: '18 MB', filePct: 78, fileSpeed: '4.2 MB/s' },
  ],
  chen: [
    { id: 'c1', t: 'chip', text: '昨天 18:44' },
    { id: 'c2', t: 'them', who: 'chen', name: '陈晨 · 18:44', text: '昨天的日志我发你邮箱了，记得看' },
  ],
  bc: [
    { id: 'b1', t: 'chip', text: '今天 10:00 · 局域网广播' },
    { id: 'b2', t: 'them', who: 'wang', name: '王强 · 10:00', text: '15:00 机房网络切换，大家提前保存手头工作' },
    { id: 'b3', t: 'me', text: '收到' },
  ],
};

export const INITIAL_CONVERSATION_META: Record<string, ConversationMeta> = {
  group: { time: '14:22', unread: 3 },
  zhang: { time: '14:06', unread: 0 },
  li: { time: '11:22', unread: 1 },
  bc: { time: '10:00', unread: 0 },
  chen: { time: '昨天', unread: 0 },
};

export const INITIAL_ORDER = ['group', 'zhang', 'li', 'bc', 'chen'];

export const INITIAL_SETTINGS: AppSettings = {
  darkMode: false,
  systemNotification: true,
  autoLaunch: false,
  language: '简体中文',
  saveDirectory: 'D:\\FeiLink\\接收',
  openFolderAfterTransfer: true,
  speedLimit: '不限速',
};

export const AUTOMATIC_REPLIES: Record<string, string[]> = {
  zhang: ['收到，我核对一下接口。', '好的，我看下联调日志。', '👌 没问题，马上更新！', '正在跑单元测试，稍等两分钟。'],
  li: ['收到，交互体验挺顺畅的！', '好的，我记在产品待办里。', '这一版视觉很有质感。', '下午开会过一下细节。'],
  wang: ['收到。目前在处理紧急缺陷。', '看到了，提交前别忘了运行回归。', '👌', '好的。'],
  chen: ['好的，等我回工位看看。', '收到。', '日志我已收到。'],
  group: ['收到！', '正在处理。', '👍', '收到，大家注意同步。'],
  bc: ['收到通知。', '已知悉。', '收到，谢谢提醒。'],
};
