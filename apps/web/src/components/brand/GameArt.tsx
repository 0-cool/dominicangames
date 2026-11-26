import { useId, type ReactNode } from 'react';

/**
 * Original concept artwork (vector) for catalog entries that do not have real game imagery yet —
 * the “Próximamente” concepts. Always presented with an “Arte conceptual” label: it is not gameplay.
 */
export function GameArt({ art, accent = '#ff2e4d', accent2, className }: { art?: string; accent?: string; accent2?: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const body = art === 'moto' ? <MotoArt id={id} /> : art === 'racing' ? <RacingArt id={id} /> : art === 'island' ? <IslandArt id={id} /> : <GenericArt id={id} a={accent} b={accent2 ?? '#2f5bff'} />;
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className={className ?? 'size-full'} role="img" aria-label="Arte conceptual">
      {body}
    </svg>
  );
}

function Palm({ x, y, s = 1, flip = false, fill }: { x: number; y: number; s?: number; flip?: boolean; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} fill={fill}>
      <path d="M-6 0 C-2 -90 10 -170 34 -250 L46 -248 C24 -168 14 -90 10 0 Z" />
      <path d="M40 -250 C0 -300 -70 -300 -120 -262 C-70 -282 -20 -272 22 -244 Z" />
      <path d="M40 -250 C60 -310 130 -330 190 -300 C130 -306 80 -290 48 -240 Z" />
      <path d="M40 -250 C100 -270 170 -240 200 -190 C150 -232 96 -244 46 -236 Z" />
      <path d="M40 -250 C-10 -246 -70 -210 -96 -150 C-50 -200 -6 -224 38 -238 Z" />
      <path d="M40 -250 C30 -300 60 -350 100 -370 C76 -330 62 -296 50 -246 Z" />
    </g>
  );
}

function Stars({ n, seed, color = '#ffffff', maxY = 520 }: { n: number; seed: number; color?: string; maxY?: number }) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return (
    <g fill={color}>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={rnd() * 1600} cy={rnd() * maxY} r={rnd() * 1.8 + 0.4} opacity={rnd() * 0.7 + 0.2} />
      ))}
    </g>
  );
}

