// Demo dataset: the four zones of the Toamasina depot, ~50% full, plus three
// accounts (one per role). Run directly with `npm run seed` to reset the data.
import { randomUUID, scryptSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store, MAX_TIER, ISO_CODES, sizeOf, isReefer, defaultReefer } from './store.js';
import { DB_FILE } from './config.js';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export const DEMO_USERS = [
  { email: 'admin@ccis.mg', password: 'admin123', name: 'Administrateur', role: 'ADMIN' },
  { email: 'operateur@ccis.mg', password: 'operateur123', name: 'Opérateur Yard', role: 'OPERATOR' },
  { email: 'lecteur@ccis.mg', password: 'lecteur123', name: 'Consultation', role: 'VIEWER' },
];

const ZONES = [
  { id: 'A', label: 'Zone A — Import', rows: 6, cols: 10 },
  { id: 'B', label: 'Zone B — Export', rows: 5, cols: 10 },
  { id: 'C', label: 'Zone C — Transit', rows: 4, cols: 10 },
  { id: 'R', label: 'Zone R — Reefer', rows: 3, cols: 8 },
];

const CLIENTS = ['Jovenna', 'Star', 'Brasseries', 'Socota', 'Galana', 'Henri Fraise', 'Total Energies', 'Ambatovy', 'QMM', 'Colas'];
const DRY_TYPES = ['EMPTY_20', 'EMPTY_40', 'FULL_20', 'FULL_40'];
const DAY = 86400000;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function buildSeed() {
  const store = new Store(DB_FILE);
  const now = Date.now();

  store.data.users = DEMO_USERS.map(({ password, ...u }) => ({ id: randomUUID(), ...u, passwordHash: hashPassword(password) }));
  store.data.zones = ZONES.map((z) => ({ ...z, createdAt: new Date(now).toISOString() }));

  for (const zone of ZONES) {
    for (let r = 0; r < zone.rows; r++) {
      for (let c = 0; c < zone.cols; c++) {
        if (Math.random() < 0.3) continue;
        // One size per stack keeps the 40'-on-20' rule satisfied.
        const types = zone.id === 'R' ? ['REEFER', 'REEFER_FULL'] : DRY_TYPES;
        const size = Math.random() < 0.5 ? 20 : 40;
        const sameSize = types.filter((t) => sizeOf(t) === size);
        const pool = sameSize.length > 0 ? sameSize : types;
        const height = 1 + Math.floor(Math.random() * MAX_TIER);
        for (let tier = 1; tier <= height; tier++) {
          const type = pick(pool);
          const entry = new Date(now - (1 + Math.random() * 30) * DAY);
          store.data.containers.push({
            id: randomUUID(),
            containerNo: store.generateContainerNo(),
            type,
            isoCode: ISO_CODES[type],
            client: pick(CLIENTS),
            weightKg: type.startsWith('EMPTY') || type === 'REEFER' ? 2200 + Math.floor(Math.random() * 1800) : 8000 + Math.floor(Math.random() * 20000),
            zoneId: zone.id,
            row: r,
            col: c,
            tier,
            entryDate: entry.toISOString(),
            plannedExitDate: new Date(now + (1 + Math.random() * 20) * DAY).toISOString(),
            reefer: isReefer(type) ? defaultReefer(new Date(now)) : null,
          });
        }
      }
    }
  }

  // A couple of reefers in trouble so the monitor has something to show.
  const reefers = store.data.containers.filter((c) => c.reefer);
  if (reefers[0]) Object.assign(reefers[0].reefer, { currentTemp: reefers[0].reefer.tempMax + 3, tempAlert: true });
  if (reefers[1]) Object.assign(reefers[1].reefer, { powerStatus: 'off', tempAlert: true });

  return store.data;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const store = new Store(DB_FILE);
  store.replace(buildSeed());
  console.log(`Seed écrit dans ${DB_FILE} : ${store.data.containers.length} conteneurs, ${store.data.zones.length} zones.`);
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(8)} ${u.email} / ${u.password}`);
}
