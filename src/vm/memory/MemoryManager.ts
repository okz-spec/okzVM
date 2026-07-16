import { RAM } from './RAM';
import { GarbageCollector } from './GarbageCollector';

export class MemoryManager {
  public ram: RAM;
  public gc: GarbageCollector;

  constructor(ram: RAM) {
    this.ram = ram;
    this.gc = new GarbageCollector(ram);
  }

  public alloc(size: number): number {
    return this.ram.alloc(size);
  }

  public free(address: number): void {
    this.ram.free(address);
  }

  public tick(now: number): void {
    this.gc.tick(now);
  }

  public get usage(): number { return this.ram.used; }
  public get total(): number { return this.ram.total; }
  public get objectCount(): number { return this.ram.objectCount; }

  public reset(): void {
    this.ram.reset();
    this.gc.collected = 0;
    this.gc.runs = 0;
  }
}