/** Moto RD — dusk ride: road to the sunset, rider tucked on a sport bike. */
function MotoArt({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14071f" />
          <stop offset="0.38" stopColor="#4a1236" />
          <stop offset="0.6" stopColor="#c43a2a" />
          <stop offset="0.7" stopColor="#ffb020" />
        </linearGradient>
        <radialGradient id={`${id}sun`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset="0.5" stopColor="#ffc24a" />
          <stop offset="1" stopColor="#ff7a1f" />
        </radialGradient>
        <radialGradient id={`${id}glow`} cx="0.62" cy="0.62" r="0.5">
          <stop offset="0" stopColor="#ffb020" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb020" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}road`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1022" />
          <stop offset="1" stopColor="#07030a" />
        </linearGradient>
        <linearGradient id={`${id}speed`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffb020" stopOpacity="0" />
          <stop offset="1" stopColor="#ffd36b" stopOpacity="0.9" />
        </linearGradient>
        <filter id={`${id}blur`}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id={`${id}sunClip`}>
          <circle cx="1010" cy="600" r="190" />
        </clipPath>
      </defs>
      <rect width="1600" height="1000" fill={`url(#${id}sky)`} />
      <rect width="1600" height="1000" fill={`url(#${id}glow)`} />
      <circle cx="1010" cy="600" r="190" fill={`url(#${id}sun)`} />
      <g clipPath={`url(#${id}sunClip)`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x="800" y={612 + i * 26} width="420" height={6 + i * 3} fill="#d9472a" />
        ))}
      </g>
      <path d="M0 690 L120 650 L260 672 L380 632 L520 664 L640 640 L760 668 L900 652 L1040 676 L1180 640 L1320 670 L1460 642 L1600 664 L1600 720 L0 720 Z" fill="#2a0f2c" />
      <path d="M0 720 L1600 720 L1600 1000 L0 1000 Z" fill="#0b0410" />
      <path d="M1010 700 L1060 700 L1600 1000 L300 1000 Z" fill={`url(#${id}road)`} />
      <path d="M1010 700 L300 1000" stroke="#ff7a1f" strokeWidth="5" opacity="0.8" />
      <path d="M1060 700 L1600 1000" stroke="#ff7a1f" strokeWidth="5" opacity="0.8" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const t0 = 0.08 + i * 0.16;
        const t1 = t0 + 0.07;
        const x = (t: number) => 1035 - 85 * t;
        const y = (t: number) => 700 + 300 * t;
        return <path key={i} d={`M${x(t0)} ${y(t0)} L${x(t1)} ${y(t1)}`} stroke="#ffd36b" strokeWidth={4 + i * 3} strokeLinecap="round" />;
      })}
      <Palm x={150} y={730} s={1.25} fill="#0b0410" />
      <Palm x={330} y={735} s={0.8} flip fill="#12061a" />
      <Palm x={1470} y={735} s={1.1} flip fill="#0b0410" />
      {/* speed streaks */}
      <g opacity="0.85">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} x={180 + i * 18} y={700 + i * 30} width={320 - i * 20} height="3" rx="1.5" fill={`url(#${id}speed)`} />
        ))}
      </g>
      {/* rider + bike, tucked and leaning */}
      <g transform="translate(560 900) rotate(-10)">
        <ellipse cx="190" cy="6" rx="210" ry="16" fill="#000" opacity="0.5" filter={`url(#${id}blur)`} />
        <circle cx="62" cy="-66" r="66" fill="#08030b" stroke="#2b1020" strokeWidth="10" />
        <circle cx="318" cy="-66" r="66" fill="#08030b" stroke="#2b1020" strokeWidth="10" />
        <circle cx="62" cy="-66" r="24" fill="#1d0b17" />
        <circle cx="318" cy="-66" r="24" fill="#1d0b17" />
        <path d="M62 -66 L120 -150 L200 -170 L262 -200 L300 -186 L318 -66 L284 -70 L262 -150 L220 -110 L150 -92 Z" fill="#0b0410" />
        <path d="M120 -150 L200 -170 L262 -200 L300 -186" fill="none" stroke="#ffb020" strokeWidth="4" strokeLinecap="round" />
        <path d="M110 -160 C150 -210 196 -246 246 -252 L262 -226 C220 -214 180 -190 150 -150 Z" fill="#0b0410" />
        <path d="M150 -150 L196 -112 L170 -84" fill="none" stroke="#0b0410" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M236 -238 L278 -196" stroke="#0b0410" strokeWidth="18" strokeLinecap="round" />
        <circle cx="262" cy="-262" r="32" fill="#0b0410" />
        <path d="M244 -278 C262 -296 290 -290 296 -268" fill="none" stroke="#ffd36b" strokeWidth="5" strokeLinecap="round" />
        <path d="M110 -160 C150 -210 196 -246 246 -252" fill="none" stroke="#ff7a1f" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        <rect x="-20" y="-110" width="40" height="10" rx="5" fill="#ff3b30" opacity="0.95" />
        <rect x="-60" y="-110" width="60" height="10" rx="5" fill="#ff3b30" opacity="0.35" filter={`url(#${id}blur)`} />
      </g>
    </>
  );
}

