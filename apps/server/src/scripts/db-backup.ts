import { requireDatabaseUrl, runCli } from '../db/errors.ts';
import { backupDatabase } from '../db/maintenance.ts';

// Usage: npm run db:backup            → backups/db-<timestamp>-manual.json
//        npm run db:backup -- full    → also includes sessions and login attempts
await runCli(async () => {
  const url = requireDatabaseUrl();
  const full = process.argv.slice(2).includes('full');
  const file = await backupDatabase(url, full ? 'manual-full' : 'manual', { full });
  console.log(`Backup written: ${file}`);
});
