---
name: foc-webapp-dashboard-develop
description: Change or extend the Dashboard page in this app (/home/praditww/foc-webapp) — panels, filters, the account drill-down, or the entitlement/quota engine. Use whenever praditww asks to adjust something on /dashboard in THIS app, or reports a number there looks wrong. NOT for the separate, unrelated FOC Data_Tableau project at .../foc-calculator/FOC Data_Tableau/ — that one has its own foc-dashboard-develop skill and must never be confused with this one (different codebase, different repo, different Claude session usually owns it).
---

## Where everything is (all inside `/home/praditww/foc-webapp`)

| File | Role |
|---|---|
| `src/app/(app)/dashboard/page.tsx` | The whole Dashboard page — server component, reads `year`/`month`/`ateam`/`q`/`hi`/`xna` search params, renders filters/KPIs/panels/table. No "My orders" tab anymore — removed 2026-09-29, praditww only wants the real Tableau-imported numbers. |
| `src/lib/dashboard/focActualsAggregate.ts` | Tab-level aggregation over `FocActual`: monthly trend, by-team, per-account rows (`focAccountRows`), cost composition. Exports `ratioOf`/`monthKey`/`monthLabel` for reuse. |
| `src/lib/dashboard/focAccountDetail.ts` | Same idea, scoped to **one account's full history** (ignores the page's month filter) — powers the drill-down modal's KPI/trend/products panels. |
| `src/lib/dashboard/entitlement.ts` | The quota/entitlement engine — see its own section below. |
| `src/app/api/dashboard/account/route.ts` | `GET ?name=<accountName>` — any signed-in user, not admin-gated. Returns the drill-down modal's full payload (summary, monthly, productsGiven/Sold, entitlement). |
| `src/components/dashboard/*` | `ActualsFilters` (year/month/team/account-dropdown/>20%), `ExcludeNaToggle` (lives next to the detail table, not the top bar), `FocActualsAccountTable` (sortable, clickable rows), `AccountDrilldown` (the modal), `EntitlementTable` (the quota table inside it), `BarChart`/`DonutChart`/`LineChart`/`RatioBadge`/`StatTile` (chart primitives, no chart library). |
| `src/lib/dashboard/focActualsImport.ts` | Tableau crosstab CSV parser → `FocActual` rows. Admin-only import, deduped by upsert on `[year,month,accountName,materialNo,productName]`. |

## Gotchas that will bite you if you forget them

