import { z } from 'zod';

// ───────────────────────────── Auth ─────────────────────────────
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Correo electrónico inválido' }));

export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128, 'La contraseña es demasiado larga');

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Mínimo 3 caracteres')
  .max(24, 'Máximo 24 caracteres')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Solo letras, números, punto y guion bajo');

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { message: 'Debes aceptar los términos y la política de privacidad' }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Token inválido');

export const verifyEmailSchema = z.object({ token: tokenSchema });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export const updateProfileSchema = z.object({ username: usernameSchema });

// ───────────────────────────── Payments ─────────────────────────────
/** DG Monetization (disabled by default): optional products only — nothing is required to play. */
export const checkoutSchema = z.object({
  /** Client-generated UUID; the server enforces one active checkout per user and product regardless. */
  idempotencyKey: z.uuid(),
  productCode: z.string().regex(/^[A-Z0-9_]{3,40}$/, 'Producto inválido'),
});

// ───────────────────────────── Game settings ─────────────────────────────
export const graphicsPresetSchema = z.enum(['low', 'medium', 'high', 'ultra']);
export type GraphicsPreset = z.infer<typeof graphicsPresetSchema>;

export const graphicsSettingsSchema = z.object({
  preset: graphicsPresetSchema,
  resolutionScale: z.number().min(0.5).max(2),
  dynamicResolution: z.boolean(),
  shadows: z.enum(['off', 'low', 'high']),
  drawDistance: z.number().min(200).max(1600),
  bloom: z.boolean(),
  ambientOcclusion: z.boolean(),
  antialias: z.boolean(),
  /** Speed blur at the screen edges when driving fast (off for players sensitive to motion). */
  motionBlur: z.boolean().default(true),
  trafficDensity: z.number().min(0).max(1),
  pedestrianDensity: z.number().min(0).max(1),
  fov: z.number().min(55).max(100),
  showFps: z.boolean(),
});
export type GraphicsSettings = z.infer<typeof graphicsSettingsSchema>;

export const audioSettingsSchema = z.object({
  master: z.number().min(0).max(1),
  music: z.number().min(0).max(1),
  sfx: z.number().min(0).max(1),
  ambience: z.number().min(0).max(1),
});

export const GAME_ACTIONS = [
  'forward',
  'backward',
  'left',
  'right',
  'sprint',
  'jump',
  'crouch',
  'interact',
  'exitVehicle',
  'handbrake',
  'horn',
  'camera',
  'lights',
  'radio',
  'photo',
  'map',
  'pause',
] as const;
export type GameAction = (typeof GAME_ACTIONS)[number];

export const DEFAULT_BINDINGS: Record<GameAction, string> = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  crouch: 'KeyC',
  interact: 'KeyE',
  exitVehicle: 'KeyF',
  handbrake: 'Space',
  horn: 'KeyH',
  camera: 'KeyV',
  lights: 'KeyL',
  radio: 'KeyR',
  photo: 'KeyP',
  map: 'KeyM',
  pause: 'Escape',
};

export const controlSettingsSchema = z.object({
  mouseSensitivity: z.number().min(0.1).max(5),
  invertY: z.boolean(),
  bindings: z.record(z.string().max(24), z.string().max(24)),
});

export const gameSettingsSchema = z.object({
  graphics: graphicsSettingsSchema,
  audio: audioSettingsSchema,
  controls: controlSettingsSchema,
  language: z.enum(['es', 'en']),
});
export type GameSettings = z.infer<typeof gameSettingsSchema>;

export const PRESETS: Record<GraphicsPreset, Omit<GraphicsSettings, 'preset' | 'fov' | 'showFps'>> = {
  low: {
    resolutionScale: 0.75,
    dynamicResolution: true,
    shadows: 'off',
    drawDistance: 350,
    bloom: false,
    ambientOcclusion: false,
    antialias: false,
    motionBlur: false,
    trafficDensity: 0.35,
    pedestrianDensity: 0.35,
  },
  medium: {
    resolutionScale: 1,
    dynamicResolution: true,
    shadows: 'low',
    drawDistance: 550,
    bloom: true,
    ambientOcclusion: false,
    antialias: true,
    motionBlur: true,
    trafficDensity: 0.6,
    pedestrianDensity: 0.6,
  },
  high: {
    resolutionScale: 1,
    dynamicResolution: true,
    shadows: 'high',
    drawDistance: 850,
    bloom: true,
    ambientOcclusion: false,
    antialias: true,
    motionBlur: true,
    trafficDensity: 0.85,
    pedestrianDensity: 0.85,
  },
  ultra: {
    resolutionScale: 1.25,
    dynamicResolution: false,
    shadows: 'high',
    drawDistance: 1200,
    bloom: true,
    ambientOcclusion: true,
    antialias: true,
    motionBlur: true,
    trafficDensity: 1,
    pedestrianDensity: 1,
  },
};

export function defaultGameSettings(preset: GraphicsPreset = 'medium'): GameSettings {
  return {
    graphics: { preset, fov: 70, showFps: false, ...PRESETS[preset] },
    audio: { master: 0.8, music: 0.6, sfx: 0.9, ambience: 0.8 },
    controls: { mouseSensitivity: 1, invertY: false, bindings: { ...DEFAULT_BINDINGS } },
    language: 'es',
  };
}

// ───────────────────────────── Saves & missions ─────────────────────────────
const finite = z.number().finite();
export const saveDataSchema = z.object({
  version: z.literal(1),
  player: z.object({ x: finite, y: finite, z: finite, heading: finite }),
  vehicle: z
    .object({ model: z.string().max(32), x: finite, y: finite, z: finite, heading: finite })
    .nullable(),
  money: z.number().int().min(0).max(1_000_000_000),
  timeOfDay: z.number().min(0).max(24),
  weather: z.enum(['clear', 'cloudy', 'rain']),
  discoveredLandmarks: z.array(z.string().max(64)).max(256),
  stats: z.object({
    distanceWalked: z.number().min(0),
    distanceDriven: z.number().min(0),
    playTimeSec: z.number().min(0),
    topSpeedKmh: z.number().min(0).max(1000),
  }),
  savedAt: z.string().max(40),
});
export type SaveData = z.infer<typeof saveDataSchema>;

export const missionIdSchema = z.string().regex(/^[a-z0-9_]{1,40}$/);
export const missionProgressSchema = z.object({
  missionId: missionIdSchema,
  status: z.enum(['started', 'completed', 'failed']),
  stats: z
    .object({
      timeSec: z.number().min(0).max(86_400),
      distanceM: z.number().min(0).max(1_000_000),
      topSpeedKmh: z.number().min(0).max(1000),
      collisions: z.number().int().min(0).max(100_000),
    })
    .partial()
    .optional(),
});
export type MissionProgressInput = z.infer<typeof missionProgressSchema>;

// ───────────────────────────── Support & telemetry ─────────────────────────────
export const supportTicketSchema = z.object({
  email: emailSchema.optional(),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(4000),
  category: z.enum(['payment', 'account', 'bug', 'performance', 'games', 'other']),
});

export const clientErrorSchema = z.object({
  message: z.string().max(1000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
  context: z.string().max(200).optional(),
});
