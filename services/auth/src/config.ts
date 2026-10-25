import { readFileSync } from 'node:fs';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4001),
  host: process.env.HOST ?? '0.0.0.0',
  privateKeyPem: () => readFileSync(required('JWT_PRIVATE_KEY_FILE'), 'utf8'),
};
