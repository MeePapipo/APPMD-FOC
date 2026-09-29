/**
 * Shared hover-animation classes — one place to tune the app-wide "lift +
 * soft shadow" feel praditww asked for (2026-09-29) rather than each
 * component picking its own timing/easing.
 */

/** Buttons, cards, and other boxed elements — a subtle lift with a soft shadow. */
export const HOVER_LIFT = "transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md";

/** Text-only nav links — the same lift, no shadow (nothing to cast one). */
export const NAV_HOVER = "transition-transform duration-150 ease-out hover:-translate-y-0.5";

/** Table/list rows — a soft background tint rather than a lift (rows don't
 * conventionally float), but still animated rather than an instant snap. */
export const ROW_HOVER = "transition-colors duration-150 hover:bg-canvas";
