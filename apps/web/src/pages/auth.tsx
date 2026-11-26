import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { registerSchema, passwordSchema, emailSchema } from '@sd/shared';
import { Api, ApiError, errorMessage } from '../lib/api.ts';
import { safeNext, useAuth } from '../lib/auth.ts';
import { useTitle } from '../lib/useTitle.ts';
import { DevMailbox } from '../components/DevMailbox.tsx';
import { Alert, Button, Checkbox, IconCheck, Input, LinkButton, PasswordInput, Spinner, cx } from '../components/ui.tsx';
import { DgMark } from '../components/brand/Logo.tsx';

const PERKS = ['Registro gratis, sin pagos ni suscripciones', 'Una cuenta para todos los juegos de DominicanGames', 'Tu progreso guardado en la nube', 'Logros, rankings y comunidad'];

/** Desktop auth layout: brand panel (real game imagery) + form card. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1400px] grid-cols-[1.1fr_1fr] gap-10 px-8 py-10">
      <aside className="grain relative isolate flex flex-col justify-end overflow-hidden rounded-[28px] border border-white/[0.07] p-12">
        <img src="/img/games/santo-domingo-open-world/hero-malecon-noche.jpg" alt="" aria-hidden className="absolute inset-0 -z-20 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,7,13,0.25)_0%,rgba(5,7,13,0.55)_45%,rgba(5,7,13,0.95)_100%)]" />
        <DgMark className="size-12" />
        <h2 className="brand-title mt-6 text-[2.8rem] text-white">
          Una cuenta.
          <br />
          <span className="text-gradient-dg">Todos los mundos.</span>
        </h2>
        <ul className="mt-7 space-y-3">
          {PERKS.map((t) => (
            <li key={t} className="flex items-center gap-3 text-[15px] text-ink-200">
              <span className="flex size-6 items-center justify-center rounded-full bg-white/10">
                <IconCheck className="size-3.5 text-dg-red-400" />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-ink-400">Imagen: Santo Domingo Open World, captura dentro del juego.</p>
      </aside>
      <div className="flex items-center justify-center">
        <div className="w-full max-w-[440px] animate-fade-up">
          <div className="card p-9">
            <h1 className="brand-title text-[1.9rem] text-white">{title}</h1>
            {subtitle && <p className="mt-2.5 text-sm leading-relaxed text-ink-300">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-ink-400">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

type Errors = Partial<Record<string, string>>;
function zodErrors(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? 'form');
    out[k] ??= i.message;
  }
  return out;
}
function apiFieldErrors(e: unknown): Errors {
  if (e instanceof ApiError && e.fields?.length) return Object.fromEntries(e.fields.map((f) => [f.path.split('.')[0], f.message]));
  return {};
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  if (/^(.)\1+$/.test(pw) || /^(1234|qwer|pass|contra)/i.test(pw)) s = Math.min(s, 1);
  return Math.min(4, s);
}
function StrengthMeter({ pw }: { pw: string }) {
  const s = strength(pw);
  if (!pw) return null;
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'];
  const colors = ['bg-coral-500', 'bg-coral-500', 'bg-gold-400', 'bg-sea-400', 'bg-leaf-500'];
  return (
    <div className="mt-2 flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('h-1 flex-1 rounded-full', i < Math.max(1, s) ? colors[s] : 'bg-white/10')} />
        ))}
      </div>
      <span className="w-20 text-right text-xs text-ink-400">{labels[s]}</span>
    </div>
  );
}

export function RegisterPage() {
  useTitle('Crear cuenta gratis');
  const nav = useNavigate();
  const [params] = useSearchParams();
  const setUser = useAuth((s) => s.setUser);
  const [f, setF] = useState({ email: '', username: '', password: '', confirm: '', acceptTerms: false });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const parsed = registerSchema.safeParse(f);
    const errs: Errors = parsed.success ? {} : zodErrors(parsed.error.issues);
    if (f.password !== f.confirm) errs.confirm = 'Las contraseñas no coinciden';
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success) return;
    setBusy(true);
    try {
      const { user } = await Api.register(parsed.data);
      setUser(user);
      // Free platform: straight to the game (or the dashboard). E-mail verification is requested, never required.
      nav(safeNext(params.get('next'), '/panel?bienvenida=1'), { replace: true });
    } catch (err) {
      setErrors(apiFieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Crea tu cuenta DominicanGames"
      subtitle="Es gratis. Con una sola cuenta juegas todos nuestros juegos, empezando por Santo Domingo Open World."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to={`/entrar${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-dg-blue-300 hover:underline">
            Entra aquí
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Input label="Correo electrónico" type="email" autoComplete="email" value={f.email} onChange={set('email')} error={errors.email} placeholder="tu@correo.com" required />
        <Input label="Nombre de usuario" autoComplete="username" value={f.username} onChange={set('username')} error={errors.username} hint="Así te verán en todos los juegos. 3–24 caracteres: letras, números, punto o guion bajo." placeholder="tigueraje_rd" required />
        <div>
          <PasswordInput label="Contraseña" autoComplete="new-password" value={f.password} onChange={set('password')} error={errors.password} hint="Mínimo 10 caracteres. Usa una frase que no uses en otro sitio." required />
          <StrengthMeter pw={f.password} />
        </div>
        <PasswordInput label="Confirmar contraseña" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} required />
        <Checkbox checked={f.acceptTerms} onChange={set('acceptTerms')} error={errors.acceptTerms} name="acceptTerms">
          Acepto los{' '}
          <Link to="/terminos" target="_blank" className="text-dg-blue-300 underline">
            Términos y condiciones
          </Link>{' '}
          y la{' '}
          <Link to="/privacidad" target="_blank" className="text-dg-blue-300 underline">
            Política de privacidad
          </Link>
          .
        </Checkbox>
        <Button type="submit" loading={busy} className="w-full" size="lg">
          Crear cuenta gratis
        </Button>
        <p className="text-center text-xs text-ink-500">Sin tarjeta. Sin pagos. Sin suscripciones.</p>
      </form>
    </AuthCard>
  );
}

export function LoginPage() {
  useTitle('Entrar');
  const nav = useNavigate();
  const [params] = useSearchParams();
  const setUser = useAuth((s) => s.setUser);
  const [f, setF] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!f.email || !f.password) return setError('Escribe tu correo y tu contraseña.');
    setBusy(true);
    try {
      const { user } = await Api.login(f);
      setUser(user);
      nav(safeNext(params.get('next'), '/panel'), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Bienvenido de vuelta"
      subtitle="Entra con tu cuenta DominicanGames para seguir jugando donde te quedaste."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link to={`/registro${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-dg-blue-300 hover:underline">
            Regístrate gratis
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Correo electrónico" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="tu@correo.com" required />
        <div>
          <PasswordInput label="Contraseña" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
          <div className="mt-2 text-right">
            <Link to="/recuperar" className="text-sm text-ink-300 hover:text-white">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>
        <Button type="submit" loading={busy} className="w-full" size="lg">
          Entrar
        </Button>
      </form>
    </AuthCard>
  );
}

export function CheckEmailPage() {
  useTitle('Verifica tu correo');
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user?.emailVerified) nav('/panel', { replace: true });
  }, [user, nav]);
  // Poll so the page moves on as soon as the link is opened in another tab.
  useEffect(() => {
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);
  async function resend() {
    setBusy(true);
    setError('');
    try {
      await Api.resendVerification();
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Confirma tu correo" subtitle={<>Te enviamos un enlace de verificación a <strong className="text-white">{user?.email ?? 'tu correo'}</strong>. Confirmarlo protege tu cuenta y te permite recuperarla. Mientras tanto, ya puedes jugar.</>}>
      <div className="space-y-4">
        {sent && <Alert tone="success">Te enviamos un nuevo enlace. Revisa también la carpeta de spam.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <LinkButton to="/jugar" className="w-full" size="lg">
          Jugar ahora
        </LinkButton>
        <Button variant="secondary" className="w-full" onClick={resend} loading={busy} disabled={!user}>
          Reenviar enlace
        </Button>
        <LinkButton to="/panel" variant="ghost" className="w-full">
          Ir a mi panel
        </LinkButton>
      </div>
      <DevMailbox email={user?.email} />
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  useTitle('Verificación de correo');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { refresh, user } = useAuth();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    Api.verifyEmail(token)
      .then(async () => {
        setState('ok');
        await refresh();
      })
      .catch((e) => {
        setError(errorMessage(e));
        setState('error');
      });
  }, [token, refresh]);
  return (
    <AuthCard title={state === 'ok' ? '¡Correo verificado!' : state === 'error' ? 'Enlace no válido' : 'Verificando…'}>
      {state === 'loading' && (
        <div className="flex justify-center py-6 text-ink-300">
          <Spinner className="size-8" />
        </div>
      )}
      {state === 'ok' && (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-leaf-500/15 text-leaf-500 animate-pop">
            <IconCheck className="size-8" />
          </div>
          <p className="text-ink-300">Tu cuenta DominicanGames está verificada. ¡A jugar!</p>
          {user ? (
            <div className="space-y-2">
              <LinkButton to="/jugar" className="w-full" size="lg">
                Jugar ahora
              </LinkButton>
              <LinkButton to="/panel" variant="ghost" className="w-full">
                Ir a mi panel
              </LinkButton>
            </div>
          ) : (
            <LinkButton to="/entrar?next=/panel" className="w-full" size="lg">
              Entrar
            </LinkButton>
          )}
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-5">
          <Alert tone="error">{error}</Alert>
          <p className="text-sm text-ink-400">Los enlaces vencen a las 24 horas y solo se pueden usar una vez. Entra a tu cuenta para pedir uno nuevo.</p>
          <LinkButton to={user ? '/verifica-tu-correo' : '/entrar'} variant="secondary" className="w-full">
            {user ? 'Pedir un enlace nuevo' : 'Entrar'}
          </LinkButton>
        </div>
      )}
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  useTitle('Recuperar contraseña');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = emailSchema.safeParse(email);
    if (!p.success) return setError(p.error.issues[0].message);
    setBusy(true);
    setError('');
    try {
      await Api.forgotPassword(p.data);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Recupera tu contraseña" subtitle="Te enviaremos un enlace para crear una nueva contraseña de tu cuenta DominicanGames." footer={<Link to="/entrar" className="text-dg-blue-300 hover:underline">Volver a entrar</Link>}>
      {sent ? (
        <Alert tone="success" title="Revisa tu correo">
          Si existe una cuenta con <strong>{email}</strong>, recibirás un enlace válido por 1 hora.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="Correo electrónico" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Enviar enlace
          </Button>
        </form>
      )}
      {sent && <DevMailbox email={email.trim().toLowerCase()} />}
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  useTitle('Nueva contraseña');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const validToken = useMemo(() => /^[a-f0-9]{64}$/.test(token), [token]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    const p = passwordSchema.safeParse(pw);
    if (!p.success) errs.password = p.error.issues[0].message;
    if (pw !== confirm) errs.confirm = 'Las contraseñas no coinciden';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError('');
    try {
      await Api.resetPassword(token, pw);
      await useAuth.getState().refresh(); // the server closed every session, including this one
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Crea una nueva contraseña">
      {!validToken ? (
        <Alert tone="error">El enlace no es válido. Pide uno nuevo desde “¿Olvidaste tu contraseña?”.</Alert>
      ) : done ? (
        <div className="space-y-5">
          <Alert tone="success" title="Contraseña actualizada">Cerramos todas tus sesiones abiertas por seguridad.</Alert>
          <LinkButton to="/entrar" className="w-full" size="lg">Entrar</LinkButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <PasswordInput label="Nueva contraseña" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.password} />
            <StrengthMeter pw={pw} />
          </div>
          <PasswordInput label="Confirmar contraseña" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Guardar contraseña
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
