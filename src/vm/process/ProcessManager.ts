import { Process } from './Process';
import { BytecodeChunk } from '../types';

export class ProcessManager {
  public processes: Process[] = [];
  private nextId: number = 1;

  public spawn(name: string, chunk: BytecodeChunk): Process {
    const proc = new Process(this.nextId++, name, chunk);
    this.processes.push(proc);
    return proc;
  }

  public kill(id: number): boolean {
    const idx = this.processes.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.processes[idx].terminate();
    this.processes.splice(idx, 1);
    return true;
  }

  public getById(id: number): Process | undefined {
    return this.processes.find(p => p.id === id);
  }

  public getByName(name: string): Process[] {
    return this.processes.filter(p => p.name === name);
  }

  public getRunning(): Process[] {
    return this.processes.filter(p => p.state === 'running' && !p.halted);
  }

  public suspend(id: number): boolean {
    const p = this.getById(id);
    if (!p) return false;
    p.state = 'suspended';
    return true;
  }

  public resume(id: number): boolean {
    const p = this.getById(id);
    if (!p) return false;
    p.state = 'running';
    return true;
  }

  public get count(): number {
    return this.processes.length;
  }

  public get totalMemoryUsage(): number {
    return this.processes.reduce((sum, p) => sum + p.memoryUsed, 0);
  }

  public clear(): void {
    for (const p of this.processes) { p.terminate(); }
    this.processes = [];
    this.nextId = 1;
  }
}