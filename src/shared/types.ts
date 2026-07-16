export interface VMSettings {
  cpuFrequency: number;
  cpuCores: number;
  ramSize: number;
  videoWidth: number;
  videoHeight: number;
  fpsLimit: number;
}

export const DEFAULT_VM_SETTINGS: VMSettings = {
  cpuFrequency: 100,
  cpuCores: 1,
  ramSize: 32 * 1024 * 1024,
  videoWidth: 800,
  videoHeight: 600,
  fpsLimit: 60,
};

export interface VMDebugInfo {
  cpuUsage: number;
  ramUsage: number;
  ramTotal: number;
  allocatedObjects: number;
  instructionsPerSecond: number;
  fps: number;
  processCount: number;
  gpuCommandsPerSecond: number;
}

export interface KeyState {
  pressed: Map<string, boolean>;
  justPressed: Map<string, boolean>;
  justReleased: Map<string, boolean>;
}

export interface MouseState {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  left: boolean;
  middle: boolean;
  right: boolean;
  wheel: number;
  pointerLocked: boolean;
}

export type BytecodeValue = number | string | boolean | null;