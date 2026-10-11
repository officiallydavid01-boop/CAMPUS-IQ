-- CampusIQ — Migration 013: Indexes
--
-- Primary keys and UNIQUE constraints already create indexes automatically
-- (see 003-011). This migration adds indexes for the query patterns the
-- application actually uses: foreign-key lookups that aren't already
-- covered by a unique constraint, status filters on content tables, and
-- trigram indexes for search.

-- Foreign-key / hierarchy lookups
create index idx_faculties_institution on public.faculties(institution_id);
create index idx_departments_faculty on public.departments(faculty_id);
create index idx_programmes_department on public.programmes(department_id);
create index idx_levels_programme on public.levels(programme_id);
create index idx_semesters_session on public.semesters(academic_session_id);

create index idx_profiles_institution on public.profiles(institution_id);
create index idx_profiles_department on public.profiles(department_id);
create index idx_profiles_programme on public.profiles(programme_id);
create index idx_profiles_current_context
  on public.profiles(programme_id, level_id, current_session_id, current_semester_id);

create index idx_course_offerings_course on public.course_offerings(course_id);
create index idx_course_offerings_programme_level_semester
  on public.course_offerings(programme_id, level_id, semester_id);
-- Covers the core "student course filtering" query from
-- docs/database-architecture.md: WHERE institution_id = ... AND
-- programme_id = ... AND level_id = ... AND semester_id = ... AND
-- status = 'published' — i.e. exactly the lookup the student's Courses
-- page runs every time their current academic context changes.
create index idx_course_offerings_student_context
  on public.course_offerings(institution_id, programme_id, level_id, semester_id, status);
create index idx_course_enrollments_offering on public.course_enrollments(course_offering_id);
create index idx_course_enrollments_student on public.course_enrollments(student_id);

create index idx_course_topics_course on public.course_topics(course_id);
create index idx_lessons_topic on public.lessons(topic_id);
create index idx_materials_lesson on public.materials(lesson_id);
create index idx_materials_offering on public.materials(course_offering_id);

create index idx_lesson_progress_student on public.lesson_progress(student_id);
create index idx_topic_progress_student on public.topic_progress(student_id);

create index idx_questions_course on public.questions(course_id);
create index idx_questions_topic on public.questions(topic_id);
create index idx_question_options_question on public.question_options(question_id);
create index idx_past_questions_course on public.past_questions(course_id);

create index idx_exams_offering on public.exams(course_offering_id);
create index idx_exam_attempts_student on public.exam_attempts(student_id);
create index idx_exam_attempts_exam on public.exam_attempts(exam_id);
create index idx_exam_answers_attempt on public.exam_answers(exam_attempt_id);

create index idx_practice_sessions_student on public.practice_sessions(student_id);
create index idx_practice_answers_session on public.practice_answers(practice_session_id);

create index idx_notes_student on public.notes(student_id);
create index idx_bookmarks_student on public.bookmarks(student_id);
create index idx_planner_tasks_student_due on public.planner_tasks(student_id, due_at);

create index idx_xp_transactions_student on public.xp_transactions(student_id);
create index idx_user_achievements_student on public.user_achievements(student_id);
create index idx_quest_progress_student on public.quest_progress(student_id, period_start);

create index idx_competitions_status_window on public.competitions(status, starts_at, ends_at);
create index idx_competition_participants_competition on public.competition_participants(competition_id);
create index idx_competition_attempts_competition on public.competition_attempts(competition_id);
create index idx_competition_results_competition on public.competition_results(competition_id);

create index idx_tournaments_status_window on public.tournaments(status, starts_at, ends_at);
create index idx_tournament_participants_tournament on public.tournament_participants(tournament_id);
create index idx_tournament_rounds_tournament on public.tournament_rounds(tournament_id);
create index idx_tournament_matches_round on public.tournament_matches(tournament_round_id);
create index idx_tournament_results_tournament on public.tournament_results(tournament_id);

create index idx_leaderboards_scope on public.leaderboards(scope, scope_ref_id, rank);

create index idx_notifications_student_unread on public.notifications(student_id, is_read);
create index idx_announcements_status_publish on public.announcements(status, publish_at);
create index idx_files_related on public.files(related_type, related_id);

create index idx_audit_logs_entity on public.admin_audit_logs(entity_type, entity_id);
create index idx_audit_logs_actor on public.admin_audit_logs(actor_id);

-- Status filters that gate almost every student-facing SELECT
create index idx_courses_status on public.courses(status);
create index idx_course_offerings_status on public.course_offerings(status);
create index idx_course_topics_status on public.course_topics(status);
create index idx_lessons_status on public.lessons(status);
create index idx_questions_status on public.questions(status);
create index idx_exams_status on public.exams(status);

-- Full-text-ish search (Admin CMS search, student course/lesson search)
create index idx_courses_title_trgm on public.courses using gin (title gin_trgm_ops);
create index idx_courses_code_trgm on public.courses using gin (course_code gin_trgm_ops);
create index idx_lessons_title_trgm on public.lessons using gin (title gin_trgm_ops);
