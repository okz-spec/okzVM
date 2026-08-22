import { VMCore, Value } from '../types';

export function registerNativeAPI(vm: VMCore, globals: Record<string, Value>): void {
    if (!vm.mainProcess) return;

    globals['bit'] = {
      type: 'table', value: {
        'band': { type: 'native', value: (vm: VMCore) => { const b = vm.popNum(); const a = vm.popNum(); return vm.num((a | 0) & (b | 0)); }},
        'bor': { type: 'native', value: (vm: VMCore) => { const b = vm.popNum(); const a = vm.popNum(); return vm.num((a | 0) | (b | 0)); }},
        'bxor': { type: 'native', value: (vm: VMCore) => { const b = vm.popNum(); const a = vm.popNum(); return vm.num((a | 0) ^ (b | 0)); }},
        'bnot': { type: 'native', value: (vm: VMCore) => { const a = vm.popNum(); return vm.num(~(a | 0)); }},
        'lshift': { type: 'native', value: (vm: VMCore) => { const n = vm.popNum(); const a = vm.popNum(); return vm.num((a | 0) << (n | 0)); }},
        'rshift': { type: 'native', value: (vm: VMCore) => { const n = vm.popNum(); const a = vm.popNum(); return vm.num((a | 0) >> (n | 0)); }},
      },
    };

    globals['screen'] = {
      type: 'table', value: {
        'clear': { type: 'native', value: (vm: VMCore) => { vm.rcmd.push({ type: 'clear', r: 0, g: 0, b: 0 }); return vm.nil(); }},
        'color': { type: 'native', value: (vm: VMCore) => { const b = vm.popNum(); const g = vm.popNum(); const r = vm.popNum(); vm.rcmd.push({ type: 'set_color', r, g, b, a: 255 }); return vm.nil(); }},
        'pixel': { type: 'native', value: (vm: VMCore) => { const y = vm.popNum(); const x = vm.popNum(); vm.rcmd.push({ type: 'pixel', x, y }); return vm.nil(); }},
        'line': { type: 'native', value: (vm: VMCore) => { const y2 = vm.popNum(); const x2 = vm.popNum(); const y1 = vm.popNum(); const x1 = vm.popNum(); vm.rcmd.push({ type: 'line', x1, y1, x2, y2 }); return vm.nil(); }},
        'rect': { type: 'native', value: (vm: VMCore) => { const h = vm.popNum(); const w = vm.popNum(); const y = vm.popNum(); const x = vm.popNum(); vm.rcmd.push({ type: 'rect', x, y, w, h }); return vm.nil(); }},
        'circle': { type: 'native', value: (vm: VMCore) => { const r = vm.popNum(); const cy = vm.popNum(); const cx = vm.popNum(); vm.rcmd.push({ type: 'circle', cx, cy, r, fill: true }); return vm.nil(); }},
        'triangle': { type: 'native', value: (vm: VMCore) => { const y3 = vm.popNum(); const x3 = vm.popNum(); const y2 = vm.popNum(); const x2 = vm.popNum(); const y1 = vm.popNum(); const x1 = vm.popNum(); vm.rcmd.push({ type: 'triangle', x1, y1, x2, y2, x3, y3, fill: true }); return vm.nil(); }},
        'polygon': { type: 'native', value: (vm: VMCore) => {
          const ptsVal = vm.getProcStack().pop();
          const points: number[] = [];
          if (ptsVal && (ptsVal.type === 'array' || ptsVal.type === 'table')) {
            const raw = ptsVal.type === 'array' ? ptsVal.value : ptsVal.value;
            for (let i = 1; i <= 1000; i++) {
              const p = raw[i];
              if (!p) break;
              const pv = p.value || p;
              const px = pv['x']?.value ?? 0;
              const py = pv['y']?.value ?? 0;
              points.push(px, py);
            }
          }
          vm.rcmd.push({ type: 'polygon', points, fill: true });
          return vm.nil();
        }},
        'rectOutline': { type: 'native', value: (vm: VMCore) => { const h = vm.popNum(); const w = vm.popNum(); const y = vm.popNum(); const x = vm.popNum(); vm.rcmd.push({ type: 'rect', x, y, w, h, fill: false }); return vm.nil(); }},
        'circleOutline': { type: 'native', value: (vm: VMCore) => { const r = vm.popNum(); const cy = vm.popNum(); const cx = vm.popNum(); vm.rcmd.push({ type: 'circle', cx, cy, r, fill: false }); return vm.nil(); }},
        'triangleOutline': { type: 'native', value: (vm: VMCore) => { const y3 = vm.popNum(); const x3 = vm.popNum(); const y2 = vm.popNum(); const x2 = vm.popNum(); const y1 = vm.popNum(); const x1 = vm.popNum(); vm.rcmd.push({ type: 'triangle', x1, y1, x2, y2, x3, y3, fill: false }); return vm.nil(); }},
        'sync': { type: 'native', value: (vm: VMCore) => { vm.interpreter.syncRequested = true; return vm.nil(); }},
        'width': { type: 'native', value: () => vm.num(vm.graphics.width) },
        'height': { type: 'native', value: () => vm.num(vm.graphics.height) },
        'render3D': { type: 'native', value: (vm: VMCore) => {
          const cfg = vm.getProcStack().pop();
          if (!cfg || cfg.type !== 'table') return vm.nil();
          const c = cfg.value;

          const vertsVal = c['vertices'];
          const trisVal = c['triangles'];
          const camVal = c['camera'];
          if (!vertsVal || !trisVal || !camVal) return vm.nil();

          const rawVerts = vertsVal.type === 'array' ? vertsVal.value : (vertsVal.type === 'table' ? vertsVal.value : {});
          const rawTris = trisVal.type === 'array' ? trisVal.value : (trisVal.type === 'table' ? trisVal.value : {});
          const rawCam = camVal.value || camVal;

          const camera = {
            x: rawCam['x']?.value ?? 0, y: rawCam['y']?.value ?? 0, z: rawCam['z']?.value ?? 5,
            rx: rawCam['rx']?.value ?? 0, ry: rawCam['ry']?.value ?? 0,
            fov: rawCam['fov']?.value ?? 90,
          };

          const vertices: R3DVertex[] = [];
          const vertKeys = Object.keys(rawVerts);
          let maxVertIdx = 0;
          for (const k of vertKeys) { const n = Number(k); if (Number.isInteger(n) && n > maxVertIdx) maxVertIdx = n; }
          const vertCap = Math.min(maxVertIdx, 1550000);
          for (let i = 1; i <= vertCap; i++) {
            const v = rawVerts[i];
            if (!v) continue;
            const vv = v.value || v;
            vertices.push({
              x: vv['x']?.value ?? 0,
              y: vv['y']?.value ?? 0,
              z: vv['z']?.value ?? 0,
              u: vv['u']?.value,
              v: vv['v']?.value,
              blend: vv['blend']?.value,
            });
          }

          const triKeys = Object.keys(rawTris);
          const triangles: R3DTriangle[] = [];
           const texCache = new Map<any, { pxArr: Array<{ r: number; g: number; b: number; a?: number } | null>; texW: number; texH: number }>();
           for (const key of triKeys) {
            const t = rawTris[key];
            if (!t) continue;
            const tv = t.value || t;
            const col = tv['color'];
            const triangle: any = { i0: tv['i0']?.value ?? 0, i1: tv['i1']?.value ?? 0, i2: tv['i2']?.value ?? 0 };
            if (col) {
              const cv = col.value || col;
              triangle.color = { r: cv['r']?.value ?? 200, g: cv['g']?.value ?? 200, b: cv['b']?.value ?? 200, a: cv['a']?.value ?? 255 };
            }
            const texVal = tv['texture'];
            if (texVal && (texVal.type === 'array' || texVal.type === 'table')) {
              let cached = texCache.get(texVal);
              if (!cached) {
                const pxArr: Array<{ r: number; g: number; b: number; a?: number } | null> = [];
                let maxPxIdx = 0;
                const pxKeys = Object.keys(texVal.type === 'array' ? texVal.value : texVal.value);
                for (const k of pxKeys) { const n = Number(k); if (!isNaN(n) && n > maxPxIdx) maxPxIdx = n; }
                for (let i = 1; i <= maxPxIdx; i++) {
                  const px = texVal.type === 'array' ? texVal.value[i] : texVal.value[i];
                  if (!px || px.type === 'nil') { pxArr.push(null); continue; }
                  const pv = px.value || px;
                  pxArr.push({ r: pv['r']?.value ?? 0, g: pv['g']?.value ?? 0, b: pv['b']?.value ?? 0, a: pv['a']?.value });
                }
                cached = { pxArr, texW: tv['texW']?.value ?? Math.sqrt(pxArr.length), texH: tv['texH']?.value ?? Math.sqrt(pxArr.length) };
                texCache.set(texVal, cached);
              }
              triangle.texture = cached.pxArr;
              triangle.texW = cached.texW;
              triangle.texH = cached.texH;
            }
            const tex2Val = tv['texture2'];
            if (tex2Val && (tex2Val.type === 'array' || tex2Val.type === 'table')) {
              let cached2 = texCache.get(tex2Val);
              if (!cached2) {
                const pxArr2: Array<{ r: number; g: number; b: number; a?: number } | null> = [];
                let maxPxIdx2 = 0;
                const pxKeys2 = Object.keys(tex2Val.type === 'array' ? tex2Val.value : tex2Val.value);
                for (const k of pxKeys2) { const n = Number(k); if (!isNaN(n) && n > maxPxIdx2) maxPxIdx2 = n; }
                for (let i = 1; i <= maxPxIdx2; i++) {
                  const px = tex2Val.type === 'array' ? tex2Val.value[i] : tex2Val.value[i];
                  if (!px || px.type === 'nil') { pxArr2.push(null); continue; }
                  const pv = px.value || px;
                  pxArr2.push({ r: pv['r']?.value ?? 0, g: pv['g']?.value ?? 0, b: pv['b']?.value ?? 0, a: pv['a']?.value });
                }
                cached2 = { pxArr: pxArr2, texW: tv['texW2']?.value ?? Math.sqrt(pxArr2.length), texH: tv['texH2']?.value ?? Math.sqrt(pxArr2.length) };
                texCache.set(tex2Val, cached2);
              }
              triangle.texture2 = cached2.pxArr;
              triangle.texW2 = cached2.texW;
              triangle.texH2 = cached2.texH;
            }
            triangles.push(triangle);
          }
           // Billboards
          const bbsVal = c['billboards'];
          let billboards: any = undefined;
          if (bbsVal && (bbsVal.type === 'array' || bbsVal.type === 'table')) {
            const bbs = bbsVal.type === 'array' ? bbsVal.value : Object.values(bbsVal.value).filter(v => v);
            billboards = [];
            for (const bb of bbs) {
              const bv = bb.value || bb;
              const pixelsVal = bv['pixels'];
              if (!pixelsVal) continue;
              const rawPx = pixelsVal.type === 'array' ? pixelsVal.value : (pixelsVal.type === 'table' ? pixelsVal.value : {});
              const pxArr: Array<{ r: number; g: number; b: number; a?: number } | null> = [];
              const pxKeys = Object.keys(rawPx);
              let maxIdx = 0;
              for (const k of pxKeys) { const n = Number(k); if (!isNaN(n) && n > maxIdx) maxIdx = n; }
              for (let i = 1; i <= maxIdx; i++) {
                const px = rawPx[i];
                if (!px || px.type === 'nil') { pxArr.push(null); continue; }
                const pv = px.value || px;
                pxArr.push({ r: pv['r']?.value ?? 0, g: pv['g']?.value ?? 0, b: pv['b']?.value ?? 0, a: pv['a']?.value });
              }
              billboards.push({
                x: bv['x']?.value ?? 0, y: bv['y']?.value ?? 0, z: bv['z']?.value ?? 0,
                w: bv['w']?.value ?? 16, h: bv['h']?.value ?? 16,
                pw: bv['pw']?.value, ph: bv['ph']?.value,
                pixels: pxArr,
              });
            }
          }
          let lightDir: { x: number; y: number; z: number } | undefined;
          const ldVal = c['lightDir'];
          if (ldVal) {
            const ldRaw = ldVal.value || ldVal;
            lightDir = { x: ldRaw['x']?.value ?? 0.3, y: ldRaw['y']?.value ?? -0.8, z: ldRaw['z']?.value ?? 0.5 };
          }
          let lightColor: { r: number; g: number; b: number } | undefined;
          const lcVal = c['lightColor'];
          if (lcVal) {
            const lcRaw = lcVal.value || lcVal;
            lightColor = { r: lcRaw['r']?.value ?? 255, g: lcRaw['g']?.value ?? 255, b: lcRaw['b']?.value ?? 255 };
          }
          let lights: { x: number; y: number; z: number; r: number; g: number; b: number; intensity?: number; radius?: number }[] | undefined;
          const lightsVal = c['lights'];
          if (lightsVal) {
            const lightsRaw = lightsVal.value || lightsVal;
            lights = [];
            let li = 1;
            while (lightsRaw[li] !== undefined || lightsRaw[String(li)] !== undefined) {
              const lv = lightsRaw[li] || lightsRaw[String(li)];
              if (lv) {
                const lr2 = lv.value || lv;
                lights.push({
                  x: lr2['x']?.value ?? 0, y: lr2['y']?.value ?? 0, z: lr2['z']?.value ?? 0,
                  r: lr2['r']?.value ?? 255, g: lr2['g']?.value ?? 255, b: lr2['b']?.value ?? 255,
                  intensity: lr2['intensity']?.value, radius: lr2['radius']?.value,
                });
              }
              li++;
            }
          }
          let fogColor: { r: number; g: number; b: number } | undefined;
          const fcVal = c['fogColor'];
          if (fcVal) {
            const fcRaw = fcVal.value || fcVal;
            fogColor = { r: fcRaw['r']?.value ?? 135, g: fcRaw['g']?.value ?? 190, b: fcRaw['b']?.value ?? 240 };
          }
          vm.rcmd.push({
            type: 'render3D',
            config: {
              vertices, triangles, camera, scale: c['scale']?.value ?? 0.5, billboards,
              blendWithFb: c['blendWithFb']?.value === true,
              ambient: c['ambient']?.value,
              lightDir,
              lightColor,
              lightIntensity: c['lightIntensity']?.value,
              lights,
              fogDensity: c['fogDensity']?.value,
              fogNear: c['fogNear']?.value,
              fogFar: c['fogFar']?.value,
              fogColor,
              shadows: c['shadows']?.value === true,
              shadowPlaneY: c['shadowPlaneY']?.value,
              shadowColor: (() => { const sv = c['shadowColor']; if (!sv) return undefined; const sr = sv.value || sv; return { r: sr['r']?.value ?? 0, g: sr['g']?.value ?? 0, b: sr['b']?.value ?? 0 }; })(),
              shadowAlpha: c['shadowAlpha']?.value,
              cullBehind: c['cullBehind']?.value === true,
            },
          });
          return vm.nil();
        }},
      },
    };

    globals['mouse'] = {
      type: 'table', value: {
        'x': { type: 'native', value: () => vm.num(vm.input.mouse.x) },
        'y': { type: 'native', value: () => vm.num(vm.input.mouse.y) },
        'deltaX': { type: 'native', value: (vm: VMCore) => { const v = vm.input.mouse.deltaX; vm.input.mouse.deltaX = 0; return vm.num(v); }},
        'deltaY': { type: 'native', value: (vm: VMCore) => { const v = vm.input.mouse.deltaY; vm.input.mouse.deltaY = 0; return vm.num(v); }},
        'left': { type: 'native', value: () => vm.bool(vm.input.mouse.left) },
        'right': { type: 'native', value: () => vm.bool(vm.input.mouse.right) },
        'wheel': { type: 'native', value: () => vm.num(vm.input.mouse.wheel) },
        'locked': { type: 'native', value: () => vm.bool(vm.input.mouse.pointerLocked) },
        'setPointerLock': { type: 'native', value: (vm: VMCore) => { const enabled = vm.popNum() !== 0; vm.input.setPointerLock(enabled); return vm.nil(); }},
        'setPosition': { type: 'native', value: (vm: VMCore) => { const y = vm.popNum(); const x = vm.popNum(); vm.input.mouse.x = x; vm.input.mouse.y = y; vm.input.virtualX = x; vm.input.virtualY = y; return vm.nil(); }},
      },
    };

    globals['keyboard'] = {
      type: 'table', value: {
        'isPressed': { type: 'native', value: (vm: VMCore) => vm.bool(vm.input.isKeyPressed(vm.popStr())) },
        'justPressed': { type: 'native', value: (vm: VMCore) => vm.bool(vm.input.wasKeyJustPressed(vm.popStr())) },
        'justReleased': { type: 'native', value: (vm: VMCore) => vm.bool(vm.input.wasKeyJustReleased(vm.popStr())) },
      },
    };

    globals['system'] = {
      type: 'table', value: {
        'deltaTime': { type: 'native', value: (vm: VMCore) => { const dt = vm.clock.deltaTime; if (dt > 1) console.log("[SYS] deltaTime=" + dt + " frameCount=" + vm.clock.frameCount); return vm.num(dt); } },
        'elapsedTime': { type: 'native', value: (vm: VMCore) => vm.num(vm.clock.elapsedTime) },
        'fps': { type: 'native', value: (vm: VMCore) => vm.num(vm.currentFps) },
        'fpsLimit': { type: 'native', value: (vm: VMCore) => { const n = vm.popNum(); if (n > 0) { vm.settings.fpsLimit = n; vm.instructionsPerFrame = vm.calculateInstructionsPerFrame(); } return vm.num(vm.settings.fpsLimit); }},
        'frameCount': { type: 'native', value: (vm: VMCore) => vm.num(vm.clock.frameCount) },
        'log': { type: 'native', value: (vm: VMCore) => { const msg = vm.popStr(); vm.log(msg, 'info'); return vm.nil(); }},
        'cpuSpeed': { type: 'native', value: (vm: VMCore) => vm.num(vm.settings.cpuFrequency) },
        'cpuCores': { type: 'native', value: (vm: VMCore) => vm.num(vm.settings.cpuCores) },
        'totalMemory': { type: 'native', value: (vm: VMCore) => vm.num(vm.settings.ramSize) },
        'wait': { type: 'native', value: (vm: VMCore) => {
          const seconds = vm.popNum();
          const proc = vm.mainProcess;
          if (proc) { (proc as any).sleepUntil = vm.clock.elapsedTime + seconds; }
          vm.interpreter.syncRequested = true;
          return vm.nil();
        }},
      },
    };

    globals['audio'] = {
      type: 'table', value: {
        // ===== FILE I/O =====
        'load': { type: 'native', value: (vm: VMCore) => {
          const path = vm.popStr(); const name = vm.popStr();
          vm.audio.load(name, vm.projectDir, path);
          return vm.nil();
        }},
        'unload': { type: 'native', value: (vm: VMCore) => {
          vm.audio.unload(vm.popStr()); return vm.nil();
        }},
        // ===== METADATA =====
        'info': { type: 'native', value: (vm: VMCore) => {
          const name = vm.popStr(); const info = vm.audio.info(name);
          if (!info) return vm.nil();
          const t: Record<string, Value> = {};
          t['sampleRate'] = vm.num(info.sampleRate);
          t['channels'] = vm.num(info.channels);
          t['samples'] = vm.num(info.samples);
          t['duration'] = vm.num(info.duration);
          return { type: 'table', value: t };
        }},
        'sampleRate': { type: 'native', value: (vm: VMCore) => vm.num(vm.audio.sampleRate(vm.popStr())) },
        'channels': { type: 'native', value: (vm: VMCore) => vm.num(vm.audio.channels(vm.popStr())) },
        'duration': { type: 'native', value: (vm: VMCore) => vm.num(vm.audio.duration(vm.popStr())) },
        'length': { type: 'native', value: (vm: VMCore) => vm.num(vm.audio.length(vm.popStr())) },
        // ===== SAMPLE ACCESS =====
        'sample': { type: 'native', value: (vm: VMCore) => {
          const idx = vm.popNum(); const ch = vm.popNum(); const name = vm.popStr();
          return vm.num(vm.audio.getSample(name, ch, idx));
        }},
        'setSample': { type: 'native', value: (vm: VMCore) => {
          const val = vm.popNum(); const idx = vm.popNum(); const ch = vm.popNum(); const name = vm.popStr();
          vm.audio.setSample(name, ch, idx, val);
          return vm.nil();
        }},
        'getChannel': { type: 'native', value: (vm: VMCore) => {
          const ch = vm.popNum(); const name = vm.popStr();
          const data = vm.audio.getChannel(name, ch);
          if (!data) return vm.nil();
          const arr: Value[] = [];
          for (let i = 0; i < data.length; i++) arr[i + 1] = vm.num(data[i]);
          return { type: 'array', value: arr };
        }},
        'setChannel': { type: 'native', value: (vm: VMCore) => {
          const samplesVal = vm.getProcStack().pop();
          const ch = vm.popNum(); const name = vm.popStr();
          if (samplesVal.type !== 'array') return vm.nil();
          const raw = samplesVal.value;
          const f32 = new Float32Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            const v = raw[i];
            f32[i] = v?.type === 'number' ? v.value : 0;
          }
          vm.audio.setChannel(name, ch, f32);
          return vm.nil();
        }},
        // ===== BUFFER CREATION =====
        'create': { type: 'native', value: (vm: VMCore) => {
          const len = vm.popNum(); const ch = vm.popNum(); const sr = vm.popNum(); const name = vm.popStr();
          vm.audio.create(name, sr, ch, len);
          return vm.nil();
        }},
        'silence': { type: 'native', value: (vm: VMCore) => { vm.audio.silence(vm.popStr()); return vm.nil(); }},
        'fill': { type: 'native', value: (vm: VMCore) => {
          const val = vm.popNum(); const ch = vm.popNum(); const name = vm.popStr();
          vm.audio.fill(name, ch, val);
          return vm.nil();
        }},
        'genTone': { type: 'native', value: (vm: VMCore) => {
          const duty = vm.popNum(); const amp = vm.popNum(); const wType = vm.popStr();
          const dur = vm.popNum(); const freq = vm.popNum(); const sr = vm.popNum(); const name = vm.popStr();
          vm.audio.generateTone(name, sr, freq, dur, wType as any, amp, duty);
          return vm.nil();
        }},
        'genNote': { type: 'native', value: (vm: VMCore) => {
          const amp = vm.popNum(); const wType = vm.popStr();
          const dur = vm.popNum(); const oct = vm.popNum(); const note = vm.popStr();
          const sr = vm.popNum(); const name = vm.popStr();
          vm.audio.generateNote(name, sr, note, oct, dur, wType as any, amp);
          return vm.nil();
        }},
        // ===== MANIPULATION =====
        'reverse': { type: 'native', value: (vm: VMCore) => { vm.audio.reverse(vm.popStr()); return vm.nil(); }},
        'trim': { type: 'native', value: (vm: VMCore) => {
          const end = vm.popNum(); const start = vm.popNum(); const name = vm.popStr();
          vm.audio.trim(name, start, end);
          return vm.nil();
        }},
        'mix': { type: 'native', value: (vm: VMCore) => {
          const vol = vm.popNum(); const src = vm.popStr(); const dest = vm.popStr();
          vm.audio.mix(dest, src, vol);
          return vm.nil();
        }},
        'normalize': { type: 'native', value: (vm: VMCore) => { vm.audio.normalize(vm.popStr()); return vm.nil(); }},
        'copy': { type: 'native', value: (vm: VMCore) => {
          const src = vm.popStr(); const dest = vm.popStr();
          vm.audio.copy(dest, src);
          return vm.nil();
        }},
        // ===== PLAYBACK =====
        'play': { type: 'native', value: (vm: VMCore) => {
          const optsVal = vm.getProcStack().pop();
          const name = vm.popStr();
          let opts: any = undefined;
          if (optsVal.type === 'table') {
            const ov = optsVal.value;
            opts = {};
            if (ov['volume']) opts.volume = ov['volume'].type === 'number' ? ov['volume'].value : undefined;
            if (ov['rate']) opts.rate = ov['rate'].type === 'number' ? ov['rate'].value : undefined;
            if (ov['loop']) opts.loop = ov['loop'].type === 'boolean' ? ov['loop'].value : undefined;
            if (ov['offset']) opts.offset = ov['offset'].type === 'number' ? ov['offset'].value : undefined;
          }
          try { vm.audio.play(name, opts); } catch (e: any) { vm.logFn(`audio.play error: ${e.message}`, 'error'); }
          return vm.nil();
        }},
        'pause': { type: 'native', value: (vm: VMCore) => { vm.audio.pause(vm.popStr()); return vm.nil(); }},
        'resume': { type: 'native', value: (vm: VMCore) => { vm.audio.resume(vm.popStr()); return vm.nil(); }},
        'stop': { type: 'native', value: (vm: VMCore) => { vm.audio.stop(vm.popStr()); return vm.nil(); }},
        'seek': { type: 'native', value: (vm: VMCore) => {
          const sec = vm.popNum(); const name = vm.popStr();
          vm.audio.seek(name, sec);
          return vm.nil();
        }},
        'position': { type: 'native', value: (vm: VMCore) => vm.num(vm.audio.position(vm.popStr())) },
        'isPlaying': { type: 'native', value: (vm: VMCore) => vm.bool(vm.audio.isPlaying(vm.popStr())) },
        // ===== FFT =====
        'fft': { type: 'native', value: (vm: VMCore) => {
          const fftSize = vm.popNum(); const ch = vm.popNum(); const name = vm.popStr();
          const mag = vm.audio.fft(name, ch, fftSize);
          if (!mag) return vm.nil();
          const arr: Value[] = [];
          for (let i = 0; i < mag.length; i++) arr[i + 1] = vm.num(mag[i]);
          return { type: 'array', value: arr };
        }},
        // ===== LEGACY =====
        'tone': { type: 'native', value: (vm: VMCore) => {
          const vol = vm.popNum(); const type = vm.popStr(); const dur = vm.popNum(); const freq = vm.popNum();
          vm.audio.generateToneRaw(freq, dur, type as any, vol);
          return vm.nil();
        }},
        'note': { type: 'native', value: (vm: VMCore) => {
          const vol = vm.popNum(); const type = vm.popStr(); const dur = vm.popNum();
          const oct = vm.popNum(); const noteStr = vm.popStr();
          vm.audio.generateNoteRaw(noteStr, oct, dur, type as any, vol);
          return vm.nil();
        }},
        'volume': { type: 'native', value: (vm: VMCore) => {
          const v = vm.popNum(); if (v >= 0) vm.audio.setVolume(v); return vm.num(vm.audio.getVolume());
        }},
        'stopAll': { type: 'native', value: (vm: VMCore) => { vm.audio.stopAll(); return vm.nil(); }},
      },
    };

    globals['math'] = {
      type: 'table', value: {
        'pi': { type: 'number', value: Math.PI },
        'huge': { type: 'number', value: Infinity },
        'cos': { type: 'native', value: (vm: VMCore) => vm.num(Math.cos(vm.popNum())) },
        'sin': { type: 'native', value: (vm: VMCore) => vm.num(Math.sin(vm.popNum())) },
        'tan': { type: 'native', value: (vm: VMCore) => vm.num(Math.tan(vm.popNum())) },
        'abs': { type: 'native', value: (vm: VMCore) => vm.num(Math.abs(vm.popNum())) },
        'floor': { type: 'native', value: (vm: VMCore) => vm.num(Math.floor(vm.popNum())) },
        'ceil': { type: 'native', value: (vm: VMCore) => vm.num(Math.ceil(vm.popNum())) },
        'sqrt': { type: 'native', value: (vm: VMCore) => vm.num(Math.sqrt(vm.popNum())) },
        'max': { type: 'native', value: (vm: VMCore) => { const b = vm.popNum(); const a = vm.popNum(); return vm.num(Math.max(a, b)); }},
        'min': { type: 'native', value: (vm: VMCore) => { const b = vm.popNum(); const a = vm.popNum(); return vm.num(Math.min(a, b)); }},
        'random': { type: 'native', value: (vm: VMCore) => { const nargs = vm.getProcStack().length; if (nargs >= 2) { const max = vm.popNum(); const min = vm.popNum(); return vm.num(min + Math.floor(Math.random() * (max - min + 1))); } if (nargs >= 1) { const max = vm.popNum(); return vm.num(1 + Math.floor(Math.random() * max)); } return vm.num(Math.random()); } },
        'atan2': { type: 'native', value: (vm: VMCore) => { const x = vm.popNum(); const y = vm.popNum(); return vm.num(Math.atan2(y, x)); }},
        'log': { type: 'native', value: (vm: VMCore) => { const base = vm.popNum(); return vm.num(Math.log(base)); }},
        'exp': { type: 'native', value: (vm: VMCore) => { const x = vm.popNum(); return vm.num(Math.exp(x)); }},
        'pow': { type: 'native', value: (vm: VMCore) => { const b = vm.popNum(); const a = vm.popNum(); return vm.num(Math.pow(a, b)); }},
        'vec2': { type: 'native', value: (vm: VMCore) => { const y = vm.popNum(); const x = vm.popNum(); return vm.mathVec2(x, y); }},
        'vec3': { type: 'native', value: (vm: VMCore) => { const z = vm.popNum(); const y = vm.popNum(); const x = vm.popNum(); return vm.mathVec3(x, y, z); }},
        'vec2Length': { type: 'native', value: (vm: VMCore) => { const v = vm.getProcStack().pop(); const sx = (v as any).value?.x?.value ?? 0; const sy = (v as any).value?.y?.value ?? 0; return vm.num(Math.sqrt(sx*sx + sy*sy)); }},
        'vec2Add': { type: 'native', value: (vm: VMCore) => { const b = vm.getProcStack().pop(); const a = vm.getProcStack().pop(); const ax = (a as any).value?.x?.value ?? 0; const ay = (a as any).value?.y?.value ?? 0; const bx = (b as any).value?.x?.value ?? 0; const by = (b as any).value?.y?.value ?? 0; return vm.mathVec2(ax+bx, ay+by); }},
        'vec2Dist': { type: 'native', value: (vm: VMCore) => { const b = vm.getProcStack().pop(); const a = vm.getProcStack().pop(); const dx = ((a as any).value?.x?.value ?? 0) - ((b as any).value?.x?.value ?? 0); const dy = ((a as any).value?.y?.value ?? 0) - ((b as any).value?.y?.value ?? 0); return vm.num(Math.sqrt(dx*dx + dy*dy)); }},
      },
    };

    globals['string'] = {
      type: 'table', value: {
        'byte': { type: 'native', value: (vm: VMCore) => { const s = vm.popStr(); if (s.length > 0) return vm.num(s.charCodeAt(0)); return vm.nil(); }},
        'char': { type: 'native', value: (vm: VMCore) => { const c = vm.popNum(); return vm.str(String.fromCharCode(c)); }},
        'sub': { type: 'native', value: (vm: VMCore) => {
          const ps = vm.getProcStack(); const na = ps.length;
          const e = na >= 3 ? vm.popNum() : -1;
          const start = na >= 2 ? vm.popNum() : 1;
          const str = na >= 1 ? vm.popStr() : '';
          const len = str.length;
          let i = start < 0 ? Math.max(0, len + start) : Math.min(len, Math.max(1, start) - 1);
          let j = e < 0 ? Math.max(0, len + e + 1) : Math.min(len, e);
          if (i >= j) return vm.str('');
          return vm.str(str.substring(i, j));
        }},
        'find': { type: 'native', value: (vm: VMCore) => { const p = vm.popStr(); const s = vm.popStr(); const idx = s.indexOf(p); if (idx === -1) return vm.nil(); return vm.num(idx + 1); }},
        'lower': { type: 'native', value: (vm: VMCore) => vm.str(vm.popStr().toLowerCase()) },
        'upper': { type: 'native', value: (vm: VMCore) => vm.str(vm.popStr().toUpperCase()) },
        'reverse': { type: 'native', value: (vm: VMCore) => { const s = vm.popStr(); return vm.str(s.split('').reverse().join('')); }},
        'rep': { type: 'native', value: (vm: VMCore) => { const n = vm.popNum(); const s = vm.popStr(); return vm.str(s.repeat(Math.max(0, Math.floor(n)))); }},
        'format': { type: 'native', value: (vm: VMCore) => {
          const ps = vm.getProcStack();
          const nargs = ps.length;
          const args: any[] = [];
          for (let i = 0; i < nargs; i++) { const v = vm.getProcStack().pop(); args.unshift(v?.value ?? v); }
          const fmt = String(args[0] ?? '');
          let argIdx = 1;
          const result = fmt.replace(/%([diouxXeEfFgGcrs%])/g, (match: string, spec: string): string => {
            if (spec === '%') return '%';
            if (argIdx >= args.length) return match;
            const val = args[argIdx++];
            switch (spec) {
              case 'd': case 'i': case 'o': case 'u': case 'x': case 'X':
                return String(Math.floor(Number(val) || 0));
              case 'e': case 'E': case 'f': case 'F': case 'g': case 'G':
                return String(Number(val) || 0);
              case 'c': return String.fromCharCode(Number(val) || 0);
              case 's': return String(val ?? '');
              default: return match;
            }
          });
          return vm.str(result);
        }},
      },
    };

    globals['table'] = {
      type: 'table', value: {
        'insert': { type: 'native', value: (vm: VMCore) => { const val = vm.getProcStack().pop(); const arr = vm.getProcStack().pop(); if (arr.type === 'array') { arr.value.push(val); } return vm.nil(); }},
        'remove': { type: 'native', value: (vm: VMCore) => { const arr = vm.getProcStack().pop(); if (arr.type === 'array') { const v = arr.value.pop(); return v || vm.nil(); } return vm.nil(); }},
        'sort': { type: 'native', value: (vm: VMCore) => {
          const cmpFn = vm.getProcStack().pop();
          const arr = vm.getProcStack().pop();
          if (arr.type !== 'array') return vm.nil();
          const a = arr.value;
          const keys = Object.keys(a).map(Number).filter(k => !isNaN(k) && a[k] !== undefined).sort((x, y) => x - y);
          const items: Value[] = keys.map(k => a[k]);
          const n = items.length;
          if (n <= 1) return vm.nil();
          if (cmpFn && cmpFn.type === 'function') {
            const fn = cmpFn.value;
            const lo = 0; const hi = n - 1;
            const stack: number[] = [lo, hi];
            while (stack.length > 0) {
              const h = stack.pop()!;
              const l = stack.pop()!;
              if (l >= h) continue;
              const pivot = items[h];
              let i = l;
              for (let j = l; j < h; j++) {
                vm.getProcStack().push(items[j], pivot);
                const result = fn(vm);
                const lt = result && result.type === 'boolean' ? result.value : true;
                if (lt) { const tmp = items[i]; items[i] = items[j]; items[j] = tmp; i++; }
              }
              const tmp = items[i]; items[i] = items[h]; items[h] = tmp;
              if (i - 1 > l) { stack.push(l, i - 1); }
              if (i + 1 < h) { stack.push(i + 1, h); }
            }
          } else {
            items.sort((a, b) => {
              if (a.type === 'number' && b.type === 'number') return a.value - b.value;
              if (a.type === 'string' && b.type === 'string') return a.value.localeCompare(b.value);
              return 0;
            });
          }
          for (let i = 0; i < items.length; i++) { a[keys[i]] = items[i]; }
          return vm.nil();
        }},
        'concat': { type: 'native', value: (vm: VMCore) => { const sep = vm.popStr(); const arr = vm.getProcStack().pop(); if (arr.type !== 'array') return vm.str(''); const parts: string[] = []; for (const v of arr.value) { if (v) { parts.push(v.type === 'string' ? v.value : String(v.type === 'number' ? v.value : '')); } } return vm.str(parts.join(sep)); }},
        'keys': { type: 'native', value: (vm: VMCore) => { const t = vm.getProcStack().pop(); const entries = t.type === 'table' || t.type === 'array' ? t.value : {}; const keys = Object.keys(entries).sort((a, b) => { const na = Number(a); const nb = Number(b); if (!isNaN(na) && !isNaN(nb)) return na - nb; return a.localeCompare(b); }); const result: Value[] = []; for (let i = 0; i < keys.length; i++) result[i + 1] = vm.str(keys[i]); return { type: 'array', value: result }; }},
      },
    };

    globals['debug'] = {
      type: 'table', value: {
        'traceback': { type: 'native', value: (vm: VMCore) => {
          const proc = vm.mainProcess;
          let trace = 'Stack traceback:\n';
          if (proc) {
            trace += '  [0] main: pc=' + proc.pc + '\n';
            for (let i = proc.frames.length - 1; i >= 0; i--) {
              const f = proc.frames[i];
              trace += '  [' + (proc.frames.length - i) + '] ' + (f.name || '?') + '\n';
            }
          }
          return vm.str(trace);
        }},
        'wireframe': { type: 'native', value: (vm: VMCore) => { vm.rcmd.toggleWireframe(); return vm.nil(); }},
        'wireframeStatus': { type: 'native', value: (vm: VMCore) => vm.bool(vm.rcmd.wireframe) },
      },
    };

    globals['type'] = { type: 'native', value: (vm: VMCore) => vm.str((vm.getProcStack().pop()?.type) || 'nil') };

    globals['pairs'] = { type: 'native', value: (vm: VMCore) => {
      const tbl = vm.getProcStack().pop();
      if (!tbl || (tbl.type !== 'table' && tbl.type !== 'array')) return vm.nil();
      const keys = Object.keys(tbl.value).sort((a, b) => {
        const na = Number(a); const nb = Number(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
      let idx = 0;
      return { type: 'native', value: (vm: VMCore) => {
        if (idx >= keys.length) return vm.nil();
        const key = keys[idx++];
        const numKey = Number(key);
        const k = !isNaN(numKey) ? vm.num(numKey) : vm.str(key);
        const v = tbl.value[key] || vm.nil();
        return { type: 'array', value: [k, v] };
      }};
    }};

    globals['ipairs'] = { type: 'native', value: (vm: VMCore) => {
      const tbl = vm.getProcStack().pop();
      if (!tbl || (tbl.type !== 'table' && tbl.type !== 'array')) return vm.nil();
      let idx = 1;
      const maxIdx = tbl.type === 'array' ? tbl.value.length : Math.max(...Object.keys(tbl.value).map(Number).filter(n => !isNaN(n)));
      return { type: 'native', value: (vm: VMCore) => {
        if (idx > maxIdx) return vm.nil();
        const i = idx;
        const v = tbl.value[i] || vm.nil();
        idx++;
        return { type: 'array', value: [vm.num(i), v] };
      }};
    }};

    globals['pcall'] = { type: 'native', value: (vm: VMCore) => {
      const ps = vm.getProcStack();
      const fn = ps.pop();
      if (!fn || (fn.type !== 'function' && fn.type !== 'native')) {
        return vm.bool(false);
      }
      try {
        if (fn.type === 'native') {
          const result = (fn as any).value(vm);
          return { type: 'array', value: [vm.bool(true), result] };
        } else {
          return { type: 'array', value: [vm.bool(true), vm.nil()] };
        }
      } catch (e: any) {
        return { type: 'array', value: [vm.bool(false), vm.str(e?.message || 'unknown error')] };
      }
    }};

    globals['process'] = {
      type: 'table', value: {
        'spawn': { type: 'native', value: (vm: VMCore) => {
          const path = vm.popStr();
          const api = (window as any).electronAPI;
          if (!api || !api.readFileSync) { vm.log('process.spawn: no filesystem access', 'error'); return vm.nil(); }
          const fullPath = vm.projectDir + '/' + path;
          let code: string;
          try { code = api.readFileSync(fullPath); } catch { vm.log('process.spawn: file not found: ' + path, 'error'); return vm.nil(); }
          if (!code) { vm.log('process.spawn: empty file: ' + path, 'error'); return vm.nil(); }
          try {
            const compiler = new Compiler(vm.log);
            const bytecode = compiler.compile(code);
            if (!bytecode) { vm.log('process.spawn: compilation failed: ' + path, 'error'); return vm.nil(); }
            const newProc = new Process(vm.scheduler.getProcesses().length + 1, path, bytecode);
            newProc.context = vm;
            newProc.globals = {};
            newProc.logFn = vm.logFn;
            newProc.state = 'running';
            vm.scheduler.addProcess(newProc);
            vm.log('Spawned: ' + path + ' (pid:' + newProc.id + ')', 'info');
            return vm.num(newProc.id);
          } catch (e: any) {
            vm.log('process.spawn: error: ' + (e?.message || '?'), 'error');
            return vm.nil();
          }
        }},
        'list': { type: 'native', value: (vm: VMCore) => {
          const procs = vm.scheduler.getProcesses();
          const result: Value[] = [];
          for (let i = 0; i < procs.length; i++) {
            result[i + 1] = vm.str(procs[i].name + ' (id:' + procs[i].id + ')');
          }
          return { type: 'array', value: result };
        }},
        'kill': { type: 'native', value: (vm: VMCore) => {
          const id = vm.popNum();
          const procs = vm.scheduler.getProcesses();
          for (const p of procs) {
            if (p.id === id) { p.terminate(); return vm.bool(true); }
          }
          return vm.bool(false);
        }},
      },
    };

    globals['print'] = {
      type: 'native',
      value: (vm: VMCore) => {
        const s = vm.getProcStack();
        if (s.length > 0) {
          const val = s.pop();
          vm.log(vm.interpreter.valueToString(val), 'info');
          return val;
        }
        vm.log('', 'info');
        return vm.nil();
      },
    };

    globals['tostring'] = {
      type: 'native',
      value: (vm: VMCore) => {
        const val = vm.getProcStack().pop();
        if (!val || val.type === 'nil') return vm.str('nil');
        if (val.type === 'boolean') return vm.str(val.value ? 'true' : 'false');
        if (val.type === 'number') return vm.str(String(val.value));
        if (val.type === 'string') return val;
        return vm.str(vm.interpreter.valueToString(val));
      },
    };

    globals['tonumber'] = {
      type: 'native',
      value: (vm: VMCore) => {
        const val = vm.getProcStack().pop();
        if (!val || val.type === 'nil') return vm.nil();
        if (val.type === 'number') return val;
        if (val.type === 'string') {
          const n = Number(val.value);
          if (isNaN(n)) return vm.nil();
          return vm.num(n);
        }
        return vm.nil();
      },
    };

    globals['file'] = {
      type: 'table', value: {
        'read': { type: 'native', value: (vm: VMCore) => {
          const path = vm.popStr();
          const api = (window as any).electronAPI;
          if (!api) return vm.nil();
          try {
            const full = vm.projectDir + '/' + path;
            const content = api.readFileSync(full);
            return vm.str(content || '');
          } catch { return vm.nil(); }
        }},
        'readBinary': { type: 'native', value: (vm: VMCore) => {
          const path = vm.popStr();
          const api = (window as any).electronAPI;
          if (!api) return vm.nil();
          try {
            const full = vm.projectDir + '/' + path;
            const buf: Uint8Array = api.readFileSyncBinary(full);
            if (!buf) return vm.nil();
            const arr: Value[] = [];
            for (let i = 0; i < buf.length; i++) arr[i + 1] = vm.num(buf[i]);
            return { type: 'array', value: arr };
          } catch { return vm.nil(); }
        }},
        'readDir': { type: 'native', value: (vm: VMCore) => {
          const path = vm.popStr() || '.';
          const api = (window as any).electronAPI;
          if (!api) return vm.nil();
          try {
            const full = vm.projectDir + '/' + path;
            const entries: string[] = api.listDir ? api.listDir(full) : [];
            const arr: Value[] = [];
            for (let i = 0; i < entries.length; i++) arr[i + 1] = vm.str(entries[i]);
            return { type: 'array', value: arr };
          } catch { return vm.nil(); }
        }},
        'write': { type: 'native', value: (vm: VMCore) => {
          const content = vm.popStr();
          const path = vm.popStr();
          const api = (window as any).electronAPI;
          if (!api) return vm.bool(false);
          try {
            const full = vm.projectDir + '/' + path;
            api.writeFile(full, content);
            return vm.bool(true);
          } catch { return vm.bool(false); }
        }},
        'exists': { type: 'native', value: (vm: VMCore) => {
          const path = vm.popStr();
          const api = (window as any).electronAPI;
          if (!api) return vm.bool(false);
          try {
            const full = vm.projectDir + '/' + path;
            api.stat(full);
            return vm.bool(true);
          } catch { return vm.bool(false); }
        }},
        'delete': { type: 'native', value: (vm: VMCore) => {
          const path = vm.popStr();
          const api = (window as any).electronAPI;
          if (!api) return vm.bool(false);
          try {
            const full = vm.projectDir + '/' + path;
            api.deleteFile(full);
            return vm.bool(true);
          } catch { return vm.bool(false); }
        }},
      },
    };
}