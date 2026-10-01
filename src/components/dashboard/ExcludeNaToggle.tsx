"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Lives next to the detail table's own heading, not the top filter bar —
 * N/A rows (no revenue, so an undefined cost/revenue ratio) are a concern of
 * that table specifically. Still drives the shared `xna` search param, so it
 * narrows the whole tab consistently with the other filters above, not just
 * this table. */
export function ExcludeNaToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.set("xna", "1");
    else params.delete("xna");
    // scroll: false keeps the page where it is instead of jumping while the new figures load.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={searchParams.get("xna") === "1"}
        onChange={(e) => toggle(e.target.checked)}
        className="h-4 w-4 rounded border-line-strong accent-brand"
      />
      Exclude accounts with no revenue (N/A)
    </label>
  );
}
