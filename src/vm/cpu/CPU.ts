import { Core } from './Core';
import { OPCODE_CYCLES } from '../../shared/constants';

export class CPU {
  public cores: Core[];
  public frequency: number;
  public currentLoad: number = 0;
  public instructionCount: number = 0;

  constructor(coreCount: number, frequencyMHz: number) {
    this.cores = [];
    this.frequency = frequencyMHz;
    for (let i = 0; i < coreCount; i++) {
      this.cores.push(new Core(i));
    }
  }

  public getCore(id: number): Core {
    return this.cores[id % this.cores.length];
  }

  public getCycleCost(opcode: string): number {
    return OPCODE_CYCLES[opcode] || 1;
  }

  public get totalCores(): number {
    return this.cores.length;
  }

  public get freeCoreCount(): number {
    return this.cores.filter(c => !c.busy).length;
  }

  public reset(): void {
    this.cores.forEach(c => c.reset());
    this.currentLoad = 0;
    this.instructionCount = 0;
  }
}