/** Caribbean Racing — night street race: neon horizon, light trails, low sports car. */
function RacingArt({ id }: { id: string }) {
  const vx = 820;
  const vy = 560;
  return (
    <>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#03040d" />
          <stop offset="0.45" stopColor="#140a33" />
          <stop offset="0.56" stopColor="#5b1a7a" />
          <stop offset="0.6" stopColor="#ff3ea5" />
        </linearGradient>
        <linearGradient id={`${id}floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#12061f" />
          <stop offset="1" stopColor="#020208" />
        </linearGradient>
        <linearGradient id={`${id}trailR`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff2e4d" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ff2e4d" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}trailC`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0.95" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`${id}halo`} cx="0.51" cy="0.56" r="0.42">
          <stop offset="0" stopColor="#ff3ea5" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff3ea5" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="1000" fill={`url(#${id}sky)`} />
      <Stars n={90} seed={7} maxY={420} color="#cfe9ff" />
      <rect width="1600" height="1000" fill={`url(#${id}halo)`} />
      {/* skyline */}
      <g fill="#0a0618">
        {[40, 150, 230, 330, 400, 470, 560, 610, 990, 1060, 1120, 1210, 1290, 1380, 1460, 1530].map((x, i) => {
          const h = [120, 200, 150, 260, 180, 230, 140, 300, 280, 190, 340, 210, 160, 250, 140, 220][i];
          return <rect key={x} x={x} y={vy - h} width={i % 3 === 0 ? 90 : 64} height={h} />;
        })}
      </g>
      <g fill="#22d3ee" opacity="0.7">
        {Array.from({ length: 70 }, (_, i) => (
          <rect key={i} x={(i * 97) % 1560 + 20} y={vy - 30 - ((i * 53) % 240)} width="5" height="7" opacity={(i % 4) / 4 + 0.2} fill={i % 3 ? '#22d3ee' : '#ff3ea5'} />
        ))}
      </g>
      <rect x="0" y={vy} width="1600" height={1000 - vy} fill={`url(#${id}floor)`} />
      {/* perspective grid */}
      <g stroke="#a855f7" strokeOpacity="0.35" strokeWidth="2">
        {Array.from({ length: 17 }, (_, i) => {
          const x = -800 + i * 200;
          return <line key={`v${i}`} x1={vx} y1={vy} x2={x} y2={1000} />;
        })}
        {[0.06, 0.14, 0.25, 0.4, 0.6, 0.86].map((t) => (
          <line key={`h${t}`} x1="0" y1={vy + (1000 - vy) * t} x2="1600" y2={vy + (1000 - vy) * t} strokeOpacity={0.15 + t * 0.4} />
        ))}
      </g>
      {/* light trails */}
      <g filter={`url(#${id}glow)`} fill="none" strokeLinecap="round">
        <path d={`M-40 900 C 400 760, 640 620, ${vx - 10} ${vy + 4}`} stroke={`url(#${id}trailR)`} strokeWidth="10" />
        <path d={`M40 1000 C 460 820, 680 650, ${vx - 4} ${vy + 6}`} stroke={`url(#${id}trailR)`} strokeWidth="6" />
        <path d={`M1640 880 C 1200 760, 980 630, ${vx + 10} ${vy + 4}`} stroke={`url(#${id}trailC)`} strokeWidth="10" />
        <path d={`M1560 1000 C 1150 830, 960 660, ${vx + 6} ${vy + 6}`} stroke={`url(#${id}trailC)`} strokeWidth="5" />
      </g>
      <Palm x={120} y={vy + 10} s={1.1} fill="#05030c" />
      <Palm x={1500} y={vy + 10} s={1.25} flip fill="#05030c" />
      {/* sports car (rear three-quarter) */}
      <g transform="translate(980 900)">
        <ellipse cx="190" cy="8" rx="250" ry="22" fill="#000" opacity="0.7" />
        <path d="M-40 0 C-40 -40 -20 -70 30 -84 L120 -110 C160 -150 220 -168 290 -160 C350 -152 380 -130 410 -100 L440 -92 C460 -86 470 -70 470 -40 L470 0 Z" fill="#06040c" />
        <path d="M130 -112 C170 -146 222 -158 286 -152 C330 -146 356 -130 380 -108 Z" fill="#141032" />
        <path d="M120 -110 C160 -150 220 -168 290 -160 C350 -152 380 -130 410 -100" fill="none" stroke="#22d3ee" strokeWidth="3" opacity="0.8" />
        <rect x="-30" y="-58" width="140" height="10" rx="5" fill="#ff2e4d" filter={`url(#${id}glow)`} />
        <circle cx="40" cy="0" r="38" fill="#030207" stroke="#1d1838" strokeWidth="8" />
        <circle cx="380" cy="0" r="38" fill="#030207" stroke="#1d1838" strokeWidth="8" />
      </g>
    </>
  );
}

/** Island Survival — moonlit tropical island, campfire on the beach. */
function IslandArt({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#020b12" />
          <stop offset="0.5" stopColor="#08303c" />
          <stop offset="0.64" stopColor="#0f5a5a" />
        </linearGradient>
        <linearGradient id={`${id}sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a4b52" />
          <stop offset="1" stopColor="#021a20" />
        </linearGradient>
        <radialGradient id={`${id}moon`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f2fffb" />
          <stop offset="0.7" stopColor="#c9f5ea" />
          <stop offset="1" stopColor="#8fe3d0" />
        </radialGradient>
        <radialGradient id={`${id}moonGlow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#8fe3d0" stopOpacity="0.45" />
          <stop offset="1" stopColor="#8fe3d0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}fire`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd36b" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#ff7a1f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff7a1f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="1000" fill={`url(#${id}sky)`} />
      <Stars n={140} seed={11} maxY={600} color="#e6fffb" />
      <circle cx="1170" cy="270" r="260" fill={`url(#${id}moonGlow)`} />
      <circle cx="1170" cy="270" r="92" fill={`url(#${id}moon)`} />
      <rect x="0" y="640" width="1600" height="360" fill={`url(#${id}sea)`} />
      {/* moon reflection */}
      <g fill="#c9f5ea">
        {Array.from({ length: 16 }, (_, i) => (
          <rect key={i} x={1170 - (40 + i * 7) / 2 + ((i * 37) % 21) - 10} y={650 + i * 21} width={40 + i * 7} height="3" rx="1.5" opacity={0.6 - i * 0.03} />
        ))}
      </g>
      {/* island */}
      <path d="M260 700 C380 640 520 610 700 612 C860 614 980 640 1060 690 C1000 712 860 722 700 722 C520 722 360 716 260 700 Z" fill="#031417" />
      <path d="M300 700 C420 676 560 668 700 670 C840 672 960 684 1030 696" fill="none" stroke="#e0c48a" strokeOpacity="0.35" strokeWidth="4" />
      <Palm x={560} y={640} s={1.05} fill="#020c0e" />
      <Palm x={660} y={628} s={1.3} flip fill="#020c0e" />
      <Palm x={820} y={640} s={0.85} fill="#031114" />
      {/* shelter */}
      <path d="M880 690 L930 630 L980 690 Z" fill="#020c0e" />
      <path d="M930 630 L930 690" stroke="#0e2e30" strokeWidth="3" />
      {/* campfire */}
      <circle cx="760" cy="688" r="90" fill={`url(#${id}fire)`} />
      <path d="M752 690 C746 676 758 664 760 652 C766 666 776 674 770 690 Z" fill="#ffd36b" />
      {/* jungle foreground */}
      <path d="M0 1000 L0 760 C60 800 90 860 120 1000 Z" fill="#010708" />
      <path d="M0 860 C80 820 180 840 260 920 C170 900 90 900 0 940 Z" fill="#021012" />
      <path d="M1600 1000 L1600 730 C1520 790 1480 860 1460 1000 Z" fill="#010708" />
      <path d="M1600 850 C1500 810 1390 840 1320 930 C1420 900 1510 905 1600 940 Z" fill="#021012" />
    </>
  );
}

function GenericArt({ id, a, b }: { id: string; a: string; b: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={b} stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#060812" />
          <stop offset="1" stopColor={a} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="#060812" />
      <rect width="1600" height="1000" fill={`url(#${id}bg)`} />
      <g stroke="#ffffff" strokeOpacity="0.06">
        {Array.from({ length: 29 }, (_, i) => (
          <line key={`v${i}`} x1={i * 56} y1="0" x2={i * 56} y2="1000" />
        ))}
        {Array.from({ length: 18 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 56} x2="1600" y2={i * 56} />
        ))}
      </g>
      <g transform="translate(650 350)" opacity="0.9">
        <rect width="135" height="135" rx="34" fill={b} />
        <rect x="165" width="135" height="135" rx="34" fill={a} />
        <rect y="165" width="135" height="135" rx="34" fill={a} />
        <path d="M187 186v100c0 9 10 15 18 10l84-50c7-5 7-16 0-20l-84-50c-8-5-18 1-18 10Z" fill="#fff" />
      </g>
    </>
  );
}

/** Small “Arte conceptual” tag shown on top of concept art. */
export function ConceptTag({ children = 'Arte conceptual' }: { children?: ReactNode }) {
  return <span className="rounded-md bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80 backdrop-blur">{children}</span>;
}
