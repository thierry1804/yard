import { readFileSync } from 'node:fs';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  authUrl: required('AUTH_URL'),
  yardUrl: required('YARD_URL'),
  amqpUrl: required('AMQP_URL'),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://127.0.0.1:5180').split(',').map((s) => s.trim()).filter(Boolean),
  publicKeyPem: () => readFileSync(required('JWT_PUBLIC_KEY_FILE'), 'utf8'),
};
