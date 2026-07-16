export class Core {
  public id: number;
  public busy: boolean = false;
  public pc: number = 0;
  public sp: number = -1;
  public cyclesUsed: number = 0;
  public cyclesLimit: number = 0;

  constructor(id: number) {
    this.id = id;
  }

  public assign(pc: number, cyclesLimit: number): void {
    this.pc = pc;
    this.cyclesLimit = cyclesLimit;
    this.cyclesUsed = 0;
    this.busy = true;
  }

  public tick(cycles: number): void {
    this.cyclesUsed += cycles;
    if (this.cyclesUsed >= this.cyclesLimit) {
      this.busy = false;
    }
  }

  public reset(): void {
    this.busy = false;
    this.pc = 0;
    this.sp = -1;
    this.cyclesUsed = 0;
    this.cyclesLimit = 0;
  }
}