import { AudioPCMBuffer } from './AudioPCMBuffer';

export interface AudioDecoder {
  readonly format: string;
  canDecode(data: ArrayBuffer): boolean;
  decode(data: ArrayBuffer): AudioPCMBuffer | Promise<AudioPCMBuffer>;
}

// ===== WAV DECODER =====
export class WAVDecoder implements AudioDecoder {
  readonly format = 'wav';

  canDecode(data: ArrayBuffer): boolean {
    if (data.byteLength < 12) return false;
    const v = new DataView(data);
    return v.getUint8(0) === 0x52 && v.getUint8(1) === 0x49 &&
           v.getUint8(2) === 0x46 && v.getUint8(3) === 0x46 &&
           v.getUint8(8) === 0x57 && v.getUint8(9) === 0x41 &&
           v.getUint8(10) === 0x56 && v.getUint8(11) === 0x45;
  }

  decode(data: ArrayBuffer): AudioPCMBuffer {
    const v = new DataView(data);
    let offset = 12;
    let fmtTag = 1, numChannels = 1, sampleRate = 44100, bitsPerSample = 16;
    let dataOffset = -1, dataSize = 0;

    while (offset + 8 <= data.byteLength) {
      const chunkId = String.fromCharCode(v.getUint8(offset), v.getUint8(offset+1), v.getUint8(offset+2), v.getUint8(offset+3));
      const chunkSize = v.getUint32(offset + 4, true);
      offset += 8;

      if (chunkId === 'fmt ') {
        fmtTag = v.getUint16(offset, true);
        numChannels = v.getUint16(offset + 2, true);
        sampleRate = v.getUint32(offset + 4, true);
        bitsPerSample = v.getUint16(offset + 10, true);
      } else if (chunkId === 'data') {
        dataOffset = offset;
        dataSize = chunkSize;
      }
      offset += chunkSize;
      if (chunkSize % 2 !== 0) offset++;
    }

    if (dataOffset < 0) throw new Error('WAV: no data chunk found');

    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const totalSamples = Math.floor(dataSize / blockAlign);
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(new Float32Array(totalSamples));
    }

    const raw = new DataView(data);
    for (let i = 0; i < totalSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const pos = dataOffset + i * blockAlign + c * bytesPerSample;
        let sample = 0;
        if (fmtTag === 1) {
          if (bitsPerSample === 8) {
            sample = (raw.getUint8(pos) - 128) / 128;
          } else if (bitsPerSample === 16) {
            sample = raw.getInt16(pos, true) / 32768;
          } else if (bitsPerSample === 24) {
            const b0 = raw.getUint8(pos);
            const b1 = raw.getUint8(pos + 1);
            const b2 = raw.getUint8(pos + 2);
            const val = (b2 << 24) | (b1 << 16) | (b0 << 8) >> 8;
            sample = val / 8388608;
          } else if (bitsPerSample === 32) {
            sample = raw.getInt32(pos, true) / 2147483648;
          }
        } else if (fmtTag === 3) {
          sample = raw.getFloat32(pos, true);
        }
        channels[c][i] = Math.max(-1, Math.min(1, sample));
      }
    }

    return new AudioPCMBuffer('', sampleRate, channels);
  }
}

// ===== MP3 / GENERIC DECODER (uses Web Audio API decodeAudioData) =====
export class WebAudioDecoder implements AudioDecoder {
  readonly format = 'webaudio';
  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  canDecode(_data: ArrayBuffer): boolean {
    return true;
  }

  decode(data: ArrayBuffer): Promise<AudioPCMBuffer> {
    return this.ctx.decodeAudioData(data).then(audioBuffer => {
      const channels: Float32Array[] = [];
      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        channels.push(new Float32Array(audioBuffer.getChannelData(i)));
      }
      return new AudioPCMBuffer('', audioBuffer.sampleRate, channels);
    });
  }
}