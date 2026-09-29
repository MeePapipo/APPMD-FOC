import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSubmissionDoc } from "./submission-doc";
import type { SessionUser } from "@/lib/session";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    submission: { findUnique: mocks.findUnique },
    masterItem: { findMany: mocks.findMany },
  },
}));

const REP: SessionUser = { id: "u1", email: "rep@roche.com", role: "USER" };
const ADMIN: SessionUser = { id: "u2", email: "admin@roche.com", role: "ADMIN" };

function line(overrides: Record<string, unknown> = {}) {
  return {
    materialNo: "M-1",
    description: "cobas omni Lysis Reagent",
    category: "Generic",
    unitText: "kit",
    calculatedQty: 5,
    stockOnHand: null,
    afterStockQty: null,
    adjustedQty: null,
    adjustComment: null,
    finalQty: 5,
    unitPrice: 100,
    lineValue: 500,
    ...overrides,
  };
}

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    accountNumber: "0012/34",
    accountName: "Siriraj Hospital",
    createdByEmail: "rep@roche.com",
    createdAt: new Date("2026-09-09T03:00:00Z"),
    status: "SUBMITTED",
    revenue: 10000,
    focValue: 500,
    focPct: 0.05,
    assayInputs: [{ system: "S6800", assayCode: "HBV", tests: 1000 }],
    reagents: [],
    lines: [line()],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([
    { materialNo: "M-1", group: "Generic", packText: "12 kits", dkshCode: "D-1" },
  ]);
});

describe("loadSubmissionDoc access control", () => {
  it("returns null for a submission that does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await loadSubmissionDoc("missing", REP)).toBeNull();
  });

  it("returns null for another rep's submission", async () => {
    mocks.findUnique.mockResolvedValue(submission({ createdByEmail: "someone-else@roche.com" }));
    expect(await loadSubmissionDoc("sub-1", REP)).toBeNull();
  });

  it("lets an admin read any submission", async () => {
    mocks.findUnique.mockResolvedValue(submission({ createdByEmail: "someone-else@roche.com" }));
    expect(await loadSubmissionDoc("sub-1", ADMIN)).not.toBeNull();
  });
});

