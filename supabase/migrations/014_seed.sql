-- CampusIQ — Migration 014: Seed data
--
-- Everything in this file is clearly-labeled DEMO data (Master Spec
-- section 16 / section 76 "SEEDING"): a fictional "CampusIQ Demo
-- University" with one faculty/department/programme, three levels and
-- two semesters, and a handful of made-up course codes. None of it is a
-- real institution's real academic structure, and none of it should ship
-- to a production project — see the README for how to skip this file
-- when applying migrations to a live deployment.
--
-- It exists for two reasons:
--   1. So `npm run dev` shows a working app immediately, without an Admin
--      having configured anything yet.
--   2. So the level+semester-specific Course Offering behavior described
--      in the "IMPORTANT CLARIFICATION" requirement is demonstrated
--      concretely and can be exercised/tested end to end.
--
-- Catalogue data (roles, permissions, level_config, default
-- platform_settings) is NOT demo data — it is real configuration every
-- CampusIQ deployment needs, seeded here for convenience.

-- ---------------------------------------------------------------------
-- Roles & permissions catalogue (real, not demo)
-- ---------------------------------------------------------------------
insert into public.roles (name, description) values
  ('super_admin', 'Full operational control of the CampusIQ ecosystem.'),
  ('admin', 'Broad Admin CMS access; cannot manage roles/permissions.'),
  ('content_editor', 'Manages academic content: courses, topics, lessons, materials, questions, exams, competitions, tournaments.'),
  ('moderator', 'Manages users, moderation and announcements.'),
  ('student', 'Default role for every registered account.')
on conflict (name) do nothing;

