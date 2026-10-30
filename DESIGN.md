---
version: alpha
name: feilian-design-system
description: 飞联 LANChat 桌面客户端 UI 设计规范（Wails 无框窗口 + React 19 + Tailwind 4）
colors:
  primary: "#4F46E5"
  primary-dark: "#7C7FF2"
  on-primary: "#FFFFFF"
  bg: "#ECEEF2"
  bg-dark: "#141519"
  surface: "#FFFFFF"
  surface-dark: "#1E2026"
  surface-alt: "#F4F5F8"
  surface-alt-dark: "#262932"
  border: "#E3E5EA"
  border-dark: "#2C3038"
  text: "#1F2329"
  text-dark: "#E7E9EE"
  text-muted: "#697180"
  text-muted-dark: "#A2AAB6"
  accent-soft: "rgba(79, 70, 229, 0.10)"
  accent-soft-dark: "rgba(124, 127, 242, 0.16)"
  success: "#22C55E"
  danger: "#EF4444"
  busy: "#EF4444"
  offline: "#697180"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1.4
  micro:
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  secondary:
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  body-strong:
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  title:
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  heading:
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
rounded:
  none: 0px
  xs: 6px
  sm: 8px
  md: 10px
  lg: 13px
  xl: 18px
  window: 14px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    height: 32px
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  button-primary-active:
    backgroundColor: "{colors.primary-dark}"
  button-primary-disabled:
    backgroundColor: "{colors.text-muted}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    borderColor: "{colors.border}"
    rounded: "{rounded.sm}"
    height: 32px
  button-outline-hover:
    backgroundColor: "{colors.surface-alt}"
  icon-button:
    backgroundColor: transparent
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    size: 28px
  icon-button-hover:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text}"
  nav-item:
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    height: 48px
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.primary}"
  conversation-row:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    height: 56px
    padding: 12px
  conversation-row-hover:
    backgroundColor: "{colors.surface-alt}"
  conversation-row-active:
    backgroundColor: "{colors.accent-soft}"
  avatar:
    rounded: "{rounded.lg}"
    size: 38px
  avatar-sm:
    rounded: "{rounded.md}"
    size: 30px
  avatar-lg:
    rounded: "{rounded.xl}"
    size: 64px
  status-dot:
    rounded: "{rounded.full}"
    size: 10px
    backgroundColor: "{colors.success}"
  bubble-in:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    typography: "{typography.body}"
  bubble-out:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    typography: "{typography.body}"
  badge-unread:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    typography: "{typography.caption}"
  toggle-on:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.full}"
    height: 21px
    width: 36px
  toggle-off:
    backgroundColor: "{colors.text-muted}"
    rounded: "{rounded.full}"
    height: 21px
    width: 36px
  search-input:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 12px
  modal-card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
  file-card-done:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: 12px
  progress-bar:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.full}"
    height: 6px
---

# 飞联 LANChat — UI 设计规范（DESIGN.md）

> 权威实现落点：`frontend/src/index.css`（令牌）+ `frontend/src/components/`（组件）。修改 UI 前先读本规范；令牌与组件的机器可读定义见上方 frontmatter，深浅双主题按 `-dark` 键映射切换。

## Overview

- **定位**：对标 QQ NT / 微信 4.0 桌面端的三段式即时通讯界面——窄导航竖栏 + 列表列 + 主内容区。
- **载体**：Wails v2 无框窗口 + React 19 + Tailwind 4 + TypeScript；聊天组件手写，**不引入 admin 组件库**。
- **设计原则**：大圆角、细边框、柔和 hover、克制的动效；杜绝后台管理系统式外观。
- **主题**：默认跟随系统深浅色（`color-scheme: light dark`），CSS 变量切换；标题栏日/月按钮与设置页开关**双向同步**。
- **三个视图**：消息 / 联系人 / 设置，右侧主区与中列**成对切换**；聊天对话框只存在于「消息」视图。
- **组件映射**：TitleBar / NavRail / MiddleColumn（三态中列）/ ChatPanel / ContactDetailPanel / SettingsPanel / ScreenshotModal / RemoteAssistModal / UserProfileModal，均在 `frontend/src/components/`。

