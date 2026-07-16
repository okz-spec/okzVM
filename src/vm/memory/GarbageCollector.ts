import { RAM } from './RAM';

export class GarbageCollector {
  private ram: RAM;
  private enabled: boolean = true;
  private interval: number = 1000;
  private lastRun: number = 0;
  public collected: number = 0;
  public runs: number = 0;

  constructor(ram: RAM) {
    this.ram = ram;
  }

  public tick(now: number): void {
    if (!this.enabled) return;
    if (now - this.lastRun < this.interval) return;
    this.lastRun = now;
    const freed = this.ram.gc();
    if (freed > 0) {
      this.collected += freed;
      this.runs++;
    }
  }

  public force(): number {
    const freed = this.ram.gc();
    this.collected += freed;
    this.runs++;
    return freed;
  }

  public isEnabled(): boolean { return this.enabled; }
  public setEnabled(v: boolean): void { this.enabled = v; }
  public setInterval(ms: number): void { this.interval = ms; }
}