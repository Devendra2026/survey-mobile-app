/** Lightweight screen timing — enable with EXPO_PUBLIC_PERF_MONITOR=1 */
const enabled = process.env.EXPO_PUBLIC_PERF_MONITOR === '1';

export function markScreenStart(screen: string): void {
  if (!enabled) return;
  console.info(`[perf] screen:start ${screen}`);
}

export function markScreenReady(screen: string, startedAt: number): void {
  if (!enabled) return;
  const ms = Math.round(performance.now() - startedAt);
  console.info(`[perf] screen:ready ${screen} ${ms}ms`);
}

/** Mark start of a user interaction (e.g. wizard keystroke) for frame timing. */
export function markInteractionStart(label: string): number {
  if (!enabled) return 0;
  const t = performance.now();
  console.info(`[perf] interaction:start ${label}`);
  return t;
}

/** Log elapsed ms since markInteractionStart. */
export function markInteractionEnd(label: string, startedAt: number): void {
  if (!enabled || startedAt <= 0) return;
  const ms = Math.round(performance.now() - startedAt);
  console.info(`[perf] interaction:end ${label} ${ms}ms`);
}

export function initMobileMonitoring(): void {
  if (process.env.EXPO_PUBLIC_PERF_MONITOR === '1') {
    console.info('[perf] Mobile performance monitor enabled');
  }
}
