import { EmptyState } from "@/components/ui/EmptyState";
import { Clock } from "lucide-react";

/**
 * Honest placeholder for every route the Master Specification defines but
 * whose feature belongs to a later phase (see the phase plan in the
 * project README). No fake data, no dead buttons pretending to work —
 * just a clear "not built yet" state, per Master Spec section 3 ("if a
 * feature cannot reasonably be completed, document the limitation instead
 * of pretending it works").
 */
export function ComingSoonPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="container" style={{ paddingBlock: "var(--space-12)" }}>
      <EmptyState
        icon={Clock}
        title={`${title} is coming in ${phase}`}
        description="This route and its database tables already exist — the feature itself is built in a later phase of the CampusIQ roadmap."
      />
    </div>
  );
}
