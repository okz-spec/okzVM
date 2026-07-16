export class Raster2D {
  private r: number = 255;
  private g: number = 255;
  private b: number = 255;
  private a: number = 255;
  private clearR: number = 0;
  private clearG: number = 0;
  private clearB: number = 0;

  public setColor(r: number, g: number, b: number, a: number = 255): void {
    this.r = Math.max(0, Math.min(255, r)) | 0;
    this.g = Math.max(0, Math.min(255, g)) | 0;
    this.b = Math.max(0, Math.min(255, b)) | 0;
    this.a = Math.max(0, Math.min(255, a)) | 0;
  }

  public setClearColor(r: number, g: number, b: number): void {
    this.clearR = Math.max(0, Math.min(255, r)) | 0;
    this.clearG = Math.max(0, Math.min(255, g)) | 0;
    this.clearB = Math.max(0, Math.min(255, b)) | 0;
  }

  public clear(fb: Uint8Array, width: number, height: number, r: number, g: number, b: number): void {
    if (r === 0 && g === 0 && b === 0) {
      fb.fill(0);
    } else {
      for (let i = 0; i < fb.length; i += 4) {
        fb[i] = r; fb[i + 1] = g; fb[i + 2] = b; fb[i + 3] = 255;
      }
    }
  }

  public pixel(fb: Uint8Array, width: number, height: number, x: number, y: number): void {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const off = (y * width + x) * 4;
    fb[off] = this.r; fb[off + 1] = this.g;
    fb[off + 2] = this.b; fb[off + 3] = this.a;
  }

  public line(fb: Uint8Array, width: number, height: number, x1: number, y1: number, x2: number, y2: number): void {
    let dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
    let dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      this.pixel(fb, width, height, x1, y1);
      if (x1 === x2 && y1 === y2) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x1 += sx; }
      if (e2 <= dx) { err += dx; y1 += sy; }
    }
  }

  public rect(fb: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.floor(x + w));
    const y1 = Math.min(height, Math.floor(y + h));
    if (x0 >= x1 || y0 >= y1) return;
    const rowLen = (x1 - x0) * 4;
    const row = new Uint8Array(rowLen);
    for (let i = 0; i < rowLen; i += 4) { row[i] = this.r; row[i + 1] = this.g; row[i + 2] = this.b; row[i + 3] = this.a; }
    for (let rowIdx = y0; rowIdx < y1; rowIdx++) {
      fb.set(row, rowIdx * width * 4 + x0 * 4);
    }
  }

  public circle(fb: Uint8Array, width: number, height: number, cx: number, cy: number, r: number): void {
    let x = r, y = 0, err = 0;
    while (x >= y) {
      this.hline(fb, width, height, cx - x, cx + x, cy + y);
      this.hline(fb, width, height, cx - x, cx + x, cy - y);
      if (y !== 0) { this.hline(fb, width, height, cx - y, cx + y, cy + x); this.hline(fb, width, height, cx - y, cx + y, cy - x); }
      y++; err += 1 + 2 * y;
      if (2 * (err - x) + 1 > 0) { x--; err += 1 - 2 * x; }
    }
  }

  public circleOutline(fb: Uint8Array, width: number, height: number, cx: number, cy: number, r: number): void {
    let x = r, y = 0, err = 0;
    while (x >= y) {
      this.pixel(fb, width, height, cx + x, cy + y); this.pixel(fb, width, height, cx + y, cy + x);
      this.pixel(fb, width, height, cx - y, cy + x); this.pixel(fb, width, height, cx - x, cy + y);
      this.pixel(fb, width, height, cx - x, cy - y); this.pixel(fb, width, height, cx - y, cy - x);
      this.pixel(fb, width, height, cx + y, cy - x); this.pixel(fb, width, height, cx + x, cy - y);
      y++; err += 1 + 2 * y;
      if (2 * (err - x) + 1 > 0) { x--; err += 1 - 2 * x; }
    }
  }

  private hline(fb: Uint8Array, width: number, height: number, x0: number, x1: number, y: number): void {
    if (y < 0 || y >= height) return;
    const start = Math.max(0, x0), end = Math.min(width - 1, x1);
    if (start > end) return;
    const off = y * width * 4 + start * 4;
    const len = (end - start + 1) * 4;
    for (let i = 0; i < len; i += 4) { fb[off + i] = this.r; fb[off + i + 1] = this.g; fb[off + i + 2] = this.b; fb[off + i + 3] = this.a; }
  }

  public triangle(fb: Uint8Array, width: number, height: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    const minX = Math.max(0, Math.floor(Math.min(x1, x2, x3)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(x1, x2, x3)));
    const minY = Math.max(0, Math.floor(Math.min(y1, y2, y3)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(y1, y2, y3)));
    const edge = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
      (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
    const area = edge(x1, y1, x2, y2, x3, y3);
    if (Math.abs(area) < 0.01) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cx = x + 0.5; const cy = y + 0.5;
        if (edge(x2, y2, x3, y3, cx, cy) >= 0 && edge(x3, y3, x1, y1, cx, cy) >= 0 && edge(x1, y1, x2, y2, cx, cy) >= 0) {
          this.pixel(fb, width, height, x, y);
        }
      }
    }
  }

  public polygon(fb: Uint8Array, width: number, height: number, points: number[]): void {
    if (points.length < 6) return;
    const n = points.length / 2;
    for (let i = 1; i < n - 1; i++) {
      this.triangle(fb, width, height, points[0], points[1], points[i * 2], points[i * 2 + 1], points[i * 2 + 2], points[i * 2 + 3]);
    }
  }

  public polygonOutline(fb: Uint8Array, width: number, height: number, points: number[]): void {
    if (points.length < 4) return;
    const n = points.length / 2;
    for (let i = 0; i < n; i++) {
      const ni = (i + 1) % n;
      this.line(fb, width, height, points[i * 2], points[i * 2 + 1], points[ni * 2], points[ni * 2 + 1]);
    }
  }

  public rectOutline(fb: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number): void {
    this.line(fb, width, height, x, y, x + w, y);
    this.line(fb, width, height, x + w, y, x + w, y + h);
    this.line(fb, width, height, x + w, y + h, x, y + h);
    this.line(fb, width, height, x, y + h, x, y);
  }
}