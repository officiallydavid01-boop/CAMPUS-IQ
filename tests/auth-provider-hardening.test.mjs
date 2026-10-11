import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const providerPath = new URL('../src/app/providers/AuthProvider.tsx', import.meta.url);
const servicePath = new URL('../src/services/auth/authService.ts', import.meta.url);

test('auth state callback stays synchronous and never awaits Supabase auth methods', async () => {
  const source = await readFile(providerPath, 'utf8');
  assert.match(source, /onAuthStateChange\(\(_event, nextSession\) =>/);
  assert.doesNotMatch(source, /onAuthStateChange\(async/);
  assert.match(source, /void loadRoles\(nextSession\?\.user\?\.id, true\)/);
});

test('role loading uses the session user id instead of calling auth.getUser in the callback path', async () => {
  const source = await readFile(servicePath, 'utf8');
  assert.match(source, /fetchCurrentUserRoles\(userId: string\)/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.doesNotMatch(source, /supabase\.auth\.getUser\(\)/);
});

test('auth bootstrap clears loading state on both success and failure paths', async () => {
  const source = await readFile(providerPath, 'utf8');
  assert.match(source, /setIsLoading\(false\)/);
  assert.match(source, /finally \{[\s\S]*finishBootstrap && version === roleLoadVersion\.current\) setIsLoading\(false\)/);
  assert.match(source, /\.catch\(\(\) => \{/);
  assert.match(source, /setRoles\(\[\]\)/);
});

test('role results are ignored when a newer session role request supersedes them', async () => {
  const source = await readFile(providerPath, 'utf8');
  assert.match(source, /roleLoadVersion\.current/);
  assert.match(source, /if \(version === roleLoadVersion\.current\) setRoles\(nextRoles\)/);
});
