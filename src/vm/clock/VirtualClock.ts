export class VirtualClock {
  private bootTime: number = 0;
  private frameLastTime: number = 0;
  private tickLastTime: number = 0;

  public frameTime: number = 0;
  public tickTime: number = 0;
  public deltaTime: number = 0;
  public elapsedTime: number = 0;

  public frameCount: number = 0;
  public tickCount: number = 0;

  private timers: Array<{
    delay: number; callback: () => void;
    elapsed: number; repeat: boolean; cancelled: boolean;
  }> = [];

  constructor() { this.reset(); }

  public reset(): void {
    const now = performance.now();
    this.bootTime = now;
    this.frameLastTime = now;
    this.tickLastTime = now;
    this.frameTime = 0;
    this.tickTime = 0;
    this.deltaTime = 0;
    this.elapsedTime = 0;
    this.frameCount = 0;
    this.tickCount = 0;
    this.timers = [];
    //console.log("[CLOCK] reset frameLastTime=" + this.frameLastTime);
  }

  public tickFrame(): void {
    const now = performance.now();
    const diff = now - this.frameLastTime;
    // if (diff > 100) console.log("[CLOCK] tickFrame diff=" + diff + "ms lastTime=" + this.frameLastTime + " now=" + now);
    this.deltaTime = Math.min(diff / 1000, 0.1);
    this.frameTime += this.deltaTime;
    this.elapsedTime = (now - this.bootTime) / 1000;
    this.frameLastTime = now;
    this.frameCount++;
  }

  public tickScheduler(): void {
    const now = performance.now();
    this.tickTime += Math.min((now - this.tickLastTime) / 1000, 0.1);
    this.tickLastTime = now;
    this.tickCount++;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if (t.cancelled) { this.timers.splice(i, 1); continue; }
      t.elapsed += this.deltaTime;
      if (t.elapsed >= t.delay) {
        t.callback();
        if (t.repeat) {
          t.elapsed = 0;
        } else {
          this.timers.splice(i, 1);
        }
      }
    }
  }

  public after(delay: number, callback: () => void): () => void {
    const t = { delay, callback, elapsed: 0, repeat: false, cancelled: false };
    this.timers.push(t);
    return () => { t.cancelled = true; };
  }

  public every(delay: number, callback: () => void): () => void {
    const t = { delay, callback, elapsed: 0, repeat: true, cancelled: false };
    this.timers.push(t);
    return () => { t.cancelled = true; };
  }

  public clearTimers(): void { this.timers = []; }
}