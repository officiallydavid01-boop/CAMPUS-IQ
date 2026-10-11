# CampusIQ tests

Run `npm test` for dependency-free static regression checks covering migration ordering, grading-function permissions, option/question matching, server-side attempt limits, enrollment eligibility, exam deadlines and grading, Admin exam/past-question workflows, and Phase 6 XP idempotency, verified lesson completion, server-side reward processing, level validation, quest/streak/achievement integration, and student/Admin gamification routes. These tests inspect source contracts; they do **not** replace a live PostgreSQL/Supabase integration test.

Final integration phase should add and run: 

- Supabase local-stack integration tests for RLS and RPC authorization.
- React/Vitest component tests for timer, save, submit, pending manual-review states, and errors.
- Playwright end-to-end tests for registration/onboarding/course access and Admin-created content flowing to students.
- Full `npm run typecheck`, `npm run lint`, and `npm run build` in an environment that can install dependencies.

Never claim a live Supabase test or a production build passed unless it was actually run.
