import Link from "next/link";
import { cn } from "@/lib/cn";
import type { DashboardView } from "@/lib/dashboard/filters";

const TABS: { view: DashboardView; label: string }[] = [
  { view: "overview", label: "Overview" },
  { view: "accounts", label: "Accounts" },
  { view: "alerts", label: "Alerts & finance" },
];

/** The three Dashboard views. Links keep every filter param, so switching
 * view never loses the scope (only `view` changes). */
export function DashboardViewTabs({ current, params }: { current: DashboardView; params: Record<string, string | undefined> }) {
  const hrefFor = (view: DashboardView) => {
    const next = new URLSearchParams();
    // `acct` belongs to the Accounts drawer, so it does not follow a tab switch.
    for (const [k, v] of Object.entries(params)) if (v && k !== "view" && k !== "acct") next.set(k, v);
    if (view !== "overview") next.set("view", view);
    const qs = next.toString();
    return qs ? `/dashboard?${qs}` : "/dashboard";
  };
  return (
    <nav aria-label="Dashboard views" className="mb-5 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.view}
          href={hrefFor(t.view)}
          aria-current={t.view === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-sm",
            t.view === current ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
