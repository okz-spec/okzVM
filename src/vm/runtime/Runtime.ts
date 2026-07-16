import { VMCore } from '../index';
import { MemoryManager } from '../memory/MemoryManager';

export class Runtime {
  public memory: MemoryManager;
  public startTime: number = 0;
  public elapsed: number = 0;

  constructor(vm: VMCore) {
    this.memory = new MemoryManager(vm.ram);
  }

  public start(): void {
    this.startTime = performance.now();
  }

  public tick(now: number): void {
    this.elapsed = now - this.startTime;
    this.memory.tick(now);
  }

  public reset(): void {
    this.memory.reset();
    this.startTime = 0;
    this.elapsed = 0;
  }
}