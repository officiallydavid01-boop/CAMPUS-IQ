# CampusIQ Phases 1–5 Integrity Audit

## Baseline and preservation

The Phase 5 ZIP was compared with the supplied Phase 4 ZIP. Every file present in Phase 4 is still present in Phase 5; Phase 5 adds its own exam/practice/question/materials/analytics files and migrations. The same comparison found no removed files in Phase 2 → 3, Phase 3 → 4, or Phase 4 → 5.

- Phase 1: React + TypeScript + Vite foundation, routing, auth, Midnight Aurora tokens, holographic brain mark, PWA shell, responsive component system.
- Phase 2: ordered Postgres schema, profile/role model, academic hierarchy, learning tables, RLS policies, indexes, seed and storage foundations.
- Phase 3: Admin academic-structure CRUD, Courses, Course Offerings, audit logging.
- Phase 4: student academic context/onboarding, course filtering/enrollment, course/topic/lesson pages, materials, lesson completion/progress.
- Phase 5: question bank, past questions, practice, exams, grading, results, analytics.

The current archive still does **not** represent the entire 11-phase CampusIQ product. Gamification, competitions, tournaments, notifications, the broader operations CMS, full low-data/offline work, and final integration/E2E verification remain later-phase work as specified in the master roadmap.

## Phase 5 defects found and addressed in this working copy

1. Added migration `017_phase5_exam_hardening.sql` to restrict direct execution of the answer evaluator and validate selected-option ownership.
2. Added server-side exam start/save/submit RPCs. Attempt limits, active enrollment, availability, question membership, answer ownership, and server-time deadlines are checked in the database.
3. Added a persistent countdown derived from the server-created attempt timestamp. The countdown does not replace server-side deadline checks.
4. Made exam submission atomic and retry-safe. The score denominator is based on the exam's question blueprint, not only the answers the student saved.
5. Added Admin manual marking for structured exam responses. Results distinguish pending manual review from incorrect answers. V1 manual marking is binary, not partial-credit rubric scoring.
6. Added mixed-topic and weak-topic practice modes.
7. Routed practice-session creation, answer submission, and session ending through validating RPCs. Direct browser writes to exam attempts/answers, practice sessions/answers, and course enrollments are revoked.
8. Restricted published course/lesson/question/past-question/exam reads to the student's current academic context or relevant active/completed enrollment, as appropriate. Self-enrollment now validates the current academic context and offering capacity in the database.
9. Expanded analytics to include graded practice accuracy, topic strengths/weaknesses, tracked study minutes, seven-day practice activity, and exam history.
10. Added dependency-free Node regression tests and wired them into CI.
11. Added migration `018_phase5_admin_exam_workflow.sql` for transactional Admin exam creation/editing, strict published-question/course validation, scheduling, attempt-limit and difficulty configuration, and protection of historical scores from post-attempt exam edits.
12. Completed the Admin past-question options editor and record editing. Added student filters for session/year, semester, topic, and exam type.
13. Expanded result review with time taken, correct/incorrect counts, topic-level breakdown, explanation review when fully graded, and the actual stored XP award value (currently zero until the gamification phase awards XP).
14. Added migration `019_phase5_exam_question_access.sql` to replace a broad exam-question-link read policy with staff/enrolled-student access.
15. A fresh compiler pass caught a duplicate `courseId` property in the practice-question request; removed the duplicate. Corrected `npm run typecheck`, which previously invoked `tsc --noEmit` against a project-reference-only root config and therefore did not perform a meaningful check.

## Checks actually run in this environment

- Phase-to-phase file preservation comparison: no files removed from Phase 2 → 3, 3 → 4, or 4 → 5.
- `node --test tests/*.test.mjs`: 21 regression checks pass.
- TypeScript compiler `transpileModule` syntax pass over 89 `.ts`/`.tsx` files: zero syntax diagnostics.
- Migrations 017–019: basic static checks for balanced parentheses and dollar-quote delimiters.

## Checks not completed

- `npm install` was attempted but timed out. Dependencies are not installed in this environment.
- `npm run build`, `npm run lint`, and a meaningful full `npm run typecheck` have not passed here. The typecheck script has now been corrected to use project build mode; its run is blocked by missing React/Supabase/Vite dependencies, so it is not a passing typecheck.
- Migrations 017–019 have not been applied to a live PostgreSQL/Supabase database. Static tests do not prove that PostgreSQL will accept every statement or that RLS works against live identities and rows.
- No live browser, device, Supabase Auth, Storage, or end-to-end tests were possible here.

## Remaining known limitations

- Structured-answer marking is correct/incorrect only; partial credit and per-part rubrics are not implemented.

- Academic CSV/JSON bulk import with preview/validation is not implemented.
- Course code uniqueness is still global rather than institution-scoped.
- Notes, bookmarks, planner, gamification, competitions, tournaments, and later Admin operations remain scheduled for later phases.
- PWA icon rasters, broader offline data behavior, and low-data settings remain later work.

## Migration safety

Migrations 017–019 are additive/alterative schema work: they add functions/policies and change privileges/views. It does not delete existing academic history or remove existing migration files. Apply migrations in numeric order, with 017 after 016, 018 after 017, and 019 after 018. Test on a non-production Supabase project before production use.
