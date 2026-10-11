# CampusIQ preview deployment (GitHub + Vercel)

This guide is for getting the current app online so the real user flows can be tested. A successful preview deployment is **not** the same as production certification. Keep the first deployment private/unadvertised while authentication, role access, and learning workflows are smoke-tested.

## 1. Push the source to GitHub

1. Download the latest CampusIQ release ZIP and extract it.
2. Create/open the CampusIQ repository on GitHub.
3. Upload the **contents** of the extracted project folder (the `package.json`, `src/`, `public/`, `supabase/`, `tests/`, and config files should sit at the repository root).
4. Do not upload `node_modules`, `.env`, service-role keys, database passwords, or Supabase access tokens.
5. Commit to the `main` branch.

## 2. Import the repository into Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Import the CampusIQ GitHub repository.
3. Use these settings:
   - Framework preset: **Vite**
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `dist`
4. Add these environment variables for **Preview** (and Production only when ready):
   - `VITE_SUPABASE_URL` = `https://gfpcbdpauncdargcrxdw.supabase.co` for the already-connected CampusIQ project
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the project's **publishable** key from Supabase Project Settings → API
5. Never use a Supabase `service_role` or secret key in a `VITE_` variable. Browser variables are public by design.
6. Deploy the preview. If the build fails, open the Vercel build log and fix the first real error before retrying.

The app uses `HashRouter`, so its client routes appear after `/#/` and do not require server-side rewrite rules.

## 3. Configure Supabase Auth URLs

In Supabase Authentication URL Configuration:

1. Set the Site URL to the Vercel preview URL while preview-testing.
2. Add the exact Vercel preview URL to the Redirect URLs allowlist. Add the eventual production domain separately later.
3. Test email confirmation and password-reset links on the deployed URL, not only on localhost.

Avoid repeatedly changing the Site URL if multiple deployment environments are being tested. Use allowed redirect URLs for preview URLs.

## 4. Create the first Admin account

The connected Supabase project currently has **zero auth users, zero profiles, and zero user-role assignments**. It has the seeded demo academic catalogue and three storage buckets, so the first account still needs to be created.

1. Open the deployed CampusIQ site and register using `officiallydavid01@gmail.com`.
2. Complete email confirmation if it is enabled, then sign in and complete onboarding.
3. In the Supabase SQL Editor for the connected project, run the documented one-time Super Admin bootstrap SQL from `docs/database-architecture.md` under **Bootstrapping the first super_admin**.
4. Sign out and back in, or refresh the session, so CampusIQ reloads the new role.
5. Confirm `/admin` opens and a normal student account cannot access Admin routes or admin-only database operations.

Do not grant the Super Admin role through browser code or by adding an email-based role bypass.

## 5. First live smoke-test sequence

Run these with test accounts and demo data before inviting other students:

1. Landing page, registration, login, sign-out, forgot-password and reset-password.
2. Onboarding and academic-context selection.
3. Admin: institutions, faculties, departments, programmes, levels, sessions, semesters, courses and course offerings.
4. Admin: topics, lessons, materials, questions, past questions, exams and manual marking of structured answers.
5. Student: courses, lesson reading/completion, practice, past questions, exam start/answer/submit, result review, profile and XP/achievements.
6. Competition: create draft, select questions/scope, publish, register, take the scheduled attempt, inspect leaderboard, submit/resolve a dispute, and finalize results.
7. Tournament: publish schedule, register individual/team participants, start and submit match attempts, record outcomes, advance rounds and finalize standings.
8. Verify cross-student privacy: Student A must not see Student B's private answers, attempts, notifications, or profile-sensitive data.
9. Test mobile layout, page refresh, service-worker update, offline fallback and the app manifest.

Use a short, controlled test window for competitions and tournaments. The database enforces the scheduled live window; publishing a competition does not make it playable outside that window.

## 6. Known limits during preview

- The weekly challenge scheduler Edge Function is in source but must be deployed and scheduled separately before weekly instances are generated automatically.
- Planner, Notes, Bookmarks and several Admin management areas still intentionally show a Coming Soon screen; their routes are not presented as finished features.
- The service worker provides a limited offline fallback, not offline access to live Supabase learning data.
- Full browser end-to-end tests with real roles have not been run in this environment. Treat any preview issues as test findings and fix them before production promotion.
