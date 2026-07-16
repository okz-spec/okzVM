export class ErrorManager {
  private logFn: (msg: string, type?: string) => void;
  public errors: VMError[] = [];
  public fatal: boolean = false;

  constructor(logFn: (msg: string, type?: string) => void) {
    this.logFn = logFn;
  }

  public throw(message: string, line?: number, column?: number): void {
    const err: VMError = {
      message,
      line: line || 0,
      column: column || 0,
      timestamp: Date.now(),
    };
    this.errors.push(err);
    this.logFn(`ERROR: ${message}${line ? ` at line ${line}` : ''}`, 'error');
    this.fatal = true;
  }

  public warn(message: string, line?: number): void {
    this.logFn(`WARN: ${message}${line ? ` at line ${line}` : ''}`, 'warn');
  }

  public info(message: string): void {
    this.logFn(message, 'info');
  }

  public clear(): void {
    this.errors = [];
    this.fatal = false;
  }
}

export interface VMError {
  message: string;
  line: number;
  column: number;
  timestamp: number;
}