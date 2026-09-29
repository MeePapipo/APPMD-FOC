"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { signOut } from "next-auth/react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { NAV_HOVER } from "@/lib/hoverStyles";

type NavUser = { name?: string | null; email?: string | null; role: "USER" | "ADMIN" };

const links = [
  { href: "/calculator", label: "Calculator" },
  { href: "/history", label: "History" },
  { href: "/dashboard", label: "Dashboard" },
];

export function AppNav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = user.role === "ADMIN" ? [...links, { href: "/admin", label: "Admin" }] : links;

  // The active mark is the same idea as the category rule on the order
  // screen (a full-strength brand-colour edge, not a filled pill) — rotated
  // to a bottom border for a horizontal list, a left border for a vertical
  // one. One accent language for "this is the current thing," everywhere.
  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={cn(
          "border-b-2 px-1 py-2 text-sm font-medium transition-colors",
          active ? "border-brand text-ink" : cn("border-transparent text-muted hover:text-ink", NAV_HOVER),
        )}
      >
        {label}
      </Link>
    );
  };

  const MobileNavLink = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={cn(
          "border-l-4 px-3 py-2 text-sm font-medium transition-colors",
          active ? "border-brand bg-brand-tint text-brand" : cn("border-transparent text-muted hover:text-ink", NAV_HOVER),
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      {/* A thin masthead rule rather than a graphic — brand presence without
          touching the logo mark itself. */}
      <div className="h-[3px] bg-brand" />
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/calculator" className="flex items-center gap-2.5">
            <Logo className="h-7 w-auto text-brand" />
            <span className="hidden text-sm font-semibold text-ink sm:inline">FOC Calculator</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {items.map((i) => (
              <NavLink key={i.href} {...i} />
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium text-ink">{user.name ?? user.email}</div>
            <div className="text-xs text-muted">
              {user.role === "ADMIN" ? "Administrator" : "Sales rep"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="text-muted hover:text-ink"
          >
            Sign out
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="h-9 w-9 text-ink md:hidden"
            onClick={() => setOpen((o) => !o)}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="flex flex-col gap-1 border-t border-line py-2 md:hidden">
          {items.map((i) => (
            <MobileNavLink key={i.href} {...i} />
          ))}
        </nav>
      )}
    </header>
  );
}
