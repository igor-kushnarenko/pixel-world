import type { Texture } from 'three';

export type PaletteName = 'cyberpunk_night' | 'coastal' | 'forest';
export interface CloudPlane {
  enabled: boolean;
  depth: number;
  coverage: number;
  density: number;
  scale: number;
  height: number;
  thickness: number;
  speed: number;
  colorSteps: number;
}
export interface AtmosphereParameters {
  presetVersion: 1;
  seed: number;
  timeOfDay: number;
  sky: { palette: PaletteName; starsEnabled: boolean; moonEnabled: false; horizonGlow: number };
  clouds: {
    enabled: boolean; coverage: number; density: number; scale: number;
    windSpeed: number; windDirectionDeg: number;
    layers: { far: CloudPlane; low: CloudPlane };
  };
  weather: { fog: number; rain: number; stormEnabled: boolean };
  lighting: {
    cityLightsIntensity: number; exteriorRoomFill: number;
    interiorLightsEnabled: boolean; radioBacklightEnabled: boolean; computerEnabled: boolean;
  };
  render: { sampling: 'nearest'; dithering: boolean; pixelGrid: 'match_scene_assets'; colorSteps: number };
}
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type ParameterPatch = DeepPartial<AtmosphereParameters>;
export type LightGroup = 'cityWindows' | 'neon' | 'street' | 'reflections' | 'exteriorRoom' | 'interior' | 'radio' | 'computer';
export type TextureSource = string | Texture | HTMLCanvasElement;
/** All coordinates are logical pixels from the top-left. Larger depth draws later. */
export interface ImageLayer {
  id: string;
  source: TextureSource;
  depth: number;
  scope: 'world' | 'room';
  x?: number; y?: number;
  /** Defaults to native texture size. Resizing source art is deliberately unsupported. */
  opacity?: number;
  receivesLightning?: boolean;
}
/** White/red=receives light, black/transparent=no light. Aligned to the whole scene. */
export interface LightMask {
  id: string; source: TextureSource; depth: number; scope: 'world' | 'room';
  group: LightGroup; color: string; intensity?: number;
  /** Explicit optional source scenario; steady by default. */
  pulse?: { amount: number; periodSeconds: number };
}
export interface SceneDefinition {
  width: number; height: number;
  layers?: ImageLayer[];
  lights?: LightMask[];
  /** Full-size white opening on black. Applied to ALL world passes. */
  windowMask?: TextureSource;
  /** Choose where fog sits among the location's layers. */
  fogDepth?: number;
  rainDepth?: number;
  /** Transparent space outside the opening defaults to opaque darkness. */
  background?: string;
}
export interface EngineOptions {
  container: HTMLElement;
  scene: SceneDefinition;
  parameters?: ParameterPatch;
  onError?: (error: Error) => void;
}
export interface EngineDiagnostics {
  logicalWidth: number; logicalHeight: number; integerScale: number;
  drawCalls: number; running: boolean; time: number;
  layers: { id: string; depth: number; visible: boolean }[];
}
