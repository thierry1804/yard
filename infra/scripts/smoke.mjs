// End-to-end check through the gateway: login → ws ticket → move → the move
// event comes back over the websocket (i.e. it went through outbox + RabbitMQ).
const GW = process.env.GATEWAY_URL ?? 'http://127.0.0.1:4000';

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(GW + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const { accessToken: token } = await call('/auth/login', { method: 'POST', body: { email: 'operateur@ccis.mg', password: 'operateur123' } });
const { ticket } = await call('/ws-ticket', { method: 'POST', token });
const ws = new WebSocket(`${GW.replace('http', 'ws')}/ws?ticket=${ticket}`);
const frames = [];
ws.addEventListener('message', (e) => frames.push(JSON.parse(e.data)));
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });

const zones = await call('/zones', { token });
const containers = await call('/containers', { token });
let move;
for (const z of zones) {
  const inZone = containers.filter((c) => c.zoneId === z.id);
  const top = inZone.find((c) => !inZone.some((o) => o.row === c.row && o.col === c.col && o.tier > c.tier));
  if (!top) continue;
  for (let r = 0; r < z.rows && !move; r++)
    for (let c = 0; c < z.cols && !move; c++)
      if (!inZone.some((o) => o.row === r && o.col === c)) move = { ct: top, toZoneId: z.id, toRow: r, toCol: c };
  if (move) break;
}
if (!move) throw new Error('aucun déplacement possible dans les données de démo');

const moved = await call(`/containers/${move.ct.id}/move`, {
  method: 'POST', token,
  body: { toZoneId: move.toZoneId, toRow: move.toRow, toCol: move.toCol, expectedVersion: move.ct.version },
});
const start = Date.now();
while (!frames.some((f) => f.event === 'yard.container.moved' && f.data.container.id === moved.id)) {
  if (Date.now() - start > 5000) throw new Error(`événement non reçu ; trames : ${JSON.stringify(frames)}`);
  await new Promise((r) => setTimeout(r, 50));
}
console.log(`OK : ${moved.containerNo} déplacé, événement reçu en ${Date.now() - start} ms`);
ws.close();
