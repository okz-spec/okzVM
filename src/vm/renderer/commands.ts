export type RenderCommand =
  | { type: 'clear'; r: number; g: number; b: number }
  | { type: 'set_color'; r: number; g: number; b: number; a: number }
  | { type: 'pixel'; x: number; y: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'circle'; cx: number; cy: number; r: number; fill: boolean }
  | { type: 'triangle'; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; fill: boolean }
  | { type: 'polygon'; points: number[]; fill: boolean }
  | { type: 'render3D'; config: import('./Renderer3D').R3DConfig };

export const LAYER_BACKGROUND = 0;
export const LAYER_DEFAULT = 100;
export const LAYER_3D = 200;
export const LAYER_UI = 300;
export const LAYER_OVERLAY = 400;