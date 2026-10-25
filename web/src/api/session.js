// Restores a persisted session on page load. Only a 401 ends it (the API
// client then logs out with the "session expirée" notice); a gateway outage or
// network blip keeps the token and retries.
export function restoreSession({ me, onUser, onRetrying, delayMs = 5000 }) {
  let cancelled = false;
  let timer = null;

  async function attempt() {
    try {
      const user = await me();
      if (!cancelled) onUser(user);
    } catch (err) {
      if (cancelled || err?.status === 401) return;
      onRetrying?.(err);
      timer = setTimeout(attempt, delayMs);
    }
  }

  attempt();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
