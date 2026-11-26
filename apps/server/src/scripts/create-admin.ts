import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import type { z } from 'zod';
import { emailSchema, passwordSchema, usernameSchema } from '@sd/shared';
import { CliError, requireDatabaseUrl, runCli } from '../db/errors.ts';
import { createDb } from '../db/index.ts';
import { users } from '../db/schema.ts';

// Usage: npm run admin:create -- admin@example.com 'una-contraseña-larga' [nombre-de-usuario]
// Creates an administrator (email already verified) or promotes an existing account (its password is not changed).
const USAGE = `Uso: npm run admin:create -- tu@correo.com 'clave-de-10-o-mas-caracteres' [nombre-de-usuario]`;

/** Validates one argument with the same rules as the website; `label` prefixes messages that need context. */
function check<T>(schema: z.ZodType<T>, value: string, label?: string): T {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const issue = r.error.issues[0]?.message ?? 'Valor no válido';
  throw new CliError(`${label ? `${label}: ${issue.charAt(0).toLowerCase()}${issue.slice(1)}` : issue}.\n${USAGE}`);
}

await runCli(async () => {
  const [email, password, username = 'admin'] = process.argv.slice(2);
  if (!email || !password) throw new CliError(USAGE);
  const e = check(emailSchema, email);
  const p = check(passwordSchema, password);
  const name = check(usernameSchema, username, 'Nombre de usuario');
  const { db, pool } = createDb(requireDatabaseUrl());
  try {
    const [existing] = await db.select().from(users).where(eq(users.email, e));
    if (existing) {
      await db.update(users).set({ role: 'admin', emailVerified: true }).where(eq(users.id, existing.id));
      console.log(`Administrador listo: ${e} ya tenía cuenta y ahora es administrador (su contraseña no cambió).`);
      return;
    }
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, name));
    if (taken) throw new CliError(`El nombre de usuario "${name}" ya está en uso. Pon otro al final del comando.\n${USAGE}`);
    await db.insert(users).values({ email: e, username: name, passwordHash: await hash(p, { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 }), emailVerified: true, emailVerifiedAt: new Date(), role: 'admin' });
    console.log(`Administrador listo: ${e} (usuario "${name}"). Entra en ${process.env.APP_ORIGIN ?? 'http://localhost:5173'}/entrar y abre /admin.`);
  } finally {
    await pool.end();
  }
});