describe("loadSubmissionDoc contents", () => {
  it("only asks the database for included lines", async () => {
    mocks.findUnique.mockResolvedValue(submission());
    await loadSubmissionDoc("sub-1", REP);
    const [{ include }] = mocks.findUnique.mock.calls[0];
    expect(include.lines.where).toEqual({ included: true });
  });

  it("joins group, pack and DKSH back from the master item", async () => {
    mocks.findUnique.mockResolvedValue(submission());
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.focItems[0]).toMatchObject({ group: "Generic", packText: "12 kits", dkshCode: "D-1" });
  });

  it("falls back to the snapshotted fields when the master item is gone", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue(submission());
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.focItems[0]).toMatchObject({ group: "Generic", packText: "kit", dkshCode: null });
  });

  it("treats a null afterStockQty as the untouched calculated quantity", async () => {
    mocks.findUnique.mockResolvedValue(submission());
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.focItems[0]).toMatchObject({ afterStockQty: 5, adjustedQty: 0, grossValue: 500 });
  });

  it("carries the stock deduction and adjustment through", async () => {
    mocks.findUnique.mockResolvedValue(submission({
      lines: [line({
        calculatedQty: 5, stockOnHand: 2, afterStockQty: 3,
        adjustedQty: -1, adjustComment: "Site holds two", finalQty: 2, lineValue: 200,
      })],
    }));
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.focItems[0]).toMatchObject({
      calculatedQty: 5, stockOnHand: 2, afterStockQty: 3,
      grossValue: 300, adjustedQty: -1, finalQty: 2, finalValue: 200,
      adjustComment: "Site holds two",
    });
  });

  it("renames the master sheet's 'Conditional' group to Common additional", async () => {
    mocks.findUnique.mockResolvedValue(submission());
    mocks.findMany.mockResolvedValue([
      { materialNo: "M-1", group: "Conditional", packText: null, dkshCode: null },
    ]);
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.focItems[0].group).toBe("Common additional");
  });

  it("passes every other group through untouched", async () => {
    for (const group of ["Control", "Optional", "Generic"]) {
      mocks.findUnique.mockResolvedValue(submission());
      mocks.findMany.mockResolvedValue([
        { materialNo: "M-1", group, packText: null, dkshCode: null },
      ]);
      const doc = await loadSubmissionDoc("sub-1", REP);
      expect(doc?.focItems[0].group).toBe(group);
    }
  });

  it("orders the table the way the calculator does, alphabetical within each group", async () => {
    mocks.findUnique.mockResolvedValue(submission({
      // The query returns description order; the loader only regroups.
      lines: [
        line({ materialNo: "M-opt-a", description: "A optional" }),
        line({ materialNo: "M-cond", description: "B conditional" }),
        line({ materialNo: "M-ctl", description: "C control" }),
        line({ materialNo: "M-gen", description: "D generic" }),
        line({ materialNo: "M-opt-b", description: "E optional" }),
        line({ materialNo: "M-unknown", description: "F brand new group" }),
      ],
    }));
    mocks.findMany.mockResolvedValue([
      { materialNo: "M-opt-a", group: "Optional", packText: null, dkshCode: null },
      { materialNo: "M-cond", group: "Conditional", packText: null, dkshCode: null },
      { materialNo: "M-ctl", group: "Control", packText: null, dkshCode: null },
      { materialNo: "M-gen", group: "Generic", packText: null, dkshCode: null },
      { materialNo: "M-opt-b", group: "Optional", packText: null, dkshCode: null },
      { materialNo: "M-unknown", group: "Somethingelse", packText: null, dkshCode: null },
    ]);
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.focItems.map((i) => i.group)).toEqual([
      "Control", "Generic", "Common additional", "Optional", "Optional", "Somethingelse",
    ]);
    // Two optionals keep the description order they arrived in.
    expect(doc?.focItems.filter((i) => i.group === "Optional").map((i) => i.description))
      .toEqual(["A optional", "E optional"]);
  });

  it("flags a line given beyond the post-stock entitlement and rolls it up", async () => {
    mocks.findUnique.mockResolvedValue(submission({
      lines: [
        line({
          materialNo: "M-over", calculatedQty: 5, stockOnHand: 2, afterStockQty: 3,
          adjustedQty: 4, finalQty: 7, lineValue: 700, unitPrice: 100,
        }),
        line({ materialNo: "M-plain", calculatedQty: 2, afterStockQty: 2, finalQty: 2, lineValue: 200 }),
      ],
    }));
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.focItems.find((i) => i.materialNo === "M-over")?.overGiveQty).toBe(4);
    expect(doc?.focItems.find((i) => i.materialNo === "M-plain")?.overGiveQty).toBe(0);
    // 4 extra packs at 100 — the three the formula asked for are not counted.
    expect(doc?.overGive).toEqual({ lineCount: 1, packs: 4, value: 400 });
  });

  it("reports no over-give when every line sits at or below its entitlement", async () => {
    mocks.findUnique.mockResolvedValue(submission({
      lines: [line({ calculatedQty: 5, stockOnHand: 2, afterStockQty: 3, adjustedQty: -1, finalQty: 2, lineValue: 200 })],
    }));
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.overGive).toEqual({ lineCount: 0, packs: 0, value: 0 });
  });

  it("measures over-give against the fallback when afterStockQty was never stored", async () => {
    mocks.findUnique.mockResolvedValue(submission({
      lines: [line({ calculatedQty: 5, afterStockQty: null, adjustedQty: 2, finalQty: 7, lineValue: 700 })],
    }));
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.focItems[0]).toMatchObject({ afterStockQty: 5, overGiveQty: 2 });
  });

  it("labels the systems the order touched", async () => {
    mocks.findUnique.mockResolvedValue(submission({
      assayInputs: [
        { system: "S6800", assayCode: "HBV", tests: 100 },
        { system: "S5800", assayCode: "HBV", tests: 50 },
        { system: "S6800", assayCode: "HCV", tests: 10 },
      ],
    }));
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.systemsLabel).toBe("cobas 6800/8800 + cobas 5800");
  });

  it("builds a filename stem safe for Content-Disposition", async () => {
    mocks.findUnique.mockResolvedValue(submission());
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(doc?.fileStem).toBe("FOC-0012_34-2026-09-09");
    expect(doc?.fileStem).not.toMatch(/["/\\]/);
  });

  it("skips the master lookup entirely when there are no lines", async () => {
    mocks.findUnique.mockResolvedValue(submission({ lines: [] }));
    const doc = await loadSubmissionDoc("sub-1", REP);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(doc?.focItems).toEqual([]);
  });
});
