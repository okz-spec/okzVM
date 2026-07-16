import { RenderCommand } from './commands';
import { Raster2D } from './Raster2D';
import { Renderer3D } from './Renderer3D';

export class RenderCommandBuffer {
  private commands: RenderCommand[] = [];
  private r2: Raster2D = new Raster2D();
  private r3d: Renderer3D = new Renderer3D();
  public commandCount: number = 0;
  public wireframe: boolean = false;

  public setColor(r: number, g: number, b: number, a: number = 255): void {
    this.r2.setColor(r, g, b, a);
  }

  public push(cmd: RenderCommand): void {
    this.commands.push(cmd);
    this.commandCount++;
  }

  public flush(fb: Uint8Array, width: number, height: number): void {
    for (const cmd of this.commands) {
      switch (cmd.type) {
        case 'clear':
          this.r2.clear(fb, width, height, cmd.r, cmd.g, cmd.b);
          break;
        case 'set_color':
          this.r2.setColor(cmd.r, cmd.g, cmd.b, cmd.a);
          break;
        case 'pixel':
          this.r2.pixel(fb, width, height, cmd.x, cmd.y);
          break;
        case 'line':
          this.r2.line(fb, width, height, cmd.x1, cmd.y1, cmd.x2, cmd.y2);
          break;
        case 'rect':
          this.r2.rect(fb, width, height, cmd.x, cmd.y, cmd.w, cmd.h);
          break;
        case 'circle':
          if (cmd.fill) this.r2.circle(fb, width, height, cmd.cx, cmd.cy, cmd.r);
          else this.r2.circleOutline(fb, width, height, cmd.cx, cmd.cy, cmd.r);
          break;
        case 'triangle':
          if (cmd.fill) this.r2.triangle(fb, width, height, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x3, cmd.y3);
          else { this.r2.line(fb, width, height, cmd.x1, cmd.y1, cmd.x2, cmd.y2); this.r2.line(fb, width, height, cmd.x2, cmd.y2, cmd.x3, cmd.y3); this.r2.line(fb, width, height, cmd.x3, cmd.y3, cmd.x1, cmd.y1); }
          break;
        case 'polygon':
          if (cmd.fill) this.r2.polygon(fb, width, height, cmd.points);
          else this.r2.polygonOutline(fb, width, height, cmd.points);
          break;
        case 'render3D':
          this.r3d.render(fb, width, height, { ...cmd.config, wireframe: this.wireframe });
          break;
      }
    }
    this.commands = [];
  }

  public toggleWireframe(): void {
    this.wireframe = !this.wireframe;
  }

  public clear(): void {
    this.commands = [];
    this.commandCount = 0;
  }
}