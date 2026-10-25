import { PrismaClient } from './generated/prisma';
import { buildAuthApp } from './app';
import { config } from './config';
import { createTokenSigner } from './tokens';

const prisma = new PrismaClient();
const app = buildAuthApp({ prisma, signer: await createTokenSigner(config.privateKeyPem()) });

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
