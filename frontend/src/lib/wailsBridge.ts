/**
 * Wails 宿主桥接层。
 * 在浏览器直接 `npm run dev` 预览时 window.go 不存在，全部优雅降级为空操作，
 * 界面保留浏览器演示形态（带假窗口边框）；在 Wails 桌面运行时走真实窗口控制。
 */

/** 引擎事件（engine.Event 经 Wails EventsEmit 的 payload，小写 tag）。 */
export interface EngineEvent {
  type: string;
  peer: {
    nick: string;
    host: string;
    ip: string;
    port: number;
    dept: string;
    status: string; // online | busy | away | offline
    lastSeen?: string;
  };
  msgId: string;
  text: string;
  time: string;
  broadcast?: boolean; // 局域网广播消息（路由到 bc 会话）
  files?: FileEntryWire[]; // 文件请求条目（file_request 事件）
  progress?: number; // 0-100（file_progress 事件）
}

/** engine.FileEntry 的线格式（attr 十六进制字符串转的数值）。 */
export interface FileEntryWire {
  id: number;
  name: string;
  size: number;
  mtime: number;
  attr: number; // 0x11 文件 / 0x13 目录（17/19）
  relPath?: string;
}

interface WailsHost {
  go?: {
    main?: {
      App?: {
        Minimize?: () => void;
        ToggleMaximize?: () => void;
        CloseWindow?: () => void;
        GetPeers?: () => Promise<EngineEvent['peer'][]>;
        SendText?: (ip: string, text: string) => Promise<string>;
        SendTyping?: (ip: string) => Promise<void>;
        BroadcastText?: (text: string) => Promise<void>;
        GetSelf?: () => Promise<SelfInfo>;
        SetSelf?: (nick: string, dept: string, status: string) => Promise<void>;
        PickFiles?: () => Promise<string[]>;
        PickFolder?: () => Promise<string>;
        SendFiles?: (ip: string, text: string, paths: string[]) => Promise<string>;
        AcceptFiles?: (reqId: string) => Promise<void>;
        RejectFiles?: (reqId: string) => Promise<void>;
        OpenPath?: (path: string) => Promise<void>;
        GetRecvDir?: () => Promise<string>;
        CaptureScreen?: () => Promise<string>;
        SaveScreenshot?: (pngData: string) => Promise<string>;
      };
    };
  };
  runtime?: {
    EventsOn?: (name: string, callback: (data: EngineEvent) => void) => () => void;
  };
}

function host(): WailsHost {
  return window as unknown as WailsHost;
}

export function isDesktop(): boolean {
  return Boolean(host().go?.main?.App);
}

export function minimizeWindow(): void {
  host().go?.main?.App?.Minimize?.();
}

export function toggleMaximizeWindow(): void {
  host().go?.main?.App?.ToggleMaximize?.();
}

export function closeWindow(): void {
  host().go?.main?.App?.CloseWindow?.();
}

// ---- 引擎桥接（T-M2 起）：浏览器形态一律降级为空数据 ----

export async function getPeers(): Promise<EngineEvent['peer'][]> {
  return (await host().go?.main?.App?.GetPeers?.()) ?? [];
}

export interface SelfInfo {
  nick: string;
  hostname: string;
  ip: string;
  dept: string;
  status: string;
}

export async function getSelf(): Promise<SelfInfo> {
  return (
    (await host().go?.main?.App?.GetSelf?.()) ?? {
      nick: '浏览器预览',
      hostname: 'browser',
      ip: '127.0.0.1',
      dept: '未分组',
      status: 'online',
    }
  );
}

export async function setSelf(nick: string, dept: string, status: string): Promise<void> {
  await host().go?.main?.App?.SetSelf?.(nick, dept, status);
}

/** 返回报文序号（回执关联用）；浏览器形态返回空串（无回执）。 */
export async function sendText(ip: string, text: string): Promise<string> {
  return (await host().go?.main?.App?.SendText?.(ip, text)) ?? '';
}

/** 「正在输入」提示（飞联扩展，尽力而为）。 */
export async function sendTyping(ip: string): Promise<void> {
  await host().go?.main?.App?.SendTyping?.(ip);
}

export async function broadcastText(text: string): Promise<void> {
  await host().go?.main?.App?.BroadcastText?.(text);
}

/** 订阅引擎事件（Wails EventsOn 透传）；浏览器形态立即返回取消空函数。 */
export function onEngineEvent(name: string, cb: (ev: EngineEvent) => void): () => void {
  const off = host().runtime?.EventsOn?.(name, cb);
  return off ?? (() => undefined);
}

// ---- 文件传输（T-M3-5）；浏览器形态全部降级为空操作 ----

/** 弹出文件选择，返回路径列表（浏览器形态返回空 = 用户取消）。 */
export async function pickFiles(): Promise<string[]> {
  return (await host().go?.main?.App?.PickFiles?.()) ?? [];
}

/** 弹出目录选择（浏览器形态返回空串）。 */
export async function pickFolder(): Promise<string> {
  return (await host().go?.main?.App?.PickFolder?.()) ?? '';
}

/** 发送文件/目录，返回消息报文序号（浏览器形态空串）。 */
export async function sendFiles(ip: string, text: string, paths: string[]): Promise<string> {
  return (await host().go?.main?.App?.SendFiles?.(ip, text, paths)) ?? '';
}

export async function acceptFiles(reqId: string): Promise<void> {
  await host().go?.main?.App?.AcceptFiles?.(reqId);
}

export async function rejectFiles(reqId: string): Promise<void> {
  host().go?.main?.App?.RejectFiles?.(reqId);
}

/** 在资源管理器中打开路径。 */
export async function openPath(path: string): Promise<void> {
  await host().go?.main?.App?.OpenPath?.(path);
}

export async function getRecvDir(): Promise<string> {
  return (await host().go?.main?.App?.GetRecvDir?.()) ?? '';
}

/** 截取主屏 PNG data URL（浏览器形态返回空串）。 */
export async function captureScreen(): Promise<string> {
  return (await host().go?.main?.App?.CaptureScreen?.()) ?? '';
}

/** 裁剪产物落盘，返回路径。 */
export async function saveScreenshot(pngData: string): Promise<string> {
  return (await host().go?.main?.App?.SaveScreenshot?.(pngData)) ?? '';
}
