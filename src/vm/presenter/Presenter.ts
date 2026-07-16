export class Presenter {
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData | null = null;
  private _frameCount: number = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  public present(fb: Uint8Array, width: number, height: number): void {
    this._frameCount++;
    if (!this.imageData || this.imageData.width !== width || this.imageData.height !== height) {
      this.imageData = this.ctx.createImageData(width, height);
    }
    this.imageData.data.set(fb);
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  public get frameCount(): number {
    return this._frameCount;
  }

  public reset(): void {
    this.imageData = null;
    this._frameCount = 0;
  }
}