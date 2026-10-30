import { HashRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { AdminRoute } from "@/app/router/AdminRoute";
import { ROUTES } from "@/app/router/routes";
import { StudentShell } from "@/components/navigation/StudentShell";
import { AdminShell } from "@/components/navigation/AdminShell";

import { LandingPage } from "@/pages/landing/LandingPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { OnboardingPage } from "@/pages/onboarding/OnboardingPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { CoursesPage } from "@/pages/courses/CoursesPage";
import { CourseDetailPage } from "@/pages/courses/CourseDetailPage";
import { TopicDetailPage } from "@/pages/courses/TopicDetailPage";
import { LessonDetailPage } from "@/pages/lessons/LessonDetailPage";
import { PracticePage } from "@/pages/practice/PracticePage";
import { PracticeQuestionsPage } from "@/pages/practice/PracticeQuestionsPage";
import { QuizPage } from "@/pages/practice/QuizPage";
import { PracticeSessionPage } from "@/pages/practice/PracticeSessionPage";
import { PastQuestionsPage } from "@/pages/past-questions/PastQuestionsPage";
import { ExamsPage } from "@/pages/exams/ExamsPage";
import { ExamDetailPage } from "@/pages/exams/ExamDetailPage";
import { ResultDetailPage } from "@/pages/results/ResultDetailPage";
import { AnalyticsPage } from "@/pages/analytics/AnalyticsPage";
import { SettingsIndexPage } from "@/pages/settings/SettingsIndexPage";
import { AcademicProfilePage } from "@/pages/settings/AcademicProfilePage";
import { SupportPage } from "@/pages/support/SupportPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminInstitutionsPage } from "@/pages/admin/academic/AdminInstitutionsPage";
import { AdminFacultiesPage } from "@/pages/admin/academic/AdminFacultiesPage";
import { AdminDepartmentsPage } from "@/pages/admin/academic/AdminDepartmentsPage";
import { AdminProgrammesPage } from "@/pages/admin/academic/AdminProgrammesPage";
import { AdminLevelsPage } from "@/pages/admin/academic/AdminLevelsPage";
import { AdminSessionsPage } from "@/pages/admin/academic/AdminSessionsPage";
import { AdminSemestersPage } from "@/pages/admin/academic/AdminSemestersPage";
import { AcademicStructureNav } from "@/pages/admin/academic/AcademicStructureNav";
import { AdminCoursesPage } from "@/pages/admin/courses/AdminCoursesPage";
import { AdminCourseOfferingsPage } from "@/pages/admin/courses/AdminCourseOfferingsPage";
import { AdminTopicsPage } from "@/pages/admin/courses/AdminTopicsPage";
import { AdminLessonsPage } from "@/pages/admin/courses/AdminLessonsPage";
import { AdminMaterialsPage } from "@/pages/admin/courses/AdminMaterialsPage";
import { AdminQuestionsPage } from "@/pages/admin/questions/AdminQuestionsPage";
import { AdminPastQuestionsPage } from "@/pages/admin/questions/AdminPastQuestionsPage";
import { AdminExamsPage } from "@/pages/admin/exams/AdminExamsPage";
import { AdminExamReviewPage } from "@/pages/admin/exams/AdminExamReviewPage";
import { NotFoundPage } from "@/pages/misc/NotFoundPage";
import { ComingSoonPage } from "@/pages/misc/ComingSoonPage";
import { AchievementsPage } from "@/pages/gamification/AchievementsPage";
import { ProfilePage } from "@/pages/gamification/ProfilePage";
import { AdminAchievementsPage } from "@/pages/admin/gamification/AdminAchievementsPage";
import { AdminQuestsPage } from "@/pages/admin/gamification/AdminQuestsPage";
import { AdminXpPage } from "@/pages/admin/gamification/AdminXpPage";
import { CompetitionsPage } from "@/pages/competitions/CompetitionsPage";
import { CompetitionDetailPage } from "@/pages/competitions/CompetitionDetailPage";
import { TournamentsPage } from "@/pages/tournaments/TournamentsPage";
import { TournamentDetailPage } from "@/pages/tournaments/TournamentDetailPage";
import { AdminCompetitionsPage } from "@/pages/admin/competitions/AdminCompetitionsPage";
import { AdminTournamentsPage } from "@/pages/admin/competitions/AdminTournamentsPage";
import { TournamentMatchAttemptPage } from "@/pages/tournaments/TournamentMatchAttemptPage";
import { NotificationsPage } from "@/pages/notifications/NotificationsPage";

/** Every student route the Master Spec lists that isn't built yet in this
 * phase, mapped to the phase that builds it — see README "Phase plan". */
const STUDENT_COMING_SOON: Array<{ path: string; title: string; phase: string }> = [
  { path: ROUTES.planner, title: "Planner", phase: "Phase 4 follow-up" },
  { path: ROUTES.notes, title: "Notes", phase: "Phase 4 follow-up" },
  { path: ROUTES.bookmarks, title: "Bookmarks", phase: "Phase 4 follow-up" },
];

const ADMIN_COMING_SOON: Array<{ path: string; title: string; phase: string }> = [
  { path: ROUTES.adminUsers, title: "Users", phase: "Phase 9" },
  { path: ROUTES.adminAnnouncements, title: "Announcements", phase: "Phase 9" },
  { path: ROUTES.adminNotifications, title: "Notifications", phase: "Phase 9" },
  { path: ROUTES.adminFiles, title: "Files", phase: "Phase 9" },
  { path: ROUTES.adminLeaderboards, title: "Leaderboards", phase: "Phase 7" },
  { path: ROUTES.adminAuditLogs, title: "Audit logs", phase: "Phase 9" },
  { path: ROUTES.adminSettings, title: "Platform settings", phase: "Phase 9" },
];

export function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path={ROUTES.home} element={<LandingPage />} />
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.register} element={<RegisterPage />} />
        <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />
        <Route path={ROUTES.support} element={<SupportPage />} />

        {/* Onboarding — protected, but intentionally has no StudentShell
            (nothing to navigate to until it's complete) */}
        <Route
          path={ROUTES.onboarding}
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />

        {/* Student app */}
        <Route
          path={ROUTES.dashboard}
          element={
            <ProtectedRoute>
              <StudentShell>
                <DashboardPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.courses}
          element={
            <ProtectedRoute>
              <StudentShell>
                <CoursesPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.courseDetail}
          element={
            <ProtectedRoute>
              <StudentShell>
                <CourseDetailPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.topicDetail}
          element={
            <ProtectedRoute>
              <StudentShell>
                <TopicDetailPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.lessonDetail}
          element={
            <ProtectedRoute>
              <StudentShell>
                <LessonDetailPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.practice}
          element={
            <ProtectedRoute>
              <StudentShell>
                <PracticePage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.practiceQuestions}
          element={
            <ProtectedRoute>
              <StudentShell>
                <PracticeQuestionsPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.practiceQuiz}
          element={
            <ProtectedRoute>
              <StudentShell>
                <QuizPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.practiceSession}
          element={
            <ProtectedRoute>
              <StudentShell>
                <PracticeSessionPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.pastQuestions}
          element={
            <ProtectedRoute>
              <StudentShell>
                <PastQuestionsPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.exams}
          element={
            <ProtectedRoute>
              <StudentShell>
                <ExamsPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.examDetail}
          element={
            <ProtectedRoute>
              <StudentShell>
                <ExamDetailPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.resultDetail}
          element={
            <ProtectedRoute>
              <StudentShell>
                <ResultDetailPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.analytics}
          element={
            <ProtectedRoute>
              <StudentShell>
                <AnalyticsPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.notifications}
          element={
            <ProtectedRoute>
              <StudentShell>
                <NotificationsPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.settings}
          element={
            <ProtectedRoute>
              <StudentShell>
                <SettingsIndexPage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.settingsAcademicProfile}
          element={
            <ProtectedRoute>
              <StudentShell>
                <AcademicProfilePage />
              </StudentShell>
            </ProtectedRoute>
          }
        />
        <Route path={ROUTES.achievements} element={<ProtectedRoute><StudentShell><AchievementsPage /></StudentShell></ProtectedRoute>} />
        <Route path={ROUTES.profile} element={<ProtectedRoute><StudentShell><ProfilePage /></StudentShell></ProtectedRoute>} />
        <Route path={ROUTES.competitions} element={<ProtectedRoute><StudentShell><CompetitionsPage /></StudentShell></ProtectedRoute>} />
        <Route path={ROUTES.competitionDetail} element={<ProtectedRoute><StudentShell><CompetitionDetailPage /></StudentShell></ProtectedRoute>} />
        <Route path={ROUTES.tournaments} element={<ProtectedRoute><StudentShell><TournamentsPage /></StudentShell></ProtectedRoute>} />
        <Route path={ROUTES.tournamentDetail} element={<ProtectedRoute><StudentShell><TournamentDetailPage /></StudentShell></ProtectedRoute>} />
        <Route path={ROUTES.tournamentMatchDetail} element={<ProtectedRoute><StudentShell><TournamentMatchAttemptPage /></StudentShell></ProtectedRoute>} />

        {STUDENT_COMING_SOON.map(({ path, title, phase }) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute>
                <StudentShell>
                  <ComingSoonPage title={title} phase={phase} />
                </StudentShell>
              </ProtectedRoute>
            }
          />
        ))}

        {/* Admin */}
        <Route
          path={ROUTES.admin}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminDashboardPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
  path={ROUTES.adminInstitutions}
  element={
    <AdminRoute>
      <AdminShell>
        <>
          <AcademicStructureNav />
          <AdminInstitutionsPage />
        </>
      </AdminShell>
    </AdminRoute>
  }
