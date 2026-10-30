# 飞联 LANChat

> 复刻飞秋（FeiQ）的局域网即时通讯软件，兼容 IPMsg（飞鸽传书）协议，可与飞秋 / 飞鸽互发消息。

[![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![Wails](https://img.shields.io/badge/Wails-v2.17-ee3942)](https://wails.io)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue)](#)

## 为什么做

飞秋是内网办公里常用的聊天 / 传文件工具，但**免费且闭源**，无法二次开发。它完全兼容开源的飞鸽传书（IPMsg）协议，而该协议公开透明，因此按协议自行实现即可做出替代品，成品还能与飞秋、飞鸽**直接互通**。

目标：内网免服务器、点对点直连的聊天 + 文件传输工具，单文件 exe，开箱即用。

## 功能特性

- **自动发现**：启动即向局域网 UDP 2425 广播上线，维护在线用户列表，心跳保活、掉线超时判定
- **即时消息**：单聊文本（含 emoji）、「正在输入…」提示、未读角标、会话置顶、本地聊天记录
- **群聊与广播**：局域网广播一条达全员；本地分组群聊（自定义扩展）
- **文件传输**：TCP 2425 分块传输，支持多文件与整个文件夹，实时进度 / 速度卡片
- **联系人**：按部门分组，资料卡查看（IP / 主机名 / 签名）
- **屏幕截图**：全局热键 `Ctrl+Alt+A`，选区后复制或直接发送（规划中）
- **远程协助**：被控端确认后的屏幕流 + 鼠标键盘转发（后期阶段）

界面风格对标 QQ NT / 微信 4.0，UI 规范见 [DESIGN.md](DESIGN.md)。

## 技术栈

Go 1.26 + Wails v2.17 + React 19 + Vite + TypeScript + Tailwind 4，构建产物为**单文件 Windows exe**（无运行时依赖）。

## 快速开始

环境要求：Go 1.26+、Wails CLI v2.17、Node 22+。

```bash
# 克隆
git clone https://github.com/mantougg/feilian.git
cd feilian

# 日常开发（Go + 前端热重载）
wails dev

# 发布构建 → build/bin/feilian.exe
wails build
```

测试：

```bash
# Go 单测（协议编解码等）
go test ./engine/...

# 前端（浏览器纯预览形态，wailsBridge 自动降级）
cd frontend
npm run dev     # vite :3000
npm run lint    # tsc --noEmit
npm run test    # ipmsg / chatLogic 单测
```

> 局域网互通需放行防火墙 UDP / TCP 2425 端口。

## 目录结构

```
main.go            Wails 入口（无框窗口 1180×720）
app.go             绑定给前端的宿主能力（窗口控制、事件桥）
engine/            网络引擎层（纯 Go，不依赖 UI）
  protocol.go      IPMsg 命令码/选项位/编解码 + 飞联扩展码（有单测）
  engine.go        引擎门面：Config/Peer/Event/Engine
frontend/src/
  components/      三视图组件（TitleBar/NavRail/MiddleColumn/ChatPanel…）
  lib/wailsBridge.ts   window.go 调用唯一收口（浏览器降级）
  utils/           chatLogic 会话派生、ipmsg 协议参考镜像（均有单测）
docs/              需求 / 架构 / 任务拆解文档与里程碑执行清单
```

架构核心：引擎经 `chan Event` 吐事件 → `app.go` 转发为 Wails Events → 前端订阅渲染；前端只经绑定方法驱动引擎，单向数据流。详见[架构设计](docs/飞联-架构设计.md)。

## 文档导航

| 文档 | 用途 |
|---|---|
| [需求文档](docs/飞联-需求文档.md) | 做什么：功能需求 / 协议 / 里程碑 |
| [架构设计](docs/飞联-架构设计.md) | 怎么做：分层 / 协议 / 数据流 / 坑位 |
| [DESIGN.md](DESIGN.md) | UI 设计规范：设计令牌 / 组件规格 / 交互状态 |
| [任务拆解](docs/飞联-开发任务拆解.md) | M0–M5 任务总表与验收标准 |
| [任务总索引](docs/tasks/INDEX.md) | 进度仪表盘 + 全任务清单 |

## 路线图

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 工程骨架（Wails + React + 协议 Go 实现 + 首个 exe） | ✅ |
| M1 | 网络引擎（UDP 发现 + 文本消息 + 飞秋互通） | ✅ |
| M2 | UI 接引擎（mock 退场，真实收发） | ✅ |
| M3 | 文件传输（TCP 2425 + 文件夹 + 进度卡片） | ✅ |
| M4 | 体验完善（截图 / 托盘 / 通知 / 热键 / SQLite 记录） | ✅ |
| M5 | 群聊本地分组 / 记录搜索 / 限速分档（远程协助暂缓） | ✅ |

## 合规边界

只复刻功能与交互，不反编译飞秋，不使用其图标、名称与素材（功能不受版权保护）。
