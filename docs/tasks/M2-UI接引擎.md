# M2 UI 接引擎 — 子任务清单

> 来源：《[飞联-开发任务拆解.md](../飞联-开发任务拆解.md)》M2 节 · 状态图例：✅ 完成 ｜ 🔶 进行中 ｜ ⬜ 未开始
>
> **目标**：把 UI 从 mock 数据切到真实引擎事件，双开 exe 即可用原型里的全部交互。
> **前置**：M1 完成（至少 T-M1-5 事件桥）。
> **UI 基准**：根目录《[DESIGN.md](../../DESIGN.md)》。

## T-M2-1 数据层替换 ⬜ <a id="T-M2-1"></a>

- [ ] `frontend/src/data/mockData.ts` 退化为「我自己」的初始值
- [ ] contacts / conversations 由引擎事件驱动构建
- [ ] 空网络时显示空态

**验收**：UI 无 mock 依赖。
**依赖**：T-M1-5。

## T-M2-2 事件订阅 ⬜ <a id="T-M2-2"></a>

- [ ] 封装 `useEngineEvents`（Wails `EventsOn` → React state）
- [ ] 覆盖事件：peer_online / peer_offline / peer_update / message / receipt / typing

**验收**：上线/下线实时反映在联系人与会话列表。
**依赖**：T-M1-5。**落点**：`frontend/src/lib/` 或 `frontend/src/hooks/` 新文件。

## T-M2-3 会话状态真实化 ⬜ <a id="T-M2-3"></a>

- [ ] 保留 `frontend/src/utils/chatLogic.ts`（置顶/未读计算已有单测）
- [ ] 删除自动回复模拟逻辑

**验收**：新消息 → 未读+置顶+预览更新；打开会话清零。
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
