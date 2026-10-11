import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/pages/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { signUp } from "@/services/auth/authService";
import { ROUTES } from "@/app/router/routes";

export function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signUp({ fullName, email, password });

    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthLayout title="Check your email" subtitle="We've sent a verification link to confirm your account.">
        <Button variant="secondary" onClick={() => navigate(ROUTES.login)}>
          Back to login
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Learn. Practice. Level up.">
      <form onSubmit={handleSubmit} className="stack" style={{ gap: "var(--space-4)" }}>
        <Input label="Full name" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" style={{ color: "var(--color-error)", fontSize: "var(--text-sm)" }}>
            {error}
          </p>
        )}
        <Button type="submit" isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-6)", textAlign: "center" }}>
        Already have an account? <Link to={ROUTES.login}>Log in</Link>
      </p>
    </AuthLayout>
  );
}
