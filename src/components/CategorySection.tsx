import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One product category on the order screen, tinted so reps can find the kind
 * of line they want without reading headings. Colours are defined once in
 * globals.css (`--cat-*`) — see the note there on how the hues were chosen.
 */
export type Category = "reagent" | "qc" | "common" | "additional" | "choice";

const STYLES: Record<Category, string> = {
  reagent: "bg-cat-reagent border-l-cat-reagent-edge",
  qc: "bg-cat-qc border-l-cat-qc-edge",
  common: "bg-cat-common border-l-cat-common-edge",
  additional: "bg-cat-additional border-l-cat-additional-edge",
  choice: "bg-cat-choice border-l-cat-choice-edge",
};

export function CategorySection({ category, title, subtitle, id, children, className }: {
  category: Category;
  title: string;
  subtitle?: ReactNode;
  /** Id for the heading, so the section can be labelled by it. */
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = id ?? `cat-${category}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        // The left rule carries the same hue at full strength: the wash alone
        // is too pale to read at a glance on a low-quality display.
        "min-w-0 rounded-lg border border-line border-l-4 p-4",
        STYLES[category],
        className,
      )}
    >
      <h3 id={headingId} className="text-sm font-semibold text-ink">
        {title}
      </h3>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
