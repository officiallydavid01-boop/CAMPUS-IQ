import { useMemo, useState, type ReactNode } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Only searchable columns are matched against the search box, so
   * searching "published" doesn't accidentally match an unrelated id. */
  searchValue?: (row: T) => string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  actions?: (row: T) => ReactNode;
  pageSize?: number;
}

/**
 * The one Admin CMS table implementation (Master Spec section 81: "Admin
 * must feel like a genuine CMS/control center... data tables, filters,
 * search, pagination"). Search and pagination are client-side, which is
 * the right tradeoff for the row counts these Phase 3 academic-structure
 * tables actually have (tens to low hundreds of rows) — a table expected
 * to hold thousands of rows (e.g. Admin > Users in Phase 9) should move
 * to server-side search/pagination via the matching service function
 * instead of raising pageSize here.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  searchPlaceholder = "Search...",
  emptyTitle = "Nothing here yet.",
  emptyDescription,
  actions,
  pageSize = 10,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => col.searchValue?.(row)?.toLowerCase().includes(needle) ?? false)
    );
  }, [rows, search, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  return (
    <div className="stack" style={{ gap: "var(--space-4)" }}>
      <div style={{ position: "relative", maxWidth: "320px" }}>
        <Search
          size={16}
          aria-hidden="true"
          style={{ position: "absolute", left: "var(--space-3)", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
        />
        <Input
          label="Search"
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          style={{ paddingLeft: "var(--space-8)" }}
        />
      </div>

      <div className="scroll-x glass-surface" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: "var(--space-6)" }}>
            <SkeletonText lines={4} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-glass)" }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      textAlign: "left",
                      padding: "var(--space-3) var(--space-4)",
                      fontSize: "var(--text-xs)",
                      color: "var(--text-muted)",
                      fontWeight: "var(--font-weight-medium)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {col.header}
                  </th>
                ))}
                {actions && <th style={{ padding: "var(--space-3) var(--space-4)" }} aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={rowKey(row)} style={{ borderBottom: "1px solid var(--border-glass)" }}>
                  {columns.map((col) => (
                    <td key={col.key} style={{ padding: "var(--space-3) var(--space-4)", fontSize: "var(--text-sm)" }}>
                      {col.render(row)}
                    </td>
                  ))}
                  {actions && (
                    <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "right" }}>
                      <div className="cluster" style={{ gap: "var(--space-2)", justifyContent: "flex-end" }}>
                        {actions(row)}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > pageSize && (
        <div className="cluster" style={{ justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          <span>
            Page {clampedPage + 1} of {pageCount}
          </span>
          <div className="cluster" style={{ gap: "var(--space-2)" }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              aria-label="Previous page"
              style={iconButtonStyle(clampedPage === 0)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={clampedPage >= pageCount - 1}
              aria-label="Next page"
              style={iconButtonStyle(clampedPage >= pageCount - 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function iconButtonStyle(disabled: boolean) {
  return {
    background: "var(--bg-glass)",
    border: "1px solid var(--border-glass)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-2)",
    color: "var(--text-primary)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}
