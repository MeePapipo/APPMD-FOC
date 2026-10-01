"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui";

/** Light is the default; the choice is kept in localStorage and applied before paint by the script in layout.tsx.
 * The icon is picked by CSS (the `dark` variant), so the server and client render the same markup. */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage blocked: the choice just lasts until reload.
    }
  }

  return (
    <Button variant="ghost" size="icon" aria-label="Toggle dark mode" title="Light / dark" onClick={toggle} className={className ?? "h-9 w-9 text-muted hover:text-ink"}>
      <Moon className="h-5 w-5 dark:hidden" aria-hidden="true" />
      <Sun className="hidden h-5 w-5 dark:block" aria-hidden="true" />
    </Button>
  );
}
