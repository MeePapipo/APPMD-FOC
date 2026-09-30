"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Narrows the tab to flagged accounts: Bonus over the whole entitlement, or stand-alone
 * FOC past its threshold (the `sig` search param), like the other toggles next to the detail table. */
export function OverQuotaToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.set("sig", "1");
    else params.delete("sig");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        aria-label="Flagged accounts only: over quota or stand-alone FOC past its threshold"
        checked={searchParams.get("sig") === "1"}
        onChange={(e) => toggle(e.target.checked)}
        className="h-4 w-4 rounded border-line-strong accent-brand"
      />
      Flagged only
    </label>
  );
}
