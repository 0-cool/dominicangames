import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sea' | 'white' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'xl';

/** DominicanGames buttons: one primary action per view (DG Red), glass secondary, quiet ghost. */
const variants: Record<Variant, string> = {
  primary: 'bg-dg text-white font-semibold shadow-red hover:brightness-110 hover:-translate-y-px active:translate-y-0 active:brightness-95',
  secondary: 'bg-white/[0.07] text-ink-100 border border-white/12 hover:bg-white/[0.12] hover:border-white/20',
  ghost: 'text-ink-200 hover:bg-white/[0.06] hover:text-white',
  danger: 'bg-coral-500/90 text-white hover:bg-coral-500',
  sea: 'bg-sea-500 text-ink-950 font-semibold hover:bg-sea-400',
  white: 'bg-white text-ink-950 font-semibold hover:bg-ink-100 hover:-translate-y-px',
  outline: 'border border-white/25 text-white hover:border-white/60 hover:bg-white/[0.06]',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-5 text-[15px] rounded-xl gap-2',
  lg: 'h-14 px-7 text-[15px] rounded-2xl gap-2.5 tracking-wide',
  xl: 'h-16 px-9 text-base rounded-2xl gap-3 tracking-[0.08em] uppercase font-bold',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cx('inline-flex select-none items-center justify-center whitespace-nowrap transition duration-200 disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], extra);
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function LinkButton({ variant = 'primary', size = 'md', className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-200">
        {label}
      </label>
      {children}
      {error ? <p className="text-sm text-coral-500">{error}</p> : hint ? <p className="text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

const inputCls = 'block w-full rounded-xl border border-white/10 bg-ink-900/80 px-4 py-3 text-[15px] text-white placeholder:text-ink-500 transition focus:border-dg-blue-400/70 focus:outline-none focus:ring-4 focus:ring-dg-blue-500/15 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode }>(function Input({ label, error, hint, className, id, ...rest }, ref) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={iid}>
      <input ref={ref} id={iid} aria-invalid={!!error} className={cx(inputCls, error && 'border-coral-500/70', className)} {...rest} />
    </Field>
  );
});

export function PasswordInput({ label, error, hint, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode }) {
  const [show, setShow] = useState(false);
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={iid}>
      <div className="relative">
        <input id={iid} type={show ? 'text' : 'password'} aria-invalid={!!error} className={cx(inputCls, 'pr-12', error && 'border-coral-500/70')} {...rest} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-400 hover:text-white" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    </Field>
  );
}

export function Textarea({ label, error, id, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} htmlFor={iid}>
      <textarea id={iid} className={cx(inputCls, 'min-h-36 resize-y', className)} {...rest} />
    </Field>
  );
}

export function Select({ label, id, children, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} htmlFor={iid}>
      <select id={iid} className={cx(inputCls, 'appearance-none', className)} {...rest}>
        {children}
      </select>
    </Field>
  );
}

export function Checkbox({ children, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode; error?: string }) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-300">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 rounded" {...rest} />
        <span>{children}</span>
      </label>
      {error && <p className="mt-1 text-sm text-coral-500">{error}</p>}
    </div>
  );
}

const alertTones = {
  info: 'border-sea-400/25 bg-sea-500/10 text-sea-300',
  success: 'border-leaf-500/30 bg-leaf-500/10 text-[#8fe3ad]',
  warning: 'border-gold-400/30 bg-gold-400/10 text-gold-300',
  error: 'border-coral-500/30 bg-coral-500/10 text-[#ff9fb6]',
};

export function Alert({ tone = 'info', title, children, className }: { tone?: keyof typeof alertTones; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-xl border px-4 py-3 text-sm', alertTones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title && 'mt-1', 'text-ink-200/90')}>{children}</div>}
    </div>
  );
}

const badgeTones = {
  ok: 'bg-leaf-500/15 text-[#8fe3ad] ring-leaf-500/30',
  warn: 'bg-gold-400/15 text-gold-300 ring-gold-400/30',
  bad: 'bg-coral-500/15 text-[#ff9fb6] ring-coral-500/30',
  muted: 'bg-white/5 text-ink-300 ring-white/10',
  sun: 'bg-sun-500/15 text-sun-300 ring-sun-500/30',
  sea: 'bg-sea-500/15 text-sea-300 ring-sea-500/30',
  red: 'bg-dg-red-500/15 text-dg-red-300 ring-dg-red-500/35',
  blue: 'bg-dg-blue-500/15 text-dg-blue-300 ring-dg-blue-500/35',
  white: 'bg-white text-ink-950 ring-white',
};
export function Badge({ tone = 'muted', children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', badgeTones[tone], className)}>{children}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('card', className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-10 flex items-end justify-between gap-8">
      <div>
        {eyebrow && <p className="brand-eyebrow mb-3">{eyebrow}</p>}
        <h1 className="brand-title text-[2.6rem] text-white">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-300">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 gap-3">{actions}</div>}
    </div>
  );
}

