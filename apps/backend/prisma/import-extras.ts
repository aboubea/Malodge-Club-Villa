/**
 * Imports the "Suivi extras Malodge Maroc" spreadsheet from the command line.
 *
 *   npm run import:extras -- <file.xlsx> [--dry-run] [--force]
 *
 * Same engine as the in-app import (Suivi des extras > Réglages > Import Excel):
 * one transaction, a dry run previews and rolls back, a second import is refused
 * unless --force is passed.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { ImportAlreadyDoneError, importExtrasWorkbook } from '../src/modules/extras/extras-import';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const prisma = new PrismaClient();

async function main() {
  if (!file) throw new Error('Usage: npm run import:extras -- <file.xlsx> [--dry-run] [--force]');
  const report = await importExtrasWorkbook(prisma, readFileSync(file), {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    fileName: basename(file),
  });
  console.log(JSON.stringify(report, null, 2));
  console.log(report.dryRun ? 'Aperçu terminé : rien n\'a été écrit.' : 'Import terminé.');
}

main()
  .catch((e) => {
    console.error(e instanceof ImportAlreadyDoneError ? `${e.message} Relancer avec --force pour importer à nouveau.` : e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
