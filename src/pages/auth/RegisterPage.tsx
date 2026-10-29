import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/pages/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { signUp } from "@/services/auth/authService";
import { ROUTES } from "@/app/router/routes";

const CAMPUSIQ_CHANNEL_URL = "https://whatsapp.com/channel/0029VbDnnL75fM5j2CilAb2h";
const CAMPUSIQ_GROUP_URL = "https://chat.whatsapp.com/LwvOqU2D5BbIu0IIYp3TVM?s=cl&p=a&mlu=4&ilr=4&iam=2";

type RegistrationStep = "details" | "community";

export function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<RegistrationStep>("details");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinedChannel, setJoinedChannel] = useState(false);
  const [joinedGroup, setJoinedGroup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleDetailsSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("community");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!joinedChannel || !joinedGroup) {
      setError("Please join both CampusIQ WhatsApp spaces and confirm below before creating your account.");
      return;
    }

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

  if (step === "community") {
    return (
      <AuthLayout title="Join the CampusIQ community" subtitle="One last step before we create your account.">
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            Join both official WhatsApp spaces to stay connected with CampusIQ announcements, updates, and fellow students.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              padding: "var(--space-4)",
              border: "1px solid var(--border-glass-strong)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-glass)",
            }}
          >
            <strong>1. CampusIQ WhatsApp Channel</strong>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              Follow the channel for official announcements and updates.
            </span>
            <a href={CAMPUSIQ_CHANNEL_URL} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "flex-start" }}>
              Open WhatsApp Channel ↗
            </a>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
              <input type="checkbox" required checked={joinedChannel} onChange={(e) => setJoinedChannel(e.target.checked)} />
              I've followed the CampusIQ WhatsApp Channel.
            </label>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              padding: "var(--space-4)",
              border: "1px solid var(--border-glass-strong)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-glass)",
            }}
          >
            <strong>2. CampusIQ WhatsApp Group</strong>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              Join the student community to connect and discuss learning.
            </span>
            <a href={CAMPUSIQ_GROUP_URL} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "flex-start" }}>
              Join WhatsApp Group ↗
            </a>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
              <input type="checkbox" required checked={joinedGroup} onChange={(e) => setJoinedGroup(e.target.checked)} />
              I've joined the CampusIQ WhatsApp Group.
            </label>
          </div>

          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
            Please note: You can only finish creating your accounts if you join both the channel and the group.
          </p>

          {error && (
            <p role="alert" style={{ color: "var(--color-error)", fontSize: "var(--text-sm)" }}>
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="stack" style={{ gap: "var(--space-3)" }}>
            <Button type="submit" isLoading={isSubmitting} disabled={!joinedChannel || !joinedGroup}>
              Confirm and create account
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setError(null); setStep("details"); }}>
              Back to account details
            </Button>
          </form>
        </div>
        <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-6)", textAlign: "center" }}>
          Already have an account? <Link to={ROUTES.login}>Log in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Learn. Practice. Level up.">
      <form onSubmit={handleDetailsSubmit} className="stack" style={{ gap: "var(--space-4)" }}>
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
        <Button type="submit">Continue</Button>
      </form>
      <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-6)", textAlign: "center" }}>
        Already have an account? <Link to={ROUTES.login}>Log in</Link>
      </p>
    </AuthLayout>
  );
}
