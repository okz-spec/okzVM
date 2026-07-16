export class AudioPCMBuffer {
  name: string;
  sampleRate: number;
  channelData: Float32Array[];

  get channelCount(): number { return this.channelData.length; }
  get length(): number { return this.channelData[0]?.length ?? 0; }
  get duration(): number { return this.length / this.sampleRate; }

  constructor(name: string, sampleRate: number, channelData: Float32Array[]) {
    this.name = name;
    this.sampleRate = sampleRate;
    this.channelData = channelData;
  }

  getSample(channel: number, index: number): number {
    const ch = this.channelData[channel];
    if (!ch || index < 0 || index >= ch.length) return 0;
    return ch[index];
  }

  setSample(channel: number, index: number, value: number): void {
    const ch = this.channelData[channel];
    if (ch && index >= 0 && index < ch.length) {
      ch[index] = Math.max(-1, Math.min(1, value));
    }
  }

  clone(newName?: string): AudioPCMBuffer {
    return new AudioPCMBuffer(
      newName ?? this.name + '_copy',
      this.sampleRate,
      this.channelData.map(ch => new Float32Array(ch))
    );
  }
}