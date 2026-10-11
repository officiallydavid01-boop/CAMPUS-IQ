import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/pages/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { signIn } from "@/services/auth/authService";
import { ROUTES } from "@/app/router/routes";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn({ email, password });

    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const from = (location.state as { from?: Location })?.from;
    navigate(from?.pathname ?? ROUTES.dashboard, { replace: true });
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to keep learning, practicing, and leveling up.">
      <form onSubmit={handleSubmit} className="stack" style={{ gap: "var(--space-4)" }}>
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" style={{ color: "var(--color-error)", fontSize: "var(--text-sm)" }}>
            {error}
          </p>
        )}
        <Button type="submit" isLoading={isSubmitting}>
          Log in
        </Button>
      </form>
      <div className="stack" style={{ gap: "var(--space-2)", marginTop: "var(--space-6)", textAlign: "center" }}>
        <Link to={ROUTES.forgotPassword} style={{ fontSize: "var(--text-sm)" }}>
          Forgot your password?
        </Link>
        <p style={{ fontSize: "var(--text-sm)" }}>
          New to CampusIQ? <Link to={ROUTES.register}>Create an account</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
