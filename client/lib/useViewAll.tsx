"use client";

import { useState, type ReactNode } from "react";

const DEFAULT_LIMIT = 10;

/**
 * Caps a potentially large list to `limit` rows and returns a "View all" /
 * "Show less" toggle so the full list is only rendered when the user asks for
 * it. Keeps dashboards fast and readable as records pile up over time.
 *
 *   const { visible, toggle } = useViewAll(rows);
 *   // render visible.map(...) then {toggle}
 *
 * When the list is at or below the cap, `slice` returns everything and `toggle`
 * is null, so a leftover "expanded" state has no visible effect.
 */
export function useViewAll<T>(items: T[], limit: number = DEFAULT_LIMIT) {
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? items : items.slice(0, limit);
  const hiddenCount = items.length - limit;
  const toggle =
    hiddenCount > 0 ? (
      <ViewAllToggle
        showAll={showAll}
        hiddenCount={hiddenCount}
        total={items.length}
        onToggle={() => setShowAll((s) => !s)}
      />
    ) : null;

  return { visible, toggle, showAll, setShowAll };
}

function ViewAllToggle({
  showAll,
  hiddenCount,
  total,
  onToggle,
}: {
  showAll: boolean;
  hiddenCount: number;
  total: number;
  onToggle: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full border-t px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition hover:bg-[var(--color-surface-alt)]"
      style={{
        borderColor: "var(--color-border)",
        color: "var(--color-primary)",
      }}
    >
      {showAll ? "▲ Show less" : `▼ View all ${total} (${hiddenCount} more)`}
    </button>
  );
}
