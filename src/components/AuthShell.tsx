import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Shared chrome for /login and /register. A solid Roche-blue panel carries
 * the brand identity so the form side can stay unadorned — no nested card,
 * no shadow, just the two flat surfaces meeting at one edge. Collapses to a
 * compact top band on narrow screens rather than shrinking the split, so the
 * form never fights the brand panel for vertical space on a phone.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <div className="flex shrink-0 items-center gap-3 bg-brand px-6 py-6 text-white lg:w-[38%] lg:items-center lg:justify-center lg:gap-8 lg:px-16 lg:py-0">
        <Logo className="h-9 w-auto text-white lg:h-11" />
        <div className="lg:max-w-xs">
          <p className="text-sm font-semibold tracking-wide text-white/80 lg:mt-0">
            MD FOC Calculator
          </p>
          <h2 className="hidden text-2xl font-semibold leading-snug lg:mt-4 lg:block">
            Reagent &amp; free-of-charge shipment calculator for cobas x800 systems
          </h2>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-surface px-6 py-10 sm:px-10">
        <ThemeToggle className="absolute right-3 top-3 h-9 w-9 text-muted hover:text-ink" />
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-xs text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