/>
        <Route
  path={ROUTES.adminFaculties}
  element={
    <AdminRoute>
      <AdminShell>
        <>
          <AcademicStructureNav />
          <AdminFacultiesPage />
        </>
      </AdminShell>
    </AdminRoute>
  }
/>
        <Route
  path={ROUTES.adminDepartments}
  element={
    <AdminRoute>
      <AdminShell>
        <>
          <AcademicStructureNav />
          <AdminDepartmentsPage />
        </>
      </AdminShell>
    </AdminRoute>
  }
/>
        <Route
  path={ROUTES.adminProgrammes}
  element={
    <AdminRoute>
      <AdminShell>
        <>
          <AcademicStructureNav />
          <AdminProgrammesPage />
        </>
      </AdminShell>
    </AdminRoute>
  }
/>
 <Route
          path={ROUTES.adminLevels}
          element={
            <AdminRoute>
              <AdminShell>
                <>
                  <AcademicStructureNav />
                  <AdminLevelsPage />
                </>
              </AdminShell>
            </AdminRoute>
          }
        />

        <Route
          path={ROUTES.adminSessions}
          element={
            <AdminRoute>
              <AdminShell>
                <>
                  <AcademicStructureNav />
                  <AdminSessionsPage />
                </>
              </AdminShell>
            </AdminRoute>
          }
        />

        <Route
          path={ROUTES.adminSemesters}
          element={
            <AdminRoute>
              <AdminShell>
                <>
                  <AcademicStructureNav />
                  <AdminSemestersPage />
                </>
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
          path={ROUTES.adminCourses}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminCoursesPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
          path={ROUTES.adminCourseOfferings}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminCourseOfferingsPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
          path={ROUTES.adminTopics}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminTopicsPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
          path={ROUTES.adminLessons}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminLessonsPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
          path={ROUTES.adminMaterials}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminMaterialsPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
          path={ROUTES.adminQuestions}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminQuestionsPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
          path={ROUTES.adminPastQuestions}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminPastQuestionsPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
          path={ROUTES.adminExams}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminExamsPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route
          path={ROUTES.adminExamReview}
          element={
            <AdminRoute>
              <AdminShell>
                <AdminExamReviewPage />
              </AdminShell>
            </AdminRoute>
          }
        />
        <Route path={ROUTES.adminAchievements} element={<AdminRoute><AdminShell><AdminAchievementsPage /></AdminShell></AdminRoute>} />
        <Route path={ROUTES.adminQuests} element={<AdminRoute><AdminShell><AdminQuestsPage /></AdminShell></AdminRoute>} />
        <Route path={ROUTES.adminXp} element={<AdminRoute><AdminShell><AdminXpPage /></AdminShell></AdminRoute>} />
        <Route path={ROUTES.adminCompetitions} element={<AdminRoute><AdminShell><AdminCompetitionsPage /></AdminShell></AdminRoute>} />
        <Route path={ROUTES.adminTournaments} element={<AdminRoute><AdminShell><AdminTournamentsPage /></AdminShell></AdminRoute>} />

        {ADMIN_COMING_SOON.map(({ path, title, phase }) => (
          <Route
            key={path}
            path={path}
            element={
              <AdminRoute>
                <AdminShell>
                  <ComingSoonPage title={title} phase={phase} />
                </AdminShell>
              </AdminRoute>
            }
          />
        ))}

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}
