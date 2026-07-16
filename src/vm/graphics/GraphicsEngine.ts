import { Raster2D } from '../renderer/Raster2D';

export class GraphicsEngine {
  public fb: Uint8Array;
  public width: number;
  public height: number;

  private r2: Raster2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.fb = new Uint8Array(width * height * 4);
    this.r2 = new Raster2D();
  }

  public resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.fb = new Uint8Array(w * h * 4);
  }

  public setColor(r: number, g: number, b: number, a: number = 255): void {
    this.r2.setColor(r, g, b, a);
  }

  public setClearColor(r: number, g: number, b: number): void {
    this.r2.setClearColor(r, g, b);
  }

  public clear(r?: number, g?: number, b?: number): void {
    this.r2.clear(this.fb, this.width, this.height, r ?? 0, g ?? 0, b ?? 0);
  }

  public pixel(x: number, y: number): void {
    this.r2.pixel(this.fb, this.width, this.height, x, y);
  }

  public line(x1: number, y1: number, x2: number, y2: number): void {
    this.r2.line(this.fb, this.width, this.height, x1, y1, x2, y2);
  }

  public rect(x: number, y: number, w: number, h: number, fill: boolean = true): void {
    if (fill) this.r2.rect(this.fb, this.width, this.height, x, y, w, h);
    else this.r2.rectOutline(this.fb, this.width, this.height, x, y, w, h);
  }

  public circle(cx: number, cy: number, r: number, fill: boolean = true): void {
    if (fill) this.r2.circle(this.fb, this.width, this.height, cx, cy, r);
    else this.r2.circleOutline(this.fb, this.width, this.height, cx, cy, r);
  }

  public triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, fill: boolean = true): void {
    if (fill) this.r2.triangle(this.fb, this.width, this.height, x1, y1, x2, y2, x3, y3);
    else { this.line(x1, y1, x2, y2); this.line(x2, y2, x3, y3); this.line(x3, y3, x1, y1); }
  }

  public polygon(points: number[], fill: boolean = true): void {
    if (fill) this.r2.polygon(this.fb, this.width, this.height, points);
    else this.r2.polygonOutline(this.fb, this.width, this.height, points);
  }

  public reset(): void {
    this.r2 = new Raster2D();
    this.fb.fill(0);
  }
}