- **`ratio` has a load-bearing 3-way branch** (`ratioOf` in `focActualsAggregate.ts`): `revenue>0 → cost/revenue`; `revenue===0 && cost>0 → Infinity` ("N/A" in the UI, but it DOES count as a ">20%" breach — `Infinity > 0.2` is true and that's intentional, an unbillable give-away is worse than 20%, not undefined); `revenue===0 && cost===0 → 0` (nothing happened, not a breach). Getting the third branch wrong silently mislabels real accounts — confirmed 2 of 238 accounts hit it.
- **`ateam` is a deliberately different URL param name from `team`.** `FocActual.team` stores the raw Tableau `TLevel3` string ("TH - North"); it is NOT this app's own `Team` enum. Reusing `team` would silently break filtering if the param ever leaked in from elsewhere.
- **The account picker is a `<select>` of real names, not free text** — account names in this source data are inconsistently spelled (typos, double spaces before the trailing `(materialNo)`, stray apostrophes). Guessing a name by hand is unreliable; even I got a real account's name wrong twice while testing this (single vs double space). Always read the name from the rendered dropdown/table, never retype it.
- **`FocActual.tests` (raw `NumberOfTests(Custom)`) must never drive the quota engine.** Use `soldQty`/`revenueQty` instead — see the entitlement section.

## The entitlement/quota engine (`entitlement.ts`)

Computes "what was this account entitled to receive per item, vs. what it actually got" — ported deliberately from the *other* project's `foc-core.js` (`evaluateSystem`/`evaluate4800`/`buildEntitlement`), but reusing **this app's own** `MasterAssay`/`MasterItem`/`AdditionalFocItem`/`TpbEntry` tables and its own batch/driver primitives (`src/lib/calc/batches.ts`, `driver.ts`, `engine4800.ts`, `tpb.ts`, `round.ts`) — the same ones the Calculator itself runs on a live order. This means the quota engine can never drift from what the Calculator would compute for a real order, and it evolves automatically as praditww edits Master data/TPB in the admin console — no separate curated copy to keep in sync.

**Two load-bearing rules — get either wrong and you get a wrong-but-plausible-looking quota number:**

1. **Quota is driven by Selling Quantity only, never `FocActual.tests`.** Free reagent must never enlarge its own quota (praditww's explicit rule — the other project had the same bug once and reversed it 2026-09-29). Use `FocActual.soldQty` for the "sold" figure fed into `MaterialGiven` — **not `revenueQty`**, even though for genuine reagent-kit rows the two are numerically identical (a reagent materialNo is always "Reagents, kits" category). `revenueQty` is zeroed by the import pipeline for non-reagent rows, which silently breaks the "ซื้อเอง" (sold) column for non-reagent give-away items like an Additional FOC consumable — confirmed against a real account where the reference showed Selling Qty -1 and `revenueQty` reported 0.
2. **`MasterAssay.materialNo` does not uniquely imply a system.** 18 of 25 distinct material numbers in this app's own live DB are shared between 6800 and 5800 (real reagent kits sold under one material number, run on either analyser). Which system(s) an account actually runs is *inferred* from a small, hardcoded set of platform-EXCLUSIVE consumables (`PLATFORM_MARKERS`/`MARKERS_4800` in `entitlement.ts`, ported verbatim and confirmed to exist in this app's own `MasterItem`/`MasterAssay` with matching descriptions) — weighing the evidence (a side needs ≥2× the other's distinct markers to win outright) rather than trusting bare presence, so one stray box of the "wrong" platform's plate doesn't flip the whole account.

**Verified correctness, not assumed** (2026-09-29): ran the real DB through `computeEntitlement` for `RAMATHIBODI HOSPITAL(FAC.OF PATHLOAGY)  (0052028315)` — a genuinely complex "both (6800+5800)+4800" platform account — and cross-checked against praditww's own screenshots of the reference dashboard for this exact account:
- Revenue ฿12,741,337 / FOC cost ฿21,749 / Bonus cost ฿1,746,480 / Total cost ฿1,768,229 / 13.88% — exact match.
- Platform "both+4800" with the identical Thai basis text — exact match.
- Three real line items' Quota/FOC/Bonus/over/ratio (LYS REAGENT 13/0/47/+34/3.62×, SPEC DIL 13/0/27/+14/2.08×, HBV/HCV/HIV RMC 13/0/18/+5/1.38×) — exact match to 2 decimal places.
- The Additional FOC bucket (Sticky Mat 26x45, ฿1,700, Selling Qty -1) — exact match after the `soldQty` fix above.
- Then swept **all 238 real accounts** through the endpoint: zero request failures, zero non-finite/nonsense values.

**One known, accepted, non-bug divergence**: the "main reagent actually sent" summary line's `(N batches)` figure can differ from what the reference project shows for the same account, because the two apps maintain **separate** `TpbEntry` snapshots (this app's own admin-managed TPB data vs. that project's own `tpb.json`). Tests-per-code always match exactly (confirming Selling-Quantity derivation and platform detection are correct); only the TPB-divisor-dependent batch count can differ. This is expected and correct — this app should reflect its own live TPB data, not silently mirror a different project's separately-maintained snapshot. Re-verify against a real account (not a synthetic fixture) if you touch this again, the same way this was verified.

**Not yet done / accepted simplification**: no separate "additional FOC materials with an assay link" edge case beyond what `AdditionalFocItem` already covers.

## Verification workflow (no browser available in this sandbox)

`npx tsc --noEmit`, `npx eslint src/`, `npm test` first. Then, since Playwright can't launch here, verify against the **real running dev server** with an authenticated `fetch()` (Auth.js credentials flow — csrf token → `/api/auth/callback/credentials` → session cookie, admin login `appmd@roche.com`/`Admin001`), the same technique used throughout this feature's development: fetch `/api/dashboard/account?name=<exact real name>` and inspect the JSON directly, or fetch `/dashboard?...` and grep the rendered HTML for expected values/absence of `NaN`/error digests. Cross-check numbers against a previously-confirmed-correct figure (an earlier screenshot, an earlier API response, or the reference dashboard) rather than trusting a new number on its own — this caught two real bugs during development (the ratio 3-way branch, the `revenueQty`→`soldQty` fix) that would otherwise have shipped silently.

Run `npm run smoke` too if you touch anything shared (`StatTile`/`BarChart`/`Card` in `src/components/ui.tsx` or `src/components/dashboard/`) — it doesn't test the Dashboard directly but does exercise the Calculator/admin flows that share those primitives.


## Added 2026-10-01 (read this before touching the dashboard or the import)

- **Views**: `page.tsx` renders `?view=accounts` (default, account accordion with a product x Jan..Dec matrix), `overview` (the original panels) and `alerts` (largest over-quota items + finance tables). Helpers: `lib/dashboard/{filters,scope,focAccountMatrix,focFinance,focExports,accountDetailLoader}.ts`, `components/dashboard/{AccountsView,AccountMatrixPanel,AlertsView,DashboardViewTabs}.tsx`. Exports: `/api/dashboard/account/export` (PDF/CSV) and `/api/dashboard/export` (CSV of everything filtered).
- **Per-account TPB now exists**: `computeEntitlement` callers pass a `tpbInput` built by `loadEngineData(accountId)` (own TPB, never below `accountFloorRatio` x national, needs `accountMinRuns`). Find the Account from the zero-padded number at the end of the FocActual name (`accountNumberFromName`). The old "no per-account TPB" caveat is obsolete.
- **Over-quota alert**: each entitlement row has `significant` (>= `minOverUnits` AND > `overPct6800`/`overPct5800` of the entitlement; thresholds in Admin -> Settings via `loadAlertThresholds`). `computeAccountAlerts` scores every account for the list/alerts view.
- **Import rules** (`focActualsImport.ts`, `focActualsDiff.ts`, `FocActualsImportControl.tsx`, `/api/admin/foc-actuals/import[/complete]`): a Tableau pull is one month x two years x every product line. The parser indexes columns by (year, month), filters PL3 to `FocImportSettings.allowedProductLines` (default MOLECULAR LAB = "MD"), and runs in the browser. The API only ever ADDS rows that are not stored; identical rows are skipped, team/rep-only differences are refreshed, revised figures are reported and applied only with the admin's checkbox. Never reintroduce the old "upsert every row" behaviour or a single-year assumption.
- **Data freshness**: `loadDataThrough()` (latest month + last import from the `FocActualImport` audit entries) feeds the page header and the Calculator allowance panel.
- Verify against the real dev server as above; PDF changes are verified with vitest (`lib/export/*.test.ts`), not the dev server (HMR garbles the Thai font).