/** Santo Domingo Open World game logo (the game's own identity: sunset + Caribbean, Anton). */
export function SdowLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="lg-sun" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd77a" />
            <stop offset="0.5" stopColor="#ff6a3d" />
            <stop offset="1" stopColor="#ff3d6e" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="#10131b" />
        <circle cx="16" cy="15" r="7.5" fill="url(#lg-sun)" />
        <path d="M3 21.5c3.2-1.6 6.3-1.6 9.4 0s6.3 1.6 9.4 0 4.8-1.6 7.2-.6V29H3z" fill="#19b3a3" />
        <path d="M3 25c3.2-1.6 6.3-1.6 9.4 0s6.3 1.6 9.4 0 4.8-1.6 7.2-.6V29H3z" fill="#0f8f86" />
      </svg>
      {!compact && (
        <span className="leading-none">
          <span className="display block text-[19px] text-white">Santo Domingo</span>
          <span className="block text-[9.5px] font-bold tracking-[0.34em] text-sun-400">OPEN WORLD</span>
        </span>
      )}
    </span>
  );
}

export { Logo, DgMark, DgLoader } from './brand/Logo.tsx';

// ───────────── Icons (inline SVG, original) ─────────────
type IconProps = { className?: string };
const I = ({ className, children }: IconProps & { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" className={className ?? 'size-5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
export const IconEye = (p: IconProps) => (
  <I {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </I>
);
export const IconEyeOff = (p: IconProps) => (
  <I {...p}>
    <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </I>
);
export const IconCheck = (p: IconProps) => (
  <I {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </I>
);
export const IconX = (p: IconProps) => (
  <I {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </I>
);
export const IconArrowRight = (p: IconProps) => (
  <I {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </I>
);
export const IconPlay = (p: IconProps) => (
  <svg viewBox="0 0 24 24" className={p.className ?? 'size-5'} fill="currentColor" aria-hidden>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
);
export const IconLock = (p: IconProps) => (
  <I {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </I>
);
export const IconShield = (p: IconProps) => (
  <I {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.4" />
  </I>
);
export const IconMoto = (p: IconProps) => (
  <I {...p}>
    <circle cx="5.5" cy="16.5" r="3.2" />
    <circle cx="18.5" cy="16.5" r="3.2" />
    <path d="M8.5 16.5h5l3-6h-4.5M14 7h3l1.5 3.5M5.5 16.5 9 10h4" />
  </I>
);
export const IconCar = (p: IconProps) => (
  <I {...p}>
    <path d="M3.5 15.5v-3l2-5a2 2 0 0 1 1.9-1.3h9.2a2 2 0 0 1 1.9 1.3l2 5v3a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1ZM3.5 12.5h17" />
    <circle cx="7.5" cy="16.5" r="1.8" />
    <circle cx="16.5" cy="16.5" r="1.8" />
  </I>
);
export const IconPeople = (p: IconProps) => (
  <I {...p}>
    <circle cx="9" cy="7.5" r="3" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M15.8 14.2A4.5 4.5 0 0 1 21 18.5" />
  </I>
);
export const IconMoon = (p: IconProps) => (
  <I {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </I>
);
export const IconRain = (p: IconProps) => (
  <I {...p}>
    <path d="M7 15a4.5 4.5 0 1 1 1-8.9A5.5 5.5 0 0 1 18.6 8 3.6 3.6 0 0 1 18 15H7Z" />
    <path d="m8 18-1 2.5M12.5 18l-1 2.5M17 18l-1 2.5" />
  </I>
);
export const IconFlag = (p: IconProps) => (
  <I {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </I>
);
export const IconMap = (p: IconProps) => (
  <I {...p}>
    <path d="m9 4.5-5.5 2v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2ZM9 4.5v13M15 6.5v13" />
  </I>
);
export const IconLandmark = (p: IconProps) => (
  <I {...p}>
    <path d="M3.5 20.5h17M5 17.5h14M6 17.5v-7M10 17.5v-7M14 17.5v-7M18 17.5v-7M4 10.5 12 4l8 6.5H4Z" />
  </I>
);
export const IconTimer = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="13.5" r="7" />
    <path d="M12 9.5v4l2.5 2M9.5 3h5" />
  </I>
);
export const IconUser = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </I>
);
export const IconSettings = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </I>
);
export const IconLifebuoy = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="m5.6 5.6 4 4M14.4 14.4l4 4M18.4 5.6l-4 4M9.6 14.4l-4 4" />
  </I>
);
export const IconLogout = (p: IconProps) => (
  <I {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
  </I>
);
export const IconCpu = (p: IconProps) => (
  <I {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9.5 9.5h5v5h-5zM9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
  </I>
);
export const IconSave = (p: IconProps) => (
  <I {...p}>
    <path d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5Z" />
    <path d="M7.5 3.5v5h8v-5M7.5 20.5v-6.5h9v6.5" />
  </I>
);
export const IconKeyboard = (p: IconProps) => (
  <I {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M18 13h.01M9 15.5h6" />
  </I>
);
export const IconSun = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </I>
);
export const IconGrid = (p: IconProps) => (
  <I {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
    <path d="M14.5 14.2v5.6a.6.6 0 0 0 .9.5l4.6-2.8a.6.6 0 0 0 0-1l-4.6-2.8a.6.6 0 0 0-.9.5Z" />
  </I>
);
export const IconTrophy = (p: IconProps) => (
  <I {...p}>
    <path d="M7.5 4.5h9v4.8a4.5 4.5 0 0 1-9 0V4.5ZM7.5 6.5H4.8a.8.8 0 0 0-.8.8c0 2.3 1.6 4 3.8 4.4M16.5 6.5h2.7a.8.8 0 0 1 .8.8c0 2.3-1.6 4-3.8 4.4M12 13.8v3.4M8.5 20.5h7M9.5 17.2h5l.6 3.3h-6.2l.6-3.3Z" />
  </I>
);
export const IconCrown = (p: IconProps) => (
  <I {...p}>
    <path d="m3.5 8 4.2 3.6L12 5l4.3 6.6L20.5 8l-1.8 10H5.3L3.5 8ZM5.5 20.5h13" />
  </I>
);
export const IconStar = (p: IconProps) => (
  <I {...p}>
    <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z" />
  </I>
);
export const IconSpark = (p: IconProps) => (
  <I {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.2 6.2l2.6 2.6M15.2 15.2l2.6 2.6M17.8 6.2l-2.6 2.6M8.8 15.2l-2.6 2.6" />
  </I>
);
export const IconMegaphone = (p: IconProps) => (
  <I {...p}>
    <path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1ZM16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" />
  </I>
);
export const IconHeart = (p: IconProps) => (
  <I {...p}>
    <path d="M12 20s-7.5-4.4-7.5-10A4.4 4.4 0 0 1 12 7.4 4.4 4.4 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" />
  </I>
);
export const IconGamepad = (p: IconProps) => (
  <I {...p}>
    <path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.4l-.8 3.8a2.4 2.4 0 0 1-4.1 1.1L14.6 16H9.4l-1.9 2.3a2.4 2.4 0 0 1-4.1-1.1l-.8-3.8A4.5 4.5 0 0 1 7 8ZM7.5 11v3M6 12.5h3M15.5 12h.01M17.5 13.5h.01" />
  </I>
);
export const IconBolt = (p: IconProps) => (
  <I {...p}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />
  </I>
);
export const IconGlobe = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5Z" />
  </I>
);
export const IconArrowLeft = (p: IconProps) => (
  <I {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </I>
);
export const IconWalk = (p: IconProps) => (
  <I {...p}>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="m9 21 2.5-6.5L14 17v4M8 11l2.5-3.5h3L16 11l2.5 1M11.5 14.5 13 8" />
  </I>
);
export const IconSpeed = (p: IconProps) => (
  <I {...p}>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0M12 13.5l4-4.5" />
    <circle cx="12" cy="14" r="1.4" />
  </I>
);
export const IconCalendar = (p: IconProps) => (
  <I {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </I>
);
export const IconCloud = (p: IconProps) => (
  <I {...p}>
    <path d="M7 18.5a4.5 4.5 0 1 1 1-8.9A5.5 5.5 0 0 1 18.6 11.5 3.5 3.5 0 0 1 18 18.5H7Z" />
  </I>
);
