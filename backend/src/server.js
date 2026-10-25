import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { Store, HttpError, computeTempAlert } from './store.js';
import { buildSeed } from './seed.js';
import { PORT, HOST, JWT_SECRET, DB_FILE, CORS_ORIGIN, REEFER_SIM_INTERVAL } from './config.js';

const store = new Store(DB_FILE);
if (store.exists()) {
  store.load();
} else {
  store.replace(buildSeed());
}

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      // The WebSocket token travels in the query string; keep it out of the logs.
      req: (req) => ({ method: req.method, url: req.url.replace(/token=[^&]+/, 'token=***') }),
    },
  },
});

await app.register(cors, { origin: CORS_ORIGIN, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
await app.register(jwt, { secret: JWT_SECRET, sign: { expiresIn: '12h' } });
await app.register(websocket);

// ---------- realtime ----------

const sockets = new Set();

function broadcast(event, data) {
  const frame = JSON.stringify({ event, data, at: new Date().toISOString() });
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(frame);
  }
}

app.get('/ws', { websocket: true }, (socket, req) => {
  try {
    app.jwt.verify(req.query.token);
  } catch {
    socket.close(4401, 'unauthorized');
    return;
  }
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

// ---------- auth ----------

const ROLE_RANK = { VIEWER: 0, OPERATOR: 1, ADMIN: 2 };

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

function requireRole(minRole) {
  return async (req) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'Session expirée, reconnectez-vous.');
    }
    const user = store.findUser(req.user.sub);
    if (!user) throw new HttpError(401, 'Utilisateur inconnu.');
    if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
      throw new HttpError(403, `Action réservée au rôle ${minRole} (vous êtes ${user.role}).`);
    }
    req.currentUser = user;
  };
}

const viewer = { preHandler: requireRole('VIEWER') };
const operator = { preHandler: requireRole('OPERATOR') };
const admin = { preHandler: requireRole('ADMIN') };

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(String(password), salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

app.post('/auth/login', async (req) => {
  const { email, password } = req.body ?? {};
  const user = email && password ? store.findUserByEmail(email) : null;
  if (!user || !checkPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'Email ou mot de passe incorrect.');
  }
  return { accessToken: app.jwt.sign({ sub: user.id, role: user.role }), user: publicUser(user) };
});

app.get('/auth/me', viewer, async (req) => publicUser(req.currentUser));

// ---------- zones ----------

app.get('/zones', viewer, async () => store.zones);

app.post('/zones', admin, async (req, reply) => {
  const zone = store.createZone(req.body ?? {});
  broadcast('zone.created', zone);
  reply.code(201);
  return zone;
});

app.patch('/zones/:id', admin, async (req) => {
  const zone = store.updateZone(req.params.id, req.body ?? {});
  broadcast('zone.updated', zone);
  return zone;
});

app.delete('/zones/:id', admin, async (req, reply) => {
  store.deleteZone(req.params.id);
  broadcast('zone.deleted', { id: req.params.id });
  reply.code(204);
});

// Declared before /zones/:id/compact so "compact-all" is never read as an id.
app.post('/zones/compact-all', operator, async (req) => {
  let total = 0;
  for (const z of store.zones) total += store.compactZone(z.id, req.currentUser.id);
  broadcast('container.compacted', { zoneId: null, total });
  return { total };
});

app.post('/zones/:id/compact', operator, async (req) => {
  const count = store.compactZone(req.params.id, req.currentUser.id);
  broadcast('container.compacted', { zoneId: req.params.id, count });
  return { count };
});

// ---------- containers ----------

app.get('/containers', viewer, async (req) => {
  const { zoneId, type, q } = req.query;
  return store.containers.filter(
    (c) =>
      (!zoneId || c.zoneId === zoneId) &&
      (!type || c.type === type) &&
      (!q || c.containerNo.includes(String(q).toUpperCase())),
  );
});

app.get('/containers/:id', viewer, async (req) => store.getContainer(req.params.id));

app.post('/containers/arrival', operator, async (req, reply) => {
  const ct = store.arrival(req.body ?? {}, req.currentUser.id);
  broadcast('container.arrived', ct);
  reply.code(201);
  return ct;
});

app.post('/containers/:id/departure', operator, async (req) => {
  const ct = store.departure(req.params.id, req.currentUser.id);
  broadcast('container.departed', ct);
  return ct;
});

app.post('/containers/:id/transfer', operator, async (req) => {
  const ct = store.transfer(req.params.id, req.body?.targetZoneId, req.currentUser.id);
  broadcast('container.transferred', ct);
  return ct;
});

app.post('/containers/:id/move', operator, async (req) => {
  const { toZoneId, toRow, toCol } = req.body ?? {};
  const ct = store.move(req.params.id, toZoneId, toRow, toCol, req.currentUser.id);
  broadcast('container.moved', ct);
  return ct;
});

app.patch('/containers/:id/reefer', operator, async (req) => {
  const ct = store.updateReefer(req.params.id, req.body ?? {});
  broadcast('reefer.updated', ct);
  return ct;
});

// ---------- movements ----------

app.get('/movements', viewer, async (req) => {
  const take = Math.min(Math.max(parseInt(req.query.take, 10) || 50, 1), 500);
  return store.listMovements(take);
});

app.post('/movements/:id/undo', operator, async (req) => {
  const ct = store.undoMovement(req.params.id, req.currentUser.id);
  broadcast('movement.undone', ct);
  return ct;
});

app.get('/health', async () => ({ ok: true, containers: store.containers.length, zones: store.zones.length }));

// ---------- errors ----------

app.setErrorHandler((err, req, reply) => {
  if (err instanceof HttpError) {
    reply.code(err.status).send({ error: err.message });
    return;
  }
  if (err.validation || err.statusCode === 400) {
    reply.code(400).send({ error: err.message });
    return;
  }
  req.log.error(err);
  reply.code(500).send({ error: 'Erreur interne du serveur.' });
});

// ---------- reefer simulation ----------

// Stands in for the reefer telemetry feed: small drift around the set point,
// occasionally pushing a unit out of range so alerts appear on their own.
if (REEFER_SIM_INTERVAL > 0) {
  setInterval(() => {
    const reefers = store.containers.filter((c) => c.reefer && c.reefer.powerStatus === 'on');
    if (reefers.length === 0) return;
    const now = new Date().toISOString();
    for (const ct of reefers) {
      const r = ct.reefer;
      const pull = (r.setPoint - r.currentTemp) * 0.3;
      const noise = (Math.random() - 0.5) * (Math.random() < 0.05 ? 8 : 1);
      r.currentTemp = Math.round((r.currentTemp + pull + noise) * 10) / 10;
      r.lastTempUpdate = now;
      r.tempAlert = computeTempAlert(r);
    }
    store.save();
    broadcast('reefer.readings', { count: reefers.length });
  }, REEFER_SIM_INTERVAL * 1000).unref();
}

const shutdown = async () => {
  store.saveNow();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: PORT, host: HOST });
