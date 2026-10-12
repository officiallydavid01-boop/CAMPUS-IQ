import { NavLink } from "react-router-dom";
import { ROUTES } from "@/app/router/routes";

const sections = [
  { label: "Institutions", path: ROUTES.adminInstitutions },
  { label: "Faculties", path: ROUTES.adminFaculties },
  { label: "Departments", path: ROUTES.adminDepartments },
  { label: "Programmes", path: ROUTES.adminProgrammes },
  { label: "Levels", path: ROUTES.adminLevels },
  { label: "Sessions", path: ROUTES.adminSessions },
  { label: "Semesters", path: ROUTES.adminSemesters },
];

export function AcademicStructureNav() {
  return (
    <nav
      aria-label="Academic structure sections"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        marginBottom: "24px",
        padding: "12px",
        background: "var(--bg-glass)",
        border: "1px solid var(--border-glass)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      {sections.map((section) => (
        <NavLink
          key={section.path}
          to={section.path}
          style={({ isActive }) => ({
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            border: isActive
              ? "1px solid var(--border-glass-strong)"
              : "1px solid transparent",
            background: isActive
              ? "var(--accent-gradient)"
              : "transparent",
            color: isActive
              ? "var(--text-on-accent)"
              : "var(--text-secondary)",
            fontSize: "var(--text-sm)",
            fontWeight: isActive ? 600 : 500,
            textDecoration: "none",
            whiteSpace: "nowrap",
          })}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}