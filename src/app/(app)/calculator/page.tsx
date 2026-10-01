import { prisma } from "@/lib/prisma";
import { timed } from "@/lib/perf";
import { toAccountDTO, toAdditionalFocDTO, toAssayDTO } from "@/lib/dto";
import { Calculator } from "@/components/calculator/Calculator";

export default async function CalculatorPage() {
  const [accounts, assays, additionalFoc] = await timed("calculator: master data", () => Promise.all([
    prisma.account.findMany({ where: { active: true }, orderBy: { accountName: "asc" } }),
    prisma.masterAssay.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.additionalFocItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { description: "asc" }],
    }),
  ]));

  return (
    <div className="mx-auto min-w-0 max-w-5xl">
      <h1 className="mb-6 text-xl font-semibold text-ink">FOC Calculator</h1>
      <Calculator
        accounts={accounts.map(toAccountDTO)}
        assays={assays.map(toAssayDTO)}
        additionalFoc={additionalFoc.map(toAdditionalFocDTO)}
      />
    </div>
  );
}
