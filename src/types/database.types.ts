/** JSON values returned by PostgreSQL json/jsonb columns. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * CampusIQ database types. Core tables retain named row interfaces; later-phase
 * relations are represented below from migrations 008–031. Keep this file in
 * sync with Supabase after schema changes using `npm run types:sync` (requires
 * the Supabase CLI and an authenticated CLI session).
 */

// ---- Enums (mirrors 002_enums.sql) ----------------------------------

export type UserRole = "super_admin" | "admin" | "content_editor" | "moderator" | "student";
export type AccountStatus = "active" | "suspended" | "deactivated";
export type ContentStatus = "draft" | "review" | "published" | "archived";
export type QuestionType = "multiple_choice" | "true_false" | "numerical" | "short_answer" | "structured";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type ExamType = "course_exam" | "mock_exam" | "past_question_exam" | "topic_exam" | "mixed_exam";
export type AttemptStatus = "in_progress" | "submitted" | "graded" | "abandoned";
export type EnrollmentStatus = "active" | "completed" | "dropped";
export type PracticeMode = "topic" | "course" | "mixed" | "past_question" | "weak_topic";
export type CompetitionStatus = "draft" | "scheduled" | "live" | "completed" | "cancelled" | "archived";
export type TournamentStatus =
  | "draft"
  | "scheduled"
  | "registration_open"
  | "live"
  | "completed"
  | "cancelled"
  | "archived";
export type TournamentFormat = "leaderboard_challenge" | "knockout" | "head_to_head" | "group_stage" | "single_elimination" | "round_robin" | "group_stage_knockout";
export type MatchStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "walkover";
export type LeaderboardScope =
  | "global"
  | "institution"
  | "faculty"
  | "department"
  | "programme"
  | "level"
  | "course"
  | "competition"
  | "tournament";
export type AnnouncementAudience =
  | "everyone"
  | "institution"
  | "faculty"
  | "department"
  | "programme"
  | "level"
  | "course"
  | "competition_participants"
  | "tournament_participants";
export type NotificationType =
  | "exam_reminder"
  | "deadline"
  | "announcement"
  | "competition_start"
  | "tournament_update"
  | "achievement"
  | "streak"
  | "course_update"
  | "lesson_published"
  | "result";
export type XpSource =
  | "lesson_completion"
  | "practice_session"
  | "mock_exam"
  | "quest"
  | "achievement"
  | "competition"
  | "tournament"
  | "streak_bonus"
  | "admin_grant";
export type QuestPeriod = "daily" | "weekly";
export type FileVisibility = "public" | "private";

