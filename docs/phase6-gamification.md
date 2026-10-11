# Phase 6: Gamification and rewards

## Included

- `020_phase6_gamification_engine.sql` adds the authenticated activity RPC, an idempotent activity-event ledger, unique XP source/event protection, server-side level calculation, streak tracking, quest progress/rewards, and achievement condition evaluation.
- Lesson completion now uses `complete_lesson`, which verifies that the lesson/topic are published and the student has an active enrollment in a published offering for that course. Students can no longer insert or update lesson completion timestamps directly.
- Practice-session rewards require a completed session with recorded answered questions. Exam rewards require an authoritative graded attempt. The RPC derives the student identity from `auth.uid()` and accepts no client-provided XP amount.
- Activity reward values are configurable through Admin settings for lesson completion, practice questions, graded exams, and seven-day streak bonuses.
- Admin can manage quest definitions, supported achievement conditions/rewards, and level thresholds. Level thresholds are validated against neighboring levels and changing configuration recalculates existing user levels.
- Student dashboard/profile/achievements pages display database-derived XP, level progress, streaks, quests, reward history, and earned/locked achievements.

## Supported quest targets

- `lessons_completed`
- `practice_sessions`
- `questions_answered`
- `exams_completed`

Quest periods reset by UTC date (daily) or UTC week start (weekly). A completed quest is awarded once per student/quest/period.

## Supported achievement conditions

- `lessons_completed`
- `practice_sessions`
- `questions_answered`
- `exams_completed`
- `perfect_exam`
- `streak_days`
- `manual` (catalogue only; not automatically awarded)

Achievement rewards are awarded once because each student/achievement pair is unique. Existing starter achievements are mapped to conditions during migration 020.

## Security notes

- `xp_transactions` is the source-of-truth append-only ledger. `user_xp` is recalculated by a database trigger.
- `record_gamification_activity` derives the student from `auth.uid()` and verifies the referenced lesson, practice session, or graded exam attempt before processing rewards.
- Direct client insert/update/delete on XP ledger/event/progress tables is not granted by the student policies. Internal award helpers have execution revoked from browser roles.
- Lesson completion's `xp_awarded` marker has a transaction-local internal flag used only by the verified award RPC; ordinary student updates cannot flip it.

## Verification still required

The dependency-free tests inspect source contracts, not actual PostgreSQL execution. Apply migrations 001–020 to a disposable Supabase project and test: first and repeated lesson completion; empty and completed practice sessions; graded and manually marked exams; same-event RPC retries; daily/weekly quest boundaries; seven-day streak transitions; concurrent duplicate requests; RLS under student and Admin sessions; and Admin configuration validation. The frontend has not been fully typechecked/built in this environment because dependencies could not be installed. No live database or browser test has been run.
