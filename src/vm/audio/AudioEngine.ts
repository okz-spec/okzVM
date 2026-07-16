import { AudioPCMBuffer } from './AudioPCMBuffer';
import { AudioDecoder, WAVDecoder, WebAudioDecoder } from './AudioDecoders';

export type WaveType = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';

export interface PlayOptions {
  volume?: number;
  rate?: number;
  loop?: boolean;
  offset?: number;
}

interface PlaybackState {
  source: AudioBufferSourceNode;
  gain: GainNode;
  buffer: AudioPCMBuffer;
  audioBuffer: AudioBuffer;
  volume: number;
  rate: number;
  loop: boolean;
  offset: number;
  startContextTime: number;
  paused: boolean;
  pausePosition: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers: Map<string, AudioPCMBuffer> = new Map();
  private playback: Map<string, PlaybackState> = new Map();
  private decoders: AudioDecoder[] = [];
  private volume: number = 1.0;
  private logFn: (msg: string, type?: string) => void;

  constructor(logFn: (msg: string, type?: string) => void) {
    this.logFn = logFn;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.volume;
      this.decoders.push(new WebAudioDecoder(this.ctx));
      this.decoders.push(new WAVDecoder());

      this.unlockAudio();
    } catch (e: any) {
      this.logFn(`Audio context creation failed: ${e.message}`, 'warn');
    }
  }

  // Browser autoplay policy hack. Chrome, Firefox, and Safari all block
  // AudioContext from starting without user interaction. This creates a
  // silent 1-sample buffer and plays it, then waits for a click/keydown
  // to actually resume the context. It's cargo cult code at this point
  // but every time I try to remove it, something breaks on mobile.
  private unlockAudio(): void {
    if (!this.ctx) return;
    if (this.ctx.state === 'running') return;
    const buf = this.ctx.createBuffer(1, 1, 22050);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start(0);
    this.logFn(`Audio unlock: ctx.state=${this.ctx.state}`);
    const unlock = () => {
      this.ctx?.resume().then(() => {
        this.logFn(`Audio unlocked: ctx.state=${this.ctx?.state}`);
      }).catch(() => {});
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
  }

  registerDecoder(d: AudioDecoder): void {
    this.decoders.unshift(d);
  }

  // ===== FILE I/O =====

  async load(name: string, projectDir: string, path: string): Promise<void> {
    if (!this.ctx) return;
    try {
      const api = (window as any).electronAPI;
      const fullPath = projectDir + '/' + path;
      let arrayBuffer: ArrayBuffer;
      if (api && api.readFileBinary) {
        const data = await api.readFileBinary(fullPath);
        if (data instanceof ArrayBuffer) {
          arrayBuffer = data;
        } else if (data && data.buffer) {
          arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        } else {
          throw new Error('Unexpected return type from readFileBinary');
        }
      } else {
        const fileUrl = 'file:///' + fullPath.replace(/\\/g, '/');
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        arrayBuffer = await resp.arrayBuffer();
      }
      const decoder = this.decoders.find(d => d.canDecode(arrayBuffer));
      if (!decoder) throw new Error('No decoder found for this format');
      const result = decoder.decode(arrayBuffer);
      const buf = result instanceof Promise ? await result : result;
      buf.name = name;
      this.buffers.set(name, buf);
      this.logFn(`Loaded "${name}": ${buf.channelCount}ch ${buf.sampleRate}Hz ${buf.duration.toFixed(2)}s`);
    } catch (e: any) {
      this.logFn(`Failed to load audio "${name}": ${e.message}`, 'error');
    }
  }

  unload(name: string): void {
    this.stop(name);
    this.buffers.delete(name);
  }

  // ===== METADATA =====

  getBuffer(name: string): AudioPCMBuffer | null {
    return this.buffers.get(name) ?? null;
  }

  info(name: string): Record<string, number> | null {
    const buf = this.buffers.get(name);
    if (!buf) return null;
    return {
      sampleRate: buf.sampleRate,
      channels: buf.channelCount,
      samples: buf.length,
      duration: +(buf.duration).toFixed(4),
    };
  }

  sampleRate(name: string): number { return this.buffers.get(name)?.sampleRate ?? 0; }
  channels(name: string): number { return this.buffers.get(name)?.channelCount ?? 0; }
  duration(name: string): number { return this.buffers.get(name)?.duration ?? 0; }
  length(name: string): number { return this.buffers.get(name)?.length ?? 0; }

  // ===== SAMPLE ACCESS =====

  getSample(name: string, channel: number, index: number): number {
    const buf = this.buffers.get(name);
    if (!buf) return 0;
    return buf.getSample(channel, index);
  }

  setSample(name: string, channel: number, index: number, value: number): void {
    const buf = this.buffers.get(name);
    if (!buf) return;
    buf.setSample(channel, index, value);
  }

  getChannel(name: string, channel: number): Float32Array | null {
    const buf = this.buffers.get(name);
    if (!buf || channel < 0 || channel >= buf.channelCount) return null;
    return new Float32Array(buf.channelData[channel]);
  }

  setChannel(name: string, channel: number, samples: Float32Array): void {
    const buf = this.buffers.get(name);
    if (!buf || channel < 0 || channel >= buf.channelCount) return;
    const len = Math.min(samples.length, buf.length);
    for (let i = 0; i < len; i++) {
      buf.channelData[channel][i] = Math.max(-1, Math.min(1, samples[i]));
    }
  }

  // ===== BUFFER CREATION =====

  create(name: string, sampleRate: number, numChannels: number, length: number): void {
    this.stop(name);
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) channels.push(new Float32Array(length));
    this.buffers.set(name, new AudioPCMBuffer(name, sampleRate, channels));
  }

  silence(name: string): void {
    const buf = this.buffers.get(name);
    if (!buf) return;
    for (const ch of buf.channelData) ch.fill(0);
  }

  fill(name: string, channel: number, value: number): void {
    const buf = this.buffers.get(name);
    if (!buf || channel < 0 || channel >= buf.channelCount) return;
    const v = Math.max(-1, Math.min(1, value));
    buf.channelData[channel].fill(v);
  }

  generateTone(name: string, sampleRate: number, frequency: number, durationSec: number, type: WaveType = 'sine', amplitude: number = 0.8, duty: number = 0.5): void {
    const length = Math.ceil(sampleRate * durationSec);
    this.create(name, sampleRate, 1, length);
    const buf = this.buffers.get(name)!;
    const ch = buf.channelData[0];
    const tau = 2 * Math.PI;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const phase = (frequency * t) % 1;
      let sample = 0;
      switch (type) {
        case 'sine':
          sample = Math.sin(tau * frequency * t) * amplitude;
          break;
        case 'square':
          sample = (phase < duty ? 1 : -1) * amplitude;
          break;
        case 'sawtooth':
          sample = (2 * phase - 1) * amplitude;
          break;
        case 'triangle':
          sample = (4 * Math.abs(phase - 0.5) - 1) * amplitude;
          break;
        case 'noise':
          sample = (Math.random() * 2 - 1) * amplitude;
          break;
      }
      ch[i] = Math.max(-1, Math.min(1, sample));
    }
  }

  generateNote(name: string, sampleRate: number, noteStr: string, octave: number, durationSec: number, type: WaveType = 'square', amplitude: number = 0.8): void {
    const notes: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
    };
    const semitone = notes[noteStr] ?? 9;
    const freq = 440 * Math.pow(2, (semitone - 9 + (octave - 4) * 12) / 12);
    this.generateTone(name, sampleRate, freq, durationSec, type, amplitude);
  }

  // ===== MANIPULATION =====

  reverse(name: string): void {
    const buf = this.buffers.get(name);
    if (!buf) return;
    for (const ch of buf.channelData) {
      let lo = 0, hi = ch.length - 1;
      while (lo < hi) {
        const tmp = ch[lo]; ch[lo] = ch[hi]; ch[hi] = tmp;
        lo++; hi--;
      }
    }
  }

  trim(name: string, startSample: number, endSample: number): void {
    const buf = this.buffers.get(name);
    if (!buf) return;
    const s = Math.max(0, Math.floor(startSample));
    const e = Math.min(buf.length, Math.ceil(endSample));
    const newLen = Math.max(0, e - s);
    for (let c = 0; c < buf.channelCount; c++) {
      const old = buf.channelData[c];
      const fresh = new Float32Array(newLen);
      for (let i = 0; i < newLen; i++) fresh[i] = old[s + i];
      buf.channelData[c] = fresh;
    }
  }

  mix(destName: string, srcName: string, srcVolume: number): void {
    const dest = this.buffers.get(destName);
    const src = this.buffers.get(srcName);
    if (!dest || !src) return;
    const len = Math.min(dest.length, src.length);
    const chCount = Math.min(dest.channelCount, src.channelCount);
    for (let c = 0; c < chCount; c++) {
      for (let i = 0; i < len; i++) {
        const mixed = dest.channelData[c][i] + src.channelData[c][i] * srcVolume;
        dest.channelData[c][i] = Math.max(-1, Math.min(1, mixed));
      }
    }
  }

  normalize(name: string): void {
    const buf = this.buffers.get(name);
    if (!buf) return;
    let peak = 0;
    for (const ch of buf.channelData) {
      for (let i = 0; i < ch.length; i++) {
        const abs = Math.abs(ch[i]);
        if (abs > peak) peak = abs;
      }
    }
    if (peak < 1e-10) return;
    const gain = 1 / peak;
    for (const ch of buf.channelData) {
      for (let i = 0; i < ch.length; i++) ch[i] *= gain;
    }
  }

  copy(destName: string, srcName: string): void {
    const src = this.buffers.get(srcName);
    if (!src) return;
    this.buffers.set(destName, src.clone(destName));
  }

  // ===== FFT (radix-2 DIT) =====
  // Textbook Cooley-Tukey FFT. The bit-reversal permutation at lines 312-321
  // is the part that always takes me 20 minutes to re-understand. The butterfly
  // stages use a running complex multiply (lines 337-339) instead of recomputing
  // cos/sin each iteration, which is correct but looks like black magic if you
  // don't know the algorithm. If the spectrum looks wrong, check the bit-reversal first.

  fft(name: string, channel: number, fftSize: number): Float32Array | null {
    const buf = this.buffers.get(name);
    if (!buf || channel < 0 || channel >= buf.channelCount) return null;
    const n = 1 << Math.floor(Math.log2(Math.max(2, Math.min(fftSize, buf.length))));
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    const ch = buf.channelData[channel];
    for (let i = 0; i < n; i++) re[i] = ch[i] ?? 0;

    let j = 0;
    for (let i = 0; i < n; i++) {
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
      let m = n >> 1;
      while (m >= 1 && j >= m) { j -= m; m >>= 1; }
      j += m;
    }

    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const angle = -2 * Math.PI / size;
      const wRe = Math.cos(angle);
      const wIm = Math.sin(angle);
      for (let i = 0; i < n; i += size) {
        let curRe = 1, curIm = 0;
        for (let k = 0; k < half; k++) {
          const tRe = curRe * re[i+k+half] - curIm * im[i+k+half];
          const tIm = curRe * im[i+k+half] + curIm * re[i+k+half];
          re[i+k+half] = re[i+k] - tRe;
          im[i+k+half] = im[i+k] - tIm;
          re[i+k] += tRe;
          im[i+k] += tIm;
          const newCurRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = newCurRe;
        }
      }
    }

    const half = n / 2;
    const mag = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      mag[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]) / n;
    }
    return mag;
  }

  // ===== PLAYBACK =====

  private pcmToAudioBuffer(buf: AudioPCMBuffer): AudioBuffer {
    if (!this.ctx) throw new Error('No audio context');
    const ab = this.ctx.createBuffer(buf.channelCount, buf.length, buf.sampleRate);
    let maxVal = 0;
    for (let c = 0; c < buf.channelCount; c++) {
      const dest = ab.getChannelData(c);
      const src = buf.channelData[c];
      const len = Math.min(src.length, dest.length);
      for (let i = 0; i < len; i++) {
        dest[i] = src[i];
        const v = Math.abs(src[i]);
        if (v > maxVal) maxVal = v;
      }
    }
    this.logFn(`pcmToAudioBuffer: max=${maxVal.toFixed(6)} ch=${buf.channelCount} len=${buf.length} sr=${buf.sampleRate}`);
    return ab;
  }

  play(name: string, opts?: PlayOptions): void {
    if (!this.ctx) { this.logFn('play: no audio context', 'error'); return; }
    const buf = this.buffers.get(name);
    if (!buf) { this.logFn(`play: "${name}" not found`, 'warn'); return; }

    this.stop(name);

    try {
      const audioBuffer = this.pcmToAudioBuffer(buf);
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      source.buffer = audioBuffer;
      const vol = opts?.volume ?? 1;
      const rate = opts?.rate ?? 1;
      const loop = opts?.loop ?? false;
      const offset = opts?.offset ?? 0;
      source.playbackRate.value = rate;
      source.loop = loop;
      gain.gain.value = vol;
      source.connect(gain);
      if (this.masterGain) gain.connect(this.masterGain);
      else gain.connect(this.ctx.destination);

      this.playback.set(name, {
        source, gain, buffer: buf, audioBuffer,
        volume: vol, rate, loop, offset,
        startContextTime: this.ctx.currentTime,
        paused: false, pausePosition: offset,
      });
      source.onended = () => {
        if (!this.playback.has(name)) return;
        const st = this.playback.get(name)!;
        if (!st.paused) this.playback.delete(name);
      };

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          try { source.start(0, offset); this.logFn(`play: "${name}" started after resume`); } catch (e: any) { this.logFn(`play start error: ${e.message}`, 'error'); }
        }).catch((e: any) => { this.logFn(`play resume error: ${e.message}`, 'error'); });
      } else {
        source.start(0, offset);
        this.logFn(`play: "${name}" started (ctx running)`);
      }
    } catch (e: any) {
      this.logFn(`play error: ${e.message}`, 'error');
    }
  }

  pause(name: string): void {
    const st = this.playback.get(name);
    if (!st || st.paused || !this.ctx) return;
    st.pausePosition = this.position(name);
    try { st.source.stop(); } catch {}
    st.paused = true;
  }

  resume(name: string): void {
    const st = this.playback.get(name);
    if (!st || !st.paused || !this.ctx) return;
    st.paused = false;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const source = this.ctx.createBufferSource();
    source.buffer = st.audioBuffer;
    source.playbackRate.value = st.rate;
    source.loop = st.loop;
    source.connect(st.gain);
    source.start(0, st.pausePosition);
    st.source = source;
    st.startContextTime = this.ctx.currentTime - st.pausePosition / st.rate;
    source.onended = () => {
      if (!this.playback.has(name)) return;
      const cur = this.playback.get(name)!;
      if (!cur.paused) this.playback.delete(name);
    };
  }

  stop(name: string): void {
    const st = this.playback.get(name);
    if (st) {
      try { st.source.stop(); } catch {}
      this.playback.delete(name);
    }
  }

  seek(name: string, seconds: number): void {
    const st = this.playback.get(name);
    if (!st || !this.ctx) return;
    const playing = !st.paused;
    if (playing) {
      try { st.source.stop(); } catch {}
    }
    st.pausePosition = Math.max(0, Math.min(seconds, st.buffer.duration));
    if (playing) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const source = this.ctx.createBufferSource();
      source.buffer = st.audioBuffer;
      source.playbackRate.value = st.rate;
      source.loop = st.loop;
      source.connect(st.gain);
      source.start(0, st.pausePosition);
      st.source = source;
      st.startContextTime = this.ctx.currentTime - st.pausePosition / st.rate;
      st.paused = false;
      source.onended = () => {
        if (!this.playback.has(name)) return;
        const cur = this.playback.get(name)!;
        if (!cur.paused) this.playback.delete(name);
      };
    } else {
      st.paused = true;
    }
  }

  position(name: string): number {
    const st = this.playback.get(name);
    if (!st || !this.ctx) return 0;
    if (st.paused) return st.pausePosition;
    const elapsed = (this.ctx.currentTime - st.startContextTime) * st.rate;
    let pos = st.offset + elapsed;
    if (st.loop && st.buffer.duration > 0) {
      pos = pos % st.buffer.duration;
    }
    return Math.max(0, Math.min(pos, st.buffer.duration));
  }

  isPlaying(name: string): boolean {
    return this.playback.has(name) && !this.playback.get(name)!.paused;
  }

  // ===== LEGACY (backward compat) =====

  generateToneRaw(frequency: number, duration: number, type: WaveType = 'sine', vol: number = 0.3): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (type === 'noise') {
      this.generateNoiseRaw(duration, vol);
      return;
    }
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    if (this.masterGain) gain.connect(this.masterGain);
    else gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private generateNoiseRaw(duration: number, vol: number): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const length = Math.ceil(sr * duration);
    const buffer = this.ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * vol;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    source.connect(gain);
    if (this.masterGain) gain.connect(this.masterGain);
    else gain.connect(this.ctx.destination);
    source.start();
  }

  generateNoteRaw(note: string, octave: number, duration: number, type: WaveType = 'square', vol: number = 0.3): void {
    const freq = this.noteToFreq(note, octave);
    this.generateToneRaw(freq, duration, type, vol);
  }

  noteToFreq(note: string, octave: number): number {
    const notes: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
    };
    const semitone = notes[note] ?? 9;
    return 440 * Math.pow(2, (semitone - 9 + (octave - 4) * 12) / 12);
  }

  // ===== MASTER =====

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
  }

  getVolume(): number { return this.volume; }

  stopAll(): void {
    this.playback.forEach((st) => { try { st.source.stop(); } catch {} });
    this.playback.clear();
  }

  destroy(): void {
    this.stopAll();
    this.buffers.clear();
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
  }
}