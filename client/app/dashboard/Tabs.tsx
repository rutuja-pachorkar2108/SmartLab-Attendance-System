"use client";

// Shared, professional menu/tab bar used by every role dashboard so the
// navigation looks and behaves identically across Student / Incharge / TA /
// Admin. Horizontal, scrolls on small screens, active tab filled with the
// brand primary colour.

export type TabDef<T extends string = string> = {
  id: T;
  label: string;
  emoji?: string;
};

export function DashTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard sections"
      className="flex gap-1 overflow-x-auto rounded-xl border p-1.5 shadow-sm"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold transition active:scale-[0.98]"
            style={
              isActive
                ? {
                    backgroundColor: "var(--color-primary)",
                    color: "white",
                    boxShadow:
                      "0 4px 12px -4px color-mix(in srgb, var(--color-primary) 60%, transparent)",
                  }
                : { backgroundColor: "transparent", color: "var(--color-primary)" }
            }
          >
            {t.emoji && <span className="text-base">{t.emoji}</span>}
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
