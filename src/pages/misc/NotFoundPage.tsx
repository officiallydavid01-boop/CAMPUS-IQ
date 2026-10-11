import { Link } from "react-router-dom";
import { HolographicBrain } from "@/components/branding/HolographicBrain";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/app/router/routes";

export function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-6)",
        textAlign: "center",
        padding: "var(--space-6)",
      }}
    >
      <HolographicBrain size={56} animated={false} />
      <div>
        <h1 style={{ fontSize: "var(--text-3xl)" }}>404</h1>
        <p style={{ color: "var(--text-secondary)" }}>This page doesn't exist.</p>
      </div>
      <Link to={ROUTES.dashboard}>
        <Button>Back to CampusIQ</Button>
      </Link>
    </div>
  );
}
