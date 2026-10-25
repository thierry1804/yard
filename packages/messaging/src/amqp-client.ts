import amqp, { type ConfirmChannel } from 'amqplib';

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type Setup = (ch: ConfirmChannel) => Promise<void>;

// Keeps one confirm channel open and re-runs every registered setup (topology,
// consumers) after each reconnection. While disconnected, `channel` is null and
// callers (the outbox relay) simply wait: nothing is lost, it stays in the outbox.
export class AmqpClient {
  private conn: Connection | null = null;
  private ch: ConfirmChannel | null = null;
  private readonly setups: Setup[] = [];
  private stopped = true;
  private retryMs = 1000;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly url: string, private readonly log: Logger) {}

  get channel(): ConfirmChannel | null {
    return this.ch;
  }

  get connected(): boolean {
    return this.ch !== null;
  }

  onConnected(setup: Setup): void {
    this.setups.push(setup);
    if (this.ch) void setup(this.ch).catch((err) => this.log.error({ err }, 'amqp setup failed'));
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const conn = this.conn;
    this.conn = null;
    this.ch = null;
    await conn?.close().catch(() => {});
  }

  private async connect(): Promise<void> {
    let conn: Connection | null = null;
    try {
      conn = await amqp.connect(this.url);
      const ch = await conn.createConfirmChannel();
      const opened = conn;
      opened.on('error', (err) => this.log.warn({ err }, 'amqp connection error'));
      opened.on('close', () => this.handleClose(opened));
      ch.on('error', (err) => this.log.warn({ err }, 'amqp channel error'));
      ch.on('close', () => {
        if (this.ch === ch) void opened.close().catch(() => {});
      });
      for (const setup of this.setups) await setup(ch);
      if (this.stopped) {
        await opened.close().catch(() => {});
        return;
      }
      this.conn = opened;
      this.ch = ch;
      this.retryMs = 1000;
      this.log.info({}, 'amqp connected');
    } catch (err) {
      this.log.warn({ err }, 'amqp connect failed');
      await conn?.close().catch(() => {});
      this.scheduleReconnect();
    }
  }

  private handleClose(conn: Connection): void {
    if (this.conn !== conn) return;
    this.conn = null;
    this.ch = null;
    if (this.stopped) return;
    this.log.warn({}, 'amqp connection closed');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, 15_000);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delay);
  }
}
