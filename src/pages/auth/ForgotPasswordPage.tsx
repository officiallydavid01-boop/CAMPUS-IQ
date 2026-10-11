import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/pages/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { requestPasswordReset } from "@/services/auth/authService";
import { ROUTES } from "@/app/router/routes";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await requestPasswordReset(email);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthLayout title="Check your email" subtitle="If an account exists for that address, a reset link is on its way.">
        <Link to={ROUTES.login}>Back to login</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we'll send you a reset link.">
      <form onSubmit={handleSubmit} className="stack" style={{ gap: "var(--space-4)" }}>
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && (
          <p role="alert" style={{ color: "var(--color-error)", fontSize: "var(--text-sm)" }}>
            {error}
          </p>
        )}
        <Button type="submit" isLoading={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-6)", textAlign: "center" }}>
        <Link to={ROUTES.login}>Back to login</Link>
      </p>
    </AuthLayout>
  );
}