## Colors

所有颜色一律使用 CSS 变量（`var(--*)`），禁止硬编码色值。深色主题取同名 `-dark` 令牌。

| 令牌 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--bg` | `#ECEEF2` | `#141519` | 窗口底色 |
| `--panel` | `#FFFFFF` | `#1E2026` | 卡片/面板/对方气泡底 |
| `--panel2` | `#F4F5F8` | `#262932` | 次级底（输入框、hover 面） |
| `--line` | `#E3E5EA` | `#2C3038` | 细边框、分隔线 |
| `--text` | `#1F2329` | `#E7E9EE` | 主文字 |
| `--mut` | `#697180` | `#A2AAB6` | 次要文字、离线态 |
| `--acc` | `#4F46E5` | `#7C7FF2` | 主色（靛蓝）：选中、主按钮、自己气泡 |
| `--accfg` | `#FFFFFF` | `#FFFFFF` | accent 上的前景文字 |
| `--accsoft` | `rgba(79,70,229,.10)` | `rgba(124,127,242,.16)` | 选中态浅底 |
| `--ok` | `#22C55E` | `#22C55E` | 在线绿、成功 |
| `--busy` | `#EF4444` | `#EF4444` | 勿扰红 |
| `--danger` | `#EF4444` | `#EF4444` | 危险/未读/关闭按钮 hover |

状态色语义：在线 `#22C55E`、勿扰 `#EF4444`、离开/离线用 `--mut` 灰；未读角标与勿扰同红。

## Typography

全局字体栈见 `typography.body`（系统栈，中文优先 PingFang SC / Microsoft YaHei，不引入外部网络字体——单文件 exe 离线运行）。

| 样式 | 字号/字重 | 用途 |
|---|---|---|
| `caption` | 10px / 500 | 导航标签、状态徽标小字 |
| `micro` | 11px / 400 | 时间戳、「姓名 · 时间」副行、IP/状态行 |
| `secondary` | 12px / 400 | 次要说明、预览文字 |
| `body` | 13px / 400 | 正文/消息默认 |
| `body-strong` | 14px / 500 | 列表名称、设置行 |
| `title` | 16px / 600 | 弹窗标题 |
| `heading` | 18px / 600 | 资料面板姓名 |

## Layout

- **窗口**：默认 1180×720，最小 720×520；无框窗口 + 自定义标题栏（42px，可拖动 `--wails-draggable`）；窗口圆角 14px（`rounded.window`）。
- **标题栏**：左「飞」logo + 窗口副标题；右依次为主题切换（日/月图标）、最小化、最大化、关闭（hover 红 `--danger`）。
- **三段式横向布局**（标题栏下方）：
  1. 导航竖栏 64px；
  2. 中列 258px（窄屏 220px）；
  3. 右侧主区随窗口伸缩。
- **聊天面板**：头部 54px（头像 + 姓名 + 状态副行「状态点 · IP · 部门」+ 动作按钮：截图/发文件/发文件夹/远程协助/更多；更多菜单含「请求窗口抖动」）。
- **资料面板信息卡**：label 列宽 64px（部门 / IP 地址 / 主机名 / 个性签名 四行）。
- **弹性**：空隙用 flex 撑开，不写死宽度；主区内容 `min-w-0` 保证省略号生效。

### Responsive

| 断点 | 行为 |
|---|---|
| ≥ 920px | 标准布局，中列 258px |
| < 920px | 中列收窄至 220px |
| < 660px | 隐藏导航竖栏与中列，仅保留聊天区 |

桌面 IM 优先，不做移动端断点；窗口最小尺寸 720×520。

### Spacing

