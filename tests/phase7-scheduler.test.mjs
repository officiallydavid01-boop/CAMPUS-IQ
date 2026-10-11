import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/026_phase7_weekly_scheduler.sql', import.meta.url), 'utf8');
const baseMigration = readFileSync(new URL('../supabase/migrations/021_phase7_competition_engine.sql', import.meta.url), 'utf8');
const handlerPath = new URL('../supabase/functions/weekly-challenge-scheduler/index.ts', import.meta.url);
const handler = readFileSync(handlerPath, 'utf8');

test('trusted scheduler migration and Edge Function are present', () => {
  assert.ok(existsSync(handlerPath));
  assert.match(migration, /create or replace function public\.run_weekly_challenge_scheduler\(\)/i);
  assert.match(handler, /supabase\.rpc\("run_weekly_challenge_scheduler"\)/);
});

test('scheduler RPC is service-role only and rejects ordinary callers', () => {
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(migration, /revoke all on function public\.run_weekly_challenge_scheduler\(\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.run_weekly_challenge_scheduler\(\) to service_role/i);
  assert.match(handler, /suppliedAuthorization !== `Bearer \$\{schedulerSecret\}`/);
});

test('weekly occurrence generation is timezone-aware and idempotent by local date', () => {
  assert.match(migration, /now\(\) at time zone v_series\.timezone/i);
  assert.match(migration, /at time zone v_series\.timezone/i);
  assert.match(baseMigration, /unique \(series_id, occurrence_key\)/i);
  assert.match(migration, /outcome := 'already_exists'/i);
  assert.match(migration, /for v_offset in 0\.\.1 loop/i);
});

test('Edge Function does not return secret values and reports controlled errors', () => {
  assert.match(handler, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(handler, /status: 401/);
  assert.match(handler, /status: 500/);
  assert.doesNotMatch(handler, /serviceRoleKey\s*[,}]\s*\}\s*,?\s*$/m);
});
