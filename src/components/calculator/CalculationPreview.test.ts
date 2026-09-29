import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { selectPreview, type PreviewLine, type PreviewResult } from "@/lib/calc/preview";
import type { AdjustmentMap } from "@/lib/calc/adjust";
import { CalculationPreview } from "./CalculationPreview";

vi.mock("lucide-react", () => ({ Minus: () => null, Plus: () => null }));

function line(overrides: Partial<PreviewLine>): PreviewLine {
  return {
    materialNo: "M-0",
    dkshCode: null,
    description: "Item",
    category: null,
    usageType: "quality control",
    unitText: null,
    system: "6800",
    onDemand: false,
    optional: false,
    qty: 4,
    unitPrice: 100,
    value: 400,
    ...overrides,
  };
}

/**
 * Three item tables at once — quality control, additional, and the selected
 * give-aways — because the duplicated-id risk only shows up across tables.
 */
const preview: PreviewResult = {
  reagents: [],
  lines: [
    line({ materialNo: "M-1", description: "Required QC" }),
    line({ materialNo: "M-2", description: "Adjusted item" }),
    line({ materialNo: "M-3", description: "Bench additional", usageType: "additional" }),
    line({ materialNo: "M-4", description: "Optional give-away", usageType: "additional", optional: true }),
  ],
  revenue: 10_000,
  focValue: 0,
  focPct: 0,
};

// M-2 is hand-adjusted with no reason yet — the state that blocks submit and
// the only one that renders the comment field.
const adjustments: AdjustmentMap = { "M-2": { adjust: 2 } };
const optionalTicked = { "M-4": true };

function render() {
  return renderToStaticMarkup(
    createElement(CalculationPreview, {
      selected: selectPreview(preview, optionalTicked, adjustments),
      stale: false,
      optionalTicked,
      onToggle: () => {},
      busy: false,
      adjustments,
      onAdjust: () => {},
    }),
  );
}

describe("order preview on a narrow screen", () => {
  // Card and table are both in the DOM at every width — one is just
  // `display:none` — so a shared id would point a visible label at a hidden
  // input, and tapping the label would do nothing.
  it("gives every element a unique id across the card and table copies", () => {
    const ids = [...render().matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect([...new Set(ids)]).toHaveLength(ids.length);
  });

  it("repeats every figure the table shows as a labelled card row", () => {
    const html = render();
    // Four lines across three tables: one card each, one header row each.
    expect(html.match(/<dt[^>]*>Stock on hand<\/dt>/g)).toHaveLength(4);
    expect(html.match(/<th[^>]*>Stock on hand<\/th>/g)).toHaveLength(3);
    for (const label of ["Calculated", "Stock on hand", "After stock", "Value (THB)", "Final qty"]) {
      expect(html).toContain(`>${label}</dt>`);
    }
  });

  it("carries the mandatory adjustment reason into the card, still flagged", () => {
    const html = render();
    const invalid = html.match(/aria-invalid="true"/g);
    expect(invalid).toHaveLength(2); // the card copy and the row copy
    expect(html.match(/A comment is required before this order can be confirmed\./g))
      .toHaveLength(2);
  });

  it("labels the card's editable quantity as giving, not adjusting, for optional lines", () => {
    const html = render();
    expect(html).toContain(">Qty to give</dt>");
    expect(html).toContain(">Adjust (+/−)</dt>");
  });
});
