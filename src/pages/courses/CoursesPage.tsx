import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { getMyProfile } from "@/services/academic/academicService";
import { getCourseOfferingsForContext, enrollInOffering, listMyEnrollments } from "@/services/courses/coursesService";
import { ROUTES } from "@/app/router/routes";
import type { CourseOfferingWithCourse, Profile } from "@/types/database.types";

/**
 * "Student course filtering" in action: this page's entire content is
 * `getCourseOfferingsForContext(profile's current institution/programme/
 * level/semester)` — no hardcoded course list, no client-side filtering
 * of an over-fetched set. Changing context in Settings and coming back
 * here shows a different list automatically (see
 * services/courses/coursesService.ts and the design note in
 * supabase/migrations/004_academic_structure.sql).
 */
export function CoursesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offerings, setOfferings] = useState<CourseOfferingWithCourse[]>([]);
  const [enrolledOfferingIds, setEnrolledOfferingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setIsLoading(true);
      try {
        const myProfile = await getMyProfile(user.id);
        setProfile(myProfile);
        if (myProfile?.institution_id && myProfile.programme_id && myProfile.level_id && myProfile.current_semester_id) {
          const [rows, enrollments] = await Promise.all([
            getCourseOfferingsForContext({
              institutionId: myProfile.institution_id,
              programmeId: myProfile.programme_id,
              levelId: myProfile.level_id,
              semesterId: myProfile.current_semester_id,
            }),
            listMyEnrollments(user.id),
          ]);
          setOfferings(rows);
          setEnrolledOfferingIds(
            new Set(
              enrollments
                .map((e) => (e as unknown as { course_offering_id: string }).course_offering_id)
                .filter(Boolean)
            )
          );
        }
      } catch {
        showToast("Couldn't load your courses.", "error");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user, showToast]);

  async function handleEnroll(offeringId: string) {
    if (!user) return;
    setEnrollingId(offeringId);
    try {
      await enrollInOffering(user.id, offeringId);
      setEnrolledOfferingIds((prev) => new Set(prev).add(offeringId));
      showToast("Enrolled.", "success");
    } catch {
      showToast("Couldn't enroll in that course.", "error");
    } finally {
      setEnrollingId(null);
    }
  }

  if (!isLoading && !profile?.onboarding_completed_at) {
    return <Navigate to={ROUTES.onboarding} replace />;
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-2)" }}>Courses</h1>
      <p style={{ marginBottom: "var(--space-6)" }}>Showing courses for your current academic context.</p>

      {isLoading ? (
        <GlassCard>
          <SkeletonText lines={4} />
        </GlassCard>
      ) : offerings.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={BookOpen}
            title="No courses found for your current context."
            description="Your institution hasn't published any course offerings for this programme, level and semester yet."
          />
        </GlassCard>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--space-4)" }}>
          {offerings.map((offering) => {
            const isEnrolled = enrolledOfferingIds.has(offering.id);
            return (
              <GlassCard key={offering.id} className="stack" style={{ gap: "var(--space-3)" }}>
                <Badge tone="accent">{offering.course.course_code}</Badge>
                <h2 style={{ fontSize: "var(--text-lg)" }}>{offering.course.title}</h2>
                {offering.course.description && (
                  <p style={{ fontSize: "var(--text-sm)" }}>{offering.course.description}</p>
                )}
                <div className="cluster" style={{ gap: "var(--space-2)", marginTop: "auto" }}>
                  {isEnrolled ? (
                    <Link to={ROUTES.courseDetail.replace(":id", offering.id)}>
                      <Button size="sm">Continue</Button>
                    </Link>
                  ) : (
                    <Button size="sm" variant="secondary" isLoading={enrollingId === offering.id} onClick={() => handleEnroll(offering.id)}>
                      Enroll
                    </Button>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
