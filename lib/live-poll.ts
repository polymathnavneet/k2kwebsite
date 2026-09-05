/** Independent, bounded refreshes: a slow map must not freeze the GPS feed. */
export function startLivePoll<T>(url: string, accept: (data: T) => void, headers: Record<string, string> = {}) {
  let stopped = false;
  let active: AbortController | null = null;
  async function refresh() {
    if (stopped || active || document.visibilityState === "hidden") return;
    const controller = new AbortController();
    active = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { cache: "no-store", headers, signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json();
      if (!stopped && !controller.signal.aborted) accept(data);
    } catch {
      // Keep the last good reading during an outage; the next tick retries.
    } finally {
      clearTimeout(timeout);
      if (active === controller) active = null;
    }
  }
  const timer = setInterval(refresh, 30000);
  const first = setTimeout(refresh, 0);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("online", refresh);
  window.addEventListener("focus", refresh);
  return {
    refresh,
    stop() {
      stopped = true;
      active?.abort();
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    },
  };
}
