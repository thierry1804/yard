// Wraps an async refresh so that at most one call runs at a time; calls made
// while it runs are merged into a single follow-up run. Bursts of websocket
// events (a compaction emits one per container) then cost two fetches, and
// responses can no longer resolve out of order and overwrite newer state.
export function coalesce(fn) {
  let running = null;
  let queued = false;

  async function loop() {
    do {
      queued = false;
      try {
        await fn();
      } catch {
        // the wrapped function reports its own errors
      }
    } while (queued);
    running = null;
  }

  return function run() {
    if (running) {
      queued = true;
      return running;
    }
    running = loop();
    return running;
  };
}
