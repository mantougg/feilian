# AGENTS.md — 飞联 LANChat 协作指南

「飞联 LANChat」：复刻飞秋（FeiQ）的局域网即时通讯软件，兼容 IPMsg 协议（UDP/TCP 2425），可与飞秋/飞鸽互发消息。技术栈 **Go 1.26 + Wails v2.17 + React 19 + Vite + Tailwind 4**，产物为单文件 Windows exe。

项目内所有沟通、代码注释、提交信息使用**中文**。

## 文档地图（docs/）

| 文档 | 用途 |
|---|---|
| [docs/tasks/INDEX.md](docs/tasks/INDEX.md) | **任务总索引**（进度仪表盘 + 全任务清单 + 依赖图，领任务从这里开始） |
| [docs/飞联-需求文档.md](docs/飞联-需求文档.md) | 做什么（功能需求 / 协议 / 里程碑） |
| [DESIGN.md](DESIGN.md)（根目录） | **UI 设计规范**：设计令牌 / 组件规格 / 交互状态 / Do-Don't / 验收清单（改 UI 必读） |
| [docs/飞联-架构设计.md](docs/飞联-架构设计.md) | 架构与关键设计决策（分层 / 协议 / 数据流 / 坑位） |
| [docs/飞联-开发任务拆解.md](docs/飞联-开发任务拆解.md) | M0–M5 任务总表（状态与依赖） |
| docs/tasks/M1~M5-*.md | 各里程碑**可勾选执行清单**，开工/完工都在这里更新状态 |
| .agents/skills/feilian-dev/ | 项目技能 `feilian-dev`：领任务 → 实现 → 验收 → 回写状态的完整流程，开发任务时优先触发 |

**接手任何任务前**：先读对应 `docs/tasks/M*.md` 清单与《飞联-开发任务拆解.md》中该任务的验收标准。

## 常用命令

```bash
# 日常开发（Go + 前端热重载）
wails dev

# 发布构建 → build/bin/feilian.exe（单文件）
wails build

# Go 单测（协议编解码等）
go test ./engine/...

# 前端（浏览器纯预览形态，wailsBridge 自动降级）
cd frontend && npm run dev     # vite :3000
npm run lint                   # tsc --noEmit
npm run test                   # tsx --test（ipmsg / chatLogic）
```

## 开发环境备忘（重要）

- Go 1.26.3（GOBIN 在 mise 目录）、Wails CLI v2.17.0、Node 22 + npm。
- Go 拉包必须 `GOPROXY=https://goproxy.cn,direct`（默认代理不可达）。

## 目录结构

```
main.go            Wails 入口（无框窗口 1180×720，embed frontend/dist）
app.go             绑定给前端的宿主能力（窗口控制；T-M1-5 起接事件桥）
engine/            ★ 网络引擎层：纯 Go，禁止 import Wails/UI
  protocol.go      IPMsg 命令码/选项位/编解码 + 飞联扩展码（有单测）
  engine.go        引擎门面：Config/Peer/Event/Engine（M1 逐任务实现）
frontend/src/
  components/      TitleBar/NavRail/MiddleColumn/ChatPanel/... 三视图组件
  lib/wailsBridge.ts   所有 window.go 调用的唯一收口（浏览器降级）
  utils/chatLogic.ts  会话派生逻辑纯函数（有单测，M2 直接复用）
  utils/ipmsg.ts      协议参考镜像（权威实现在 Go 侧）
  data/mockData.ts    M2 起退化为「我自己」初始值
DESIGN.md          根目录 UI 设计规范（令牌/组件/交互状态/验收清单）
docs/              需求/架构/拆解文档 + tasks/（INDEX 总索引 + 里程碑清单）
```

## 架构铁律（改代码前必读，详见 docs/飞联-架构设计.md §3）

1. **`engine/` 不依赖 UI**：不 import Wails、不 import frontend；CLI 联调模式（T-M1-6）是其验收手段。
2. **单向数据流**：引擎经 `chan Event` 吐事件 → `app.go` 转发为 Wails Events → 前端订阅；前端只通过绑定方法（`SendText`/`GetPeers`/`SetSelf`）驱动引擎，不反向写引擎状态。
3. **聊天对话框只存在于「消息」视图**：联系人/设置视图右侧绝不渲染 ChatPanel（UI 验收清单第 1 项）。
4. 新增飞联扩展命令码必须登记在 `engine/protocol.go` 扩展码段注释中，避免与 IPMsg 官方码冲突。

## 关键坑位

- Windows UDP 广播**必须**经 `net.ListenConfig` 的 Control 回调设置 `syscall.SO_BROADCAST`，否则 WriteTo 广播地址被拒（T-M1-1）。
- 多网卡环境要枚举网卡取各网段定向广播地址，不能只发 255.255.255.255。
- 飞秋报文编码可能是 GBK，互通验证时按首包探测转换（T-M1-7）。
- 防火墙需放行 UDP 2425；冒烟测试若发现不通先查防火墙。

## 工作约定

- **任务状态**：✅ 完成 ｜ 🔶 进行中 ｜ ⬜ 未开始。开工时把任务标 🔶，完工标 ✅ 并勾选 `docs/tasks/M*.md` 子步骤；状态在**三处同步**——`docs/tasks/INDEX.md` 任务行、任务清单标题、《飞联-开发任务拆解.md》总表。开发任务优先走 `feilian-dev` 技能的完整流程。
- 代码注释密度与现有文件保持一致（解释「为什么/约束」，不解释「做了什么」）。
- 协议与会话逻辑改动必须带单测（`engine/*_test.go` / `frontend/src/utils/*.test.ts`）。
- 不引入 admin 组件库；聊天界面组件手写，风格对标 QQ NT / 微信 4.0；颜色/字号/圆角一律用 `frontend/src/index.css` 的 CSS 变量，UI 规范见根目录 DESIGN.md。
- 待定问题（飞秋互通深度、聊天记录存储形态、群聊形态、断点续传）在动手对应任务前先与用户确认，不要自行拍板。