// ---- Core tables ------------------------------------------------------

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  account_status: AccountStatus;
  preferences: Record<string, unknown>;
  // Current academic context — see docs/database-architecture.md
  // "Current context vs. academic history". Mutable; does not affect
  // historical records in course_enrollments/lesson_progress/etc.
  institution_id: string | null;
  faculty_id: string | null;
  department_id: string | null;
  programme_id: string | null;
  level_id: string | null;
  current_session_id: string | null;
  current_semester_id: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Institution {
  id: string;
  name: string;
  short_name: string | null;
  country: string | null;
  city: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Faculty {
  id: string;
  institution_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  faculty_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Programme {
  id: string;
  department_id: string;
  name: string;
  code: string | null;
  degree_type: string | null;
  duration_years: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Level {
  id: string;
  programme_id: string;
  name: string;
  numeric_value: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicSession {
  id: string;
  institution_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface Semester {
  id: string;
  academic_session_id: string;
  name: string;
  numeric_value: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  course_code: string;
  title: string;
  description: string | null;
  credit_units: number;
  course_type: string | null;
  department_id: string | null;
  status: ContentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseOffering {
  id: string;
  course_id: string;
  institution_id: string;
  programme_id: string;
  level_id: string;
  semester_id: string;
  capacity: number | null;
  status: ContentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape returned by the "student course filtering" query — see
 * services/courses/coursesService.ts `getCourseOfferingsForContext`. */
export interface CourseOfferingWithCourse extends CourseOffering {
  course: Course;
}

export interface CourseEnrollment {
  id: string;
  student_id: string;
  course_offering_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  completed_at: string | null;
}

export interface CourseTopic {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  display_order: number;
  status: ContentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  topic_id: string;
  title: string;
  introduction: string | null;
  learning_objectives: string[] | null;
  core_concept: string | null;
  detailed_explanation: string | null;
  examples: string | null;
  formulas: string | null;
  key_points: string[] | null;
  notes: string | null;
  additional_resources: Array<{ label: string; url: string }>;
  estimated_reading_minutes: number | null;
  display_order: number;
  status: ContentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonProgress {
  id: string;
  student_id: string;
  lesson_id: string;
  completed_at: string | null;
  xp_awarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface TopicProgress {
  id: string;
  student_id: string;
  topic_id: string;
  lessons_completed: number;
  lessons_total: number;
  completed_at: string | null;
  updated_at: string;
}

export interface Material {
  id: string;
  lesson_id: string | null;
  course_offering_id: string | null;
  title: string;
  description: string | null;
  file_id: string | null;
  status: ContentStatus;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileRecord {
  id: string;
  storage_bucket: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  visibility: FileVisibility;
  uploaded_by: string | null;
  related_type: string | null;
  related_id: string | null;
  created_at: string;
}

/** Shape returned when a material is fetched with its file joined —
 * see services/courses/coursesService.ts `getLessonMaterials`. */
export interface MaterialWithFile extends Material {
  file: FileRecord | null;
}

export interface UserXp {
  student_id: string;
  total_xp: number;
  campusiq_level: number;
  updated_at: string;
}

export interface Streak {
  student_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  updated_at: string;
}

export interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string | null;
  icon: string | null;
  xp_reward: number;
  condition_type: "manual" | "lessons_completed" | "practice_sessions" | "questions_answered" | "exams_completed" | "perfect_exam" | "streak_days";
  condition_target: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}


export interface XpTransaction {
  id: string; student_id: string; amount: number; source: XpSource; source_id: string | null; note: string | null; created_at: string;
}
export interface LevelConfig { level: number; xp_required: number; title: string | null; created_at: string; }
export interface Quest { id: string; title: string; description: string | null; period: QuestPeriod; target_type: string; target_count: number; xp_reward: number; is_active: boolean; created_by: string | null; created_at: string; updated_at: string; }
export interface QuestProgress { id: string; student_id: string; quest_id: string; period_start: string; current_count: number; is_completed: boolean; completed_at: string | null; xp_awarded: boolean; }
export interface UserAchievement { id: string; student_id: string; achievement_id: string; earned_at: string; }
export interface GamificationEvent { id: string; student_id: string; activity_type: string; source_id: string; occurred_at: string; created_at: string; }

export interface PlatformSettings {
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface Role {
  id: string;
  name: UserRole;
  description: string | null;
  created_at: string;
}

/** Row shape of the user_roles join table (see 003_profiles_roles.sql).
 * Named UserRoleGrant, not UserRole, to avoid colliding with the
 * `user_role` Postgres enum's TS type above. */
export interface UserRoleGrant {
  user_id: string;
  role_id: string;
  granted_by: string | null;
  granted_at: string;
}

export interface AdminAuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---- Question bank, past questions, exams, practice (Phase 5) --------

export interface Question {
  id: string;
  course_id: string;
  topic_id: string | null;
  question_type: QuestionType;
  prompt: string;
  difficulty: DifficultyLevel;
  explanation: string | null;
  source: string | null;
  xp_value: number;
  correct_answer_text: string | null;
  status: ContentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  display_order: number;
  created_at: string;
}

export interface PastQuestion {
  id: string;
  course_id: string;
  topic_id: string | null;
  institution_id: string | null;
  session_label: string;
  semester_label: string | null;
  exam_type: ExamType;
  prompt: string;
  options: { text: string; is_correct: boolean }[] | null;
  correct_answer_text: string | null;
  explanation: string | null;
  status: ContentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Exam {
  id: string;
  course_offering_id: string;
  title: string;
  description: string | null;
  exam_type: ExamType;
  duration_minutes: number;
  question_count: number;
  difficulty: DifficultyLevel | null;
  attempt_limit: number | null;
  available_from: string | null;
  available_until: string | null;
  status: ContentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamQuestion {
  exam_id: string;
  question_id: string;
  display_order: number;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  status: AttemptStatus;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  xp_awarded: number;
  created_at: string;
}

export interface ExamAnswer {
  id: string;
  exam_attempt_id: string;
  question_id: string;
  selected_option_id: string | null;
  answer_text: string | null;
  is_correct: boolean | null;
  response_time_ms: number | null;
  answered_at: string;
}

export interface PracticeSession {
  id: string;
  student_id: string;
  mode: PracticeMode;
  course_id: string | null;
  topic_id: string | null;
  question_count: number;
  correct_count: number;
  started_at: string;
  ended_at: string | null;
  xp_awarded: number;
}

export interface PracticeAnswer {
  id: string;
  practice_session_id: string;
  question_id: string;
  selected_option_id: string | null;
  answer_text: string | null;
  is_correct: boolean | null;
  response_time_ms: number | null;
  answered_at: string;
}

/** Shape returned by an exam question fetched through the student-safe
 * `questions_public` view, joined via exam_questions — see
 * services/exams/examAttemptService.ts. */
export interface ExamQuestionWithDetails {
  question_id: string;
  display_order: number;
  question: Database["public"]["Views"]["questions_public"]["Row"];
  options: Database["public"]["Views"]["question_options_public"]["Row"][];
}

// ---- Supabase Database generic (for createClient<Database>) ----------
// Deliberately partial: only the tables/views current Phase 1 services
// touch are declared in full Row/Insert/Update shape. Extend this as each
// later phase's services need typed access to more tables — see the note
// at the top of this file about regenerating from a live project instead.
//
// Every table/view below carries `Relationships: []`, matching the shape
// `supabase gen types` actually produces (and what @supabase/postgrest-js's
// generic constraints expect) — even though this file is hand-written, it
// mirrors the real output shape rather than a simplified Row/Insert/Update
// -only guess, since a missing Relationships field is exactly the kind of
// thing that only surfaces once you actually run tsc.

export interface CompetitionTableRow {
  id: string; title: string; description: string | null; banner_url: string | null;
  course_id: string | null; topic_id: string | null; difficulty: DifficultyLevel | null;
  question_count: number; time_limit_minutes: number; starts_at: string; ends_at: string;
  participant_limit: number | null; xp_reward: number; achievement_id: string | null;
  leaderboard_scope: LeaderboardScope; status: CompetitionStatus; created_by: string | null;
  created_at: string; updated_at: string; competition_type: string; participation_mode: string;
  registration_starts_at: string | null; registration_ends_at: string | null; timezone: string;
  attempt_policy: string; team_scoring_method: string; team_top_n: number; scoring_config: Json;
  rules_version: number; published_at: string | null; finalized_at: string | null;
  dispute_window_hours: number; recurrence_series_id: string | null; tournament_id: string | null;
  min_team_size: number; max_team_size: number;
}
export interface CompetitionAttemptTableRow {
  id: string; competition_id: string; student_id: string; status: AttemptStatus; started_at: string;
  submitted_at: string | null; score: number | null; response_time_ms: number | null;
  disqualified: boolean; disqualified_reason: string | null; max_score: number | null;
  accuracy: number | null; rules_version: number;
}
export interface CompetitionParticipantTableRow {
  id: string; competition_id: string; student_id: string; registered_at: string;
  eligibility_snapshot: Json; registration_status: string; roster_locked_at: string | null;
}
export interface CompetitionQuestionTableRow {
  competition_id: string; question_id: string; display_order: number; points: number;
  question_snapshot: Json | null; snapshot_version: number;
}
export interface CompetitionResultTableRow {
  id: string; competition_id: string; student_id: string; rank: number | null; score: number;
  xp_awarded: number; published: boolean; created_at: string; accuracy: number | null;
  completion_duration_ms: number | null; result_version: number; provisional_published_at: string | null;
  dispute_until: string | null; finalized_at: string | null; source_attempt_id: string | null; status: string;
}
export interface CompetitionScopeTableRow { id: string; competition_id: string; scope_type: string; scope_id: string | null; created_at: string }
export interface CompetitionTeamTableRow {
  id: string; competition_id: string; name: string; normalized_name: string; captain_id: string;
  department_id: string | null; status: string; created_at: string; roster_locked_at: string | null;
}
export interface CompetitionTeamMemberTableRow {
  id: string; team_id: string; student_id: string; role: string; status: string;
  joined_at: string | null; created_at: string;
}
export interface CompetitionDisputeTableRow {
  id: string; competition_result_id: string; competition_id: string; student_id: string;
  reason: string; evidence_url: string | null; status: string; reviewer_id: string | null;
  resolution_note: string | null; submitted_at: string; resolved_at: string | null;
}
export interface NotificationTableRow {
  id: string; student_id: string; type: NotificationType; title: string; body: string | null;
  related_type: string | null; related_id: string | null; is_read: boolean; read_at: string | null; created_at: string;
}
export interface StudySessionTableRow {
  id: string; student_id: string; course_id: string | null; started_at: string; ended_at: string | null;
  duration_minutes: number | null; notes: string | null; created_at: string;
}
export interface TournamentTableRow {
  id: string; title: string; description: string | null; banner_url: string | null; format: TournamentFormat;
  institution_id: string | null; faculty_id: string | null; department_id: string | null; programme_id: string | null;
  level_id: string | null; course_id: string | null; topic_id: string | null; registration_starts_at: string | null;
  registration_ends_at: string | null; starts_at: string; ends_at: string; participant_limit: number | null;
  round_count: number; match_duration_minutes: number | null; question_count: number; tie_breaker: string | null;
  xp_reward: number; achievement_id: string | null; status: TournamentStatus; created_by: string | null;
  created_at: string; updated_at: string; timezone: string; participation_mode: string; scoring_config: Json;
  rules_version: number; published_at: string | null; tournament_published_at: string | null;
  participant_mode: string; team_top_n: number; team_competition_id: string | null;
}
export interface TournamentParticipantTableRow {
  id: string; tournament_id: string; student_id: string; seed: number | null; registered_at: string;
  is_eliminated: boolean; eliminated_at: string | null; group_key: string | null; registration_status: string;
  eligibility_snapshot: Json;
}
export interface TournamentRoundTableRow {
  id: string; tournament_id: string; round_number: number; title: string | null;
  starts_at: string | null; ends_at: string | null; status: MatchStatus; created_at: string;
}
export interface TournamentQuestionTableRow {
  tournament_id: string; question_id: string; display_order: number; points: number;
  question_snapshot: Json | null; snapshot_version: number;
}
export interface TournamentMatchAttemptTableRow {
  id: string; tournament_match_id: string; student_id: string; status: AttemptStatus; started_at: string;
  submitted_at: string | null; score: number | null; max_score: number | null; accuracy: number | null;
  response_time_ms: number | null;
}
export interface TournamentTeamMatchAttemptTableRow {
  id: string; tournament_match_id: string; team_id: string; student_id: string; status: AttemptStatus;
  started_at: string; submitted_at: string | null; score: number | null; max_score: number | null;
  accuracy: number | null; response_time_ms: number | null;
}
export interface WeeklyChallengeSeriesTableRow {
  id: string; title: string; template_competition_id: string; timezone: string; weekday: number;
  local_start_time: string; duration_minutes: number; registration_lead_minutes: number; is_active: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface AnnouncementTableRow { id: string; title: string; body: string; audience: AnnouncementAudience; audience_ref_id: string | null; status: ContentStatus; publish_at: string | null; created_by: string | null; created_at: string; updated_at: string }
export interface BookmarkTableRow { id: string; student_id: string; bookmarkable_type: string; bookmarkable_id: string; created_at: string }
export interface CompetitionAnswerTableRow { id: string; competition_attempt_id: string; question_id: string; selected_option_id: string | null; answer_text: string | null; is_correct: boolean | null; response_time_ms: number | null; answered_at: string; selected_option_snapshot_id: string | null }
export interface CompetitionRuleTableRow { id: string; competition_id: string; rule_key: string; rule_value: Json; created_at: string }
export interface CompetitionScoreCorrectionTableRow { id: string; competition_result_id: string; dispute_id: string | null; old_score: number; new_score: number; old_accuracy: number | null; new_accuracy: number | null; reason: string; reviewer_id: string; result_version: number; created_at: string }
export interface CompetitionTeamResultTableRow { id: string; competition_id: string; team_id: string; score: number; contributing_scores: Json; rank: number | null; result_version: number; status: string; finalized_at: string | null; created_at: string }
export interface DepartmentCompetitionResultTableRow { id: string; competition_id: string; department_id: string; score: number; contributing_result_count: number; rank: number | null; result_version: number; finalized_at: string | null; created_at: string }
export interface LeaderboardTableRow { id: string; scope: LeaderboardScope; scope_ref_id: string | null; student_id: string; rank: number; score: number; computed_at: string }
export interface NoteTableRow { id: string; student_id: string; course_id: string | null; topic_id: string | null; lesson_id: string | null; title: string; content: string; created_at: string; updated_at: string }
export interface NotificationPreferenceTableRow { student_id: string; exam_reminders: boolean; deadlines: boolean; announcements: boolean; competition_updates: boolean; tournament_updates: boolean; achievement_alerts: boolean; streak_alerts: boolean; course_updates: boolean; updated_at: string }
export interface PermissionTableRow { id: string; key: string; description: string | null; created_at: string }
export interface PlannerTaskTableRow { id: string; student_id: string; course_id: string | null; title: string; description: string | null; task_type: string; due_at: string | null; is_completed: boolean; completed_at: string | null; created_at: string; updated_at: string }
export interface RolePermissionTableRow { role_id: string; permission_id: string }
export interface TournamentMatchAnswerTableRow { id: string; attempt_id: string; question_id: string; selected_option_id: string | null; selected_option_snapshot_id: string | null; answer_text: string | null; is_correct: boolean | null; answered_at: string }
export interface TournamentMatchQuestionTableRow { tournament_match_id: string; question_id: string; display_order: number; points: number; question_snapshot: Json | null; snapshot_version: number }
export interface TournamentMatchResultTableRow { id: string; tournament_match_id: string; participant_a_score: number | null; participant_b_score: number | null; team_a_score: number | null; team_b_score: number | null; outcome: string; reviewed_by: string | null; reason: string | null; result_version: number; created_at: string }
export interface TournamentMatchTableRow { id: string; tournament_round_id: string; participant_a_id: string | null; participant_b_id: string | null; winner_participant_id: string | null; status: MatchStatus; scheduled_at: string | null; started_at: string | null; completed_at: string | null; created_at: string; team_a_id: string | null; team_b_id: string | null; winner_team_id: string | null; next_match_id: string | null; next_slot: string | null; result_version: number }
export interface TournamentResultTableRow { id: string; tournament_id: string; student_id: string; final_rank: number | null; score: number | null; xp_awarded: number; published: boolean; created_at: string }
export interface TournamentTeamMatchAnswerTableRow { id: string; attempt_id: string; question_id: string; selected_option_id: string | null; selected_option_snapshot_id: string | null; answer_text: string | null; is_correct: boolean | null; answered_at: string }
export interface TournamentTeamParticipantTableRow { id: string; tournament_id: string; team_id: string; seed: number | null; group_key: string | null; registration_status: string; registered_at: string }
export interface WeeklyChallengeInstanceTableRow { id: string; series_id: string; competition_id: string; occurrence_key: string; scheduled_start_at: string; scheduled_end_at: string; generated_at: string }

export type DatabaseFunctionName =
  | "admin_create_exam"
  | "admin_update_exam"
  | "advance_group_stage_to_knockout"
  | "advance_team_group_stage_to_knockout"
  | "ci_award_xp"
  | "ci_complete_tournament_match_from_attempts"
  | "ci_complete_tournament_team_match"
  | "ci_evaluate_achievements"
  | "ci_level_for_xp"
  | "ci_notify_student"
  | "ci_question_options_public"
  | "ci_questions_public"
  | "ci_snapshot_competition_question"
  | "ci_unlock_achievement"
  | "ci_update_quest_progress"
  | "ci_update_streak"
  | "complete_lesson"
  | "create_competition_team"
  | "end_practice_session"
  | "enroll_in_course_offering"
  | "evaluate_answer"
  | "finalize_competition_results"
  | "finalize_team_tournament_standings"
  | "finalize_tournament_standings"
  | "generate_tournament_matches"
  | "generate_tournament_team_matches"
  | "generate_weekly_challenge_instance"
  | "get_competition_attempt_answers"
  | "get_competition_attempt_questions"
  | "get_competition_leaderboard"
  | "get_graded_attempt_correct_answers"
  | "get_question_explanation"
  | "get_tournament_match_attempt_answers"
  | "get_tournament_match_attempt_questions"
  | "get_tournament_team_match_attempt_answers"
  | "get_tournament_team_match_attempt_questions"
  | "grade_exam_attempt"
  | "has_role"
  | "invite_competition_team_member"
  | "is_admin"
  | "is_staff"
  | "is_super_admin"
  | "list_my_tournament_teams"
  | "lock_competition_team_rosters"
  | "mark_structured_exam_answer"
  | "publish_competition"
  | "publish_competition_results"
  | "publish_tournament"
  | "rebuild_competition_team_results"
  | "rebuild_department_competition_results"
  | "record_gamification_activity"
  | "record_tournament_match_result"
  | "register_for_competition"
  | "register_for_tournament"
  | "register_team_for_tournament"
  | "reschedule_tournament_match"
  | "resolve_competition_dispute"
  | "respond_competition_team_invite"
  | "run_weekly_challenge_scheduler"
  | "save_competition_answer"
  | "save_exam_answer"
  | "save_tournament_match_answer"
  | "save_tournament_team_match_answer"
  | "start_competition_attempt"
  | "start_exam_attempt"
  | "start_practice_session"
  | "start_tournament_match_attempt"
  | "start_tournament_team_match_attempt"
  | "submit_competition_attempt"
  | "submit_competition_dispute"
  | "submit_exam_attempt"
  | "submit_practice_answer"
  | "submit_tournament_match_attempt"
  | "submit_tournament_team_match_attempt"
  | "transition_tournament_status"
  | "withdraw_from_competition";

type Phase8FunctionCompatibility = {
  [FunctionName in DatabaseFunctionName]: { Args: Record<string, unknown>; Returns: unknown };
};

type Phase8FunctionOverrides = {
  admin_create_exam: { Args: { p_course_offering_id: string; p_title: string; p_description: string | null; p_exam_type: ExamType; p_duration_minutes: number; p_question_ids: string[]; p_difficulty?: DifficultyLevel; p_attempt_limit?: number | null; p_available_from?: string | null; p_available_until?: string | null }; Returns: unknown };
  admin_update_exam: { Args: { p_exam_id: string; p_title: string; p_description: string | null; p_exam_type: ExamType; p_duration_minutes: number; p_question_ids: string[]; p_difficulty?: DifficultyLevel; p_attempt_limit?: number | null; p_available_from?: string | null; p_available_until?: string | null }; Returns: unknown };
  advance_group_stage_to_knockout: { Args: { p_tournament_id: string }; Returns: unknown };
  advance_team_group_stage_to_knockout: { Args: { p_tournament_id: string }; Returns: unknown };
  create_competition_team: { Args: { p_competition_id: string; p_name: string; p_department_id?: string | null }; Returns: unknown };
  finalize_competition_results: { Args: { p_competition_id: string }; Returns: unknown };
  finalize_team_tournament_standings: { Args: { p_tournament_id: string }; Returns: unknown };
  finalize_tournament_standings: { Args: { p_tournament_id: string }; Returns: unknown };
  generate_tournament_matches: { Args: { p_tournament_id: string }; Returns: unknown };
  generate_tournament_team_matches: { Args: { p_tournament_id: string }; Returns: unknown };
  generate_weekly_challenge_instance: { Args: { p_series_id: string; p_scheduled_start: string; p_occurrence_key: string }; Returns: unknown };
  get_competition_attempt_answers: { Args: { p_attempt_id: string }; Returns: unknown };
  get_competition_attempt_questions: { Args: { p_attempt_id: string }; Returns: unknown };
  get_competition_leaderboard: { Args: { p_competition_id: string }; Returns: unknown };
  get_tournament_match_attempt_answers: { Args: { p_attempt_id: string }; Returns: unknown };
  get_tournament_match_attempt_questions: { Args: { p_attempt_id: string }; Returns: unknown };
  get_tournament_team_match_attempt_answers: { Args: { p_attempt_id: string }; Returns: unknown };
  get_tournament_team_match_attempt_questions: { Args: { p_attempt_id: string }; Returns: unknown };
  invite_competition_team_member: { Args: { p_team_id: string; p_student_id: string }; Returns: unknown };
  list_my_tournament_teams: { Args: { p_tournament_id: string }; Returns: unknown };
  lock_competition_team_rosters: { Args: { p_competition_id: string }; Returns: unknown };
  publish_competition: { Args: { p_competition_id: string }; Returns: unknown };
  publish_competition_results: { Args: { p_competition_id: string }; Returns: unknown };
  publish_tournament: { Args: { p_tournament_id: string }; Returns: unknown };
  rebuild_competition_team_results: { Args: { p_competition_id: string }; Returns: unknown };
  rebuild_department_competition_results: { Args: { p_competition_id: string }; Returns: unknown };
  record_tournament_match_result: { Args: { p_match_id: string; p_outcome: string; p_a_score: number | null; p_b_score: number | null; p_reason: string | null }; Returns: unknown };
  register_for_competition: { Args: { p_competition_id: string }; Returns: unknown };
  register_for_tournament: { Args: { p_tournament_id: string }; Returns: unknown };
  register_team_for_tournament: { Args: { p_tournament_id: string; p_team_id: string }; Returns: unknown };
  reschedule_tournament_match: { Args: { p_match_id: string; p_new_time: string; p_reason: string }; Returns: unknown };
  resolve_competition_dispute: { Args: { p_dispute_id: string; p_decision: string; p_resolution_note: string | null; p_new_score: number | null; p_new_accuracy: number | null }; Returns: unknown };
  respond_competition_team_invite: { Args: { p_team_id: string; p_accept: boolean }; Returns: unknown };
  save_competition_answer: { Args: { p_attempt_id: string; p_question_id: string; p_selected_option_id: string | null; p_answer_text: string | null }; Returns: unknown };
  save_tournament_match_answer: { Args: { p_attempt_id: string; p_question_id: string; p_selected_option_id: string | null; p_answer_text: string | null }; Returns: unknown };
  save_tournament_team_match_answer: { Args: { p_attempt_id: string; p_question_id: string; p_selected_option_id: string | null; p_answer_text: string | null }; Returns: unknown };
  start_competition_attempt: { Args: { p_competition_id: string }; Returns: unknown };
  start_tournament_match_attempt: { Args: { p_match_id: string }; Returns: unknown };
  start_tournament_team_match_attempt: { Args: { p_match_id: string }; Returns: unknown };
  submit_competition_attempt: { Args: { p_attempt_id: string }; Returns: unknown };
  submit_competition_dispute: { Args: { p_competition_result_id: string; p_reason: string; p_evidence_url: string | null }; Returns: unknown };
  submit_tournament_match_attempt: { Args: { p_attempt_id: string }; Returns: unknown };
  submit_tournament_team_match_attempt: { Args: { p_attempt_id: string }; Returns: unknown };
  transition_tournament_status: { Args: { p_tournament_id: string; p_new_status: TournamentStatus }; Returns: unknown };
  withdraw_from_competition: { Args: { p_competition_id: string }; Returns: unknown };
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      institutions: {
        Row: Institution;
        Insert: Partial<Institution>;
        Update: Partial<Institution>;
        Relationships: [];
      };
      faculties: {
        Row: Faculty;
        Insert: Partial<Faculty>;
        Update: Partial<Faculty>;
        Relationships: [];
      };
      departments: {
        Row: Department;
        Insert: Partial<Department>;
        Update: Partial<Department>;
        Relationships: [];
      };
      programmes: {
        Row: Programme;
        Insert: Partial<Programme>;
        Update: Partial<Programme>;
        Relationships: [];
      };
      levels: {
        Row: Level;
        Insert: Partial<Level>;
        Update: Partial<Level>;
        Relationships: [];
      };
      academic_sessions: {
        Row: AcademicSession;
        Insert: Partial<AcademicSession>;
        Update: Partial<AcademicSession>;
        Relationships: [];
      };
      semesters: {
        Row: Semester;
        Insert: Partial<Semester>;
        Update: Partial<Semester>;
        Relationships: [];
      };
      courses: {
        Row: Course;
        Insert: Partial<Course>;
        Update: Partial<Course>;
        Relationships: [];
      };
      course_offerings: {
        Row: CourseOffering;
        Insert: Partial<CourseOffering>;
        Update: Partial<CourseOffering>;
        Relationships: [
          { foreignKeyName: "course_offerings_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"]; },
          { foreignKeyName: "course_offerings_institution_id_fkey"; columns: ["institution_id"]; isOneToOne: false; referencedRelation: "institutions"; referencedColumns: ["id"]; },
          { foreignKeyName: "course_offerings_programme_id_fkey"; columns: ["programme_id"]; isOneToOne: false; referencedRelation: "programmes"; referencedColumns: ["id"]; },
          { foreignKeyName: "course_offerings_level_id_fkey"; columns: ["level_id"]; isOneToOne: false; referencedRelation: "levels"; referencedColumns: ["id"]; },
          { foreignKeyName: "course_offerings_semester_id_fkey"; columns: ["semester_id"]; isOneToOne: false; referencedRelation: "semesters"; referencedColumns: ["id"]; }
        ];
      };
      course_enrollments: {
        Row: CourseEnrollment;
        Insert: Partial<CourseEnrollment>;
        Update: Partial<CourseEnrollment>;
        Relationships: [];
      };
      course_topics: {
        Row: CourseTopic;
        Insert: Partial<CourseTopic>;
        Update: Partial<CourseTopic>;
        Relationships: [];
      };
      lessons: {
        Row: Lesson;
        Insert: Partial<Lesson>;
        Update: Partial<Lesson>;
        Relationships: [];
      };
      lesson_progress: {
        Row: LessonProgress;
        Insert: Partial<LessonProgress>;
        Update: Partial<LessonProgress>;
        Relationships: [];
      };
      topic_progress: {
        Row: TopicProgress;
        Insert: Partial<TopicProgress>;
        Update: Partial<TopicProgress>;
        Relationships: [];
      };
      materials: {
        Row: Material;
        Insert: Partial<Material>;
        Update: Partial<Material>;
        Relationships: [];
      };
      files: {
        Row: FileRecord;
        Insert: Partial<FileRecord>;
        Update: Partial<FileRecord>;
        Relationships: [];
      };
      xp_transactions: { Row: XpTransaction; Insert: Partial<XpTransaction>; Update: Partial<XpTransaction>; Relationships: []; };
      level_config: { Row: LevelConfig; Insert: Partial<LevelConfig>; Update: Partial<LevelConfig>; Relationships: []; };
      quests: { Row: Quest; Insert: Partial<Quest>; Update: Partial<Quest>; Relationships: []; };
      quest_progress: { Row: QuestProgress; Insert: Partial<QuestProgress>; Update: Partial<QuestProgress>; Relationships: []; };
      user_achievements: { Row: UserAchievement; Insert: Partial<UserAchievement>; Update: Partial<UserAchievement>; Relationships: []; };
      gamification_events: { Row: GamificationEvent; Insert: Partial<GamificationEvent>; Update: Partial<GamificationEvent>; Relationships: []; };
      user_xp: {
        Row: UserXp;
        Insert: Partial<UserXp>;
        Update: Partial<UserXp>;
        Relationships: [];
      };
      streaks: {
        Row: Streak;
        Insert: Partial<Streak>;
        Update: Partial<Streak>;
        Relationships: [];
      };
      achievements: {
        Row: Achievement;
        Insert: Partial<Achievement>;
        Update: Partial<Achievement>;
        Relationships: [];
      };
      platform_settings: {
        Row: PlatformSettings;
        Insert: Partial<PlatformSettings>;
        Update: Partial<PlatformSettings>;
        Relationships: [];
      };
      roles: {
        Row: Role;
        Insert: Partial<Role>;
        Update: Partial<Role>;
        Relationships: [];
      };
      user_roles: {
        Row: UserRoleGrant;
        Insert: Partial<UserRoleGrant> & { user_id: string; role_id: string };
        Update: Partial<UserRoleGrant>;
        Relationships: [];
      };
      admin_audit_logs: {
        Row: AdminAuditLog;
        Insert: Partial<AdminAuditLog>;
        Update: Partial<AdminAuditLog>;
        Relationships: [];
      };
      questions: {
        Row: Question;
        Insert: Partial<Question>;
        Update: Partial<Question>;
        Relationships: [];
      };
      question_options: {
        Row: QuestionOption;
        Insert: Partial<QuestionOption>;
        Update: Partial<QuestionOption>;
        Relationships: [];
      };
      past_questions: {
        Row: PastQuestion;
        Insert: Partial<PastQuestion>;
        Update: Partial<PastQuestion>;
        Relationships: [];
      };
      exams: {
        Row: Exam;
        Insert: Partial<Exam>;
        Update: Partial<Exam>;
        Relationships: [];
      };
      exam_questions: {
        Row: ExamQuestion;
        Insert: Partial<ExamQuestion> & { exam_id: string; question_id: string };
        Update: Partial<ExamQuestion>;
        Relationships: [];
      };
      exam_attempts: {
        Row: ExamAttempt;
        Insert: Partial<ExamAttempt>;
        Update: Partial<ExamAttempt>;
        Relationships: [];
      };
      exam_answers: {
        Row: ExamAnswer;
        Insert: Partial<ExamAnswer>;
        Update: Partial<ExamAnswer>;
        Relationships: [];
      };
      practice_sessions: {
        Row: PracticeSession;
        Insert: Partial<PracticeSession>;
        Update: Partial<PracticeSession>;
        Relationships: [];
      };
      practice_answers: {
        Row: PracticeAnswer;
        Insert: Partial<PracticeAnswer>;
        Update: Partial<PracticeAnswer>;
        Relationships: [];
      };
      competitions: { Row: CompetitionTableRow; Insert: Partial<CompetitionTableRow>; Update: Partial<CompetitionTableRow>; Relationships: []; };
      competition_attempts: { Row: CompetitionAttemptTableRow; Insert: Partial<CompetitionAttemptTableRow>; Update: Partial<CompetitionAttemptTableRow>; Relationships: []; };
      competition_participants: { Row: CompetitionParticipantTableRow; Insert: Partial<CompetitionParticipantTableRow>; Update: Partial<CompetitionParticipantTableRow>; Relationships: []; };
      competition_questions: { Row: CompetitionQuestionTableRow; Insert: Partial<CompetitionQuestionTableRow>; Update: Partial<CompetitionQuestionTableRow>; Relationships: []; };
      competition_results: { Row: CompetitionResultTableRow; Insert: Partial<CompetitionResultTableRow>; Update: Partial<CompetitionResultTableRow>; Relationships: []; };
      competition_scopes: { Row: CompetitionScopeTableRow; Insert: Partial<CompetitionScopeTableRow>; Update: Partial<CompetitionScopeTableRow>; Relationships: []; };
      competition_teams: { Row: CompetitionTeamTableRow; Insert: Partial<CompetitionTeamTableRow>; Update: Partial<CompetitionTeamTableRow>; Relationships: []; };
      competition_team_members: { Row: CompetitionTeamMemberTableRow; Insert: Partial<CompetitionTeamMemberTableRow>; Update: Partial<CompetitionTeamMemberTableRow>; Relationships: []; };
      competition_disputes: { Row: CompetitionDisputeTableRow; Insert: Partial<CompetitionDisputeTableRow>; Update: Partial<CompetitionDisputeTableRow>; Relationships: []; };
      notifications: { Row: NotificationTableRow; Insert: Partial<NotificationTableRow>; Update: Partial<NotificationTableRow>; Relationships: []; };
      study_sessions: { Row: StudySessionTableRow; Insert: Partial<StudySessionTableRow>; Update: Partial<StudySessionTableRow>; Relationships: []; };
      tournament_match_attempts: { Row: TournamentMatchAttemptTableRow; Insert: Partial<TournamentMatchAttemptTableRow>; Update: Partial<TournamentMatchAttemptTableRow>; Relationships: []; };
      tournament_participants: { Row: TournamentParticipantTableRow; Insert: Partial<TournamentParticipantTableRow>; Update: Partial<TournamentParticipantTableRow>; Relationships: []; };
      tournament_questions: { Row: TournamentQuestionTableRow; Insert: Partial<TournamentQuestionTableRow>; Update: Partial<TournamentQuestionTableRow>; Relationships: []; };
      tournament_rounds: { Row: TournamentRoundTableRow; Insert: Partial<TournamentRoundTableRow>; Update: Partial<TournamentRoundTableRow>; Relationships: []; };
      tournament_team_match_attempts: { Row: TournamentTeamMatchAttemptTableRow; Insert: Partial<TournamentTeamMatchAttemptTableRow>; Update: Partial<TournamentTeamMatchAttemptTableRow>; Relationships: []; };
      tournaments: { Row: TournamentTableRow; Insert: Partial<TournamentTableRow>; Update: Partial<TournamentTableRow>; Relationships: []; };
      weekly_challenge_series: { Row: WeeklyChallengeSeriesTableRow; Insert: Partial<WeeklyChallengeSeriesTableRow>; Update: Partial<WeeklyChallengeSeriesTableRow>; Relationships: []; };
      announcements: { Row: AnnouncementTableRow; Insert: Partial<AnnouncementTableRow>; Update: Partial<AnnouncementTableRow>; Relationships: []; };
      bookmarks: { Row: BookmarkTableRow; Insert: Partial<BookmarkTableRow>; Update: Partial<BookmarkTableRow>; Relationships: []; };
      competition_answers: { Row: CompetitionAnswerTableRow; Insert: Partial<CompetitionAnswerTableRow>; Update: Partial<CompetitionAnswerTableRow>; Relationships: []; };
      competition_rules: { Row: CompetitionRuleTableRow; Insert: Partial<CompetitionRuleTableRow>; Update: Partial<CompetitionRuleTableRow>; Relationships: []; };
      competition_score_corrections: { Row: CompetitionScoreCorrectionTableRow; Insert: Partial<CompetitionScoreCorrectionTableRow>; Update: Partial<CompetitionScoreCorrectionTableRow>; Relationships: []; };
      competition_team_results: { Row: CompetitionTeamResultTableRow; Insert: Partial<CompetitionTeamResultTableRow>; Update: Partial<CompetitionTeamResultTableRow>; Relationships: []; };
      department_competition_results: { Row: DepartmentCompetitionResultTableRow; Insert: Partial<DepartmentCompetitionResultTableRow>; Update: Partial<DepartmentCompetitionResultTableRow>; Relationships: []; };
      leaderboards: { Row: LeaderboardTableRow; Insert: Partial<LeaderboardTableRow>; Update: Partial<LeaderboardTableRow>; Relationships: []; };
      notes: { Row: NoteTableRow; Insert: Partial<NoteTableRow>; Update: Partial<NoteTableRow>; Relationships: []; };
      notification_preferences: { Row: NotificationPreferenceTableRow; Insert: Partial<NotificationPreferenceTableRow>; Update: Partial<NotificationPreferenceTableRow>; Relationships: []; };
      permissions: { Row: PermissionTableRow; Insert: Partial<PermissionTableRow>; Update: Partial<PermissionTableRow>; Relationships: []; };
      planner_tasks: { Row: PlannerTaskTableRow; Insert: Partial<PlannerTaskTableRow>; Update: Partial<PlannerTaskTableRow>; Relationships: []; };
      role_permissions: { Row: RolePermissionTableRow; Insert: Partial<RolePermissionTableRow>; Update: Partial<RolePermissionTableRow>; Relationships: []; };
      tournament_match_answers: { Row: TournamentMatchAnswerTableRow; Insert: Partial<TournamentMatchAnswerTableRow>; Update: Partial<TournamentMatchAnswerTableRow>; Relationships: []; };
      tournament_match_questions: { Row: TournamentMatchQuestionTableRow; Insert: Partial<TournamentMatchQuestionTableRow>; Update: Partial<TournamentMatchQuestionTableRow>; Relationships: []; };
      tournament_match_results: { Row: TournamentMatchResultTableRow; Insert: Partial<TournamentMatchResultTableRow>; Update: Partial<TournamentMatchResultTableRow>; Relationships: []; };
      tournament_matches: { Row: TournamentMatchTableRow; Insert: Partial<TournamentMatchTableRow>; Update: Partial<TournamentMatchTableRow>; Relationships: []; };
      tournament_results: { Row: TournamentResultTableRow; Insert: Partial<TournamentResultTableRow>; Update: Partial<TournamentResultTableRow>; Relationships: []; };
      tournament_team_match_answers: { Row: TournamentTeamMatchAnswerTableRow; Insert: Partial<TournamentTeamMatchAnswerTableRow>; Update: Partial<TournamentTeamMatchAnswerTableRow>; Relationships: []; };
      tournament_team_participants: { Row: TournamentTeamParticipantTableRow; Insert: Partial<TournamentTeamParticipantTableRow>; Update: Partial<TournamentTeamParticipantTableRow>; Relationships: []; };
      weekly_challenge_instances: { Row: WeeklyChallengeInstanceTableRow; Insert: Partial<WeeklyChallengeInstanceTableRow>; Update: Partial<WeeklyChallengeInstanceTableRow>; Relationships: []; };
    };
    Views: {
      questions_public: {
        Row: {
          id: string;
          course_id: string;
          topic_id: string | null;
          question_type: QuestionType;
          prompt: string;
          difficulty: DifficultyLevel;
          xp_value: number;
          status: ContentStatus;
          created_at: string;
        };
        Relationships: [];
      };
      question_options_public: {
        Row: {
          id: string;
          question_id: string;
          option_text: string;
          display_order: number;
        };
        Relationships: [];
      };
    };
    // Later-phase RPC names are enumerated in DatabaseFunctionName. Exact
    // argument shapes are defined for all existing core RPCs and frontend-used
    // Phase 7 RPCs; remaining exposed functions use a safe unknown return type
    // rather than a guessed result shape.
    Functions: {
      complete_lesson: { Args: { p_lesson_id: string }; Returns: LessonProgress; };
      record_gamification_activity: {
        Args: { p_activity_type: string; p_source_id: string };
        Returns: { awarded: boolean; xp_awarded?: number; total_xp?: number; level?: number; current_streak?: number; reason?: string };
      };
      start_exam_attempt: {
        Args: { p_exam_id: string };
        Returns: ExamAttempt;
      };
      enroll_in_course_offering: {
        Args: { p_course_offering_id: string };
        Returns: CourseEnrollment;
      };
      start_practice_session: {
        Args: { p_mode: PracticeMode; p_course_id: string; p_topic_id?: string | null };
        Returns: PracticeSession;
      };
      submit_practice_answer: {
        Args: { p_practice_session_id: string; p_question_id: string; p_selected_option_id?: string | null; p_answer_text?: string | null; p_response_time_ms?: number | null };
        Returns: PracticeAnswer;
      };
      end_practice_session: {
        Args: { p_practice_session_id: string };
        Returns: PracticeSession;
      };
      mark_structured_exam_answer: {
        Args: { p_answer_id: string; p_is_correct: boolean };
        Returns: ExamAttempt;
      };
      save_exam_answer: {
        Args: { p_attempt_id: string; p_question_id: string; p_selected_option_id?: string | null; p_answer_text?: string | null; p_response_time_ms?: number | null };
        Returns: ExamAnswer;
      };
      submit_exam_attempt: {
        Args: { p_attempt_id: string };
        Returns: ExamAttempt;
      };
      grade_exam_attempt: {
        Args: { p_attempt_id: string };
        Returns: ExamAttempt;
      };
      get_question_explanation: {
        Args: { p_question_id: string };
        Returns: string | null;
      };
      get_graded_attempt_correct_answers: {
        Args: { p_attempt_id: string };
        Returns: { r_question_id: string; r_option_id: string | null; r_answer_text: string | null }[];
      };
    } & Phase8FunctionCompatibility & Phase8FunctionOverrides;
    Enums: {
      user_role: UserRole;
      account_status: AccountStatus;
      content_status: ContentStatus;
      question_type: QuestionType;
      difficulty_level: DifficultyLevel;
      exam_type: ExamType;
      attempt_status: AttemptStatus;
      enrollment_status: EnrollmentStatus;
      practice_mode: PracticeMode;
      competition_status: CompetitionStatus;
      tournament_status: TournamentStatus;
      tournament_format: TournamentFormat;
      match_status: MatchStatus;
      leaderboard_scope: LeaderboardScope;
      announcement_audience: AnnouncementAudience;
      notification_type: NotificationType;
      xp_source: XpSource;
      quest_period: QuestPeriod;
      file_visibility: FileVisibility;
    };
    CompositeTypes: Record<string, never>;
  };
}
