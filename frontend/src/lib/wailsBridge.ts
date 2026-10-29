/**
 * Wails 宿主桥接层。
 * 在浏览器直接 `npm run dev` 预览时 window.go 不存在，全部优雅降级为空操作，
 * 界面保留浏览器演示形态（带假窗口边框）；在 Wails 桌面运行时走真实窗口控制。
 */
interface WailsHost {
  go?: {
    main?: {
      App?: {
        Minimize?: () => void;
        ToggleMaximize?: () => void;
        CloseWindow?: () => void;
      };
    };
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
