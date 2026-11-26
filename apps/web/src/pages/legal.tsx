import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTitle } from '../lib/useTitle.ts';
import { Container } from '../components/Layout.tsx';
import { Alert, LinkButton, PageHeader } from '../components/ui.tsx';

const UPDATED = '23 de noviembre de 2026';

function LegalShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <Container className="max-w-3xl py-14">
      <PageHeader eyebrow={eyebrow} title={title}>
        Última actualización: {UPDATED}
      </PageHeader>
      <Alert tone="warning" className="mb-8" title="Borrador pendiente de revisión legal">
        Este texto es una base de trabajo. Debe revisarlo un abogado en República Dominicana y completarse con los datos del titular (razón social, RNC, domicilio) antes del lanzamiento público.
      </Alert>
      <article className="prose-legal">{children}</article>
    </Container>
  );
}

export function TermsPage() {
  useTitle('Términos y condiciones');
  return (
    <LegalShell eyebrow="Legal" title="Términos y condiciones">
      <h2>1. Quiénes somos</h2>
      <p>
        DominicanGames (“la Plataforma”) es una plataforma de videojuegos para navegador operada por [RAZÓN SOCIAL], RNC [PENDIENTE], con domicilio en [DIRECCIÓN], Santo Domingo, República Dominicana (“nosotros”). Su primer título es Santo Domingo Open World (“el Juego”). Puedes contactarnos desde la página de <Link to="/soporte">Soporte</Link>.
      </p>
      <p>Nuestros juegos son proyectos originales e independientes. No están afiliados, patrocinados ni respaldados por Rockstar Games, Take-Two Interactive, el Gobierno dominicano, el Ayuntamiento del Distrito Nacional ni ninguna marca o comercio real.</p>

      <h2>2. Tu cuenta DominicanGames</h2>
      <ul>
        <li>Una sola cuenta te da acceso a todos los juegos disponibles de la Plataforma. Debes dar un correo válido; te pediremos verificarlo para proteger tu cuenta.</li>
        <li>Eres responsable de mantener tu contraseña en secreto. La cuenta es personal: no la compartas, vendas ni transfieras.</li>
        <li>Tu nombre de usuario y tu avatar son públicos dentro de la Plataforma (por ejemplo, en los rankings, salvo que desactives esa opción en tu perfil). No uses nombres ofensivos o que suplanten a otras personas.</li>
        <li>Si eres menor de 18 años, necesitas autorización de tu madre, padre o tutor para usar la Plataforma.</li>
      </ul>

      <h2 id="acceso">3. Acceso gratuito</h2>
      <ul>
        <li>Registrarte, iniciar sesión y jugar Santo Domingo Open World es <strong>gratis</strong>. No hay pagos obligatorios ni suscripciones para jugar.</li>
        <li>Recibes una licencia personal, limitada, no exclusiva e intransferible para jugar los juegos disponibles mientras el servicio esté activo.</li>
        <li>Los juegos marcados como “Próximamente” son conceptos en desarrollo; su existencia, contenido y fecha de lanzamiento pueden cambiar.</li>
        <li>
          Si en el futuro ofrecemos productos opcionales (por ejemplo, membresías, artículos cosméticos o moneda virtual), serán siempre opcionales, se anunciarán con su precio y condiciones antes de cualquier compra y no serán necesarios para jugar.
        </li>
      </ul>

      <h2 id="compra">4. Compras anteriores del acceso</h2>
      <p>
        Antes de convertirse en una plataforma gratuita, Santo Domingo Open World tuvo un acceso de pago. Ese producto ya no existe y jugar no tiene ningún costo. Las cuentas que lo compraron conservan su progreso y la insignia “Fundador”. Los registros de esas compras se conservan según las normas fiscales y contables, y cualquier consulta sobre ellas se atiende desde Soporte, sin perjuicio de los derechos que te reconoce la Ley General de Protección de los Derechos del Consumidor o Usuario (Ley núm. 358-05).
      </p>

      <h2>5. Uso aceptable</h2>
      <ul>
        <li>No intentes acceder a cuentas ajenas, atacar la Plataforma ni extraer los archivos de los juegos para redistribuirlos.</li>
        <li>No uses bots, automatizaciones ni trampas que afecten el servicio, los rankings o los logros. Podemos retirar de los rankings los resultados que no sean legítimos.</li>
        <li>Podemos suspender cuentas que incumplan estos términos o que estén vinculadas a fraude o contracargos.</li>
      </ul>

      <h2>6. Contenido del Juego</h2>
      <p>
        Santo Domingo Open World representa una ciudad real de forma estilizada. Incluye conducción arcade y situaciones de tránsito que no deben imitarse: en la vida real respeta la Ley núm. 63-17 de Movilidad, Transporte Terrestre, Tránsito y Seguridad Vial, usa casco en motor y cinturón en carro. Los negocios, personajes y marcas del Juego son ficticios; cualquier parecido con negocios reales es coincidencia.
      </p>

      <h2>7. Propiedad intelectual</h2>
      <p>
        La marca DominicanGames, su logotipo, el código, los modelos, las texturas, el audio y el resto del contenido de la Plataforma y sus juegos son originales o se usan con licencia. La geografía de Santo Domingo Open World se basa en datos de OpenStreetMap © colaboradores de OpenStreetMap, disponibles bajo la Open Database License (ODbL). Consulta <Link to="/creditos">Créditos y licencias</Link>.
      </p>

      <h2>8. Disponibilidad y cambios</h2>
      <p>Trabajamos para que la Plataforma esté disponible, pero puede haber interrupciones por mantenimiento o causas ajenas. Podemos actualizar los juegos, el catálogo y estos términos; te avisaremos de cambios importantes por correo, en los anuncios o en el sitio.</p>

      <h2>9. Responsabilidad</h2>
      <p>En la medida que permita la ley, no somos responsables por daños indirectos derivados del uso de la Plataforma o de sus juegos. Nada en estos términos limita los derechos que la ley dominicana te reconoce como consumidor.</p>

      <h2>10. Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República Dominicana. Cualquier controversia se someterá a los tribunales competentes de Santo Domingo, sin perjuicio de los mecanismos de Pro Consumidor.</p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  useTitle('Política de privacidad');
  return (
    <LegalShell eyebrow="Legal" title="Política de privacidad">
      <p>
        Esta política explica qué datos personales trata DominicanGames y cómo, conforme a la Ley núm. 172-13 sobre protección de datos de carácter personal de la República Dominicana. Aplica a la Plataforma y a todos sus juegos. Responsable: [RAZÓN SOCIAL], RNC [PENDIENTE].
      </p>
      <h2>Datos que tratamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> correo, nombre de usuario, avatar, idioma, tu preferencia de aparecer en rankings y tu contraseña cifrada con Argon2id (nunca guardamos la contraseña en texto).</li>
        <li><strong>Juegos:</strong> partidas guardadas, progreso de misiones, ajustes, logros y las fechas y duración de tus sesiones de juego (para “Continuar jugando”, tu historial y estadísticas agregadas).</li>
        <li><strong>Compras anteriores:</strong> si compraste el acceso original, monto, moneda, estado y la referencia del proveedor de pagos. Nunca recibimos ni guardamos números de tarjeta ni códigos de seguridad.</li>
        <li><strong>Seguridad:</strong> dirección IP, navegador, inicios de sesión y registros de auditoría para prevenir fraude y abuso.</li>
        <li><strong>Soporte y errores:</strong> los mensajes que nos envías y reportes técnicos de errores del juego.</li>
      </ul>
      <h2>Para qué los usamos</h2>
      <ul>
        <li>Crear y proteger tu cuenta, verificar tu correo y permitirte recuperar el acceso.</li>
        <li>Guardar tu progreso, calcular logros y, si lo permites, mostrar tu nombre de usuario y avatar en los rankings públicos (puedes desactivarlo en Perfil y cuenta).</li>
        <li>Mejorar la estabilidad de los juegos y conocer de forma agregada cuánto se juega cada título.</li>
        <li>Conservar el registro de compras anteriores y cumplir obligaciones fiscales.</li>
        <li>Responder tus solicitudes de soporte.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad. La Plataforma no muestra anuncios.</p>
      <h2>Cookies</h2>
      <p>
        Usamos solo dos cookies estrictamente necesarias: <code>sd_session</code> (mantiene tu sesión iniciada) y <code>sd_csrf</code> (protege los formularios contra falsificación de solicitudes). No usamos cookies de publicidad ni de analítica de terceros.
      </p>
      <h2>Con quién los compartimos</h2>
      <ul>
        <li>El proveedor de pagos que procesó una compra anterior (por ejemplo, AZUL), solo respecto de esa compra.</li>
        <li>El proveedor de correo electrónico para enviarte verificaciones y comprobantes.</li>
        <li>El proveedor de alojamiento donde funciona la plataforma.</li>
        <li>Autoridades, cuando una ley u orden judicial lo exija.</li>
      </ul>
      <h2>Cuánto tiempo los guardamos</h2>
      <p>Mientras tu cuenta esté activa. Los registros de pagos se conservan el plazo que exijan las normas fiscales y contables. Los registros de seguridad se eliminan periódicamente.</p>
      <h2>Tus derechos</h2>
      <p>
        Puedes solicitar acceso, rectificación, cancelación u oposición al tratamiento de tus datos, y pedir la eliminación de tu cuenta, escribiendo desde <Link to="/soporte">Soporte</Link>. Responderemos en los plazos que establece la ley.
      </p>
      <h2>Seguridad</h2>
      <p>Usamos conexiones cifradas (HTTPS), cookies HttpOnly, protección CSRF, límites de intentos de inicio de sesión, contraseñas cifradas y registros de auditoría. Ningún sistema es 100 % infalible; si detectamos un incidente que te afecte, te avisaremos.</p>
      <h2>Menores</h2>
      <p>La Plataforma no está dirigida a menores de 13 años. Los menores de 18 necesitan autorización de su madre, padre o tutor para usarla.</p>
    </LegalShell>
  );
}

export function CreditsPage() {
  useTitle('Créditos y licencias');
  const rows: [string, string, string][] = [
    ['OpenStreetMap', 'Calles, edificios, parques y costa de Santo Domingo', '© colaboradores de OpenStreetMap — Open Database License (ODbL) 1.0'],
    ['three.js', 'Motor de renderizado 3D', 'MIT'],
    ['Rapier (dimforge)', 'Física de vehículos, personajes y colisiones', 'Apache 2.0'],
    ['React, React Router, Zustand', 'Interfaz del sitio y del juego', 'MIT'],
    ['Tailwind CSS', 'Estilos', 'MIT'],
    ['Inter', 'Tipografía de texto', 'SIL Open Font License 1.1'],
    ['Unbounded', 'Tipografía de la marca DominicanGames', 'SIL Open Font License 1.1'],
    ['Anton', 'Tipografía de títulos de Santo Domingo Open World y El Tapón', 'SIL Open Font License 1.1'],
    ['Fastify, Drizzle ORM, PostgreSQL', 'Servidor y base de datos', 'MIT / PostgreSQL License'],
  ];
  return (
    <Container className="max-w-3xl py-14">
      <PageHeader eyebrow="Legal" title="Créditos y licencias">
        La marca DominicanGames, su logotipo y el arte conceptual de los próximos juegos son originales. En Santo Domingo Open World, edificios, texturas, vehículos, personajes, letreros y música se generan por procedimiento a partir de código propio; en El Tapón, los sprites, la calle y el sonido también. No usamos material de GTA ni logotipos de fabricantes o comercios reales.
      </PageHeader>
      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-5 py-3">Componente</th>
              <th className="px-5 py-3">Uso</th>
              <th className="px-5 py-3">Licencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map(([a, b, c]) => (
              <tr key={a}>
                <td className="px-5 py-3 font-medium text-ink-100">{a}</td>
                <td className="px-5 py-3 text-ink-300">{b}</td>
                <td className="px-5 py-3 text-ink-300">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="prose-legal mt-8">
        <h2>El Tapón</h2>
        <p>
          Todo el arte de El Tapón —el motoconchista, el carro público, el Sonata mamey, la OMSA, la guagua, la platanera, la patrulla, los agentes de tránsito, el resto del tráfico y la calle— son ilustraciones originales dibujadas con código, con nombres de negocios y teléfonos inventados. Los sonidos y la música se sintetizan en el navegador. No usamos fotografías ni imágenes de terceros.
        </p>
        <p>
          El Tapón es una comedia de ficción inspirada en el tránsito de Santo Domingo. No está afiliado ni respaldado por la Policía Nacional, la Dirección General de Seguridad de Tránsito y Transporte Terrestre (DIGESETT, antes AMET), la Oficina Metropolitana de Servicios de Autobuses (OMSA) ni por ningún fabricante de vehículos, y no reproduce sus insignias, escudos ni logotipos. El “Sonata mamey” es un taxi genérico inspirado en los taxis de la capital, sin marcas.
        </p>
        <h2>Sobre los datos del mapa</h2>
        <p>
          La red de calles, las huellas de los edificios, los parques y la línea de costa provienen de OpenStreetMap (extracto de la zona entre Gazcue, la Zona Colonial y el Malecón). Donde OpenStreetMap no tiene huellas de edificios, el juego rellena las manzanas con edificios procedurales que siguen la forma de las calles reales; esos edificios no representan construcciones específicas. Los monumentos principales se modelan de forma simplificada a partir de su huella real.
        </p>
        <p>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">openstreetmap.org/copyright</a>
        </p>
      </div>
    </Container>
  );
}

export function NotFoundPage() {
  useTitle('No encontrado');
  return (
    <Container narrow className="py-28 text-center">
      <p className="brand-title text-8xl text-gradient-dg">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-white">Te perdiste en la Zona Colonial</h1>
      <p className="mt-2 text-ink-300">Esta página no existe. Vuelve a la avenida principal.</p>
      <div className="mt-8 flex justify-center gap-3">
        <LinkButton to="/">Ir al inicio</LinkButton>
        <LinkButton to="/juegos" variant="secondary">Ver los juegos</LinkButton>
      </div>
    </Container>
  );
}
