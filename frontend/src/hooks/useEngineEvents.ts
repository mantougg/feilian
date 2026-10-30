import { useEffect, useRef } from 'react';
import { onEngineEvent, EngineEvent } from '../lib/wailsBridge';

/**
 * 引擎事件订阅 hook：Wails EventsOn → 回调分发（T-M2-2）。
 *
 * handlers 是「事件名 → 回调」映射；订阅只在挂载时建立一次，
 * 回调经 ref 取最新渲染版本（避免闭包读到过期 state，也避免重复订阅）。
 * 浏览器预览形态下 onEngineEvent 降级为 no-op，组件照常渲染。
 */
export function useEngineEvents(handlers: Record<string, (ev: EngineEvent) => void>): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const offs = Object.keys(ref.current).map((name) =>
      onEngineEvent(name, (ev) => ref.current[name]?.(ev))
    );
    return () => offs.forEach((off) => off());
    // 依赖为空数组：事件集在运行期不变，回调新鲜度由 ref 保证
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
