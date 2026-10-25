export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start > this.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      if (this.windows.size > 10_000) this.sweep(t);
      return true;
    }
    w.count++;
    return w.count <= this.max;
  }

  private sweep(t: number): void {
    for (const [k, w] of this.windows) if (t - w.start > this.windowMs) this.windows.delete(k);
  }
}
