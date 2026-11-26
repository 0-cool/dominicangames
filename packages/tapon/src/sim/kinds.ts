/** Traffic roster: which sprite each kind uses, how fast it goes and how it behaves (docs/EL_TAPON.md §3). */
export interface KindDef {
  sprite: string;
  /** Alternative sprites (paint colours); one is picked at random for each car. */
  variants?: string[];
  /** Sprites drawn on top in the same frame (riders). */
  overlays?: string[];
  label: string;
  /** Ground speed range (m/s). The moto starts at 9 m/s. */
  speed: [number, number];
  /** Spawn weight for a stage (0 = never). */
  weight: (stage: number) => number;
  /** Lane-change attempts per second (carro público, Sonata, motos). */
  laneChange?: number;
  /** Sudden stop attempts per second when in a curb lane (guagua, OMSA). */
  stops?: number;
  stopTime?: [number, number];
  /** What the driver shouts when stopping. */
  stopSay?: string;
  /** Drops plantains (La Platanera). */
  drops?: boolean;
  /** Horn pitch pair (Hz) for random honks. */
  horn: [number, number];
}

export const KINDS: Record<string, KindDef> = {
  concho: { sprite: 'carro-publico', label: 'Carro público', speed: [3, 6.5], weight: () => 26, laneChange: 0.22, horn: [392, 494] },
  sonata: { sprite: 'sonata-mamey', label: 'Sonata mamey', speed: [4, 7], weight: () => 16, laneChange: 0.12, horn: [440, 554] },
  omsa: { sprite: 'omsa', label: 'OMSA', speed: [2, 3.8], weight: (s) => 6 + s, stops: 0.05, stopTime: [3, 4.5], stopSay: 'Parada', horn: [196, 247] },
  guagua: { sprite: 'guagua', label: 'Guagua', speed: [3, 6], weight: () => 11, stops: 0.16, stopTime: [2, 3.5], stopSay: '¡Vamo, vamo!', horn: [330, 415] },
  platanera: { sprite: 'platanera', label: 'La Platanera', speed: [2.5, 4.5], weight: () => 9, drops: true, horn: [370, 466] },
  policia: { sprite: 'policia', label: 'Policía', speed: [5, 7], weight: (s) => (s >= 1 ? 2 : 0), horn: [415, 523] },
  'digesett-moto': { sprite: 'moto-digesett', overlays: ['agente-motorizado'], label: 'Motorizado de tránsito', speed: [4, 6], weight: (s) => (s >= 1 ? 3 : 0), laneChange: 0.1, horn: [660, 830] },
  'digesett-pickup': { sprite: 'digesett-pickup', label: 'Tránsito', speed: [4, 6], weight: (s) => (s >= 2 ? 2 : 0), horn: [415, 523] },
  cocos: { sprite: 'cocos', label: 'Cocos fríos', speed: [3, 5], weight: () => 4, horn: [392, 494] },
  // everyday traffic (docs/EL_TAPON.md §3.9)
  sedan: { sprite: 'sedan-plata', variants: ['sedan-plata', 'sedan-vino', 'sedan-blanco'], label: 'Carro privado', speed: [4, 7.5], weight: () => 8, laneChange: 0.06, horn: [466, 587] },
  yipeta: { sprite: 'yipeta-negra', variants: ['yipeta-negra', 'yipeta-blanca'], label: 'Yipeta', speed: [4.5, 7.5], weight: () => 6, laneChange: 0.14, horn: [349, 440] },
  delivery: { sprite: 'moto-delivery', overlays: ['repartidor'], label: 'Motor de delivery', speed: [5, 8], weight: () => 5, laneChange: 0.3, horn: [740, 880] },
  agua: { sprite: 'camion-agua', label: 'Camión de botellones', speed: [2.5, 4.5], weight: () => 3, stops: 0.08, stopTime: [2, 3.5], stopSay: '¡Agua!', horn: [311, 392] },
  basura: { sprite: 'camion-basura', label: 'Camión de la basura', speed: [1.5, 3], weight: (s) => (s >= 1 ? 2 : 1), stops: 0.14, stopTime: [3, 5], stopSay: '¡La basura!', horn: [175, 220] },
  mudanza: { sprite: 'camion-mudanza', label: 'Camión de mudanza', speed: [2.5, 4.5], weight: () => 2, laneChange: 0.03, horn: [262, 330] },
};

/** Static things on the road. `deadly` = costs a casco when hit. */
export const OBSTACLES: Record<string, { sprite: string; deadly: boolean }> = {
  platano: { sprite: 'platano', deadly: true },
  racimo: { sprite: 'platano-racimo', deadly: true },
  cono: { sprite: 'cono', deadly: true },
  desvio: { sprite: 'desvio', deadly: true },
  'agente-pare': { sprite: 'agente-pare', deadly: true },
  'agente-siga': { sprite: 'agente-siga', deadly: true },
  'moto-parada': { sprite: 'moto-digesett', deadly: true },
  'policia-parada': { sprite: 'policia', deadly: true },
  hoyo: { sprite: 'hoyo', deadly: false },
  casco: { sprite: 'casco', deadly: false },
};
