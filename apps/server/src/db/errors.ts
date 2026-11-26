/**
 * Clear explanations for the problems people hit when running DominicanGames on their own computer
 * (`npm run db:migrate`, `db:rollback`, `db:backup`, `admin:create`, `npm run dev`), printed instead of a raw
 * stack trace. Messages are in Spanish, like the README.
 */

/** An expected problem with a ready-to-read message (no stack trace is printed for it). */
export class CliError extends Error {}

/** Port of the project's own PostgreSQL in docker-compose.yml. */
export const DOCKER_DB_PORT = '55432';

interface Coded {
  code: string;
  message: string;
}

/** First error with a string `code` in the cause chain or inside an AggregateError (pg, drizzle and Node errors). */
export function findErrorCode(err: unknown, depth = 0): Coded | null {
  if (!err || typeof err !== 'object' || depth > 6) return null;
  const e = err as { code?: unknown; message?: unknown; errors?: unknown; cause?: unknown };
  if (typeof e.code === 'string') return { code: e.code, message: String(e.message ?? '') };
  if (Array.isArray(e.errors)) {
    for (const inner of e.errors) {
      const found = findErrorCode(inner, depth + 1);
      if (found) return found;
    }
  }
  return findErrorCode(e.cause, depth + 1);
}

function describeTarget(url: string | undefined) {
  try {
    const u = new URL(url ?? '');
    const port = u.port || '5432';
    return { where: `${u.hostname}:${port}`, host: u.hostname, port, user: decodeURIComponent(u.username), database: decodeURIComponent(u.pathname.replace(/^\//, '')) };
  } catch {
    return { where: 'el servidor de DATABASE_URL', host: '', port: '', user: '', database: '' };
  }
}

const DOCKER_TIP = `Base del proyecto (Docker): abre Docker Desktop y ejecuta "docker compose up -d" en la carpeta del proyecto.`;

/** Returns a readable explanation for well-known database connection problems, or null for anything else. */
export function explainDbError(err: unknown, url = process.env.DATABASE_URL): string | null {
  const found = findErrorCode(err);
  if (!found) return null;
  const t = describeTarget(url);
  const portNote =
    t.port && t.port !== DOCKER_DB_PORT && ['localhost', '127.0.0.1', '[::1]'].includes(t.host)
      ? [`Tu DATABASE_URL usa el puerto ${t.port}; la base de Docker del proyecto está en 127.0.0.1:${DOCKER_DB_PORT} (mira .env.example).`]
      : [];
  const lines = (title: string, tips: string[]) => [title, ...tips.map((s) => `  • ${s}`)].join('\n');
  switch (found.code) {
    case '28P01': // invalid_password
    case '28000': // invalid_authorization_specification (no pg_hba entry, role cannot log in…)
      return lines(`PostgreSQL en ${t.where} rechazó el usuario "${t.user}" (contraseña incorrecta o ese usuario no existe en ese servidor).`, [
        'Suele pasar cuando en ese puerto responde OTRO PostgreSQL (uno instalado en tu computadora u otro proyecto) y no la base de este proyecto.',
        ...portNote,
        DOCKER_TIP,
        'Tu propio PostgreSQL: pon su usuario, contraseña y puerto en DATABASE_URL (.env).',
      ]);
    case 'ECONNREFUSED':
      return lines(`No hay ningún PostgreSQL escuchando en ${t.where}.`, [
        ...portNote,
        DOCKER_TIP,
        'Tu propio PostgreSQL: comprueba que está iniciado y que DATABASE_URL (.env) tiene su puerto.',
      ]);
    case '57P03': // cannot_connect_now: "the database system is starting up"
      return lines(`PostgreSQL en ${t.where} todavía se está iniciando.`, ['Espera unos segundos y vuelve a ejecutar el comando.']);
    case '3D000': // invalid_catalog_name
      return lines(`La base de datos "${t.database}" no existe en ${t.where}.`, [
        'Con Docker se crea sola la primera vez: "docker compose up -d".',
        `En tu propio PostgreSQL créala: CREATE DATABASE ${t.database || 'sd_open_world'} OWNER ${t.user || 'sd'};`,
      ]);
    case '42501': // insufficient_privilege
      return lines(`El usuario "${t.user}" no tiene permisos suficientes en la base "${t.database}".`, [
        `Hazlo dueño de la base: ALTER DATABASE ${t.database || 'sd_open_world'} OWNER TO ${t.user || 'sd'};`,
      ]);
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return lines(`No se encontró el servidor "${t.host}" de DATABASE_URL.`, ['Revisa DATABASE_URL en .env.']);
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      return lines(`PostgreSQL en ${t.where} no respondió a tiempo.`, ['Comprueba que el servidor está iniciado y que nada bloquea ese puerto.', ...portNote]);
    default:
      return null;
  }
}

/** DATABASE_URL from the environment (.env), or a clear message telling how to create it. */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new CliError('Falta DATABASE_URL. Crea el archivo .env a partir de .env.example (PowerShell: Copy-Item .env.example .env).');
  return url;
}

/** Prints a readable message for known problems (the full error otherwise) and exits with code 1. */
export function exitWithError(err: unknown, url = process.env.DATABASE_URL): never {
  const hint = explainDbError(err, url);
  if (hint) {
    const found = findErrorCode(err);
    console.error(`\nERROR: ${hint}\n\n  Detalle técnico: ${found?.code ?? ''} ${found?.message ?? ''}\n`);
  } else if (err instanceof CliError) {
    console.error(`\nERROR: ${err.message}\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
}

/** Runs a command-line script and turns failures into readable messages. */
export async function runCli(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (err) {
    exitWithError(err);
  }
}
