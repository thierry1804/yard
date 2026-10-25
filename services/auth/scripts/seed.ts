import { PrismaClient } from '../src/generated/prisma';
import { hashPassword } from '../src/passwords';

// Demo accounts (development only).
const USERS = [
  { email: 'admin@ccis.mg', password: 'admin123', name: 'Administrateur', role: 'ADMIN' as const },
  { email: 'operateur@ccis.mg', password: 'operateur123', name: 'Opérateur Yard', role: 'OPERATOR' as const },
  { email: 'lecteur@ccis.mg', password: 'lecteur123', name: 'Consultation', role: 'VIEWER' as const },
];

const prisma = new PrismaClient();
for (const u of USERS) {
  const passwordHash = await hashPassword(u.password);
  await prisma.user.upsert({
    where: { email: u.email },
    update: { name: u.name, role: u.role, passwordHash, active: true },
    create: { email: u.email, name: u.name, role: u.role, passwordHash },
  });
  console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}
await prisma.$disconnect();
