import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('local environment template exists and exposes only public browser settings', () => {
  assert.ok(existsSync(join(root, '.env.example')));
  const env = read('.env.example');
  assert.match(env, /^VITE_SUPABASE_URL=/m);
  assert.match(env, /^VITE_SUPABASE_PUBLISHABLE_KEY=/m);
  assert.doesNotMatch(env, /^(?:VITE_\w*(?:SERVICE_ROLE|SECRET)|SUPABASE_SERVICE_ROLE_KEY)\s*=|sb_secret_[A-Za-z0-9_-]{12,}/im);
  assert.match(env, /YOUR[-_A-Z0-9]+/i);
});

test('all numbered migrations 001 through 039 exist without gaps', () => {
  const files = readdirSync(join(root, 'supabase/migrations')).filter((name) => /^\d{3}_.+\.sql$/.test(name));
  const nums = files.map((name) => Number(name.slice(0, 3))).sort((a, b) => a - b);
  assert.deepEqual(nums, Array.from({ length: 39 }, (_, i) => i + 1));
});

test('every frontend RPC and queried relation has a migration definition', () => {
  const sqlDir = join(root, 'supabase/migrations');
  const sql = readdirSync(sqlDir).filter((name) => name.endsWith('.sql')).sort().map((name) => readFileSync(join(sqlDir, name), 'utf8')).join('\n');
  const sourceDir = join(root, 'src');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
  const source = walk(sourceDir).map((path) => readFileSync(path, 'utf8')).join('\n');
  const functions = new Set([...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\(/gi)].map((m) => m[1].toLowerCase()));
  const tables = new Set([...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi)].map((m) => m[1].toLowerCase()));
  const views = new Set([...sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-zA-Z_][\w]*)/gi)].map((m) => m[1].toLowerCase()));
  for (const [, rpc] of source.matchAll(/\.rpc\(\s*['"]([a-zA-Z_][\w]*)['"]/g)) assert.ok(functions.has(rpc.toLowerCase()), `Missing SQL RPC: ${rpc}`);
  for (const [, relation] of source.matchAll(/\.from\(\s*['"]([a-zA-Z_][\w]*)['"]/g)) assert.ok(tables.has(relation.toLowerCase()) || views.has(relation.toLowerCase()), `Missing SQL relation: ${relation}`);
});

test('tables introduced after baseline RLS migration explicitly enable RLS', () => {
  const migrationDir = join(root, 'supabase/migrations');
  const files = readdirSync(migrationDir).filter((name) => /^\d{3}_.+\.sql$/.test(name) && Number(name.slice(0, 3)) > 12);
  const created = new Set();
  const enabled = new Set();
  for (const name of files) {
    const sql = readFileSync(join(migrationDir, name), 'utf8');
    for (const [, table] of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi)) created.add(table.toLowerCase());
    for (const [, table] of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)\s+enable\s+row\s+level\s+security/gi)) enabled.add(table.toLowerCase());
  }
  assert.ok(created.size > 0);
  for (const table of created) assert.ok(enabled.has(table), `RLS not explicitly enabled: ${table}`);
});


test('later-phase queried relations are represented in the database type map', () => {
  const types = read('src/types/database.types.ts');
  const required = [
    'competitions', 'competition_attempts', 'competition_disputes', 'competition_participants',
    'competition_questions', 'competition_results', 'competition_scopes', 'competition_team_members',
    'competition_teams', 'notifications', 'study_sessions', 'tournament_match_attempts',
    'tournament_participants', 'tournament_questions', 'tournament_rounds',
    'tournament_team_match_attempts', 'tournaments', 'weekly_challenge_series',
  ];
  for (const table of required) assert.ok(types.includes(`${table}: { Row:`), `Missing typed relation: ${table}`);
  assert.match(types, /Functions:[\s\S]*Phase8FunctionCompatibility/);
  assert.match(types, /export type DatabaseFunctionName =/);
  assert.match(types, /tournament_format: TournamentFormat/);
});

test('security hardening migrations restrict anonymous role-helper access and move pg_trgm', () => {
  const migrations = readdirSync(join(root, 'supabase/migrations')).sort();
  const roleHardening = read('supabase/migrations/030_restrict_unauthenticated_role_helpers.sql');
  const extensionMove = read('supabase/migrations/031_move_pg_trgm_to_extensions.sql');
  for (const helper of ['has_role', 'is_admin', 'is_staff', 'is_super_admin']) {
    assert.ok(roleHardening.toLowerCase().includes(`revoke execute on function public.${helper}(`), `Missing anon execute revocation for ${helper}`);
  }
  assert.match(roleHardening, /from public, anon/i);
  assert.match(extensionMove, /alter extension pg_trgm set schema extensions/i);
  assert.ok(migrations.includes('030_restrict_unauthenticated_role_helpers.sql'));
  assert.ok(migrations.includes('031_move_pg_trgm_to_extensions.sql'));
  assert.ok(migrations.includes('032_index_uncovered_foreign_keys.sql'));
  assert.ok(migrations.includes('033_guard_team_match_question_access.sql'));
  assert.ok(migrations.includes('034_guard_team_match_answer_access.sql'));
  assert.ok(migrations.includes('035_optimize_rls_auth_uid_initplans.sql'));
  assert.ok(migrations.includes('036_restrict_browser_table_privileges.sql'));
  assert.ok(migrations.includes('037_restrict_anon_direct_writes.sql'));
  assert.ok(migrations.includes('038_rpc_only_official_record_mutations.sql'));
  assert.ok(migrations.includes('039_secure_future_function_and_sequence_defaults.sql'));
});


test('all 78 migration-created tables have database type entries', () => {
  const sqlDir = join(root, 'supabase/migrations');
  const sql = readdirSync(sqlDir).filter((name) => name.endsWith('.sql')).sort().map((name) => readFileSync(join(sqlDir, name), 'utf8')).join('\n');
  const types = read('src/types/database.types.ts');
  const tableNames = new Set([...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi)].map((m) => m[1].toLowerCase()));
  assert.equal(tableNames.size, 78);
  for (const table of tableNames) assert.ok(types.includes(`${table}: {`), `Database types omit table ${table}`);
  const functionTypeSection = types.match(/export type DatabaseFunctionName =([\s\S]*?);/)?.[1] ?? '';
  const typedFunctions = new Set([...functionTypeSection.matchAll(/"([a-zA-Z_][\w]*)"/g)].map((m) => m[1]));
  assert.equal(typedFunctions.size, 76, 'Expected all 76 live public RPC functions to be represented.');
  const sourceDir = join(root, 'src');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
  const source = walk(sourceDir).map((path) => readFileSync(path, 'utf8')).join('\n');
  const calledRpcs = new Set([...source.matchAll(/\.rpc\(\s*['"]([a-zA-Z_][\w]*)['"]/g)].map((m) => m[1]));
  for (const rpc of calledRpcs) assert.ok(typedFunctions.has(rpc), `Database types omit RPC ${rpc}`);
});

test('migration 032 adds missing foreign-key indexes without dropping schema objects', () => {
  const sql = read('supabase/migrations/032_index_uncovered_foreign_keys.sql');
  assert.match(sql, /CREATE INDEX IF NOT EXISTS/i);
  assert.match(sql, /pg_constraint/);
  assert.match(sql, /pg_index/);
  assert.match(sql, /indisvalid/);
  assert.doesNotMatch(sql, /\bDROP\s+(?:INDEX|TABLE|CONSTRAINT)\b/i);
});


test('migration 033 rejects questions for completed or cancelled team tournament matches', () => {
  const sql = read('supabase/migrations/033_guard_team_match_question_access.sql');
  assert.match(sql, /v_match\.status not in \('scheduled', 'in_progress'\)/i);
  assert.match(sql, /student_id = v_uid and status = 'in_progress'/i);
  assert.match(sql, /v_t\.status <> 'live'/i);
  assert.match(sql, /revoke all on function public\.get_tournament_team_match_attempt_questions\(uuid\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_tournament_team_match_attempt_questions\(uuid\) to authenticated/i);
});


test('migration 034 guards team-match answer reads and writes by match status and deadline', () => {
  const sql = read('supabase/migrations/034_guard_team_match_answer_access.sql');
  assert.match(sql, /v_match\.status not in \('scheduled', 'in_progress'\)/i);
  assert.match(sql, /student_id = v_uid and status = 'in_progress'/i);
  assert.match(sql, /v_t\.status <> 'live'/i);
  assert.match(sql, /match deadline has passed/i);
  assert.match(sql, /public\.get_tournament_team_match_attempt_answers\(uuid\)/i);
  assert.match(sql, /revoke all on function public\.save_tournament_team_match_answer\(uuid, uuid, uuid, text\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.save_tournament_team_match_answer\(uuid, uuid, uuid, text\) to authenticated/i);
});


test('migration 035 hoists auth.uid() in RLS policies without dropping or recreating policies', () => {
  const sql = read('supabase/migrations/035_optimize_rls_auth_uid_initplans.sql');
  assert.match(sql, /from pg_policies/i);
  assert.match(sql, /replace\(pol\.qual, 'auth\.uid\(\)', '\(select auth\.uid\(\)\)'\)/i);
  assert.match(sql, /alter policy/i);
  assert.doesNotMatch(sql, /\bDROP\s+(?:POLICY|TABLE|FUNCTION)\b/i);
});


test('migration 036 removes RLS-bypassing browser privileges and secures future table defaults', () => {
  const sql = read('supabase/migrations/036_restrict_browser_table_privileges.sql');
  assert.match(sql, /revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated/i);
  assert.match(sql, /alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated/i);
  assert.match(sql, /alter default privileges for role postgres in schema public grant select on tables to anon, authenticated/i);
});

test('migration 037 removes anonymous direct table and sequence writes', () => {
  const sql = read('supabase/migrations/037_restrict_anon_direct_writes.sql');
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger, maintain\s+on all tables in schema public from anon/i);
  assert.match(sql, /revoke all privileges on all sequences in schema public from anon/i);
});


test('migration 038 makes official attempt, answer, score and role records RPC-only for browser roles', () => {
  const sql = read('supabase/migrations/038_rpc_only_official_record_mutations.sql');
  assert.match(sql, /revoke insert, update, delete on table/i);
  for (const table of ['exam_attempts','exam_answers','practice_sessions','practice_answers','user_roles','user_xp','gamification_events','competition_attempts','competition_answers','competition_results','tournament_match_attempts','tournament_match_answers','tournament_team_match_attempts','tournament_team_match_answers']) {
    assert.match(sql, new RegExp('public\\.' + table + '\\b'), `Missing RPC-only DML restriction for ${table}`);
  }
  assert.match(sql, /from anon, authenticated/i);
});


test('migration 039 prevents future public functions and sequences inheriting browser privileges', () => {
  const sql = read('supabase/migrations/039_secure_future_function_and_sequence_defaults.sql');
  assert.match(sql, /alter default privileges for role postgres in schema public\s+revoke execute on functions from public, anon, authenticated/i);
  assert.match(sql, /alter default privileges for role postgres in schema public\s+revoke all on sequences from anon, authenticated/i);
});


test('preview deployment prerequisites include Node types and an ESM-safe Vite config', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.devDependencies['@types/node'], 'Vite config uses Node APIs and needs Node typings');
  const vite = read('vite.config.ts');
  assert.match(vite, /fileURLToPath\(import\.meta\.url\)/);
  assert.doesNotMatch(vite, /path\.resolve\(__dirname/);
  assert.ok(existsSync(join(root, 'docs/preview-deployment.md')));
});
