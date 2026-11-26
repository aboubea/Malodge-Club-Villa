import { execFileSync } from 'child_process';
import * as path from 'path';
import { testDatabaseUrl } from './db';

/** Brings the test database to the schema of the migrations, as the deployment does. */
export default function setup() {
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'migrate.js')], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit',
  });
}
