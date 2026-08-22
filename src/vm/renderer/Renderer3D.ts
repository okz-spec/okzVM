export interface R3DCamera {
  x: number; y: number; z: number;
  rx: number; ry: number;
  fov: number;
}
export interface R3DVertex {
  x: number; y: number; z: number;
  u?: number; v?: number;
  blend?: number;
}
export interface R3DTriangle {
  i0: number; i1: number; i2: number;
  color?: { r: number; g: number; b: number; a?: number };
  texture?: Array<{ r: number; g: number; b: number; a?: number } | null>;
  texW?: number;
  texH?: number;
  texture2?: Array<{ r: number; g: number; b: number; a?: number } | null>;
  texW2?: number;
  texH2?: number;
}
export interface R3DBillboard {
  x: number; y: number; z: number;
  w: number; h: number; pw: number; ph: number;
  pixels: Array<{ r: number; g: number; b: number; a?: number } | null>;
}
export interface R3DLight {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  intensity?: number;
  radius?: number;
}
export interface R3DConfig {
  vertices: R3DVertex[];
  triangles: R3DTriangle[];
  camera: R3DCamera;
  scale?: number;
  wireframe?: boolean;
  billboards?: R3DBillboard[];
  blendWithFb?: boolean;
  ambient?: number;
  lightDir?: { x: number; y: number; z: number };
  lightColor?: { r: number; g: number; b: number };
  lightIntensity?: number;
  lights?: R3DLight[];
  fogDensity?: number;
  fogNear?: number;
  fogFar?: number;
  fogColor?: { r: number; g: number; b: number };
  shadows?: boolean;
  shadowPlaneY?: number;
  shadowColor?: { r: number; g: number; b: number };
  shadowAlpha?: number;
  cullBehind?: boolean;
}
export class Renderer3D {
  render(fb: Uint8Array, width: number, height: number, config: R3DConfig): void {
    const scale = config.scale ?? 0.5;
    const rw = Math.max(1, Math.ceil(width * scale));
    const rh = Math.max(1, Math.ceil(height * scale));
    const cam = config.camera;
    const fovRad = cam.fov * Math.PI / 180;
    const focal = rw / (2 * Math.tan(fovRad / 2));
    const ws = new Uint8Array(rw * rh * 4);
    const zBuf = new Float32Array(rw * rh);
    const groundMask = new Uint8Array(rw * rh);
    zBuf.fill(1e9);
    // ===== PRE-FILL ws FROM fb FOR ALPHA COMPOSITING =====
    if (config.blendWithFb) {
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const srcX = (x * width / rw) | 0;
          const srcY = (y * height / rh) | 0;
          const si = (y * rw + x) * 4;
          const di = (srcY * width + srcX) * 4;
          ws[si] = fb[di];
          ws[si+1] = fb[di+1];
          ws[si+2] = fb[di+2];
          ws[si+3] = fb[di+3];
        }
      }
      for (let i = 0; i < rw * rh; i++) {
        zBuf[i] = 1e9;
      }
    }
    const near = 0.5;
    const rw2 = rw / 2, rh2 = rh / 2;
    // ===== LIGHTING =====
    const lightCfg = config.lightDir ?? { x: 0.3, y: -0.8, z: 0.5 };
    const ll = Math.sqrt(lightCfg.x*lightCfg.x + lightCfg.y*lightCfg.y + lightCfg.z*lightCfg.z) || 1;
    const ldx = lightCfg.x / ll, ldy = lightCfg.y / ll, ldz = lightCfg.z / ll;
    const ambient = Math.max(0, Math.min(1, config.ambient ?? 0.25));
    const lightClr = config.lightColor ?? { r: 255, g: 255, b: 255 };
    const lightIntensity = Math.max(0, Math.min(1, config.lightIntensity ?? 1));
    const pointLights = config.lights ?? [];
    const fogDensity = config.fogDensity ?? 0;
    const fogNear = config.fogNear ?? 0;
    const fogFar = config.fogFar ?? 0;
    const useLinearFog = fogNear > 0 && fogFar > fogNear;
    const fogR = config.fogColor?.r ?? 135;
    const fogG = config.fogColor?.g ?? 190;
    const fogB = config.fogColor?.b ?? 240;
    const shadowPlaneY = config.shadowPlaneY ?? 0;
    // ===== VIEW TRANSFORM =====
    const view: { x: number; y: number; z: number }[] = [];
    const cy = Math.cos(cam.ry), sy = Math.sin(cam.ry);
    const cx = Math.cos(cam.rx), sx = Math.sin(cam.rx);
    for (const v of config.vertices) {
      let x = v.x - cam.x;
      let y = v.y - cam.y;
      let z = v.z - cam.z;
      // yaw
      let dx = x * cy - z * sy;
      let dz = x * sy + z * cy;
      // pitch
      let dy = y * cx - dz * sx;
      dz = y * sx + dz * cx;
      view.push({ x: dx, y: dy, z: dz });
    }
    const project = (v: any) => ({
      x: (v.x / v.z) * focal + rw / 2,
      y: -(v.y / v.z) * focal + rh / 2,
      z: v.z
    });
    const edge = (ax:number, ay:number, bx:number, by:number, cx:number, cy:number) =>
      (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
    // Near-plane clipping: Sutherland-Hodgman against z=near.
    // This was a fucking nightmare to get right. The tricky part isn't the clipping
    // itself, it's that you need to interpolate u,v AND blend weights along the
    // clipped edges, then fan-triangulate the result. One wrong interpolation and
    // textures swim like they're drunk.
    const clipNearTri = (vv0: any, vv1: any, vv2: any,
      u0: number, v0: number, u1: number, v1: number, u2: number, v2: number,
      b0: number, b1: number, b2: number): { verts: any[]; uvs: number[]; blends: number[] }[] => {
      const verts = [vv0, vv1, vv2];
      const uvs = [u0, v0, u1, v1, u2, v2];
      const blends = [b0, b1, b2];
      const inside: any[] = [];
      const insideUV: number[] = [];
      const insideBlend: number[] = [];
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        const cur = verts[i], nxt = verts[j];
        const curIn = cur.z >= near, nxtIn = nxt.z >= near;
        if (curIn) { inside.push(cur); insideUV.push(uvs[i*2], uvs[i*2+1]); insideBlend.push(blends[i]); }
        if (curIn !== nxtIn) {
          const t = (near - cur.z) / (nxt.z - cur.z);
          inside.push({
            x: cur.x + t * (nxt.x - cur.x),
            y: cur.y + t * (nxt.y - cur.y),
            z: near
          });
          insideUV.push(
            uvs[i*2] + t * (uvs[j*2] - uvs[i*2]),
            uvs[i*2+1] + t * (uvs[j*2+1] - uvs[i*2+1])
          );
          insideBlend.push(blends[i] + t * (blends[j] - blends[i]));
        }
      }
      const result: { verts: any[]; uvs: number[]; blends: number[] }[] = [];
      for (let i = 1; i + 1 < inside.length; i++) {
        const t0 = inside[0], t1 = inside[i], t2 = inside[i+1];
        const cross = (t1.x - t0.x) * (t2.y - t0.y) - (t1.y - t0.y) * (t2.x - t0.x);
        if (Math.abs(cross) < 0.001) continue;
        result.push({
          verts: [t0, t1, t2],
          uvs: [insideUV[0], insideUV[1], insideUV[i*2], insideUV[i*2+1], insideUV[(i+1)*2], insideUV[(i+1)*2+1]],
          blends: [insideBlend[0], insideBlend[i], insideBlend[i+1]]
        });
      }
      return result;
    };
    const opaque: any[] = [];
    const transparent: any[] = [];
    // ===== TRIANGLE BUILD =====
    for (const tri of config.triangles) {
      const v0 = view[tri.i0];
      const v1 = view[tri.i1];
      const v2 = view[tri.i2];
      if (!v0 || !v1 || !v2) continue;
      const anyBehind = v0.z < near || v1.z < near || v2.z < near;
      if (anyBehind) {
        if (config.cullBehind) continue;
        if (v0.z < near && v1.z < near && v2.z < near) continue;
      }
      const wv0 = config.vertices[tri.i0];
      const wv1 = config.vertices[tri.i1];
      const wv2 = config.vertices[tri.i2];
      const e1x = wv1.x - wv0.x, e1y = wv1.y - wv0.y, e1z = wv1.z - wv0.z;
      const e2x = wv2.x - wv0.x, e2y = wv2.y - wv0.y, e2z = wv2.z - wv0.z;
      let fnx = e1y * e2z - e1z * e2y;
      let fny = e1z * e2x - e1x * e2z;
      let fnz = e1x * e2y - e1y * e2x;
      const fl = Math.sqrt(fnx * fnx + fny * fny + fnz * fnz) || 1;
      fnx /= fl; fny /= fl; fnz /= fl;
      const ca = tri.color?.a ?? 255;
      const hasTexture = !!tri.texture;
      const hasTexture2 = !!tri.texture2;
      const isOpaque = ca >= 255 && !hasTexture && !hasTexture2;
      const vb0 = wv0.blend ?? 0, vb1 = wv1.blend ?? 0, vb2 = wv2.blend ?? 0;
      let clips: { verts: any[]; uvs: number[]; blends: number[] }[];
      if (!anyBehind) {
        clips = [{ verts: [v0, v1, v2], uvs: [wv0.u ?? 0, wv0.v ?? 0, wv1.u ?? 0, wv1.v ?? 0, wv2.u ?? 0, wv2.v ?? 0], blends: [vb0, vb1, vb2] }];
      } else {
        clips = clipNearTri(v0, v1, v2, wv0.u ?? 0, wv0.v ?? 0, wv1.u ?? 0, wv1.v ?? 0, wv2.u ?? 0, wv2.v ?? 0, vb0, vb1, vb2);
      }
      for (const clip of clips) {
        const cv0 = clip.verts[0], cv1 = clip.verts[1], cv2 = clip.verts[2];
        const cp0 = project(cv0);
        const cp1 = project(cv1);
        const cp2 = project(cv2);
        const minX = Math.floor(Math.min(cp0.x, cp1.x, cp2.x));
        const maxX = Math.ceil(Math.max(cp0.x, cp1.x, cp2.x));
        const minY = Math.floor(Math.min(cp0.y, cp1.y, cp2.y));
        const maxY = Math.ceil(Math.max(cp0.y, cp1.y, cp2.y));
        if (maxX < 0 || minX >= rw || maxY < 0 || minY >= rh) continue;
        const depth = Math.min(cv0.z, cv1.z, cv2.z);
        const entry = {
          t: tri,
          p0: cp0, p1: cp1, p2: cp2,
          minX, maxX, minY, maxY,
          depth,
          nx: fnx, ny: fny, nz: fnz,
          worldX: (wv0.x + wv1.x + wv2.x) / 3,
          worldY: (wv0.y + wv1.y + wv2.y) / 3,
          worldZ: (wv0.z + wv1.z + wv2.z) / 3,
          u0: clip.uvs[0], v0: clip.uvs[1],
          u1: clip.uvs[2], v1: clip.uvs[3],
          u2: clip.uvs[4], v2: clip.uvs[5],
          b0: clip.blends[0], b1: clip.blends[1], b2: clip.blends[2],
          hasTexture,
          isOpaque,
          // Precomputed per-triangle lighting
          dirDot: (isOpaque ? Math.max(0, fnx * ldx + fny * ldy + fnz * ldz) : Math.max(0, Math.abs(fnx * ldx + fny * ldy + fnz * ldz))) * lightIntensity,
          plLR: 0, plLG: 0, plLB: 0,
        };
        // Precompute point light contribution for this triangle
        for (const pl of pointLights) {
          const plx = entry.worldX - pl.x, ply = entry.worldY - pl.y, plz = entry.worldZ - pl.z;
          const dist = Math.sqrt(plx * plx + ply * ply + plz * plz);
          const plRadius = pl.radius ?? 20;
          if (dist < plRadius) {
            const attn = 1 - dist / plRadius;
            const plI = (pl.intensity ?? 1) * attn;
            const lToSx = -plx, lToSy = -ply, lToSz = -plz;
            const lToSlen = Math.sqrt(lToSx * lToSx + lToSy * lToSy + lToSz * lToSz) || 1;
            const pdot = Math.max(0, (fnx * lToSx + fny * lToSy + fnz * lToSz) / lToSlen);
            entry.plLR += (pl.r / 255) * plI * pdot;
            entry.plLG += (pl.g / 255) * plI * pdot;
            entry.plLB += (pl.b / 255) * plI * pdot;
          }
        }
        if (ca >= 255) opaque.push(entry);
        else transparent.push(entry);
      }
    }
    // far → near
    transparent.sort((a, b) => b.depth - a.depth);
    const edgeTest = (p0:any,p1:any,p2:any,x:number,y:number) => {
      const e0 = edge(p1.x,p1.y,p2.x,p2.y,x,y);
      const e1 = edge(p2.x,p2.y,p0.x,p0.y,x,y);
      const e2 = edge(p0.x,p0.y,p1.x,p1.y,x,y);
      return { e0,e1,e2 };
    };
    const raster = (e:any, shadowMode = false) => {
      const t = e.t;
      const { p0,p1,p2,minX,maxX,minY,maxY } = e;
      const x0 = Math.max(0, minX);
      const x1 = Math.min(rw - 1, maxX);
      const y0 = Math.max(0, minY);
      const y1 = Math.min(rh - 1, maxY);
      const area = edge(p0.x,p0.y,p1.x,p1.y,p2.x,p2.y);
      if (Math.abs(area) < 1e-5) return;
      const invArea = 1 / area;
      const p0z = p0.z, p1z = p1.z, p2z = p2.z;

      if (shadowMode) {
        const shA = t.color?.a ?? 40;
        const darken = 1 - shA / 255;
        const e0dx = p2.x - p1.x, e0dy = p2.y - p1.y;
        const e1dx = p0.x - p2.x, e1dy = p0.y - p2.y;
        for (let y = y0; y <= y1; y++) {
          const row = y * rw * 4;
          const px = x0 + 0.5;
          const py = y + 0.5;
          let e0Base = (px - p1.x) * e0dy - (py - p1.y) * e0dx;
          let e1Base = (px - p2.x) * e1dy - (py - p2.y) * e1dx;
          for (let x = x0; x <= x1; x++) {
            const e0 = e0Base, e1 = e1Base;
            const e2 = area - e0 - e1;
            if (!((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0))) { e0Base += e0dy; e1Base += e1dy; continue; }
            const idx = y * rw + x;
            if (groundMask[idx] === 0) { e0Base += e0dy; e1Base += e1dy; continue; }
            const off = row + x * 4;
            const existing = ws[off];
            if (existing === 0 && ws[off+1] === 0 && ws[off+2] === 0) { e0Base += e0dy; e1Base += e1dy; continue; }
            ws[off]   = (existing * darken) | 0;
            ws[off+1] = (ws[off+1] * darken) | 0;
            ws[off+2] = (ws[off+2] * darken) | 0;
            e0Base += e0dy;
            e1Base += e1dy;
          }
        }
        return;
      }

      let cr = 200, cg = 200, cb = 200;
      const ca = t.color?.a ?? 255;
      if (t.color) {
        cr = t.color.r; cg = t.color.g; cb = t.color.b;
      }
      const isOpaque = e.isOpaque ?? (ca >= 255 && !e.hasTexture);
      const e0dx = p2.x - p1.x, e0dy = p2.y - p1.y;
      const e1dx = p0.x - p2.x, e1dy = p0.y - p2.y;
      const dirDot = e.dirDot ?? 0.5;
      const plLR = e.plLR ?? 0, plLG = e.plLG ?? 0, plLB = e.plLB ?? 0;
      const lRpre = ambient + (1 - ambient) * Math.min(1, (lightClr.r / 255) * dirDot + plLR);
      const lGpre = ambient + (1 - ambient) * Math.min(1, (lightClr.g / 255) * dirDot + plLG);
      const lBpre = ambient + (1 - ambient) * Math.min(1, (lightClr.b / 255) * dirDot + plLB);
      const hasTex = !!(t.texture && t.texW && t.texH);
      const hasTex2 = !!(t.texture2 && t.texW2 && t.texH2);
      const texW = t.texW || 0, texH = t.texH || 0;
      const texW2 = t.texW2 || 0, texH2 = t.texH2 || 0;
      const fogIsLinear = useLinearFog;
      const fogIsExp = !useLinearFog && fogDensity > 0;
      for (let y = y0; y <= y1; y++) {
        const row = y * rw * 4;
        const px = x0 + 0.5;
        const py = y + 0.5;
        let e0Base = (px - p1.x) * e0dy - (py - p1.y) * e0dx;
        let e1Base = (px - p2.x) * e1dy - (py - p2.y) * e1dx;
        for (let x = x0; x <= x1; x++) {
          const e0 = e0Base, e1 = e1Base;
          const e2 = area - e0 - e1;
          if (!((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0))) { e0Base += e0dy; e1Base += e1dy; continue; }
          const w0 = e0 * invArea;
          const w1 = e1 * invArea;
          const w2 = e2 * invArea;
          const depth = w0 * p0z + w1 * p1z + w2 * p2z;
          if (depth <= 0) { e0Base += e0dy; e1Base += e1dy; continue; }
          const idx = y * rw + x;
          if (zBuf[idx] <= depth + 0.01) { e0Base += e0dy; e1Base += e1dy; continue; }
          if (isOpaque) zBuf[idx] = depth;
          let sr: number, sg: number, sb: number;
          let sa = ca;
          if (hasTex) {
            // Perspective-correct UV interpolation. The 1/z trick: divide UV by depth,
            // interpolate, then divide back. Without this, textures warp and swim
            // at steep angles. If you're reading this and textures look wrong,
            // check this section first. The ooz (1/z) math is where bugs hide.
            const ooz0 = p0z > 0.001 ? 1 / p0z : 0;
            const ooz1 = p1z > 0.001 ? 1 / p1z : 0;
            const ooz2 = p2z > 0.001 ? 1 / p2z : 0;
            const pcW0 = w0 * ooz0, pcW1 = w1 * ooz1, pcW2 = w2 * ooz2;
            const pcSum = pcW0 + pcW1 + pcW2 || 1;
            const tu = (pcW0 * e.u0 + pcW1 * e.u1 + pcW2 * e.u2) / pcSum;
            const tv = (pcW0 * e.v0 + pcW1 * e.v1 + pcW2 * e.v2) / pcSum;
            // Double modulo because JS % returns negative for negative inputs.
            // This is the kind of shit that only breaks on specific hardware at 2am.
            const tx = ((Math.floor(tu * texW) % texW) + texW) % texW;
            const ty = ((Math.floor(tv * texH) % texH) + texH) % texH;
            const tpx = t.texture[ty * texW + tx];
            if (!tpx) { e0Base += e0dy; e1Base += e1dy; continue; }
            if (hasTex2) {
              const blend = w0 * e.b0 + w1 * e.b1 + w2 * e.b2;
              const ib = 1 - blend;
              const tx2 = ((Math.floor(tu * texW2) % texW2) + texW2) % texW2;
              const ty2 = ((Math.floor(tv * texH2) % texH2) + texH2) % texH2;
              const tpx2 = t.texture2![ty2 * texW2 + tx2];
              if (tpx2) {
                sr = (tpx.r * ib + tpx2.r * blend) * lRpre;
                sg = (tpx.g * ib + tpx2.g * blend) * lGpre;
                sb = (tpx.b * ib + tpx2.b * blend) * lBpre;
                sa = ((tpx.a ?? 255) * ib + (tpx2.a ?? 255) * blend) | 0;
              } else {
                sr = tpx.r * lRpre;
                sg = tpx.g * lGpre;
                sb = tpx.b * lBpre;
                sa = tpx.a ?? 255;
              }
            } else {
              sr = tpx.r * lRpre;
              sg = tpx.g * lGpre;
              sb = tpx.b * lBpre;
              sa = tpx.a ?? 255;
            }
          } else {
            sr = cr * lRpre;
            sg = cg * lGpre;
            sb = cb * lBpre;
          }
          if (sa >= 255) {
            const isGround = Math.abs(e.ny) > 0.5 && Math.abs(e.worldY - shadowPlaneY) < 0.5;
            if (isGround) {
              groundMask[idx] = 1;
            } else {
              groundMask[idx] = 0;
            }
          }
          if (fogIsLinear) {
            const fogFactor = Math.max(0, Math.min(1, (depth - fogNear) / (fogFar - fogNear)));
            sr = sr * (1 - fogFactor) + fogR * fogFactor;
            sg = sg * (1 - fogFactor) + fogG * fogFactor;
            sb = sb * (1 - fogFactor) + fogB * fogFactor;
          } else if (fogIsExp) {
            const fogFactor = 1 - Math.exp(-fogDensity * depth);
            sr = sr * (1 - fogFactor) + fogR * fogFactor;
            sg = sg * (1 - fogFactor) + fogG * fogFactor;
            sb = sb * (1 - fogFactor) + fogB * fogFactor;
          }
          if (sa >= 255) {
            const off = row + x * 4;
            ws[off] = sr;
            ws[off+1] = sg;
            ws[off+2] = sb;
            ws[off+3] = 255;
          } else {
            const off = row + x * 4;
            const fa = sa / 255;
            ws[off]   = ws[off]   * (1 - fa) + sr * fa;
            ws[off+1] = ws[off+1] * (1 - fa) + sg * fa;
            ws[off+2] = ws[off+2] * (1 - fa) + sb * fa;
            ws[off+3] = 255;
          }
          e0Base += e0dy;
          e1Base += e1dy;
        }
      }
    };
    for (const t of opaque) raster(t);
    // ===== SHADOWS (multiplicative darkening) =====
    // This whole system is a hack. We project triangles onto a ground plane
    // by intersecting vertices along the light direction, then render them
    // as dark quads. If ldy is 0 (light is horizontal), nothing happens.
    // The shadow alpha scales with lightIntensity so shadows fade at night.
    // It's not physically correct but it looks good enough and runs fast.
    if (config.shadows) {
      const shABase = config.shadowAlpha ?? 60;
      const shA = Math.max(1, Math.min(200, Math.round(shABase * lightIntensity * Math.min(1, ambient * 2 + 0.1))));
      if (shA > 1 && ldy !== 0) {
        const shColor = { r: 0, g: 0, b: 0, a: shA };
        for (const tri of config.triangles) {
          const a = tri.color?.a ?? 255;
          if (a < 255) continue;
          const wvs = [config.vertices[tri.i0], config.vertices[tri.i1], config.vertices[tri.i2]];
          if (wvs.every(wv => wv.y <= shadowPlaneY + 0.01)) continue;
          const shadowVerts: { x: number; y: number; z: number }[] = [];
          for (const wv of wvs) {
            const tParam = (shadowPlaneY - wv.y) / ldy;
            const shX = wv.x + tParam * ldx;
            const shZ = wv.z + tParam * ldz;
            let vx = shX - cam.x, vy = shadowPlaneY - cam.y, vz = shZ - cam.z;
            let dx = vx * cy - vz * sy;
            let dz = vx * sy + vz * cy;
            let dy = vy * cx - dz * sx;
            dz = vy * sx + dz * cx;
            if (dz < near) { shadowVerts.length = 0; break; }
            shadowVerts.push({ x: dx, y: dy, z: dz });
          }
          if (shadowVerts.length < 3) continue;
          const sp0 = project(shadowVerts[0]);
          const sp1 = project(shadowVerts[1]);
          const sp2 = project(shadowVerts[2]);
          const sMinX = Math.floor(Math.min(sp0.x, sp1.x, sp2.x));
          const sMaxX = Math.ceil(Math.max(sp0.x, sp1.x, sp2.x));
          const sMinY = Math.floor(Math.min(sp0.y, sp1.y, sp2.y));
          const sMaxY = Math.ceil(Math.max(sp0.y, sp1.y, sp2.y));
          if (sMaxX < 0 || sMinX >= rw || sMaxY < 0 || sMinY >= rh) continue;
          raster({
            t: { color: shColor },
            p0: sp0, p1: sp1, p2: sp2,
            minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY,
            nx: 0, ny: 1, nz: 0
          }, true);
        }
      }
    }
    // ===== BILLBOARDS (before transparent so they get tinted by it) =====
    // Billboard rendering: camera-facing quads with a 30% tilt factor so they
    // don't look completely flat. The UV mapping uses a 2x2 inverse matrix to
    // handle arbitrary quad orientations. This is basically copy-pasted from the
    // triangle rasterizer but with different math. If you refactor one, refactor both.
    if (config.billboards && config.billboards.length > 0) {
      const bRightX = cy, bRightZ = -sy;
      const camFwdX = sy * cx, camFwdY = sx, camFwdZ = cy * cx;
      const tiltFactor = 0.3;
      const bUpX = camFwdX * tiltFactor;
      const bUpY = 1 - tiltFactor + camFwdY * tiltFactor;
      const bUpZ = camFwdZ * tiltFactor;
      const upLen = Math.sqrt(bUpX * bUpX + bUpY * bUpY + bUpZ * bUpZ) || 1;
      const nUpX = bUpX / upLen, nUpY = bUpY / upLen, nUpZ = bUpZ / upLen;
      for (const bb of config.billboards) {
        const bw = (bb.w || 1) / 2;
        const bh = (bb.h || 1) / 2;
        const corners = [
          { x: bb.x - bRightX * bw - nUpX * bh, y: bb.y - nUpY * bh, z: bb.z - bRightZ * bw - nUpZ * bh },
          { x: bb.x + bRightX * bw - nUpX * bh, y: bb.y - nUpY * bh, z: bb.z + bRightZ * bw - nUpZ * bh },
          { x: bb.x + bRightX * bw + nUpX * bh, y: bb.y + nUpY * bh, z: bb.z + bRightZ * bw + nUpZ * bh },
          { x: bb.x - bRightX * bw + nUpX * bh, y: bb.y + nUpY * bh, z: bb.z - bRightZ * bw + nUpZ * bh },
        ];
        const sc: { x: number; y: number; z: number }[] = [];
        let allBehind = false;
        for (const c of corners) {
          let vx = c.x - cam.x, vy = c.y - cam.y, vz = c.z - cam.z;
          let dx = vx * cy - vz * sy;
          let dz = vx * sy + vz * cy;
          let dy = vy * cx - dz * sx;
          dz = vy * sx + dz * cx;
          if (dz < near) { allBehind = true; break; }
          sc.push({ x: (dx / dz) * focal + rw / 2, y: -(dy / dz) * focal + rh / 2, z: dz });
        }
        if (allBehind || sc.length < 4) continue;
        const sMinX = Math.floor(Math.min(sc[0].x, sc[1].x, sc[2].x, sc[3].x));
        const sMaxX = Math.ceil(Math.max(sc[0].x, sc[1].x, sc[2].x, sc[3].x));
        const sMinY = Math.floor(Math.min(sc[0].y, sc[1].y, sc[2].y, sc[3].y));
        const sMaxY = Math.ceil(Math.max(sc[0].y, sc[1].y, sc[2].y, sc[3].y));
        if (sMaxX < 0 || sMinX >= rw || sMaxY < 0 || sMinY >= rh) continue;
        const px0 = Math.max(0, sMinX);
        const px1 = Math.min(rw - 1, sMaxX);
        const py0 = Math.max(0, sMinY);
        const py1 = Math.min(rh - 1, sMaxY);
        const pixels = bb.pixels;
        const texPW = bb.pw || bb.w || 1;
        const texPH = bb.ph || bb.h || 1;
        const uDirX = sc[2].x - sc[3].x, uDirY = sc[2].y - sc[3].y;
        const vDirX = sc[0].x - sc[3].x, vDirY = sc[0].y - sc[3].y;
        const det = uDirX * vDirY - uDirY * vDirX;
        if (Math.abs(det) < 0.01) continue;
        const invDet = 1 / det;
        const origX = sc[3].x, origY = sc[3].y;
        const bbDepth = (sc[0].z + sc[1].z + sc[2].z + sc[3].z) * 0.25;
        const bbDirDot = 0.8 * lightIntensity;
        let bbLR = (lightClr.r / 255) * bbDirDot;
        let bbLG = (lightClr.g / 255) * bbDirDot;
        let bbLB = (lightClr.b / 255) * bbDirDot;
        for (const pl of pointLights) {
          const plx = bb.x - pl.x, ply = bb.y - pl.y, plz = bb.z - pl.z;
          const dist = Math.sqrt(plx * plx + ply * ply + plz * plz);
          const plRadius = pl.radius ?? 20;
          if (dist < plRadius) {
            const attn = (1 - dist / plRadius) * (pl.intensity ?? 1);
            bbLR += (pl.r / 255) * attn;
            bbLG += (pl.g / 255) * attn;
            bbLB += (pl.b / 255) * attn;
          }
        }
        const bbLRc = Math.min(1, bbLR), bbLGc = Math.min(1, bbLG), bbLBc = Math.min(1, bbLB);
        for (let sy2 = py0; sy2 <= py1; sy2++) {
          for (let sx2 = px0; sx2 <= px1; sx2++) {
            const px = sx2 + 0.5;
            const py = sy2 + 0.5;
            const dxp = px - origX, dyp = py - origY;
            const u = (dxp * vDirY - dyp * vDirX) * invDet;
            const v = (uDirX * dyp - uDirY * dxp) * invDet;
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;
            const idx = sy2 * rw + sx2;
            const pixDepth = (1 - v) * ((1 - u) * sc[3].z + u * sc[2].z) + v * ((1 - u) * sc[0].z + u * sc[1].z);
            if (zBuf[idx] <= pixDepth + 0.001) continue;
            const texX = Math.min(texPW - 1, Math.max(0, Math.floor(u * texPW)));
            const texY = Math.min(texPH - 1, Math.max(0, Math.floor(v * texPH)));
            const pixIdx = texY * texPW + texX;
            const pxl = pixels[pixIdx];
            if (!pxl) continue;
            zBuf[idx] = pixDepth;
            let bbr = pxl.r * (ambient + (1 - ambient) * bbLRc);
            let bbg = pxl.g * (ambient + (1 - ambient) * bbLGc);
            let bbb = pxl.b * (ambient + (1 - ambient) * bbLBc);
            if (useLinearFog) {
              const fogFactor = Math.max(0, Math.min(1, (pixDepth - fogNear) / (fogFar - fogNear)));
              bbr = bbr * (1 - fogFactor) + fogR * fogFactor;
              bbg = bbg * (1 - fogFactor) + fogG * fogFactor;
              bbb = bbb * (1 - fogFactor) + fogB * fogFactor;
            } else if (fogDensity > 0) {
              const fogFactor = 1 - Math.exp(-fogDensity * pixDepth);
              bbr = bbr * (1 - fogFactor) + fogR * fogFactor;
              bbg = bbg * (1 - fogFactor) + fogG * fogFactor;
              bbb = bbb * (1 - fogFactor) + fogB * fogFactor;
            }
            const off = sy2 * rw * 4 + sx2 * 4;
            const fa = (pxl.a ?? 255) / 255;
            if (fa >= 1) {
              ws[off] = bbr; ws[off + 1] = bbg; ws[off + 2] = bbb; ws[off + 3] = 255;
            } else {
              ws[off] = ws[off] * (1 - fa) + bbr * fa;
              ws[off + 1] = ws[off + 1] * (1 - fa) + bbg * fa;
              ws[off + 2] = ws[off + 2] * (1 - fa) + bbb * fa;
              ws[off + 3] = 255;
            }
          }
        }
      }
    }
    for (const t of transparent) raster(t);
    // ===== UPSCALE (only paint where triangles rendered) =====
    // Nearest-neighbor upscale from the scaled render buffer to the actual framebuffer.
    // The | 0 is intentional floor. This is where the "pixelated" look comes from:
    // render at half res, upscale with no smoothing. If you want smooth upscaling,
    // change GL_NEAREST to GL_LINEAR in the OpenGL side (or just don't use this renderer).
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = (x * rw / width) | 0;
        const sy = (y * rh / height) | 0;
        const si = (sy * rw + sx) * 4;
        const di = (y * width + x) * 4;
        if (ws[si+3] > 0) {
          fb[di] = ws[si];
          fb[di+1] = ws[si+1];
          fb[di+2] = ws[si+2];
          fb[di+3] = ws[si+3];
        }
      }
    }
  }
}