基数 4px，档位见 `spacing` 令牌（xs 4 / sm 8 / md 12 / lg 16 / xl 20 / 2xl 24）。列表行与卡片内边距取 12~16；区块间 16~24。全局 `box-sizing: border-box`，杜绝列表横向滚动条。

## Elevation & Depth

- 以**细边框**（`--line` 1px）分层为主，不依赖重阴影——保持克制扁平。
- 弹窗/悬停卡片允许极轻阴影（黑色 4%~8% 透明度、大模糊半径）；关闭按钮 hover 红是唯一强警示色块。
- 滚动条 6px：thumb 用 `--line` 圆胶囊，hover 变 `--mut`，轨道透明。

## Shapes

圆角刻度见 `rounded` 令牌：

| 档位 | 值 | 场景 |
|---|---|---|
| `none` | 0 | 无 |
| `xs` | 6px | 极小控件 |
| `sm` | 8px | 按钮（小控件 7px 取近值） |
| `md` | 10px | 输入框、30px 小头像 |
| `lg` | 13px | 卡片 / 面板 / 弹窗 / 38px 会话头像 |
| `xl` | 18px | 64px 资料大头像 |
| `window` | 14px | 窗口外框 |
| `full` | 999px | 胶囊（chip / 角标 / kbd / 开关 / 进度条） |

## Components

机器可读的组件令牌（含 `-hover` / `-active` / `-disabled` 交互状态变体）见文件头部 frontmatter 的 `components:` 组。以下是行为与结构规格：

### NavRail 导航竖栏

自上而下：「飞」logo（accent 底圆角方块）→ 消息（message-circle，20px 图标 + 10px 标签）→ 联系人（users）→ 弹性空隙 → 设置（settings）→ 底部我的头像（紫色圆角方块 + 在线状态点）。选中态 = `nav-item-active`（accent 图标 + `--accsoft` 浅底）；消息项右上角红色未读角标（`badge-unread`），进入会话实时递减，归零隐藏。

### Avatar 头像

圆角方形（`avatar` 38px / `avatar-sm` 30px / `avatar-lg` 64px），首字汉字白字，每人固定色相（靛/翠/琥珀/紫…）；群聊用 users 图标、广播用 radio 图标；右下角 10px 状态点（带 panel 描边，在线绿/勿扰红/离线灰）。不用圆形头像（品牌识别点）。

### ConversationRow 会话行（消息视图中列）

头像（38px + 状态点）｜名称（`body-strong`）｜时间（右上，`micro`）｜预览（单行省略，`secondary`）｜未读红角标（右下）。hover = `conversation-row-hover`；选中 = `conversation-row-active`。点击 = 打开会话并清零未读；收发消息后自动置顶并刷新预览与时间；排序按最近活跃。类型：单聊、群聊（users 头像）、局域网广播（radio 头像）。

### MessageBubble 消息气泡

对方居左 = `bubble-in`（panel 底 + 细边框），自己居右 = `bubble-out`（accent 底白字）；带 30px 小头像；对方消息上方「姓名 · 时间」`micro` 小字；群聊每条消息独立显示发送者头像与姓名；日期分隔为居中胶囊 chip。入场动画见 Motion。

### FileTransferCard 文件传输卡片

文件图标 + 文件名 + 两态：完成 = 绿对勾「已接收」+ 大小 + 「打开文件夹」链接（`--ok`）；进行中 = 大小 + 实时速度 + 百分比进度条（`progress-bar`，accent 填充）。

### ImageMessage 图片消息

缩略图占位 +「文件名 · 大小」说明条（`secondary`）。

### TypingIndicator 正在输入

三点跳动动画气泡（1.2s 循环，三点错峰 0.2s），出现在对方消息流末尾。

### Composer 输入区

工具栏图标按钮（表情 / 图片 / 截图 / 文件 / 聊天记录）+ 多行输入框（`search-input` 同款：`--panel2` 底、圆角 10px）+「发送」按钮（`button-primary`，圆角 8px）。**Enter 发送、Shift+Enter 换行**；输入停顿 500ms 触发 typing 事件（M2）；无会话或发送中时按钮置灰（`button-primary-disabled`）。

