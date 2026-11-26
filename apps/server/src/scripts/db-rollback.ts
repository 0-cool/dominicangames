import { createInterface } from 'node:readline/promises';
import { CliError, requireDatabaseUrl, runCli } from '../db/errors.ts';
import { backupDatabase, rollbackMigration } from '../db/maintenance.ts';

// Usage: npm run db:rollback -- 0001_dominicangames_platform [--yes]
// NOT a setup step: it UNDOES a migration. Asks for confirmation (or pass --yes), writes a JSON backup, then runs
// drizzle/rollback/<tag>.down.sql in a single transaction.
// Start the server with MIGRATE_ON_START=false afterwards, or it will re-apply the migration.
await runCli(async () => {
  const args = process.argv.slice(2);
  const tag = args.find((a) => !a.startsWith('--'));
  if (!tag) throw new CliError('Uso: npm run db:rollback -- <migración> [--yes]   (por ejemplo 0001_dominicangames_platform)');
  const url = requireDatabaseUrl();
  if (!args.includes('--yes')) {
    if (!process.stdin.isTTY) throw new CliError('Para deshacer una migración sin terminal interactiva añade --yes.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `\nEsto DESHACE la migración ${tag} en la base de datos (no es un paso de instalación).\n` +
        'Antes se guarda un respaldo en backups/. Escribe "deshacer" para continuar o pulsa Enter para cancelar: ',
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'deshacer') {
      console.log('Cancelado. No se cambió nada.');
      return;
    }
  }
  const file = await backupDatabase(url, `before-rollback-${tag}`);
  console.log(`Backup written: ${file}`);
  await rollbackMigration(url, tag);
  console.log(`Rolled back ${tag}. Remember: MIGRATE_ON_START=true would apply it again on the next server start.`);
});
