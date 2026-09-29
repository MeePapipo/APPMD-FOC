import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SubmissionDetailPage from "./page";
import type { SubmissionDoc } from "@/lib/export/submission-doc";

const mocks = vi.hoisted(() => ({
  loadSubmissionDoc: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/export/submission-doc", () => ({ loadSubmissionDoc: mocks.loadSubmissionDoc }));
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }));
// `CardRow` is the real one: the narrow-screen assertions below are about the
// markup it emits, so stubbing it would test the stub.
vi.mock("@/components/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui")>()),
  Card: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Badge: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("lucide-react", () => ({
  FileText: () => null,
  FileSpreadsheet: () => null,
  // Pulled in by ui.tsx's QtyStepper, which this page never renders.
  Minus: () => null,
  Plus: () => null,
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("Not found"); } }));

function focItem(overrides: Partial<SubmissionDoc["focItems"][number]>): SubmissionDoc["focItems"][number] {
  return {
    group: "Control",
    description: "Item",
    materialNo: "M-0",
    dkshCode: null,
    packText: null,
    calculatedQty: 0,
    stockOnHand: null,
    afterStockQty: 0,
    unitPrice: null,
    grossValue: 0,
    adjustedQty: 0,
    finalQty: 0,
    finalValue: 0,
    adjustComment: null,
    overGiveQty: 0,
    ...overrides,
  };
}

const doc: SubmissionDoc = {
  id: "existing-order",
  accountNumber: "TEST",
  accountName: "Test account",
  repEmail: "report-test@roche.com",
  createdAt: new Date("2026-09-09T00:00:00Z"),
  status: "SUBMITTED",
  systemsLabel: "cobas 6800/8800",
  assayInputs: [],
  reagents: [],
  reagentTotal: 0,
  focItems: [
    focItem({ description: "Required QC", materialNo: "M-1", calculatedQty: 3, afterStockQty: 3, finalQty: 3, finalValue: 900 }),
    focItem({ description: "Selected additional", materialNo: "M-2", calculatedQty: 2, afterStockQty: 2, finalQty: 2, finalValue: 400 }),
    focItem({ description: "Included zero-value item", materialNo: "M-3", calculatedQty: 1, afterStockQty: 1, finalQty: 1, finalValue: 0 }),
    focItem({
      description: "Stock-reduced item", materialNo: "M-4",
      calculatedQty: 5, stockOnHand: 2, afterStockQty: 3,
      adjustedQty: -1, finalQty: 2, finalValue: 200, adjustComment: "Site already holds two",
    }),
  ],
  calculatedFocTotal: 1300,
  additionalFocItems: [
    {
      description: "Disposable Gloves(powderless) size M",
      materialNo: "05840031001",
      dkshCode: "100394733",
      packText: null,
      qty: 4,
      unitPrice: 250,
      value: 1000,
    },
  ],
  additionalFocTotal: 1000,
  focTotal: 2300,
  overGive: { lineCount: 0, packs: 0, value: 0 },
  revenue: 10000,
  focPct: 0.23,
  fileStem: "FOC-TEST-2026-09-09",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "u1", role: "USER", email: "report-test@roche.com" });
  mocks.loadSubmissionDoc.mockResolvedValue(doc);
});

async function renderReport() {
  return renderToStaticMarkup(await SubmissionDetailPage({ params: Promise.resolve({ id: "existing-order" }) }));
}

describe("submitted order report", () => {
  it("renders every line the loader returned", async () => {
    const html = await renderReport();
    expect(mocks.loadSubmissionDoc).toHaveBeenCalledWith("existing-order", expect.objectContaining({
      email: "report-test@roche.com",
    }));
    expect(html).toContain("Required QC");
    expect(html).toContain("Selected additional");
    expect(html).toContain("Included zero-value item");
  });

  it("renders value immediately before the rightmost quantity for headers and rows", async () => {
    const html = await renderReport();
    expect(html).toMatch(/<th[^>]*>Value<\/th><th[^>]*>Quantity<\/th>/);
    expect(html).toMatch(/<td[^>]*>900<\/td><td[^>]*>3<\/td>/);
    expect(html).toMatch(/<td[^>]*>400<\/td><td[^>]*>2<\/td>/);
  });

  it("shows the stock deduction, the adjustment and its mandatory reason", async () => {
    const html = await renderReport();
    expect(html).toContain("Stock-reduced item");
    expect(html).toContain("Site already holds two");
    // calculated 5, stock 2, after stock 3, adjust -1, value 200, final 2
    expect(html).toMatch(/<td[^>]*>5<\/td><td[^>]*>2<\/td><td[^>]*>3<\/td><td[^>]*>-1<\/td><td[^>]*>200<\/td><td[^>]*>2<\/td>/);
  });

  it("shows rep-chosen give-aways in their own section with the REF number", async () => {
    const html = await renderReport();
    expect(html).toContain("Third party FOC (chosen by the rep)");
    expect(html).toContain("Disposable Gloves(powderless) size M");
    expect(html).toContain("REF 05840031001");
    expect(html).toContain("100394733");
  });

  // Below `lg` the tables are swapped for a card per line. Both renderings sit
  // in the DOM at once, so the risk is one of them quietly losing a column.
  it("repeats every order line as a card, carrying the same figures as the row", async () => {
    const html = await renderReport();
    expect(html.match(/<dt[^>]*>Calculated<\/dt>/g)).toHaveLength(doc.focItems.length);
    expect(html.match(/<th[^>]*>Calculated<\/th>/g)).toHaveLength(1);
    // Every column the table has, the card has: five figures plus the quantity.
    for (const label of ["Calculated", "Stock on hand", "After stock", "Adjust", "Value", "Quantity"]) {
      expect(html).toContain(`>${label}</dt>`);
    }
    // The adjustment's mandatory reason is part of the line, not decoration.
    expect(html.match(/Site already holds two/g)).toHaveLength(2);
  });

  it("repeats rep-chosen give-aways as cards too", async () => {
    const html = await renderReport();
    expect(html.match(/<dt[^>]*>THB \/ pack<\/dt>/g)).toHaveLength(doc.additionalFocItems.length);
    expect(html.match(/<th[^>]*>THB \/ pack<\/th>/g)).toHaveLength(1);
  });

  it("offers both export formats", async () => {
    const html = await renderReport();
    expect(html).toContain("Download PDF");
    expect(html).toContain("Download Excel");
  });

  it("404s when the loader refuses the submission", async () => {
    mocks.loadSubmissionDoc.mockResolvedValue(null);
    await expect(renderReport()).rejects.toThrow("Not found");
  });
});
