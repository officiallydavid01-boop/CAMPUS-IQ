import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SkeletonText } from "@/components/ui/Skeleton";
import { AcademicContextForm } from "@/features/academic/AcademicContextForm";
import { useAuth } from "@/app/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { getMyProfile, updateCurrentAcademicContext, type AcademicContext } from "@/services/academic/academicService";
import type { Profile } from "@/types/database.types";

/**
 * "Settings -> Academic Profile -> Change Academic Context" (Master Spec:
 * a student's account is permanent; only their *current* context changes,
 * and changing it must never touch past enrollments/progress — see the
 * design note on profiles in supabase/migrations/004_academic_structure.sql).
 * This page only ever writes to the profile's current_* columns; every
 * historical table is untouched by anything on this screen.
 */
export function AcademicProfilePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyProfile(user.id)
      .then(setProfile)
      .catch(() => showToast("Couldn't load your academic profile.", "error"))
      .finally(() => setIsLoading(false));
  }, [user, showToast]);

  async function handleSubmit(context: AcademicContext) {
    if (!user) return;
    const updated = await updateCurrentAcademicContext(user.id, context);
    setProfile(updated);
    setIsEditing(false);
    showToast("Academic context updated.", "success");
  }

  const hasContext = Boolean(profile?.programme_id && profile?.level_id && profile?.current_semester_id);

  // Bug fix: previously this screen never passed the student's existing
  // selections into the form, so "Change Academic Context" forced a full
  // re-pick from Institution down even for a one-field change like
  // advancing to next semester — unnecessary friction for a legitimate,
  // routine transfer/progression. AcademicContextForm's cascading
  // useEffects already fire correctly on mount when given a starting
  // value (they don't require a user-driven change to run), so passing
  // this is the whole fix.
  const initialContext = profile
    ? {
        institutionId: profile.institution_id ?? undefined,
        facultyId: profile.faculty_id ?? undefined,
        departmentId: profile.department_id ?? undefined,
        programmeId: profile.programme_id ?? undefined,
        levelId: profile.level_id ?? undefined,
        sessionId: profile.current_session_id ?? undefined,
        semesterId: profile.current_semester_id ?? undefined,
      }
    : undefined;

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "640px" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Academic profile</h1>

      <GlassCard>
        {isLoading ? (
          <SkeletonText lines={4} />
        ) : isEditing || !hasContext ? (
          <AcademicContextForm
            initialContext={initialContext}
            submitLabel={hasContext ? "Save changes" : "Save academic context"}
            onSubmit={handleSubmit}
          />
        ) : (
          <div className="stack" style={{ gap: "var(--space-4)" }}>
            <p style={{ color: "var(--text-secondary)" }}>
              Your current academic context determines which course offerings you see. It does not affect your past
              course history, progress, or results — those stay exactly as they are.
            </p>
            <div className="cluster" style={{ gap: "var(--space-2)" }}>
              <Badge tone="accent">Context set</Badge>
            </div>
            <Button variant="secondary" onClick={() => setIsEditing(true)} style={{ alignSelf: "flex-start" }}>
              Change academic context
            </Button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
