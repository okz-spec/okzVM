import { Process } from '../process/Process';

export interface SchedulerStats {
  totalProcesses: number;
  runningProcesses: number;
  currentIndex: number;
  quantum: number;
  totalInstrExecuted: number;
}

export class Scheduler {
  private processes: Process[] = [];
  private quantum: number = 500;
  private currentIndex: number = -1;
  public algorithm: 'round-robin' | 'fifo' = 'round-robin';
  private totalInstrExecuted: number = 0;
  public yieldCheck: (() => boolean) | null = null;

  constructor(quantum?: number) {
    if (quantum) this.quantum = quantum;
  }

  public addProcess(proc: Process): void {
    this.processes.push(proc);
  }

  public removeProcess(id: number): boolean {
    const idx = this.processes.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.processes.splice(idx, 1);
    if (this.currentIndex >= this.processes.length) {
      this.currentIndex = this.processes.length - 1;
    }
    return true;
  }

  public getProcesses(): Process[] {
    return this.processes;
  }

  public getById(id: number): Process | undefined {
    return this.processes.find(p => p.id === id);
  }

  private getNextRunnable(currentTime?: number): Process | null {
    if (this.processes.length === 0) return null;

    const startIdx = this.currentIndex;
    for (let i = 0; i < this.processes.length; i++) {
      this.currentIndex = (startIdx + i + 1) % this.processes.length;
      const proc = this.processes[this.currentIndex];
      if (proc.state === 'running' && !proc.halted) {
        if (currentTime !== undefined && (proc as any).sleepUntil > currentTime) {
          continue;
        }
        return proc;
      }
    }
    return null;
  }

  public runQuantum(limit?: number, currentTime?: number): number {
    const proc = this.getNextRunnable(currentTime);
    if (!proc) return 0;

    let executed = 0;
    proc.instructionsExecuted = 0;
    const maxInstr = limit !== undefined ? limit : this.quantum;

    while (executed < maxInstr) {
      if (proc.halted) break;

      if (this.yieldCheck && this.yieldCheck()) break;

      const result = proc.step();
      executed++;
      this.totalInstrExecuted++;

      if (result === 'halt') {
        proc.state = 'terminated';
        break;
      }
    }

    return executed;
  }

  public tick(currentTime?: number): number {
    if (this.processes.length === 0) return 0;
    return this.runQuantum(undefined, currentTime);
  }

  public setQuantum(q: number): void {
    this.quantum = q;
  }

  public clear(): void {
    this.processes = [];
    this.currentIndex = -1;
    this.totalInstrExecuted = 0;
  }

  public getStats(): SchedulerStats {
    return {
      totalProcesses: this.processes.length,
      runningProcesses: this.processes.filter(p => p.state === 'running' && !p.halted).length,
      currentIndex: this.currentIndex,
      quantum: this.quantum,
      totalInstrExecuted: this.totalInstrExecuted,
    };
  }

  public reset(): void {
    this.currentIndex = -1;
  }
}