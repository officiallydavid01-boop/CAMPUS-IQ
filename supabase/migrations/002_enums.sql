-- CampusIQ — Migration 002: Enumerated types
--
-- Centralizing enums here (rather than inline per-table) keeps the set of
-- valid states documented in one place and makes it easy to see which
-- migration a given value set was introduced in.

create type public.user_role as enum (
  'super_admin',
  'admin',
  'content_editor',
  'moderator',
  'student'
);

create type public.account_status as enum (
  'active',
  'suspended',
  'deactivated'
);

create type public.content_status as enum (
  'draft',
  'review',
  'published',
  'archived'
);

create type public.question_type as enum (
  'multiple_choice',
  'true_false',
  'numerical',
  'short_answer',
  'structured'
);

create type public.difficulty_level as enum (
  'easy',
  'medium',
  'hard'
);

create type public.exam_type as enum (
  'course_exam',
  'mock_exam',
  'past_question_exam',
  'topic_exam',
  'mixed_exam'
);

create type public.attempt_status as enum (
  'in_progress',
  'submitted',
  'graded',
  'abandoned'
);

create type public.enrollment_status as enum (
  'active',
  'completed',
  'dropped'
);

create type public.practice_mode as enum (
  'topic',
  'course',
  'mixed',
  'past_question',
  'weak_topic'
);

create type public.competition_status as enum (
  'draft',
  'scheduled',
  'live',
  'completed',
  'cancelled',
  'archived'
);

create type public.tournament_status as enum (
  'draft',
  'scheduled',
  'registration_open',
  'live',
  'completed',
  'cancelled',
  'archived'
);

create type public.tournament_format as enum (
  'leaderboard_challenge',
  'knockout',
  'head_to_head',
  'group_stage'
);

create type public.match_status as enum (
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'walkover'
);

create type public.leaderboard_scope as enum (
  'global',
  'institution',
  'faculty',
  'department',
  'programme',
  'level',
  'course',
  'competition',
  'tournament'
);

create type public.announcement_audience as enum (
  'everyone',
  'institution',
  'faculty',
  'department',
  'programme',
  'level',
  'course',
  'competition_participants',
  'tournament_participants'
);

create type public.notification_type as enum (
  'exam_reminder',
  'deadline',
  'announcement',
  'competition_start',
  'tournament_update',
  'achievement',
  'streak',
  'course_update',
  'lesson_published',
  'result'
);

create type public.xp_source as enum (
  'lesson_completion',
  'practice_session',
  'mock_exam',
  'quest',
  'achievement',
  'competition',
  'tournament',
  'streak_bonus',
  'admin_grant'
);

create type public.quest_period as enum (
  'daily',
  'weekly'
);

create type public.file_visibility as enum (
  'public',
  'private'
);
