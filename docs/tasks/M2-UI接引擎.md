# M2 UI 接引擎 — 子任务清单

> 来源：《[飞联-开发任务拆解.md](../飞联-开发任务拆解.md)》M2 节 · 状态图例：✅ 完成 ｜ 🔶 进行中 ｜ ⬜ 未开始
>
> **目标**：把 UI 从 mock 数据切到真实引擎事件，双开 exe 即可用原型里的全部交互。
> **前置**：M1 完成（至少 T-M1-5 事件桥）。
> **UI 基准**：根目录《[DESIGN.md](../../DESIGN.md)》。

## T-M2-1 数据层替换 ✅ <a id="T-M2-1"></a>

- [x] `frontend/src/data/mockData.ts` 退化为「我自己」的初始值
- [x] contacts / conversations 由引擎事件驱动构建
- [x] 空网络时显示空态

**验收**：UI 无 mock 依赖。✅（mock 只剩 self 占位 + 广播常量 + 状态色表；联系人 id = 引擎主键 `nick@host`；挂载时 GetPeers/GetSelf 拉快照，增量靠事件（T-M2-2）；联系人视图改按部门动态分组（chatLogic.groupContactsByDept 带单测）；无在线用户显示空态。顺带完成 T-M2-3 的「删除自动回复模拟」——AUTOMATIC_REPLIES 与 mock 会话一并退场）
**依赖**：T-M1-5。

## T-M2-2 事件订阅 ✅ <a id="T-M2-2"></a>

- [x] 封装 `useEngineEvents`（Wails `EventsOn` → React state）
- [x] 覆盖事件：peer_online / peer_offline / peer_update / message / receipt / typing

**验收**：上线/下线实时反映在联系人与会话列表。✅（六类事件全部接入：presence upsert 联系人、offline 标离线保留列表、message 走 applyIncomingMessage 纯函数、typing 指示 5s 自消、receipt 按 msgId 标送达。浏览器形态订阅降级 no-op。**待用户验证**：双开 exe 的实时性需人工确认，引擎侧事件流已由 M1 单测覆盖）
**依赖**：T-M1-5。**落点**：`frontend/src/hooks/useEngineEvents.ts`。

## T-M2-3 会话状态真实化 ✅ <a id="T-M2-3"></a>

- [x] 保留 `frontend/src/utils/chatLogic.ts`（置顶/未读计算已有单测）
- [x] 删除自动回复模拟逻辑（随 T-M2-1 mock 退场完成）

**验收**：新消息 → 未读+置顶+预览更新；打开会话清零。✅（新逻辑集中在 `applyIncomingMessage` 纯函数：追加气泡（清 typing 残留）+置顶+未读（会话打开时清零）+时间预览；16 个前端单测全过。打开清零在 handleSelectConv）
**依赖**：T-M2-2。

## T-M2-4 发送链路 ⬜ <a id="T-M2-4"></a>

- [ ] `handleSendMessage` → `SendText`
- [ ] 回执（receipt 事件）更新消息状态
- [ ] 失败（离线）行内提示

**验收**：双开 exe 互发消息全链路 OK。
**依赖**：T-M2-3。**落点**：`frontend/src/App.tsx` / `components/ChatPanel.tsx`。

## T-M2-5 正在输入 ⬜ <a id="T-M2-5"></a>

- [ ] 输入框停顿 500ms 发 `CmdFeiLinkTyping`
- [ ] 对端展示三点跳动动画（ChatPanel 已有样式）

**验收**：双开可见 typing 指示。
**依赖**：T-M1-4。

## T-M2-6 我的资料与状态 ⬜ <a id="T-M2-6"></a>

- [ ] `UserProfileModal` → `SetSelf`（昵称/部门/状态）
- [ ] 变更即广播 `CmdBrAbsence`

**验收**：A 改状态，B 侧徽标/资料即时变化。
**依赖**：T-M1-3。**落点**：`frontend/src/components/UserProfileModal.tsx`。

## T-M2-7 广播会话 ⬜ <a id="T-M2-7"></a>

- [ ] 联系人列表「局域网广播」→ `BroadcastText`
- [ ] 广播消息按来源人显示

**验收**：广播全员可见。
**依赖**：T-M1-4。

## M2 整体验收

《[DESIGN.md](../../DESIGN.md)》验收清单（六项）在**真实双开环境**下全部通过。
