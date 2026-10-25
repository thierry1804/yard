function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4002),
  host: process.env.HOST ?? '0.0.0.0',
  amqpUrl: required('AMQP_URL'),
};
