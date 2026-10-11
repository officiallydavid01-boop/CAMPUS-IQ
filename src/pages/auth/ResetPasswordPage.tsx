import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "@/pages/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { updatePassword } from "@/services/auth/authService";
import { ROUTES } from "@/app/router/routes";

/**
 * Reached via the emailed reset link (Supabase redirects here with a
 * recovery token in the URL, which supabase-js's detectSessionInUrl
 * already handled by the time this component mounts — see
 * services/supabase/client.ts).
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await updatePassword(password);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(ROUTES.dashboard, { replace: true });
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={handleSubmit} className="stack" style={{ gap: "var(--space-4)" }}>
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" style={{ color: "var(--color-error)", fontSize: "var(--text-sm)" }}>
            {error}
          </p>
        )}
        <Button type="submit" isLoading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
