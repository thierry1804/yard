const API_URL = import.meta.env.VITE_API_URL || `http://${globalThis.location?.hostname ?? 'localhost'}:4000`;
const TOKEN_KEY = 'ccis_access_token';

let accessToken = sessionStorage.getItem(TOKEN_KEY) || null;

export function getToken() {
  return accessToken;
}

export function setToken(token) {
  accessToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // sessionStorage unavailable (private mode, etc.) — token still works in-memory for this tab.
  }
}

let unauthorizedHandler = null;

// Registered by useAuth: any 401 on an authenticated call (or a websocket
// closed with 4401) means the session is over.
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
  return () => {
    if (unauthorizedHandler === fn) unauthorizedHandler = null;
  };
}

export function notifyUnauthorized() {
  setToken(null);
  unauthorizedHandler?.();
}

export class ApiError extends Error {
  constructor(status, body) {
    super(typeof body?.error === 'string' ? body.error : `Request failed (${status})`);
    this.status = status;
    this.code = body?.code ?? null;
    this.body = body;
  }
}

function toQuery(params) {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  // Fastify's JSON body parser rejects an empty body when this header is
  // present, so only set it when there actually is a JSON body to send.
  if (body != null) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }

  if (!res.ok) {
    if (res.status === 401 && auth) notifyUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  opsGet: (path, params) => request(`/operations/${path}${toQuery(params)}`),
  opsWrite: (path, body, method = 'POST') => request(`/operations/${path}`, { method, body }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/auth/me'),
  wsTicket: () => request('/ws-ticket', { method: 'POST' }),

  getZones: () => request('/zones'),
  createZone: (data) => request('/zones', { method: 'POST', body: data }),
  updateZone: (id, data) => request(`/zones/${id}`, { method: 'PATCH', body: data }),
  deleteZone: (id) => request(`/zones/${id}`, { method: 'DELETE' }),
  compactZone: (id) => request(`/zones/${id}/compact`, { method: 'POST' }),
  compactAll: () => request('/zones/compact-all', { method: 'POST' }),

  getContainers: (params) => request(`/containers${toQuery(params)}`),
  getContainer: (id) => request(`/containers/${id}`),
  getContainerHistory: (id) => request(`/containers/${encodeURIComponent(id)}/history`),
  containerArrival: (data) => request('/containers/arrival', { method: 'POST', body: data }),
  containerDeparture: (id, expectedVersion) =>
    request(`/containers/${id}/departure`, { method: 'POST', body: { expectedVersion } }),
  containerTransfer: (id, targetZoneId, expectedVersion) =>
    request(`/containers/${id}/transfer`, { method: 'POST', body: { targetZoneId, expectedVersion } }),
  containerMove: (id, toZoneId, toRow, toCol, expectedVersion) =>
    request(`/containers/${id}/move`, { method: 'POST', body: { toZoneId, toRow, toCol, expectedVersion } }),
  updateReefer: (id, data) => request(`/containers/${id}/reefer`, { method: 'PATCH', body: data }),

  getMovements: (take, scope) => request(`/movements${toQuery({ take, scope })}`),
  undoMovement: (id) => request(`/movements/${id}/undo`, { method: 'POST' }),
};
