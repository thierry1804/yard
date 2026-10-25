const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';

// Browsers cannot set custom headers on a WebSocket upgrade request, so the
// token travels as a query param — the backend's /ws route expects exactly this.
export function connectYardSocket(token, onEvent) {
  let socket = null;
  let closedByUser = false;
  let retryDelay = 1000;
  let retryTimer = null;

  function open() {
    socket = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(token)}`);

    socket.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch {
        // malformed frame, ignore
      }
    };

    socket.onopen = () => {
      retryDelay = 1000;
    };

    socket.onclose = () => {
      if (closedByUser) return;
      retryTimer = setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15000);
    };
  }

  open();

  return function disconnect() {
    closedByUser = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
  };
}
