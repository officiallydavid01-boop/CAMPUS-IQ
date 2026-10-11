import { Mail, MessageCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

/** Master Spec section 61: official support contact, shown here (and
 * referenced, not repeated, from Settings/error states). */
export function SupportPage() {
  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "560px" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Support</h1>
      <GlassCard>
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          <a href="mailto:officiallydavid01@gmail.com" className="cluster" style={{ gap: "var(--space-3)" }}>
            <Mail size={18} aria-hidden="true" />
            officiallydavid01@gmail.com
          </a>
          <a href="https://wa.me/2349126122448" target="_blank" rel="noreferrer" className="cluster" style={{ gap: "var(--space-3)" }}>
            <MessageCircle size={18} aria-hidden="true" />
            WhatsApp: 09126122448
          </a>
        </div>
      </GlassCard>
    </div>
  );
}
