import type { Pulse } from './protocol.js';

export class ReplayBuffer {
  private items: Pulse[] = [];
  constructor(private windowMs = 60_000, private cap = 500) {}

  push(p: Pulse) { this.items.push(p); this.prune(p.ts); }
  list(now = Date.now()): Pulse[] { this.prune(now); return [...this.items]; }

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    while (this.items.length && this.items[0].ts < cutoff) this.items.shift();
    if (this.items.length > this.cap) this.items.splice(0, this.items.length - this.cap);
  }
}
