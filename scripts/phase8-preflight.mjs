import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');
const srcDir = join(root, 'src');
const errors = [];
const notes = [];

function read(path) {
  return readFileSync(path, 'utf8');
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
function requireCheck(condition, message) {
  if (!condition) errors.push(message);
}

const packageJson = JSON.parse(read(join(root, 'package.json')));
const envExamplePath = join(root, '.env.example');
requireCheck(existsSync(envExamplePath), 'Missing .env.example; setup instructions reference this file.');
if (existsSync(envExamplePath)) {
  const envExample = read(envExamplePath);
  requireCheck(envExample.includes('VITE_SUPABASE_URL='), '.env.example must define VITE_SUPABASE_URL.');
  requireCheck(envExample.includes('VITE_SUPABASE_PUBLISHABLE_KEY='), '.env.example must define VITE_SUPABASE_PUBLISHABLE_KEY.');
  requireCheck(!/^(?:VITE_\w*(?:SERVICE_ROLE|SECRET)|SUPABASE_SERVICE_ROLE_KEY)\s*=|sb_secret_[A-Za-z0-9_-]{12,}/im.test(envExample), '.env.example must never contain a service-role/secret key.');
  requireCheck(/YOUR[-_A-Z0-9]+/i.test(envExample), '.env.example should contain placeholders, not live credentials.');
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d{3}_.+\.sql$/.test(name))
  .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
const migrationNumbers = migrationFiles.map((name) => Number(name.slice(0, 3)));
requireCheck(migrationNumbers.length === 39, `Expected 39 numbered migrations; found ${migrationNumbers.length}.`);
for (let i = 0; i < 39; i += 1) {
  requireCheck(migrationNumbers[i] === i + 1, `Missing or duplicate migration number ${String(i + 1).padStart(3, '0')}.`);
}

const sql = migrationFiles.map((name) => read(join(migrationsDir, name))).join('\n');
const sourceFiles = walk(srcDir).filter((path) => /\.(ts|tsx)$/.test(path));
const source = sourceFiles.map(read).join('\n');
const definedFunctions = new Set([...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\(/gi)].map((m) => m[1].toLowerCase()));
const definedTables = new Set([...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi)].map((m) => m[1].toLowerCase()));
const definedViews = new Set([...sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-zA-Z_][\w]*)/gi)].map((m) => m[1].toLowerCase()));
const calledRpcs = new Set([...source.matchAll(/\.rpc\(\s*['"]([a-zA-Z_][\w]*)['"]/g)].map((m) => m[1].toLowerCase()));
const queriedRelations = new Set([...source.matchAll(/\.from\(\s*['"]([a-zA-Z_][\w]*)['"]/g)].map((m) => m[1].toLowerCase()));
for (const rpc of calledRpcs) requireCheck(definedFunctions.has(rpc), `Frontend RPC has no matching SQL function definition: ${rpc}`);
for (const relation of queriedRelations) requireCheck(definedTables.has(relation) || definedViews.has(relation), `Frontend relation has no matching SQL table/view definition: ${relation}`);

const databaseTypes = read(join(root, 'src', 'types', 'database.types.ts'));
const tableTypeSection = databaseTypes.match(/Tables: \{([\s\S]*?)\n    \};\n    Views:/)?.[1] ?? '';
const typedTables = new Set([...tableTypeSection.matchAll(/^\s{6}([a-zA-Z_][\w]*): \{/gm)].map((m) => m[1].toLowerCase()));
for (const table of definedTables) requireCheck(typedTables.has(table), `Database TypeScript map is missing a table row type: ${table}`);
const functionTypeSection = databaseTypes.match(/export type DatabaseFunctionName =([\s\S]*?);/)?.[1] ?? '';
const typedFunctions = new Set([...functionTypeSection.matchAll(/["']([a-zA-Z_][\w]*)["']/g)].map((m) => m[1].toLowerCase()));
for (const rpc of calledRpcs) requireCheck(typedFunctions.has(rpc), `Database TypeScript map is missing an RPC signature: ${rpc}`);
requireCheck(typedTables.size === 78, `Expected 78 typed tables; found ${typedTables.size}.`);
requireCheck(typedFunctions.size === 76, `Expected 76 live RPC names; found ${typedFunctions.size}.`);

// Migration 012 enables RLS on all public tables that exist at that point.
// Any table introduced later must enable RLS explicitly in the migration set.
const laterMigrationSql = migrationFiles
  .filter((name) => Number(name.slice(0, 3)) > 12)
  .map((name) => read(join(migrationsDir, name))).join('\n');
const tablesCreatedAfterBaseline = new Set();
for (const name of migrationFiles.filter((name) => Number(name.slice(0, 3)) > 12)) {
  const body = read(join(migrationsDir, name));
  for (const match of body.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi)) {
    tablesCreatedAfterBaseline.add(match[1].toLowerCase());
  }
}
const rlsEnabledTables = new Set([...laterMigrationSql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)\s+enable\s+row\s+level\s+security/gi)].map((m) => m[1].toLowerCase()));
for (const table of tablesCreatedAfterBaseline) requireCheck(rlsEnabledTables.has(table), `Table introduced after baseline does not explicitly enable RLS: ${table}`);

const clientSecrets = [...sourceFiles].filter((path) => /SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]{12,}/.test(read(path)));
requireCheck(clientSecrets.length === 0, `Potential Supabase service-role/secret key reference in frontend source: ${clientSecrets.map((p) => p.replace(root + '/', '')).join(', ')}`);
requireCheck(packageJson.scripts?.test === 'node --test tests/*.test.mjs', 'Expected dependency-free Node test script is missing or changed.');

console.log(`CampusIQ Phase 8 preflight`);
console.log(`- Numbered migrations: ${migrationFiles.length}/39`);
console.log(`- Frontend TypeScript files scanned: ${sourceFiles.length}`);
console.log(`- Frontend RPC references matched to SQL: ${calledRpcs.size}`);
console.log(`- Frontend table/view references matched to SQL: ${queriedRelations.size}`);
console.log(`- Database table type coverage: ${typedTables.size}/78`);
console.log(`- Live RPC names represented in TypeScript: ${typedFunctions.size}/76`);
console.log(`- Post-baseline tables checked for explicit RLS: ${tablesCreatedAfterBaseline.size}`);
if (notes.length) for (const note of notes) console.log(`NOTE: ${note}`);
if (errors.length) {
  console.error(`\n${errors.length} preflight issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('PASS: static integration preflight checks passed.');
  console.log('LIMIT: this does not execute PostgreSQL migrations or connect to Supabase.');
}
