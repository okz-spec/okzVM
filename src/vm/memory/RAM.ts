import { MemoryBlock } from '../types';
import { PAGE_SIZE } from '../../shared/constants';

export class RAM {
  public total: number;
  public used: number = 0;
  public objectCount: number = 0;

  private buffer: ArrayBuffer;
  private view: DataView;
  private blocks: MemoryBlock[] = [];
  private nextAddress: number = 0;
  private logFn: (msg: string, type?: string) => void;

  constructor(size: number, logFn: (msg: string, type?: string) => void) {
    this.total = size;
    this.logFn = logFn;
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
  }

  public resize(newSize: number): void {
    const newBuf = new ArrayBuffer(newSize);
    const copyLen = Math.min(newSize, this.total);
    const src = new Uint8Array(this.buffer, 0, copyLen);
    const dst = new Uint8Array(newBuf, 0, copyLen);
    dst.set(src);
    this.buffer = newBuf;
    this.view = new DataView(this.buffer);
    this.total = newSize;
  }

  public alloc(size: number): number {
    size = Math.max(size, 4);
    size = Math.ceil(size / PAGE_SIZE) * PAGE_SIZE;

    if (this.used + size > this.total) {
      const newTotal = Math.max(this.total * 2, this.used + size);
      this.resize(newTotal);
      this.logFn('RAM grew to ' + newTotal + ' bytes', 'info');
    }

    const addr = this.nextAddress;
    this.nextAddress += size;

    const block: MemoryBlock = {
      address: addr,
      size,
      data: new ArrayBuffer(size),
      free: false,
    };

    this.blocks.push(block);
    this.used += size;
    this.objectCount++;
    return addr;
  }

  public free(address: number): void {
    const idx = this.blocks.findIndex(b => b.address === address && !b.free);
    if (idx === -1) return;
    const block = this.blocks[idx];
    block.free = true;
    this.used -= block.size;
    this.objectCount--;
  }

  public read8(address: number): number {
    return this.view.getUint8(address);
  }

  public write8(address: number, value: number): void {
    this.view.setUint8(address, value & 0xFF);
  }

  public read16(address: number): number {
    return this.view.getUint16(address, true);
  }

  public write16(address: number, value: number): void {
    this.view.setUint16(address, value & 0xFFFF, true);
  }

  public read32(address: number): number {
    return this.view.getInt32(address, true);
  }

  public write32(address: number, value: number): void {
    this.view.setInt32(address, value, true);
  }

  public readFloat(address: number): number {
    return this.view.getFloat64(address, true);
  }

  public writeFloat(address: number, value: number): void {
    this.view.setFloat64(address, value, true);
  }

  public readBytes(address: number, length: number): Uint8Array {
    return new Uint8Array(this.buffer, address, length);
  }

  public writeBytes(address: number, data: Uint8Array): void {
    const dst = new Uint8Array(this.buffer, address, data.length);
    dst.set(data);
  }

  public get usagePercent(): number {
    return this.total > 0 ? (this.used / this.total) * 100 : 0;
  }

  public gc(): number {
    const before = this.blocks.length;
    this.blocks = this.blocks.filter(b => !b.free);
    const collected = before - this.blocks.length;
    if (collected > 0) {
      this.used = 0;
      for (const b of this.blocks) { this.used += b.size; }
      this.objectCount = this.blocks.length;
    }
    return collected;
  }

  public reset(): void {
    this.buffer = new ArrayBuffer(this.total);
    this.view = new DataView(this.buffer);
    this.blocks = [];
    this.used = 0;
    this.objectCount = 0;
    this.nextAddress = 0;
  }
}