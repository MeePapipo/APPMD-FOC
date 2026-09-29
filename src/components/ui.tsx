import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { HOVER_LIFT } from "@/lib/hoverStyles";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
  // `cn` joins rather than merges, so a `p-0` passed via className cannot beat
  // the padding below — Tailwind emits `.px-*` after `.p-0`, so the axis rule
  // wins and squeezes the content box. Icon-only buttons must use size="icon".
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2.5 text-sm", icon: "p-0 text-sm" };
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "bg-white text-ink border border-line-strong hover:bg-canvas",
    ghost: "text-brand hover:bg-brand-tint",
    danger: "bg-negative text-white hover:opacity-90",
  };
  // The lift is skipped for icon-size buttons: those are always glued flush
  // inside a bordered container (QtyStepper's − [box] + pill), where a
  // translated button pops a visible gap against its neighbors. Everywhere
  // else still gets `transition-colors` for the color-only variants above.
  return (
    <button
      className={cn(base, size === "icon" ? "transition-colors" : HOVER_LIFT, sizes[size], variants[variant], className)}
      {...props}
    />
  );
}

/**
 * `− [box] +` for a quantity a rep nudges one at a time but occasionally types
 * outright. The box stays editable on purpose: stepping to +12 is twelve
 * clicks, and reps do enter figures that large.
 *
 * `onChange` is only called with a finite integer — a half-typed "-" or a
 * cleared box reports 0 rather than NaN, so callers never have to guard.
 */
export function QtyStepper({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  label,
  className,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Announced to screen readers on both buttons, e.g. "Adjustment for X". */
  label: string;
  className?: string;
}) {
  const clamp = (n: number) =>
    Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min ?? -Number.MAX_SAFE_INTEGER, n));
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;
  // 40px on a phone — 32px is under the 44px WCAG 2.5.5 target and these sit
  // next to each other, so a mis-tap changes the quantity rather than missing.
  // Back to 32px from `md` up, where the stepper lives inside a dense table.
  const stepButton = "h-10 w-10 shrink-0 text-ink hover:bg-canvas md:h-8 md:w-8";

  return (
    <div
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-lg border border-line-strong bg-surface",
        disabled && "opacity-50",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Decrease ${label}`}
        disabled={disabled || atMin}
        onClick={() => onChange(clamp(value - step))}
        className={cn(stepButton, "rounded-none")}
      >
        <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
      </Button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        step={step}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          onChange(Number.isSafeInteger(parsed) ? clamp(parsed) : 0);
        }}
        className="no-spin w-14 border-x border-line-strong bg-transparent px-1 py-1 text-center text-sm tabular-nums focus:outline-brand disabled:opacity-50 md:w-12"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Increase ${label}`}
        disabled={disabled || atMax}
        onClick={() => onChange(clamp(value + step))}
        className={cn(stepButton, "rounded-none")}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function Card({
  className,
  style,
  interactive = false,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  /** Lift + shadow on hover — for a standalone tile/panel meant to be looked
   * at as its own thing (a KPI tile, a dashboard chart panel). Off by
   * default: a Card also serves as a plain structural container (e.g. the
   * History list's outer frame around many rows), where lifting on any
   * inner hover would be a stray, meaningless animation. */
  interactive?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("rounded-xl border border-line bg-surface shadow-sm", interactive && HOVER_LIFT, className)}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * One label/value pair inside a mobile card — the card's stand-in for a table
 * cell and the column header it sits under. Below `md` (or `lg` for the wide
 * tables) the app swaps its tables for a card per row, and every figure the
 * table showed has to keep its label, so callers wrap a run of these in a
 * `<dl>`.
 *
 * `value` takes an input or a stepper as happily as it takes a number, so the
 * editable columns survive the swap.
 */
export function CardRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1", className)}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm tabular-nums">{value}</dd>
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "positive" | "warning" | "negative" | "brand";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-canvas text-muted border-line",
    positive: "bg-positive-tint text-positive border-positive/20",
    warning: "bg-warning-tint text-warning border-warning/20",
    negative: "bg-negative-tint text-negative border-negative/20",
    brand: "bg-brand-tint text-brand border-brand/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
