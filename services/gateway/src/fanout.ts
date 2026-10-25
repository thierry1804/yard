import { subscribeEphemeral, type AmqpClient, type Logger } from '@ccis/messaging';
import type { Hub } from './hub';

// Besides relaying yard events, tells browsers when the relay itself is
// interrupted: events published while the gateway's queue did not exist are
// lost for this gateway, so browsers fall back to polling ('degraded') and
// reload everything once the queue is bound again ('resync').
export function startFanout(client: AmqpClient, hub: Hub, log: Logger): void {
  subscribeEphemeral(client, {
    queuePrefix: 'gateway',
    bindings: [{ exchange: 'yard.events', pattern: '#' }],
    onMessage: (env) => hub.broadcast({ event: env.type, data: env.data, at: env.occurredAt }),
    log,
  });
  let connections = 0;
  client.onConnected(async () => {
    connections++;
    if (connections > 1) hub.broadcast({ event: 'realtime.resync', data: null, at: new Date().toISOString() });
  });
  client.onDisconnected(() => {
    hub.broadcast({ event: 'realtime.degraded', data: null, at: new Date().toISOString() });
  });
}
