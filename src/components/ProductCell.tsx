import type { ReactNode } from "react";

/**
 * The house style for naming a product in any table: the description, with the
 * Roche material number beneath it prefixed "REF" — the label printed on the
 * box itself, so a rep reading the screen and a customer reading the carton
 * are looking at the same string.
 *
 * The DKSH code is deliberately NOT here: it belongs in its own column
 * (see `DkshCell`) because it is the distributor's number, used when ordering
 * rather than when identifying the product on the bench.
 */
export function ProductCell({ description, materialNo, children }: {
  description: string;
  materialNo: string;
  /** Extra notes shown under the REF line, e.g. pack text or an adjustment reason. */
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="break-words">{description}</div>
      <div className="font-mono text-xs text-muted">REF {materialNo}</div>
      {children}
    </div>
  );
}

/** DKSH code in its own column, em-dash when the master data has none. */
export function DkshCell({ code }: { code: string | null | undefined }) {
  return <span className="font-mono text-xs text-muted">{code ?? "—"}</span>;
}
