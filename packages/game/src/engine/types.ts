import type { SaveData } from '@sd/shared';

export interface HudMarker {
  x: number;
  z: number;
  kind: 'objective' | 'checkpoint' | 'landmark' | 'landmark_found' | 'vehicle' | 'npc' | 'activity';
  label?: string;
}

export interface HudState {
  mode: 'foot' | 'vehicle';
  speedKmh: number;
  gear: string;
  rpm: number;
  rpmMax: number;
  damage: number;
  vehicleName: string;
  prompt: string | null;
  money: number;
  clock: string;
  weather: 'clear' | 'cloudy' | 'rain';
  fps: number;
  resolutionScale: number;
  player: { x: number; z: number; heading: number };
  mission: { id: string; title: string; objective: string; step: number; steps: number; timer?: number } | null;
  subtitle: { speaker: string; text: string } | null;
  route: number[];
  markers: HudMarker[];
  /** Player's headlights are on. */
  lights: boolean;
  /** Station playing in the player's vehicle (null: on foot or radio off). */
  radio: string | null;
  /** In-game photo mode is active (the client hides the HUD). */
  photo: boolean;
}

export interface MissionStats {
  timeSec: number;
  distanceM: number;
  topSpeedKmh: number;
  collisions: number;
}

export type GameEvent =
  | { type: 'notification'; title: string; text: string; kind?: 'info' | 'success' | 'warning' | 'landmark' }
  | { type: 'missionStarted'; missionId: string; title: string }
  | { type: 'missionComplete'; missionId: string; title: string; stats: MissionStats; reward: number; landmarks: number }
  | { type: 'missionFailed'; missionId: string; reason: string }
  | { type: 'save'; data: SaveData }
  | { type: 'pauseRequest' }
  | { type: 'toggleMap' }
  | { type: 'radio'; station: string | null }
  | { type: 'photoMode'; active: boolean }
  | { type: 'photoTaken'; dataUrl: string };
