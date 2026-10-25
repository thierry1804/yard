const WS_URL = import.meta.env.VITE_WS_URL || `ws://${globalThis.location?.hostname ?? 'localhost'}:4000`;
const DISCONNECTED_AFTER_MS = 30_000;

// Status: 'connected' | 'reconnecting' | 'disconnected' (no connection for 30 s).
// onConnected fires on every (re)connection so the caller can resynchronise:
// events emitted while the socket was down are not replayed.
export function connectYardSocket({
  getTicket,
  onEvent,
  onConnected,
  onStatus,
  onUnauthorized,
  WebSocketImpl = globalThis.WebSocket,
  wsUrl = WS_URL,
}) {
  let socket = null;
  let closedByUser = false;
  let retryDelay = 1000;
  let retryTimer = null;
  let downTimer = null;
  let status = null;

  const setStatus = (s) => {
    status = s;
    onStatus?.(s);
  };

  // Once 'disconnected' (red), further failed retries keep it red.
  function markDown() {
    if (status !== 'disconnected') setStatus('reconnecting');
    if (!downTimer) downTimer = setTimeout(() => setStatus('disconnected'), DISCONNECTED_AFTER_MS);
  }

  function scheduleRetry() {
    if (closedByUser) return;
    retryTimer = setTimeout(open, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 15000);
  }

  async function open() {
    retryTimer = null;
    let ticket;
    try {
      ticket = await getTicket();
    } catch (err) {
      // 401: the API client already logged the user out.
      if (err?.status === 401) return;
      markDown();
      scheduleRetry();
      return;
    }
    if (closedByUser) return;

    socket = new WebSocketImpl(`${wsUrl}/ws?ticket=${encodeURIComponent(ticket)}`);
    socket.onopen = () => {
      retryDelay = 1000;
      clearTimeout(downTimer);
      downTimer = null;
      setStatus('connected');
      onConnected?.();
    };
    socket.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch {
        // malformed frame, ignore
      }
    };
    socket.onclose = (event) => {
      socket = null;
      if (closedByUser) return;
      if (event.code === 4401) {
        setStatus('disconnected');
        onUnauthorized?.();
        return;
      }
      markDown();
      scheduleRetry();
    };
  }

  markDown();
  open();

  return function disconnect() {
    closedByUser = true;
    clearTimeout(retryTimer);
    clearTimeout(downTimer);
    socket?.close();
  };
}
