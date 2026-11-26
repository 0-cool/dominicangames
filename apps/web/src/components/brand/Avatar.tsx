import { AVATARS, type AvatarDef } from '@sd/shared';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Original line glyphs for the preset avatars (drawn on a 24×24 grid). */
const GLYPHS: Record<AvatarDef['glyph'], React.ReactNode> = {
  palm: (
    <>
      <path d="M12.5 21c.4-4.6-.1-8.6-1.8-12" />
      <path d="M10.7 9C8.6 6.8 5.5 6.4 3.5 7.8c2.6-.2 4.7.6 6.2 2" />
      <path d="M10.7 9c.6-3 3.2-4.9 6-4.6-2.2 1-3.8 2.6-4.6 4.6" />
      <path d="M10.7 9c3-1.1 6.4.1 7.8 2.5-2.4-1-4.8-1.2-7.1-.6" />
      <path d="M10.7 9c-2.7.3-4.9 2.5-5.2 5.2 1.5-2 3.2-3.4 5.1-4.2" />
      <path d="M8.5 21h8" />
    </>
  ),
  moto: (
    <>
      <circle cx="6" cy="16" r="3" />
      <circle cx="18" cy="16" r="3" />
      <path d="M9 16h4.5l2.8-5.5H12M14.5 7h2.8l1.6 3.4M6 16l3.3-5.5h3.7" />
    </>
  ),
  bus: (
    <>
      <rect x="4.5" y="4" width="15" height="13.5" rx="2.5" />
      <path d="M4.5 11h15M8 17.5V20M16 17.5V20M8 14.3h.01M16 14.3h.01M7.5 7h9" />
    </>
  ),
  baseball: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M7.4 5.6c1.6 1.7 2.5 3.9 2.5 6.4s-.9 4.7-2.5 6.4M16.6 5.6c-1.6 1.7-2.5 3.9-2.5 6.4s.9 4.7 2.5 6.4" />
    </>
  ),
  domino: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="2" />
      <path d="M7 12h10" />
      <circle cx="10" cy="7" r=".9" fill="currentColor" />
      <circle cx="14" cy="9" r=".9" fill="currentColor" />
      <circle cx="12" cy="16" r=".9" fill="currentColor" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </>
  ),
  wave: (
    <>
      <path d="M3 15c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0 3.9-1.6 4.8-.9" />
      <path d="M3 19c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0 3.9-1.6 4.8-.9" />
      <path d="M6 11.2C6 7.3 9 4.5 12.6 4.5c2.6 0 4.4 1.4 5.4 3.2-1.9-.6-4.4-.2-5.6 1.6" />
    </>
  ),
  mango: (
    <>
      <path d="M8.2 19.5c-3-1.6-3.6-5.6-1.6-8.6 2-3 5.8-4.6 9-3.4 3.3 1.3 3.8 5.4 1.4 8.4-2.2 2.8-5.8 5-8.8 3.6Z" />
      <path d="M14.5 7.4c.2-1.6 1-2.9 2.5-3.9M15.3 5c1.6-.8 3.2-.6 4.4.4-1.5.6-3 .5-4.4-.4Z" />
    </>
  ),
  helmet: (
    <>
      <path d="M4 15.5a8 8 0 0 1 16 0v1.5H4v-1.5Z" />
      <path d="M12 7.5c-2.6 1-4.2 3.6-4.2 6.5M20 15.5h-6.5V12" />
      <path d="M4 17h16" />
    </>
  ),
  arch: (
    <>
      <path d="M4 20.5V9.5L12 4l8 5.5v11" />
      <path d="M9 20.5v-5a3 3 0 0 1 6 0v5M3 20.5h18" />
    </>
  ),
  guitar: (
    <>
      <path d="M13.6 10.4 19 5M17.4 3.4l3.2 3.2" />
      <path d="M11.4 8.6c-1.3-.3-2.7.1-3.6 1-.6.6-.8 1.4-.8 2.1-1.3.1-2.4.6-3.1 1.3-1.7 1.7-1.3 4.8.9 7s5.3 2.6 7 .9c.7-.7 1.2-1.8 1.3-3.1.7 0 1.5-.2 2.1-.8.9-.9 1.3-2.3 1-3.6" />
      <circle cx="10.2" cy="15.4" r="1.4" />
    </>
  ),
  car: (
    <>
      <path d="M3.5 15.5v-3l2-4.8A2 2 0 0 1 7.4 6.4h9.2a2 2 0 0 1 1.9 1.3l2 4.8v3a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1ZM3.5 12.5h17" />
      <circle cx="7.5" cy="16.5" r="1.8" />
      <circle cx="16.5" cy="16.5" r="1.8" />
    </>
  ),
};

function hashHue(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** A player's avatar: a preset (original glyph on a gradient disc) or their initial on a brand gradient. */
export function Avatar({ avatar, username, className, ring = false }: { avatar: string | null | undefined; username: string; className?: string; ring?: boolean }) {
  const def = AVATARS.find((a) => a.id === avatar);
  const size = className ?? 'size-9';
  if (!def) {
    const hue = hashHue(username);
    return (
      <span
        className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-white', size, ring && 'ring-2 ring-white/15 ring-offset-2 ring-offset-ink-950')}
        style={{ background: `linear-gradient(135deg, hsl(${hue} 85% 58%), hsl(${(hue + 50) % 360} 80% 42%))` }}
        aria-label={`Avatar de ${username}`}
        role="img"
      >
        {/* SVG text scales with the avatar size */}
        <svg viewBox="0 0 40 40" className="size-full" aria-hidden>
          <text x="20" y="27.5" textAnchor="middle" fontSize="19" fontWeight="800" fill="#fff" style={{ fontFamily: 'var(--font-brand)' }}>
            {username.slice(0, 1).toUpperCase()}
          </text>
        </svg>
      </span>
    );
  }
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full text-white', size, ring && 'ring-2 ring-white/15 ring-offset-2 ring-offset-ink-950')} style={{ background: `linear-gradient(135deg, ${def.from}, ${def.to})` }} role="img" aria-label={`Avatar ${def.label}`}>
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {GLYPHS[def.glyph]}
      </svg>
    </span>
  );
}
