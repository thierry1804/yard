import { PrismaClient, type ContainerType } from '../src/generated/prisma';
import { ISO_CODES, MAX_TIER, isReefer, sizeOf } from '../src/domain/rules';
import { defaultReefer } from '../src/domain/reefer';

// Demo data, ~50 % full. Writes no events: this is the initial state.
// Usage: npm run seed -w @ccis/yard-service [-- --reset]
const ZONES = [
  { id: 'A', label: 'Zone A — Import', rows: 6, cols: 10 },
  { id: 'B', label: 'Zone B — Export', rows: 5, cols: 10 },
  { id: 'C', label: 'Zone C — Transit', rows: 4, cols: 10 },
  { id: 'R', label: 'Zone R — Reefer', rows: 3, cols: 8 },
];
const CLIENTS = ['Jovenna', 'Star', 'Brasseries', 'Socota', 'Galana', 'Henri Fraise', 'Total Energies', 'Ambatovy', 'QMM', 'Colas'];
const CARRIERS = ['MSCU', 'CMAU', 'MAEU', 'HLCU', 'OOLU', 'EISU', 'TCLU', 'MSKU', 'ONEU', 'CSLU'];
const DRY: ContainerType[] = ['EMPTY_20', 'EMPTY_40', 'FULL_20', 'FULL_40'];
const REEF: ContainerType[] = ['REEFER', 'REEFER_FULL'];
const DAY = 86_400_000;
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

const prisma = new PrismaClient();
const reset = process.argv.includes('--reset');

if (!reset && (await prisma.zone.count()) > 0) {
  console.log('Données déjà présentes (utiliser -- --reset pour réinitialiser).');
} else {
  await prisma.$executeRawUnsafe('TRUNCATE "Movement", "ReeferState", "Container", "Zone", outbox CASCADE');
  const used = new Set<string>();
  const containerNo = () => {
    for (;;) {
      const no = pick(CARRIERS) + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
      if (!used.has(no)) { used.add(no); return no; }
    }
  };
  const now = Date.now();
  let count = 0;
  for (const zone of ZONES) {
    await prisma.zone.create({ data: zone });
    for (let r = 0; r < zone.rows; r++) {
      for (let c = 0; c < zone.cols; c++) {
        if (Math.random() < 0.3) continue;
        const types = zone.id === 'R' ? REEF : DRY;
        const size = Math.random() < 0.5 ? 20 : 40;
        const pool = types.filter((t) => sizeOf(t) === size).length ? types.filter((t) => sizeOf(t) === size) : types;
        const height = 1 + Math.floor(Math.random() * MAX_TIER);
        for (let tier = 1; tier <= height; tier++) {
          const type = pick(pool);
          const heavy = type.startsWith('FULL') || type === 'REEFER_FULL';
          await prisma.container.create({
            data: {
              containerNo: containerNo(),
              type,
              isoCode: ISO_CODES[type],
              client: pick(CLIENTS),
              weightKg: heavy ? 8000 + Math.floor(Math.random() * 20000) : 2200 + Math.floor(Math.random() * 1800),
              zoneId: zone.id,
              row: r,
              col: c,
              tier,
              entryDate: new Date(now - (1 + Math.random() * 30) * DAY),
              plannedExitDate: new Date(now + (1 + Math.random() * 20) * DAY),
              ...(isReefer(type) ? { reefer: { create: defaultReefer(new Date(now)) } } : {}),
            },
          });
          count++;
        }
      }
    }
  }
  console.log(`Seed : ${count} conteneurs, ${ZONES.length} zones.`);
}
await prisma.$disconnect();
