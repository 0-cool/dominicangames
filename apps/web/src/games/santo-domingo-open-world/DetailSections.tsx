import type { ReactNode } from 'react';
import type { PublicGame } from '@sd/shared';
import { SectionHeading } from '../../components/platform.tsx';
import { IconCar, IconFlag, IconKeyboard, IconLandmark, IconMoon, IconMoto, IconPeople, IconRain, IconTimer } from '../../components/ui.tsx';

/**
 * Santo Domingo Open World — game-specific sections of its catalog page (the generic page renders title,
 * status, description, metadata, screenshots and the PLAY action from the catalog).
 * Figures come from the world builder output (OpenStreetMap slice) — they describe the game, not players.
 */
const FACTS: [string, string][] = [
  ['8 km²', 'de ciudad jugable'],
  ['236', 'calles reales con su nombre'],
  ['8 200+', 'edificios'],
  ['15', 'monumentos para descubrir'],
  ['1 400+', 'negocios ficticios: colmados, bancas, salones…'],
];

const AREAS = [
  { img: '/img/games/santo-domingo-open-world/shot-parque-colon.jpg', title: 'Zona Colonial', text: 'Calle El Conde peatonal, la Catedral Primada, el Alcázar de Colón, la Fortaleza Ozama y las Ruinas de San Francisco, con sus muros de piedra coralina y casas de colores.' },
  { img: '/img/games/santo-domingo-open-world/shot-obelisco.jpg', title: 'El Malecón', text: 'La Avenida George Washington frente al Caribe, el Obelisco, el muro del litoral y las palmas. Perfecto para el Reto del Malecón… o para ver el atardecer.' },
  { img: '/img/city-gazcue.jpg', title: 'Gazcue y el centro', text: 'Calles arboladas, casas de los años 30 a 50, el Palacio Nacional, el Parque Independencia y avenidas con guaguas, carros públicos y motoconchos.' },
];

const FEATURES: [ReactNode, string, string][] = [
  [<IconMoto key="i" className="size-6" />, 'Motores que se sienten', 'El motor se inclina en las curvas, derrapa y te tumba si chocas. También hay carros, yipetas, pickups, guaguas y carros públicos.'],
  [<IconCar key="i" className="size-6" />, 'Tráfico de verdad', 'Semáforos, intersecciones, calles de una vía, carros que frenan, tocan bocina y se estacionan en la acera.'],
  [<IconPeople key="i" className="size-6" />, 'Gente en la calle', 'Peatones que cruzan, se asustan y se apartan; dominó y bachata en los colmados.'],
  [<IconMoon key="i" className="size-6" />, 'Día y noche', 'El sol cae sobre el Caribe y la ciudad enciende sus faroles, letreros y ventanas. De noche, tus faros alumbran la calle.'],
  [<IconCar key="i" className="size-6" />, 'Radio dominicana', 'Cuatro emisoras con música original generada al momento: bachata, merengue, dembow y típico. Cambia de emisora con R.'],
  [<IconTimer key="i" className="size-6" />, 'Modo foto', 'Congela la ciudad, mueve la cámara libremente y guarda tus mejores capturas en PNG.'],
  [<IconRain key="i" className="size-6" />, 'Aguaceros', 'Calles mojadas que reflejan las luces y charcos en el asfalto.'],
  [<IconFlag key="i" className="size-6" />, 'Misiones', '“Bienvenido a Santo Domingo”: Don Ramón te presta su motor para un encargo por la ciudad. Y después, el Reto del Malecón.'],
  [<IconLandmark key="i" className="size-6" />, 'Descubre monumentos', 'Gana RD$50 del juego por cada monumento que descubras: del Palacio Nacional a la Puerta del Conde.'],
  [<IconTimer key="i" className="size-6" />, 'Tu progreso, en tu cuenta', 'La partida se guarda en tu cuenta DominicanGames: sigue donde te quedaste desde cualquier computadora.'],
];

/** Items from docs/ROADMAP.md (planned, not available yet). */
const ROADMAP: [string, string][] = [
  ['Más Santo Domingo', 'Ciudad Nueva, el Mercado Modelo, la Avenida Duarte y el Puente Duarte.'],
  ['Más cosas que hacer', 'Nuevas misiones: entregas, viajes de motoconcho y carreras.'],
  ['Teléfono en el juego', 'Un teléfono dentro del juego para recibir encargos, mensajes y llamadas.'],
  ['Mejor tecnología', 'Renderizado WebGPU, más detalle a distancia y cargas más rápidas.'],
];

const CONTROLS: [string, string][] = [
  ['W A S D', 'Moverse / conducir'],
  ['Mouse', 'Cámara'],
  ['Shift', 'Correr'],
  ['Espacio', 'Saltar · freno de mano'],
  ['E', 'Interactuar · subir a un vehículo'],
  ['F', 'Bajarse'],
  ['L · R', 'Luces · radio'],
  ['P', 'Modo foto'],
  ['M', 'Mapa'],
  ['Esc', 'Pausa'],
];

