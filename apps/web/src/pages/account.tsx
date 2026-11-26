import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AVATARS, defaultGameSettings, gameSettingsSchema, passwordSchema, supportTicketSchema, usernameSchema, type GameSettings } from '@sd/shared';
import { Api, errorMessage } from '../lib/api.ts';
import { useAuth } from '../lib/auth.ts';
import { fmtDate } from '../lib/format.ts';
import { useTitle } from '../lib/useTitle.ts';
import { Container } from '../components/Layout.tsx';
import { SettingsPanel } from '../components/SettingsPanel.tsx';
import { Avatar } from '../components/brand/Avatar.tsx';
import { Alert, Badge, Button, Card, IconCheck, IconCrown, Input, LinkButton, PageHeader, PasswordInput, Select, Spinner, Textarea, cx } from '../components/ui.tsx';

export function ProfilePage() {
  useTitle('Perfil y cuenta', { noindex: true });
  const { user, setUser } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [uMsg, setUMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [uBusy, setUBusy] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pMsg, setPMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pBusy, setPBusy] = useState(false);
  const [aMsg, setAMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [sent, setSent] = useState(false);
  if (!user) return null;

  async function patch(p: Parameters<typeof Api.updateProfile>[0], ok: string, setMsg: typeof setAMsg) {
    try {
      const r = await Api.updateProfile(p);
      setUser(r.user);
      setMsg({ tone: 'success', text: ok });
    } catch (err) {
      setMsg({ tone: 'error', text: errorMessage(err) });
    }
  }
  async function saveUsername(e: FormEvent) {
    e.preventDefault();
    const p = usernameSchema.safeParse(username);
    if (!p.success) return setUMsg({ tone: 'error', text: p.error.issues[0].message });
    setUBusy(true);
    await patch({ username: p.data }, 'Nombre de usuario actualizado en todos los juegos.', setUMsg);
    setUBusy(false);
  }
  async function changePw(e: FormEvent) {
    e.preventDefault();
    const p = passwordSchema.safeParse(pw.next);
    if (!p.success) return setPMsg({ tone: 'error', text: p.error.issues[0].message });
    if (pw.next !== pw.confirm) return setPMsg({ tone: 'error', text: 'Las contraseñas nuevas no coinciden.' });
    setPBusy(true);
    try {
      await Api.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPMsg({ tone: 'success', text: 'Contraseña cambiada. Cerramos tus otras sesiones abiertas.' });
    } catch (err) {
      setPMsg({ tone: 'error', text: errorMessage(err) });
    } finally {
      setPBusy(false);
    }
  }

  return (
    <Container className="max-w-[1100px] py-14">
      <PageHeader eyebrow="Cuenta DominicanGames" title="Perfil y cuenta">
        Tu identidad es la misma en todos los juegos: nombre de usuario, avatar, logros y progreso.
      </PageHeader>
      <div className="grid grid-cols-[1.3fr_1fr] gap-6">
        <div className="space-y-6">
          <Card className="p-7">
            <div className="flex items-center gap-5">
              <Avatar avatar={user.avatar} username={user.username} className="size-20 text-3xl" ring />
              <div>
                <p className="brand-title text-2xl text-white">{user.username}</p>
                <p className="text-sm text-ink-400">Miembro desde {fmtDate(user.createdAt)}</p>
                {user.founder && (
                  <Badge tone="warn" className="mt-2">
                    <IconCrown className="size-3" /> Fundador
                  </Badge>
                )}
              </div>
            </div>
            <p className="mb-3 mt-7 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-400">Elige tu avatar</p>
            {aMsg && <Alert tone={aMsg.tone} className="mb-4">{aMsg.text}</Alert>}
            <div className="grid grid-cols-7 gap-3" role="radiogroup" aria-label="Avatar">
              <button role="radio" aria-checked={!user.avatar} onClick={() => patch({ avatar: null }, 'Avatar actualizado.', setAMsg)} className={cx('rounded-full p-1 transition', !user.avatar ? 'ring-2 ring-dg-red-500' : 'ring-1 ring-white/10 hover:ring-white/30')} title="Inicial">
                <Avatar avatar={null} username={user.username} className="size-12" />
              </button>
              {AVATARS.map((a) => (
                <button key={a.id} role="radio" aria-checked={user.avatar === a.id} onClick={() => patch({ avatar: a.id }, 'Avatar actualizado.', setAMsg)} className={cx('rounded-full p-1 transition', user.avatar === a.id ? 'ring-2 ring-dg-red-500' : 'ring-1 ring-white/10 hover:ring-white/30')} title={a.label} data-testid={`avatar-${a.id}`}>
                  <Avatar avatar={a.id} username={user.username} className="size-12" />
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-7">
            <h2 className="text-lg font-semibold text-white">Perfil</h2>
            <form onSubmit={saveUsername} className="mt-5 space-y-4">
              {uMsg && <Alert tone={uMsg.tone}>{uMsg.text}</Alert>}
              <Input label="Nombre de usuario" value={username} onChange={(e) => setUsername(e.target.value)} hint="Visible en rankings y logros de todos los juegos." />
              <Button type="submit" loading={uBusy} disabled={username === user.username}>Guardar</Button>
            </form>
          </Card>
          <Card className="p-7">
            <h2 className="text-lg font-semibold text-white">Cambiar contraseña</h2>
            <form onSubmit={changePw} className="mt-5 space-y-4">
              {pMsg && <Alert tone={pMsg.tone}>{pMsg.text}</Alert>}
              <PasswordInput label="Contraseña actual" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              <PasswordInput label="Nueva contraseña" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} hint="Mínimo 10 caracteres." />
              <PasswordInput label="Confirmar nueva contraseña" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              <Button type="submit" loading={pBusy} disabled={!pw.current || !pw.next}>Cambiar contraseña</Button>
            </form>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-7">
            <h2 className="text-lg font-semibold text-white">Correo</h2>
            <p className="mt-3 truncate text-ink-100">{user.email}</p>
            <div className="mt-2">{user.emailVerified ? <Badge tone="ok"><IconCheck className="size-3" /> Verificado</Badge> : <Badge tone="warn">Sin verificar</Badge>}</div>
            {!user.emailVerified && (
              <div className="mt-4">
                {sent ? (
                  <Alert tone="success">Te enviamos un nuevo enlace.</Alert>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => Api.resendVerification().then(() => setSent(true)).catch(() => undefined)}>
                    Reenviar enlace de verificación
                  </Button>
                )}
              </div>
            )}
          </Card>
          <Card className="p-7">
            <h2 className="text-lg font-semibold text-white">Privacidad y preferencias</h2>
            <label className="mt-5 flex cursor-pointer items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-medium text-ink-100">Aparecer en los rankings públicos</span>
                <span className="block text-xs text-ink-400">Muestra tu nombre de usuario y avatar en la comunidad. Nunca mostramos tu correo.</span>
              </span>
              <input type="checkbox" className="mt-1 size-5" checked={user.showInRankings} onChange={(e) => patch({ showInRankings: e.target.checked }, e.target.checked ? 'Ahora apareces en los rankings.' : 'Ya no apareces en los rankings.', setAMsg)} data-testid="toggle-rankings" />
            </label>
            <div className="mt-6">
              <Select label="Idioma" value={user.locale} onChange={(e) => patch({ locale: e.target.value as 'es' | 'en' }, 'Idioma guardado.', setAMsg)}>
                <option value="es">Español</option>
                <option value="en" disabled>English (próximamente)</option>
              </Select>
            </div>
          </Card>
          <Card className="p-7">
            <h2 className="text-lg font-semibold text-white">Tus datos</h2>
            <p className="mt-2 text-sm text-ink-300">
              Puedes pedir una copia de tus datos o la eliminación de tu cuenta escribiendo a soporte. Consulta la <Link to="/privacidad" className="text-dg-blue-300 underline">Política de privacidad</Link>.
            </p>
            <LinkButton to="/soporte" variant="secondary" className="mt-4">Solicitar a soporte</LinkButton>
          </Card>
        </div>
      </div>
    </Container>
  );
}

export function SettingsPage() {
  useTitle('Ajustes de juego', { noindex: true });
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Api.getSettings()
      .then((r) => {
        const parsed = r.settings ? gameSettingsSchema.safeParse(r.settings) : null;
        setSettings(parsed?.success ? parsed.data : defaultGameSettings('medium'));
      })
      .catch((e) => {
        setMsg({ tone: 'error', text: errorMessage(e) });
        setSettings(defaultGameSettings('medium'));
      });
  }, []);
  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      await Api.putSettings(settings);
      setMsg({ tone: 'success', text: 'Ajustes guardados en tu cuenta.' });
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Container className="max-w-3xl py-14">
      <PageHeader eyebrow="Santo Domingo Open World" title="Ajustes de juego">
        Gráficos, audio y controles. Se guardan en tu cuenta DominicanGames y se aplican en cualquier computadora donde juegues.
      </PageHeader>
      <Card className="p-7">
        {msg && <Alert tone={msg.tone} className="mb-5">{msg.text}</Alert>}
        {!settings ? (
          <div className="py-10 text-center text-ink-400"><Spinner /></div>
        ) : (
          <>
            <SettingsPanel value={settings} onChange={(s) => { setSettings(s); setMsg(null); }} />
            <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-5">
              <Button variant="ghost" onClick={() => setSettings(defaultGameSettings(settings.graphics.preset))}>Restablecer</Button>
              <Button onClick={save} loading={busy}>Guardar ajustes</Button>
            </div>
          </>
        )}
      </Card>
    </Container>
  );
}

