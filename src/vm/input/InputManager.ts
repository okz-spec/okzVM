import { KeyState, MouseState } from '../../shared/types';

export type InputEventType = 'keydown' | 'keyup' | 'mousemove' | 'mousedown' | 'mouseup' | 'wheel';

export interface InputEvent {
  type: InputEventType;
  code?: string;
  x?: number;
  y?: number;
  button?: number;
  deltaX?: number;
  deltaY?: number;
  wheelDelta?: number;
}

export class InputManager {
  public keys: KeyState;
  public mouse: MouseState;
  private canvas: HTMLCanvasElement;
  private listeners: Array<{ type: string; handler: EventListener }> = [];

  public rawEventQueue: InputEvent[] = [];
  public frameEvents: InputEvent[] = [];

  public virtualX: number = 0;
  public virtualY: number = 0;
  private pointerLockDisabled: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.keys = {
      pressed: new Map(),
      justPressed: new Map(),
      justReleased: new Map(),
    };
    this.mouse = {
      x: 0, y: 0, deltaX: 0, deltaY: 0,
      left: false, middle: false, right: false, wheel: 0,
      pointerLocked: false,
    };
  }

  public setupListeners(): void {
    this.addListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Alt') { this.exitPointerLock(); }
      this.rawEventQueue.push({ type: 'keydown', code: ke.code });
    });

    this.addListener('keyup', (e: Event) => {
      const ke = e as KeyboardEvent;
      this.rawEventQueue.push({ type: 'keyup', code: ke.code });
    });

    this.addListener('mousemove', (e: Event) => {
      const me = e as MouseEvent;
      this.rawEventQueue.push({ type: 'mousemove', x: me.clientX, y: me.clientY, deltaX: me.movementX, deltaY: me.movementY });
    });

    this.addListener('mousedown', (e: Event) => {
      const me = e as MouseEvent;
      this.rawEventQueue.push({ type: 'mousedown', button: me.button });
      if (me.button === 0 && e.target === this.canvas && !this.pointerLockDisabled) {
        this.canvas.requestPointerLock();
      }
    });

    this.addListener('mouseup', (e: Event) => {
      const me = e as MouseEvent;
      this.rawEventQueue.push({ type: 'mouseup', button: me.button });
    });

    this.addListener('wheel', (e: Event) => {
      const we = e as WheelEvent;
      this.rawEventQueue.push({ type: 'wheel', wheelDelta: we.deltaY > 0 ? 1 : -1 });
    });

    this.addListener('contextmenu', (e: Event) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.mouse.pointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  public processFrame(): void {
    this.frameEvents = this.rawEventQueue.splice(0);
    this.keys.justPressed.clear();
    this.keys.justReleased.clear();
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    this.mouse.wheel = 0;

    for (const evt of this.frameEvents) {
      switch (evt.type) {
        case 'keydown':
          if (!this.keys.pressed.get(evt.code!)) {
            this.keys.justPressed.set(evt.code!, true);
          }
          this.keys.pressed.set(evt.code!, true);
          break;
        case 'keyup':
          this.keys.pressed.set(evt.code!, false);
          this.keys.justReleased.set(evt.code!, true);
          break;
        case 'mousemove': {
          const rect = this.canvas.getBoundingClientRect();
          if (document.pointerLockElement === this.canvas) {
            this.virtualX += evt.deltaX!;
            this.virtualY += evt.deltaY!;
            this.mouse.deltaX = evt.deltaX!;
            this.mouse.deltaY = evt.deltaY!;
            this.mouse.x = this.virtualX;
            this.mouse.y = this.virtualY;
          } else {
            this.virtualX = evt.x! - rect.left;
            this.virtualY = evt.y! - rect.top;
            this.mouse.deltaX = 0;
            this.mouse.deltaY = 0;
            this.mouse.x = this.virtualX;
            this.mouse.y = this.virtualY;
          }
          break;
        }
        case 'mousedown':
          if (evt.button === 0) this.mouse.left = true;
          if (evt.button === 1) this.mouse.middle = true;
          if (evt.button === 2) this.mouse.right = true;
          break;
        case 'mouseup':
          if (evt.button === 0) this.mouse.left = false;
          if (evt.button === 1) this.mouse.middle = false;
          if (evt.button === 2) this.mouse.right = false;
          break;
        case 'wheel':
          this.mouse.wheel = evt.wheelDelta!;
          break;
      }
    }
  }

  private exitPointerLock(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  public setPointerLock(enabled: boolean): void {
    if (enabled) {
      this.pointerLockDisabled = false;
      this.canvas.requestPointerLock();
    } else {
      this.pointerLockDisabled = true;
      this.exitPointerLock();
    }
  }

  private addListener(type: string, handler: EventListener): void {
    window.addEventListener(type, handler);
    this.listeners.push({ type, handler });
  }

  public isKeyPressed(code: string): boolean {
    return this.keys.pressed.get(code) === true;
  }

  public wasKeyJustPressed(code: string): boolean {
    return this.keys.justPressed.get(code) === true;
  }

  public wasKeyJustReleased(code: string): boolean {
    return this.keys.justReleased.get(code) === true;
  }

  public clearFrame(): void {
    this.keys.justPressed.clear();
    this.keys.justReleased.clear();
    this.mouse.wheel = 0;
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
  }

  public removeListeners(): void {
    this.exitPointerLock();
    this.listeners.forEach(l => window.removeEventListener(l.type, l.handler));
    this.listeners = [];
    this.rawEventQueue = [];
    this.frameEvents = [];
  }
}