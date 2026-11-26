import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PublicGame, TaponLeaderboard } from '@sd/shared';
import { Api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.ts';
import { fmtDate } from '../../lib/format.ts';
import { Avatar } from '../../components/brand/Avatar.tsx';
import { SectionHeading } from '../../components/platform.tsx';
import { IconBolt, IconKeyboard, IconMoto, IconPlay, IconShield, IconStar, IconTrophy, LinkButton, Spinner, cx } from '../../components/ui.tsx';

/**
 * El Tapón — game-specific sections of its catalog page: how to play, the vehicles of the tapón (original sprites
 * exported by packages/tapon/scripts/export-assets.ts), the real high-score tables and the non-affiliation note.
 */
interface VehicleCard {
  file: string;
  name: string;
  text: string;
  tag?: string;
}

/** In the order of the design brief: the signature vehicles first, then everyday traffic. */
const SIGNATURE: VehicleCard[] = [
  { file: 'motoconchista', name: 'Tú: el motoconchista', text: 'Tu motor de 150 cc, casco y chaleco con número. Cambias de carril con W/S o las flechas y te metes por donde quepas.', tag: 'Jugador' },
  { file: 'carro-publico', name: 'Carro público (concho)', text: 'Lleno hasta el tope y con la puerta de otro color. Se cambia de carril cuando le da la gana: mira las direccionales.' },
  { file: 'sonata-mamey', name: 'Sonata mamey', text: 'El taxi color mamey: el más rápido del tapón y atrevido para meterse en tu carril.' },
  { file: 'omsa', name: 'OMSA', text: 'Larguísima y lenta por su corredor. Cuando para, para: rebásala con tiempo.' },
  { file: 'guagua', name: 'Guagua', text: '“¡Vamo, vamo!”: frena de golpe en cualquier esquina para montar pasajeros. Su cobrador va colgado de la puerta.' },
  { file: 'platanera', name: 'La Platanera', text: 'Cargada de plátanos verdes amarrados con soga. Se le caen por detrás: esquívalos y suman puntos.' },
  { file: 'policia', name: 'Patrulla', text: 'Llega por detrás con la sirena y te avisa con una flecha; otras veces arma un chequeo con conos.' },
  { file: 'transito', name: 'Agentes de tránsito', text: 'El agente con el pito, el motorizado y la camioneta cierran un carril con conos y desvío, o paran el tráfico: “¡Pare!”.' },
];
const EVERYDAY: VehicleCard[] = [
  { file: 'sedan-plata', name: 'Carro privado', text: 'Sedán en plata, vino o blanco: cambia de carril de vez en cuando.' },
  { file: 'yipeta-negra', name: 'Yipeta', text: 'Cristales oscuros y cambios de carril sin aviso.' },
  { file: 'moto-delivery', name: 'Motor de delivery', text: 'Más rápido que el tráfico y zigzagueando entre carriles.' },
  { file: 'camion-agua', name: 'Camión de botellones', text: 'Se para a repartir agua: “¡Agua!”.' },
  { file: 'camion-basura', name: 'Camión de la basura', text: 'El más lento de la calle, y para cada dos esquinas.' },
  { file: 'camion-mudanza', name: 'Camión de mudanza', text: 'Una casa entera amarrada encima… y el primo sentado arriba.' },
  { file: 'cocos', name: 'Camioneta de cocos', text: '“Cocos fríos”: lenta y con su letrero pintado a mano.' },
];

const POINTS: [string, string][] = [
  ['Rebasar un vehículo', '+5'],
  ['Por un pelo (cambiarte con un carro encima)', '+50'],
  ['Por el medio (entre dos carros)', '+75'],
  ['Plátano esquivado', '+10'],
  ['Montar un pasajero', '+100'],
  ['Viaje completado', '+300'],
];

const FAQ: [string, string][] = [
  ['¿Cuánto cuesta?', 'Nada. El Tapón es gratis y se puede jugar sin cuenta. Con una cuenta DominicanGames (también gratis) tus puntuaciones salen con tu nombre, ganas logros y tu progreso aparece en tu panel.'],
  ['¿Cómo funciona la tabla de récords?', 'Cada partida se registra en el servidor antes de empezar. Las que entran en la tabla o dan un logro se vuelven a jugar en el servidor para comprobar que la puntuación es real. Los invitados aparecen con el apodo que eligen.'],
  ['¿Se puede jugar en el celular?', 'No. El Tapón está hecho para computadora con teclado (pantalla de al menos 1280 × 720).'],
  ['¿Es un juego oficial de la Policía, la DIGESETT o la OMSA?', 'No. Es una comedia de ficción de DominicanGames. No está afiliado ni respaldado por la Policía Nacional, la DIGESETT (antes AMET), la OMSA ni ninguna marca de vehículos, y no usa sus insignias ni logos.'],
];

function VehicleGrid({ list, big = false }: { list: VehicleCard[]; big?: boolean }) {
  return (
    <div className={cx('grid gap-5', big ? 'grid-cols-4' : 'grid-cols-4')}>
      {list.map((v) => (
        <figure key={v.file} className="card flex flex-col overflow-hidden" data-testid={`tapon-vehicle-${v.file}`}>
          <div className="flex h-44 items-end justify-center bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,138,61,0.16),transparent_70%)] px-5 pb-4">
            <img src={`/games/el-tapon/vehicles/${v.file}.webp`} alt={`${v.name} — ilustración original de El Tapón`} loading="lazy" className="max-h-full max-w-full object-contain drop-shadow-[0_10px_8px_rgba(0,0,0,0.45)]" />
          </div>
          <figcaption className="border-t border-white/[0.06] p-5">
            <p className="flex items-center gap-2 font-semibold text-white">
              {v.name}
              {v.tag && <span className="rounded-md bg-[#ff8a3d]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ffb27a]">{v.tag}</span>}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{v.text}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Records() {
  const user = useAuth((s) => s.user);
  const [period, setPeriod] = useState<'week' | 'all'>('all');
  const [data, setData] = useState<TaponLeaderboard | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setData(null);
    setFailed(false);
    Api.taponLeaderboard(period, 20)
      .then(setData)
      .catch(() => setFailed(true));
  }, [period, user?.id]);
  return (
    <div className="card p-7" data-testid="tapon-records">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gold-400/10 text-gold-300">
          <IconTrophy className="size-5" />
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-white">Tabla de récords</h3>
          <p className="text-xs text-ink-400">Partidas verificadas por el servidor · mejor puntuación de cada jugador</p>
        </div>
        <div className="flex rounded-xl bg-white/[0.06] p-1 text-sm font-semibold">
          {(['all', 'week'] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={cx('rounded-lg px-3 py-1.5 transition', period === p ? 'bg-white text-ink-950' : 'text-ink-300 hover:text-white')}>
              {p === 'all' ? 'Siempre' : 'Esta semana'}
            </button>
          ))}
        </div>
      </div>
      {failed ? (
        <p className="py-8 text-center text-sm text-ink-400">No pudimos cargar la tabla. Intenta de nuevo más tarde.</p>
      ) : !data ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-7" />
        </div>
      ) : data.entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
          <p className="text-sm font-medium text-ink-200">Todavía no hay nadie en la tabla.</p>
          <p className="mt-1 text-xs text-ink-400">Se llena con partidas reales. ¡Juega y sé el primero!</p>
        </div>
      ) : (
        <ol className="grid grid-cols-2 gap-x-6 gap-y-1">
          {data.entries.map((e) => (
            <li key={`${e.rank}-${e.name}-${e.at}`} className="flex items-center gap-3 rounded-xl px-2 py-2 odd:bg-white/[0.025]">
              <span className={cx('w-6 text-center font-brand text-sm font-bold', e.rank === 1 ? 'text-gold-300' : e.rank === 2 ? 'text-ink-200' : e.rank === 3 ? 'text-sun-300' : 'text-ink-500')}>{e.rank}</span>
              {e.guest ? <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-ink-300">{e.name.slice(0, 1).toUpperCase()}</span> : <Avatar avatar={e.avatar} username={e.name} className="size-8" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-100">
                {e.name}
                {e.guest && <span className="ml-2 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">Invitado</span>}
              </span>
              <span className="text-xs text-ink-500">{fmtDate(e.at)}</span>
              <span className="w-20 text-right font-mono text-sm text-ink-100">{e.score.toLocaleString('es-DO')}</span>
            </li>
          ))}
        </ol>
      )}
      {data?.me && (
        <p className="mt-4 text-sm text-ink-300">
          Tu mejor puntuación verificada: <b className="text-white">{data.me.best.toLocaleString('es-DO')}</b>
          {data.me.rank ? ` · puesto ${data.me.rank}` : ' · no apareces en la tabla (lo puedes cambiar en tu perfil)'}
        </p>
      )}
    </div>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="card p-6">
      <span className="flex size-11 items-center justify-center rounded-xl bg-[#ff8a3d]/12 text-[#ffb27a]">{icon}</span>
      <h3 className="mt-4 font-semibold text-white">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-ink-300">{children}</div>
    </div>
  );
}

export default function TaponDetailSections({ game }: { game: PublicGame }) {
  const user = useAuth((s) => s.user);
  return (
    <>
      <section className="border-t border-white/[0.06] py-20" id="como-se-juega">
        <div className="mx-auto max-w-[1240px] px-8">
          <SectionHeading eyebrow="Cómo se juega" title="Tres carriles, tres cascos y mucho tapón">
            El motor avanza solo y cada vez más rápido por las avenidas de la capital. Tú decides el carril. Cada choque cuesta un casco; con el tercero se acaba la carrera.
          </SectionHeading>
          <div className="grid grid-cols-3 gap-5">
            <Feature icon={<IconKeyboard className="size-6" />} title="Controles">
              <ul className="space-y-1.5">
                <li><b className="text-white">W / ↑</b> subir de carril · <b className="text-white">S / ↓</b> bajar</li>
                <li><b className="text-white">Esc</b> pausa · <b className="text-white">R</b> reiniciar · <b className="text-white">M</b> silencio</li>
                <li>Menús con el mouse. Solo PC, mínimo 1280 × 720.</li>
              </ul>
            </Feature>
            <Feature icon={<IconStar className="size-6" />} title="Puntos">
              <ul className="space-y-1">
                <li>1 punto por metro recorrido, más:</li>
                {POINTS.map(([l, p]) => (
                  <li key={l} className="flex justify-between gap-4">
                    <span>{l}</span>
                    <b className="text-white">{p}</b>
                  </li>
                ))}
                <li className="pt-1">Encadena bonos y el multiplicador sube hasta <b className="text-white">×5</b>.</li>
              </ul>
            </Feature>
            <Feature icon={<IconShield className="size-6" />} title="Siempre hay salida">
              Los cierres de carril, las paradas de guagua y los plátanos aparecen con aviso. El juego comprueba que siempre quede un hueco por donde pasar: si chocas, fue por un pelo. Los hoyos te frenan y los cascos tirados en la calle te devuelven una vida.
            </Feature>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-5">
            <Feature icon={<IconMoto className="size-6" />} title="Pasajeros">
              Clientes con su letrero de “¡MOTO!” esperan en la acera. Pégate a su carril para montarlos y llévalos hasta su destino sin chocar: el viaje vale 300 puntos.
            </Feature>
            <Feature icon={<IconBolt className="size-6" />} title="De la Lincoln a la Churchill">
              Cada 600 metros cambias de avenida: Abraham Lincoln, 27 de Febrero, John F. Kennedy, Duarte, Máximo Gómez y Winston Churchill. La tarde cae y la ciudad enciende sus luces.
            </Feature>
            <Feature icon={<IconTrophy className="size-6" />} title="Récords y logros">
              {user ? 'Tus partidas se guardan solas en tu cuenta.' : 'Sin cuenta, al terminar puedes poner tu apodo en la tabla.'} Con cuenta ganas logros que suman puntos DominicanGames y ves tu progreso en tu panel.
            </Feature>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.06] bg-ink-900/40 py-20" id="vehiculos">
        <div className="mx-auto max-w-[1240px] px-8">
          <SectionHeading eyebrow="Los vehículos del tapón" title="Cada uno maneja a su manera">
            Ilustraciones originales, dibujadas de lado con la misma escala (75 px por metro). Cada vehículo tiene su comportamiento en el tráfico.
          </SectionHeading>
          <VehicleGrid list={SIGNATURE} big />
          <p className="brand-eyebrow mb-5 mt-14">Y el resto del tráfico</p>
          <VehicleGrid list={EVERYDAY} />
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-20" id="records">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[1.5fr_1fr] gap-10 px-8">
          <Records />
          <div>
            <p className="brand-eyebrow mb-4">Preguntas</p>
            <div className="space-y-5">
              {FAQ.map(([q, a]) => (
                <div key={q}>
                  <p className="font-semibold text-white">{q}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-300">{a}</p>
                </div>
              ))}
            </div>
            {game.launchPath && (
              <LinkButton to={game.launchPath} className="mt-8" data-testid="tapon-play-bottom">
                <IconPlay className="size-5" /> Jugar ahora
              </LinkButton>
            )}
            {!user && (
              <p className="mt-4 text-sm text-ink-400">
                ¿Quieres tu nombre en la tabla y logros?{' '}
                <Link to="/registro?next=/juegos/el-tapon/jugar" className="font-semibold text-gold-300 hover:text-white">
                  Crea tu cuenta gratis
                </Link>
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
