// Operator-only setup. Credentials remain in memory and pass to Secret Manager
// through stdin; they are never command arguments, console output, or repo files.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { Pool } = require('pg');
const project = process.env.CLOUD_PROJECT || 'houseworthit-20261026';
if (!/^houseworthit-[a-z0-9-]+$/.test(project)) throw new Error('Expected the dedicated HouseWorthIt project.');
const gcloud = process.env.GCLOUD_PATH || 'C:/intouch/.data/google-cloud/google-cloud-sdk/bin/gcloud.cmd';
function cloud(args, input) {
  const result = spawnSync('cmd.exe', ['/d', '/c', gcloud, ...args, `--project=${project}`, '--quiet'], { encoding: 'utf8', input, windowsHide: true });
  if (result.status !== 0) throw new Error(`Google ${args[0]} operation failed. Secret values were not printed.`);
  return result.stdout.trim();
}
function getOrCreateSecret(name, generate) {
  const names = cloud(['secrets', 'list', `--filter=name:${name}`, '--format=value(name)']).split(/\r?\n/);
  if (!names.some(value => value === name || value.endsWith(`/${name}`))) cloud(['secrets', 'create', name, '--replication-policy=automatic']);
  const versions = cloud(['secrets', 'versions', 'list', name, '--filter=state:ENABLED', '--sort-by=~createTime', '--limit=1', '--format=value(name)']);
  if (versions) return cloud(['secrets', 'versions', 'access', versions.split('/').at(-1), `--secret=${name}`]);
  const value = generate();
  cloud(['secrets', 'versions', 'add', name, '--data-file=-'], value);
  return value;
}
const adminEnvironment = parseEnv(readFileSync(process.env.NEON_ADMIN_ENV_FILE || 'C:/ablest/apps/api/.env.hosted', 'utf8'));
const adminUrl = new URL(adminEnvironment.DATABASE_URL);
if (!adminUrl.hostname.endsWith('.neon.tech')) throw new Error('Expected an existing Neon administration connection.');
adminUrl.hostname = adminUrl.hostname.replace('-pooler.', '.');
adminUrl.searchParams.set('sslmode', 'verify-full');
const role = 'houseworthit_app_20261026';
const database = 'houseworthit';
const connection = getOrCreateSecret('houseworthit-database-url', () => {
  const application = new URL(adminUrl);
  application.hostname = new URL(adminEnvironment.DATABASE_URL).hostname;
  application.username = role;
  application.password = randomBytes(32).toString('hex');
  application.pathname = `/${database}`;
  return application.toString();
});
const appUrl = new URL(connection);
if (appUrl.username !== role || appUrl.pathname !== `/${database}` || !/^[a-f0-9]{64}$/.test(appUrl.password)) throw new Error('Existing application secret does not match the isolated database.');
const administrator = new Pool({ connectionString: adminUrl.toString(), max: 1, connectionTimeoutMillis: 15000 });
let phase = 'role lookup';
try {
  const roles = await administrator.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [role]);
  phase = 'restricted role creation';
  if (!roles.rowCount) await administrator.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${appUrl.password}' NOCREATEDB NOCREATEROLE NOINHERIT`);
  phase = 'database creation';
  const databases = await administrator.query('SELECT datname,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [database]);
  if (!databases.rowCount) await administrator.query(`CREATE DATABASE "${database}"`);
  else if (![role, decodeURIComponent(adminUrl.username)].includes(databases.rows[0].owner)) throw new Error('Existing database is owned by another role; stopped without changing it.');
  phase = 'database grants';
  await administrator.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
  await administrator.query(`GRANT CONNECT ON DATABASE "${database}" TO "${role}"`);
  const databaseAdminUrl = new URL(adminUrl); databaseAdminUrl.pathname = `/${database}`;
  const databaseAdmin = new Pool({ connectionString: databaseAdminUrl.toString(), max: 1, connectionTimeoutMillis: 15000 });
  try {
    await databaseAdmin.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await databaseAdmin.query(`GRANT USAGE,CREATE ON SCHEMA public TO "${role}"`);
  } finally { await databaseAdmin.end(); }
  phase = 'application connection verification';
  const application = new Pool({ connectionString: connection, max: 1, connectionTimeoutMillis: 15000 });
  try {
    const result = await application.query('SELECT current_database() AS database,current_user AS role');
    console.log(JSON.stringify({ database: result.rows[0].database, role: result.rows[0].role, secret: 'houseworthit-database-url', planChange: 'none' }));
  } finally { await application.end(); }
  getOrCreateSecret('houseworthit-document-key', () => randomBytes(32).toString('hex'));
  console.log('Neon database and document-key secrets are ready. No existing application records were imported or modified.');
} catch (error) {
  console.error('Provisioning stopped during', phase, ':', error.code || 'configuration or permission error');
  process.exitCode = 1;
} finally { await administrator.end(); }