insert into public.permissions (key, description) values
  ('academic_structure.manage', 'Create/edit institutions, faculties, departments, programmes, levels, sessions, semesters'),
  ('courses.manage', 'Create/edit courses, course offerings, topics, lessons, materials'),
  ('questions.manage', 'Create/edit question bank, past questions, exams'),
  ('competitions.manage', 'Create/edit/run competitions and weekly challenges'),
  ('tournaments.manage', 'Create/edit/run tournaments'),
  ('users.manage', 'View/search users, change account status'),
  ('gamification.manage', 'Configure XP levels, achievements, quests'),
  ('announcements.manage', 'Create/publish announcements and notifications'),
  ('platform_settings.manage', 'Change platform-wide settings'),
  ('roles.manage', 'Grant/revoke roles (super_admin only, enforced by RLS)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- CampusIQ level configuration (real; a simple, tweakable XP curve)
-- ---------------------------------------------------------------------
insert into public.level_config (level, xp_required, title) values
  (1, 0, 'Fresher'),
  (2, 100, 'Learner'),
  (3, 250, 'Scholar'),
  (4, 500, 'Analyst'),
  (5, 900, 'Strategist'),
  (6, 1400, 'Specialist'),
  (7, 2000, 'Expert'),
  (8, 2800, 'Master'),
  (9, 3800, 'Sage'),
  (10, 5000, 'Luminary')
on conflict (level) do nothing;

-- ---------------------------------------------------------------------
-- Default platform settings (real)
-- ---------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('platform_name', '"CampusIQ"', 'Displayed app name'),
  ('support_email', '"officiallydavid01@gmail.com"', 'Support contact email'),
  ('support_whatsapp', '"09126122448"', 'Support contact WhatsApp number'),
  ('maintenance_mode', 'false', 'When true, show a maintenance banner/block student access'),
  ('maintenance_message', '""', 'Message shown when maintenance_mode is true'),
  ('default_lesson_xp', '10', 'Default XP awarded for a first-time lesson completion'),
  ('default_question_xp', '5', 'Default XP value for a newly created question')
on conflict (key) do nothing;

-- Starter achievement catalogue (real, matches Master Spec section 40)
insert into public.achievements (code, title, description, xp_reward) values
  ('first_lesson', 'First Lesson', 'Complete your first lesson.', 20),
  ('first_exam', 'First Exam', 'Complete your first exam.', 20),
  ('ten_lessons', '10 Lessons', 'Complete 10 lessons.', 50),
  ('hundred_questions', '100 Questions', 'Answer 100 practice/exam questions.', 75),
  ('perfect_score', 'Perfect Score', 'Score 100% on an exam.', 100),
  ('seven_day_streak', '7-Day Streak', 'Maintain a 7-day activity streak.', 75),
  ('competition_participant', 'Competition Participant', 'Take part in a CampusIQ competition.', 30),
  ('tournament_participant', 'Tournament Participant', 'Take part in a CampusIQ tournament.', 30)
on conflict (code) do nothing;

-- ======================================================================
-- DEMO DATA — fictional, for local development only
-- ======================================================================

do $$
declare
  v_institution_id uuid;
  v_faculty_id uuid;
  v_department_id uuid;
  v_programme_id uuid;
  v_level_100 uuid;
  v_level_200 uuid;
  v_level_300 uuid;
  v_session_id uuid;
  v_semester_1 uuid;
  v_semester_2 uuid;
  v_csc101 uuid;
  v_mth101 uuid;
  v_phy101 uuid;
  v_csc201 uuid;
  v_csc202 uuid;
  v_csc301 uuid;
begin
  insert into public.institutions (name, short_name, country, is_active)
  values ('CampusIQ Demo University [DEMO]', 'CIQ-DEMO', 'Demo', true)
  returning id into v_institution_id;

  insert into public.faculties (institution_id, name, code)
  values (v_institution_id, 'Faculty of Science [DEMO]', 'SCI')
  returning id into v_faculty_id;

  insert into public.departments (faculty_id, name, code)
  values (v_faculty_id, 'Department of Computer Science [DEMO]', 'CSC')
  returning id into v_department_id;

  insert into public.programmes (department_id, name, code, degree_type, duration_years)
  values (v_department_id, 'B.Sc. Computer Science [DEMO]', 'BSC-CSC', 'Bachelor', 4)
  returning id into v_programme_id;

  insert into public.levels (programme_id, name, numeric_value)
  values (v_programme_id, '100 Level', 100) returning id into v_level_100;
  insert into public.levels (programme_id, name, numeric_value)
  values (v_programme_id, '200 Level', 200) returning id into v_level_200;
  insert into public.levels (programme_id, name, numeric_value)
  values (v_programme_id, '300 Level', 300) returning id into v_level_300;

  insert into public.academic_sessions (institution_id, name, is_current)
  values (v_institution_id, '2026/2027 [DEMO]', true)
  returning id into v_session_id;

  insert into public.semesters (academic_session_id, name, numeric_value)
  values (v_session_id, 'First Semester', 1) returning id into v_semester_1;
  insert into public.semesters (academic_session_id, name, numeric_value)
  values (v_session_id, 'Second Semester', 2) returning id into v_semester_2;

  insert into public.courses (course_code, title, description, credit_units, course_type, department_id, status)
  values ('CSC101 [DEMO]', 'Introduction to Computer Science', 'Demo seed course.', 3, 'core', v_department_id, 'published')
  returning id into v_csc101;
  insert into public.courses (course_code, title, description, credit_units, course_type, department_id, status)
  values ('MTH101 [DEMO]', 'General Mathematics I', 'Demo seed course.', 3, 'core', v_department_id, 'published')
  returning id into v_mth101;
  insert into public.courses (course_code, title, description, credit_units, course_type, department_id, status)
  values ('PHY101 [DEMO]', 'General Physics I', 'Demo seed course.', 3, 'core', v_department_id, 'published')
  returning id into v_phy101;
  insert into public.courses (course_code, title, description, credit_units, course_type, department_id, status)
  values ('CSC201 [DEMO]', 'Data Structures', 'Demo seed course.', 3, 'core', v_department_id, 'published')
  returning id into v_csc201;
  insert into public.courses (course_code, title, description, credit_units, course_type, department_id, status)
  values ('CSC202 [DEMO]', 'Object-Oriented Programming', 'Demo seed course.', 3, 'core', v_department_id, 'published')
  returning id into v_csc202;
  insert into public.courses (course_code, title, description, credit_units, course_type, department_id, status)
  values ('CSC301 [DEMO]', 'Database Systems', 'Demo seed course.', 3, 'core', v_department_id, 'published')
  returning id into v_csc301;

  -- Exactly the level + semester matrix from the "IMPORTANT CLARIFICATION"
  -- requirement, so a demo student in 100L/1st sees a different course
  -- list than one in 100L/2nd, 200L/1st, etc.
  insert into public.course_offerings (course_id, institution_id, programme_id, level_id, semester_id, status)
  values
    (v_csc101, v_institution_id, v_programme_id, v_level_100, v_semester_1, 'published'),
    (v_mth101, v_institution_id, v_programme_id, v_level_100, v_semester_1, 'published'),
    (v_phy101, v_institution_id, v_programme_id, v_level_100, v_semester_2, 'published'),
    (v_csc201, v_institution_id, v_programme_id, v_level_200, v_semester_1, 'published'),
    (v_csc202, v_institution_id, v_programme_id, v_level_200, v_semester_2, 'published'),
    (v_csc301, v_institution_id, v_programme_id, v_level_300, v_semester_1, 'published');
end;
$$;
