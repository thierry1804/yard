const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
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

export class ApiError extends Error {
  constructor(status, body) {
    super(typeof body?.error === 'string' ? body.error : `Request failed (${status})`);
    this.status = status;
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

  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/auth/me'),

  getZones: () => request('/zones'),
  createZone: (data) => request('/zones', { method: 'POST', body: data }),
  updateZone: (id, data) => request(`/zones/${id}`, { method: 'PATCH', body: data }),
  deleteZone: (id) => request(`/zones/${id}`, { method: 'DELETE' }),
  compactZone: (id) => request(`/zones/${id}/compact`, { method: 'POST' }),
  compactAll: () => request('/zones/compact-all', { method: 'POST' }),

  getContainers: (params) => request(`/containers${toQuery(params)}`),
  getContainer: (id) => request(`/containers/${id}`),
  containerArrival: (data) => request('/containers/arrival', { method: 'POST', body: data }),
  containerDeparture: (id) => request(`/containers/${id}/departure`, { method: 'POST' }),
  containerTransfer: (id, targetZoneId) =>
    request(`/containers/${id}/transfer`, { method: 'POST', body: { targetZoneId } }),
  containerMove: (id, toZoneId, toRow, toCol) =>
    request(`/containers/${id}/move`, { method: 'POST', body: { toZoneId, toRow, toCol } }),
  updateReefer: (id, data) => request(`/containers/${id}/reefer`, { method: 'PATCH', body: data }),

  getMovements: (take) => request(`/movements${toQuery({ take })}`),
  undoMovement: (id) => request(`/movements/${id}/undo`, { method: 'POST' }),
};