const FAQ: [string, ReactNode][] = [
  ['¿Cuánto cuesta jugar?', 'Nada. Crear tu cuenta DominicanGames y jugar Santo Domingo Open World es gratis: no hay pagos obligatorios ni suscripciones.'],
  ['El juego va lento', 'En el lanzador o en Ajustes de juego elige el preset “Bajo” y activa la resolución dinámica. Cierra otras pestañas y, en laptops, conecta el cargador y usa la GPU dedicada si tienes una.'],
  ['La pantalla se queda negra o dice que no hay WebGL 2', 'Actualiza tu navegador (Chrome o Edge recientes) y activa la “aceleración por hardware” en su configuración.'],
  ['¿Puedo jugar en el celular?', 'Por ahora no: nuestros juegos necesitan teclado y mouse en una computadora.'],
  ['¿Cómo cambio mi avatar o mi nombre?', 'Desde Perfil y cuenta. Los cambios se ven en todos los juegos de DominicanGames.'],
];

export function SupportPage() {
  useTitle('Soporte', { description: 'Ayuda con tu cuenta de DominicanGames y con nuestros juegos.' });
  const { user } = useAuth();
  const [f, setF] = useState({ email: '', category: 'other', subject: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const body = { ...f, email: user ? undefined : f.email.trim() || undefined };
    const p = supportTicketSchema.safeParse(body);
    if (!p.success) {
      setErrors(Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    if (!user && !body.email) return setErrors({ email: 'Indica un correo para responderte.' });
    setErrors({});
    setBusy(true);
    try {
      const r = await Api.supportTicket(p.data);
      setDone(r.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Container className="py-14">
      <PageHeader eyebrow="Ayuda" title="Soporte">
        ¿Problemas con tu cuenta o con un juego? Revisa las preguntas frecuentes o escríbenos.
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card group p-5">
              <summary className="cursor-pointer list-none font-medium text-ink-100 marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {q}
                  <span className="text-ink-400 transition group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-300">{a}</p>
            </details>
          ))}
        </div>
        <Card className="p-7">
          {done ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-leaf-500/15 text-leaf-500"><IconCheck className="size-7" /></div>
              <h2 className="text-xl font-semibold text-white">Recibimos tu mensaje</h2>
              <p className="mt-2 text-sm text-ink-300">Número de caso <span className="font-mono">{done.slice(0, 8).toUpperCase()}</span>. Te responderemos por correo.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <h2 className="text-lg font-semibold text-white">Escríbenos</h2>
              {error && <Alert tone="error">{error}</Alert>}
              {!user && <Input label="Tu correo" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} />}
              <Select label="Tema" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                <option value="account">Cuenta</option>
                <option value="games">Juegos y catálogo</option>
                <option value="bug">Error en el juego</option>
                <option value="performance">Rendimiento</option>
                {user?.founder && <option value="payment">Compras anteriores</option>}
                <option value="other">Otro</option>
              </Select>
              <Input label="Asunto" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} error={errors.subject} maxLength={120} />
              <Textarea label="Mensaje" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={errors.message} maxLength={4000} placeholder="Cuéntanos qué pasó y en qué juego." />
              <Button type="submit" loading={busy} className="w-full">Enviar</Button>
            </form>
          )}
        </Card>
      </div>
    </Container>
  );
}
