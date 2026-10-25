import { subscribeEphemeral, type AmqpClient, type Logger } from '@ccis/messaging';
import type { Hub } from './hub';

export function startFanout(client: AmqpClient, hub: Hub, log: Logger): void {
  subscribeEphemeral(client, {
    queuePrefix: 'gateway',
    bindings: [{ exchange: 'yard.events', pattern: '#' }],
    onMessage: (env) => hub.broadcast({ event: env.type, data: env.data, at: env.occurredAt }),
    log,
  });
}