const FAQ: [string, string][] = [
  ['¿Cuánto cuesta?', 'Nada. Santo Domingo Open World es gratis: solo necesitas una cuenta DominicanGames (también gratis). No hay suscripciones ni pagos para jugar.'],
  ['¿Es un juego oficial de GTA?', 'No. Es un juego original e independiente de DominicanGames, inspirado en los mundos abiertos clásicos. No usa personajes, mapas, música ni material de otros juegos y no está afiliado con Rockstar Games ni Take-Two.'],
  ['¿Tengo que descargar algo?', 'No. El juego corre en el navegador de tu computadora. La primera carga descarga el motor y la zona donde empiezas; el resto de la ciudad se carga mientras exploras.'],
  ['¿Puedo jugar en el celular?', 'Por ahora no: el juego necesita teclado y mouse en una computadora.'],
  ['¿Los negocios del juego son reales?', 'No. Las calles y monumentos son reales, pero los colmados, bancas, farmacias y comercios tienen nombres inventados.'],
];

export default function SdowDetailSections({ game }: { game: PublicGame }) {
  return (
    <>
      <section className="border-y border-white/[0.06] bg-ink-900/60">
        <div className="mx-auto grid max-w-[1240px] grid-cols-5 gap-6 px-8 py-10">
          {FACTS.map(([n, l]) => (
            <div key={l}>
              <p className="display text-[2.6rem] text-white">{n}</p>
              <p className="mt-1 text-sm text-ink-400">{l}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-[1240px] px-8">
          <SectionHeading eyebrow="La ciudad" title={<>Calles reales.<br />Sabor real.</>}>
            El trazado de las calles, la costa y los edificios viene de OpenStreetMap. Si conoces Santo Domingo, vas a reconocer por dónde vas.
          </SectionHeading>
          <div className="grid grid-cols-3 gap-6">
            {AREAS.map((a) => (
              <article key={a.title} className="group card overflow-hidden">
                <div className="overflow-hidden">
                  <img src={a.img} alt={`${a.title} en el juego`} loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-105" />
                </div>
                <div className="p-6">
                  <h3 className="display text-2xl text-white">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-300">{a.text}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-6 text-xs text-ink-500">Capturas tomadas dentro del juego. Datos de mapa © colaboradores de OpenStreetMap. Donde el mapa no tiene edificios registrados, el juego los completa con construcciones generadas que respetan las manzanas reales.</p>
        </div>
      </section>

      <section className="border-t border-white/[0.05] bg-ink-900/40 py-24">
        <div className="mx-auto max-w-[1240px] px-8">
          <SectionHeading eyebrow="El juego" title={<>Súbete y <span className="text-gradient-sun">dale</span></>}>
            Camina, corre, salta, móntate en lo que encuentres y piérdete por la ciudad.
          </SectionHeading>
          <div className="grid grid-cols-4 gap-5">
            {FEATURES.map(([icon, title, text]) => (
              <div key={title} className="card p-6">
                <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-sun-500/10 text-sun-400">{icon}</div>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-[1240px] grid-cols-3 gap-6 px-8">
          <div>
            <p className="brand-eyebrow mb-4">Requisitos</p>
            <h2 className="brand-title text-[2.2rem] text-white">¿Mi computadora lo corre?</h2>
            <p className="mt-3 text-ink-300">El lanzador revisa tu equipo y elige la calidad gráfica adecuada antes de empezar.</p>
            <div className="mt-6 rounded-2xl border border-white/[0.07] p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <IconKeyboard className="size-5 text-sun-400" /> Controles
              </div>
              <ul className="space-y-1.5 text-sm">
                {CONTROLS.map(([k, l]) => (
                  <li key={l} className="flex items-center justify-between gap-3">
                    <span className="text-ink-300">{l}</span>
                    <span className="kbd">{k}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="card p-7">
            <h3 className="font-semibold text-white">Mínimo</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-300">
              <li>Chrome o Edge actualizado (Firefox reciente también funciona)</li>
              <li>WebGL 2 con aceleración por hardware</li>
              <li>Gráficos integrados recientes (calidad Baja)</li>
              <li>8 GB de RAM · teclado y mouse</li>
              <li>Menos de 15 MB en la primera carga</li>
            </ul>
          </div>
          <div className="card p-7">
            <h3 className="font-semibold text-white">Recomendado</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-300">
              <li>Tarjeta gráfica dedicada de gama media o superior</li>
              <li>16 GB de RAM</li>
              <li>Pantalla 1080p o mayor</li>
              <li>Conexión de 10 Mbps o más</li>
              <li>Aún no disponible en celulares ni tabletas</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.05] bg-ink-900/40 py-24">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[1fr_1.4fr] gap-14 px-8">
          <div>
            <p className="brand-eyebrow mb-4">En el horizonte</p>
            <h2 className="brand-title text-[2.2rem] text-white">Lo que viene a {game.title}</h2>
            <p className="mt-3 text-ink-300">Planes de desarrollo publicados en nuestra hoja de ruta. Todavía no están disponibles y pueden cambiar.</p>
            <ul className="mt-7 space-y-3">
              {ROADMAP.map(([t, d]) => (
                <li key={t} className="flex gap-4 rounded-2xl border border-white/[0.06] p-4">
                  <span className="mt-0.5 h-fit rounded-md border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-300">Planeado</span>
                  <span>
                    <span className="block font-semibold text-white">{t}</span>
                    <span className="text-sm text-ink-400">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="brand-eyebrow mb-4">Preguntas</p>
            <h2 className="brand-title text-[2.2rem] text-white">Lo que todo el mundo pregunta</h2>
            <div className="mt-7 space-y-3">
              {FAQ.map(([q, a]) => (
                <details key={q} className="card group p-5">
                  <summary className="cursor-pointer list-none font-medium text-ink-100 marker:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {q}
                      <span className="text-xl text-ink-400 transition group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-ink-300">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
