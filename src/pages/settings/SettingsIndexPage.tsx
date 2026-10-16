
import { Link } from "react-router-dom";
import {
  GraduationCap,
  ChevronRight,
  Settings2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { ROUTES } from "@/app/router/routes";

export function SettingsIndexPage() {
  return (
    <div
      className="container"
      style={{
        paddingBlock: "var(--space-8)",
        maxWidth: "640px",
        width: "100%",
        marginInline: "auto",
      }}
    >
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1
          style={{
            fontSize: "var(--text-2xl)",
            marginBottom: "var(--space-2)",
          }}
        >
          Settings
        </h1>

        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "var(--text-sm)",
            margin: 0,
          }}
        >
          Manage your CampusIQ preferences and academic information.
        </p>
      </div>

      <section aria-labelledby="academic-settings-heading">
        <h2
          id="academic-settings-heading"
          style={{
            fontSize: "var(--text-lg)",
            marginBottom: "var(--space-3)",
          }}
        >
          Academic settings
        </h2>

        <Link
          to={ROUTES.settingsAcademicProfile}
          aria-label="Change Academic Context: update your institution, faculty, department, programme, level, session and semester"
          style={{
            display: "block",
            color: "inherit",
            textDecoration: "none",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <GlassCard
            interactive
            className="stack"
            style={{
              gap: "var(--space-4)",
              padding: "var(--space-5)",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div
              className="cluster"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--space-3)",
              }}
            >
              <div
                className="cluster"
                style={{
                  gap: "var(--space-3)",
                  minWidth: 0,
                  alignItems: "center",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: "48px",
                    height: "48px",
                    flexShrink: 0,
                    borderRadius: "var(--radius-lg)",
                    background: "var(--surface-secondary)",
                  }}
                >
                  <GraduationCap size={26} />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--text-primary)",
                      fontWeight: "var(--font-weight-semibold)",
                      fontSize: "var(--text-md)",
                    }}
                  >
                    Academic profile
                  </div>

                  <div
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "var(--text-sm)",
                      marginTop: "var(--space-1)",
                    }}
                  >
                    Your university and study details
                  </div>
                </div>
              </div>

              <ChevronRight
                size={22}
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              />
            </div>

            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "var(--text-sm)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              Update your institution, faculty, department, programme,
              level, academic session and semester.
            </p>

            <div
              className="cluster"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--space-2)",
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <span
                style={{
                  color: "var(--text-primary)",
                  fontWeight: "var(--font-weight-semibold)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <Settings2 size={18} aria-hidden="true" />
                Change Academic Context
              </span>

              <span
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "var(--text-sm)",
                }}
              >
                Open
              </span>
            </div>
          </GlassCard>
        </Link>
      </section>
    </div>
  );
}
