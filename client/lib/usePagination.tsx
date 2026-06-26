"use client";

import { useState, type ReactNode } from "react";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50];

type Options<T> = {
  /** Rows per page. Defaults to 10. */
  pageSize?: number;
  /**
   * When provided, a filter box is returned and rows are kept only when this
   * text (lowercased) contains the typed query. Build it from every column the
   * user might search, e.g. `(u) => `${u.name} ${u.email}``.
   */
  searchText?: (item: T) => string;
  searchPlaceholder?: string;
};

/**
 * Client-side pagination + optional text filter for a fully-loaded list.
 * Successor to {@link useViewAll}: instead of a single "View all" toggle it
 * pages the rows and (optionally) filters them, so dashboards stay fast and
 * readable as records pile up.
 *
 *   const { visible, filterBox, controls } = usePagination(rows, {
 *     searchText: (r) => `${r.name} ${r.email}`,
 *     searchPlaceholder: "Filter users…",
 *   });
 *   // render {filterBox} above the table, visible.map(...) as rows, {controls} below
 *
 * `filterBox` is null when no `searchText` is given; `controls` is null while
 * everything fits on one page (nothing to navigate).
 */
export function usePagination<T>(items: T[], options: Options<T> = {}) {
  const {
    pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
    searchText,
    searchPlaceholder = "Filter…",
  } = options;

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const q = query.trim().toLowerCase();
  const filtered =
    searchText && q
      ? items.filter((it) => searchText(it).toLowerCase().includes(q))
      : items;

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Derive the effective page rather than storing a clamped value: if the data
  // shrinks below the current page (delete, filter, refresh, larger page size),
  // `safePage` keeps the view valid without a setState-in-effect. Prev/Next and
  // the numbered buttons all act on `safePage`, so any click self-corrects.
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  const onQuery = (v: string) => {
    setQuery(v);
    setPage(1);
  };

  const filterBox = searchText ? (
    <input
      type="search"
      value={query}
      onChange={(e) => onQuery(e.target.value)}
      placeholder={searchPlaceholder}
      className="w-full sm:max-w-xs rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)]"
      style={{ borderColor: "var(--color-border)" }}
    />
  ) : null;

  let controls: ReactNode = null;
  if (q && total === 0) {
    controls = (
      <div
        className="border-t px-5 py-3 text-xs"
        style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
      >
        No rows match “{query.trim()}”.{" "}
        <button
          type="button"
          onClick={() => onQuery("")}
          className="font-bold underline-offset-2 hover:underline"
          style={{ color: "var(--color-primary)" }}
        >
          Clear filter
        </button>
      </div>
    );
  } else if (pageCount > 1) {
    controls = (
      <PaginationBar
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        total={total}
        start={start + 1}
        end={Math.min(start + pageSize, total)}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    );
  }

  return { visible, filterBox, controls };
}

function PaginationBar({
  page,
  pageCount,
  pageSize,
  total,
  start,
  end,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  start: number;
  end: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span style={{ color: "var(--color-muted)" }}>
        Showing <strong>{start}</strong>–<strong>{end}</strong> of{" "}
        <strong>{total}</strong>
      </span>

      <div className="flex items-center gap-1">
        <NavButton disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Prev
        </NavButton>
        {pageList(page, pageCount).map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              className="px-1.5"
              style={{ color: "var(--color-muted)" }}
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? "page" : undefined}
              className="min-w-[1.85rem] rounded-md border px-2 py-1 font-bold transition"
              style={
                p === page
                  ? {
                      borderColor: "var(--color-primary)",
                      backgroundColor: "var(--color-primary)",
                      color: "white",
                    }
                  : { borderColor: "var(--color-border)", color: "var(--color-primary)" }
              }
            >
              {p}
            </button>
          )
        )}
        <NavButton disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next ›
        </NavButton>

        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Rows per page"
          className="ml-2 rounded-md border bg-white px-2 py-1 outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}/page
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function NavButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border px-2 py-1 font-bold transition hover:bg-[var(--color-surface-alt)] disabled:opacity-40 disabled:hover:bg-transparent"
      style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
    >
      {children}
    </button>
  );
}

// First page, last page, and the current page ±1, with "…" gaps. Keeps the bar
// compact no matter how many pages there are.
function pageList(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(count - 1, current + 1);
  if (left > 2) pages.push("…");
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < count - 1) pages.push("…");
  pages.push(count);
  return pages;
}
