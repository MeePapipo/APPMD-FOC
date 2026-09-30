"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_HOVER } from "@/lib/hoverStyles";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/master", label: "Master data" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/tpb", label: "TPB" },
  { href: "/admin/instruments", label: "Instruments" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-6 border-b border-line">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
              active ? "border-brand text-ink" : cn("border-transparent text-muted hover:text-ink", NAV_HOVER),
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