### ContactRow 联系人行（联系人中列）

分组：「群聊与广播」置顶，其后按部门分组；「周舟（我）」条目不可点击。行内容：头像 + 状态点｜姓名｜`IP · 状态`（`micro`，勿扰为红点）。hover/选中态同 ConversationRow；列表底部提示「单击查看资料 · 双击直接进入会话」。**单击** = 仅切换右侧资料面板；**双击**或点「发消息」= 切回消息视图并打开会话。

### ContactDetailPanel 联系人资料面板

64px 大头像（`avatar-lg`）+ 姓名（`heading`）+「状态 · 部门」副行；信息卡（panel 底）：部门 / IP 地址 / 主机名 / 个性签名四行，label 列 64px；操作按钮行：**发消息**（`button-primary`）、**发文件**、**远程协助**（`button-outline`）。

### SettingsPanel 设置面板

中列：我的资料卡（头像 + 姓名 + `主机名 · IP`）+ 菜单（通用 / 文件与传输 / 快捷键 / 关于）。右区按菜单切换的卡片式行布局。开关 = `toggle-on` / `toggle-off`（36×21 胶囊，关闭态深灰轨道 + 浅色圆钮保证两主题可辨识，过渡约 150ms）；快捷键用 kbd 胶囊（`--panel2` 底、`rounded.full`）。深色模式开关必须真实生效并与标题栏日/月按钮双向同步。

### Button / SearchInput / Modal

- `button-primary`：accent 底白字；hover/active 加深为 `primary-dark`；disabled 灰。
- `button-outline`：描边 `--line`、hover 变 `--panel2` 底。
- `icon-button`：无底图标按钮，hover 显 `--panel2` 圆角底；标题栏关闭按钮 hover 红 `--danger`。
- `search-input`：会话列表顶部，占位「搜索」，聚焦不加边框高亮（保持柔和）。
- `modal-card`：居中卡片 + 半透明遮罩，入场淡入缩放约 150ms（ScreenshotModal / RemoteAssistModal / UserProfileModal）。

## Do's and Don'ts

**Do**

- 新组件先用本规范令牌（`var(--*)`）与 `components:` 规格；对齐 QQ NT / 微信 4.0 的克制风格。
- 每个可交互组件显式定义 hover / active / disabled 三态（frontmatter 用 `-hover` / `-active` / `-disabled` 兄弟变体登记）。
- 选中/激活态用 accent 或 `--accsoft`（10%~16% 透明浅底）；文本省略链路配 `min-w-0`。

**Don't**

- 不引入 admin 组件库（antd/Element 等）；不硬编码颜色（一律 CSS 变量）；不用纯黑/纯白做边框。
- 不引入外部网络字体；不用奇数间距、负 margin 造重叠；不做重动效。
- 联系人/设置视图右侧不渲染 ChatPanel（三视图互斥）。

### 验收清单（UI 全量验收，M2 以真实双开环境复验）

1. 三视图互斥切换：联系人/设置视图下右侧**不出现**聊天对话框。
2. 会话未读：初始角标数量正确，打开会话即清零，竖栏角标同步。
3. 发送消息：Enter 发送、会话置顶、预览与时间更新。
4. 单击联系人仅选中；双击（或发消息按钮）跳转消息视图并开对话。
5. 设置菜单分页切换；深色模式开关与标题栏按钮联动生效。
6. 深浅色两套主题下无重叠、无溢出、无横向滚动条，对比度达标。

## Motion

- 入场动画 180ms 上移 6px 淡入（`cubic-bezier(0.16,1,0.3,1)`，见 `v1in`）。
- typing 三点 1.2s 循环错峰；开关/按钮过渡约 150ms。
- 收到窗口抖动请求时主界面左右轻移 650ms；`prefers-reduced-motion` 下不播放。
- `prefers-reduced-motion: reduce` 时全局关闭动画。
