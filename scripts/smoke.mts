/**
 * Drives a locally running dev server the way a signed-in rep would: dev-auth
 * login, then fetch each page and the two export routes, reporting status and
 * a few markers from each body.
 *
 * Needs the server started with DEV_AUTH=true. Run: npx tsx scripts/smoke.mts
 */
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { parseCsvRecords } from "../src/lib/csv";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = "praditww@roche.com";

const jar = new Map<string, string>();

function storeCookies(res: Response) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function get(path: string, redirect: RequestRedirect = "manual") {
  const res = await fetch(BASE + path, { headers: { cookie: cookieHeader() }, redirect });
  storeCookies(res);
  return res;
}

/**
 * Self-registration + credentials login, in its own cookie jar so it can't
 * clobber the shared dev-auth session `main()` uses afterward for the
 * ADMIN-level page checks below. Idempotent across reruns: the happy-path
 * email accepts either 200 (first run) or 409 (subsequent runs) — everything
 * else is a negative path that never creates a row.
 */
async function testSelfRegistration() {
  const localJar = new Map<string, string>();
  const store = (res: Response) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) localJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookies = () => [...localJar].map(([k, v]) => `${k}=${v}`).join("; ");
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies() },
      body: JSON.stringify(body),
    });
    store(res);
    return res;
  };

  console.log("Self-registration:");

  const badDomain = await post("/api/register", {
    name: "Smoke Test",
    email: "smoke-test@gmail.com",
    team: "NORTH",
    password: "password123",
  });
  console.log(`  ${badDomain.status === 400 ? "✓" : "✗"} non-roche.com domain rejected (${badDomain.status})`);

  const weakPassword = await post("/api/register", {
    name: "Smoke Test",
    email: "smoke-weakpass@roche.com",
    team: "NORTH",
    password: "short",
  });
  console.log(`  ${weakPassword.status === 400 ? "✓" : "✗"} short password rejected (${weakPassword.status})`);

  const email = "smoke-register@roche.com";
  const password = "Smokepassword123";
  const register = await post("/api/register", { name: "Smoke Test", email, team: "NORTH", password });
  console.log(`  ${register.status === 200 || register.status === 409 ? "✓" : "✗"} register (${register.status})`);

  const dup = await post("/api/register", { name: "Smoke Test", email, team: "NORTH", password });
  console.log(`  ${dup.status === 409 ? "✓" : "✗"} duplicate email rejected (${dup.status})`);

  const dupCase = await post("/api/register", {
    name: "Smoke Test",
    email: email.toUpperCase(),
    team: "NORTH",
    password,
  });
  console.log(`  ${dupCase.status === 409 ? "✓" : "✗"} case-variant duplicate email rejected (${dupCase.status})`);

  // Real Auth.js credentials flow: csrf token -> callback -> session cookie.
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookies() } });
  store(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookies() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/calculator` }),
    redirect: "manual",
  });
  store(loginRes);
  const session = (await (
    await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookies() } })
  ).json()) as { user?: { email?: string; role?: string } } | null;
  console.log(
    `  ${session?.user?.email === email ? "✓" : "✗"} credentials login round-trip (signed in as ${session?.user?.email ?? "(nobody)"})`,
  );

  const wrongPassword = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookies() },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: "wrong-password",
      callbackUrl: `${BASE}/calculator`,
    }),
    redirect: "manual",
  });
  const rejectedWrongPassword = (wrongPassword.headers.get("location") ?? "").includes("error=");
  console.log(`  ${rejectedWrongPassword ? "✓" : "✗"} wrong password rejected`);

  // Deactivated-user rejection isn't checked here — there's no admin console
  // yet to deactivate an account with (that's Phase 2 of the roadmap).
}

/**
 * Exercises the admin console using the already-established (shared `jar`)
 * ADMIN session from the dev-auth login just above, plus a throwaway
 * credentials login for the 403-as-non-admin check.
 */
async function testAdminConsole(admin: { id?: string; email?: string; role?: string }) {
  console.log("Admin console:");

  const listRes = await get("/api/admin/users");
  const { users } = (await listRes.json()) as { users?: { id: string; email: string; active: boolean }[] };
  console.log(`  ${listRes.status === 200 ? "✓" : "✗"} GET /api/admin/users (${listRes.status})`);

  const target = users?.find((u) => u.email === "smoke-register@roche.com");
  if (!target) {
    console.log("  (smoke-register@roche.com not found — run the self-registration block first)");
  } else {
    const deactivate = await fetch(`${BASE}/api/admin/users/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ team: "SOUTH", active: false }),
    });
    const deactivateBody = (await deactivate.json()) as { user?: { team?: string; active?: boolean } };
    console.log(
      `  ${deactivate.status === 200 && deactivateBody.user?.team === "SOUTH" && deactivateBody.user?.active === false ? "✓" : "✗"} PATCH team+deactivate (${deactivate.status})`,
    );

    // Restore active so a rerun of testSelfRegistration()'s login check still
    // works — this script is meant to be idempotent across runs.
    const reactivate = await fetch(`${BASE}/api/admin/users/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ active: true }),
    });
    console.log(`  ${reactivate.status === 200 ? "✓" : "✗"} PATCH reactivate (${reactivate.status})`);
  }

  if (admin.id) {
    const selfDemote = await fetch(`${BASE}/api/admin/users/${admin.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ active: false }),
    });
    console.log(`  ${selfDemote.status === 400 ? "✓" : "✗"} self-deactivate rejected (${selfDemote.status})`);
  }

  // A non-admin must not reach either admin route.
  const localJar = new Map<string, string>();
  const store = (res: Response) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) localJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookies = () => [...localJar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  store(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const repLogin = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookies() },
    body: new URLSearchParams({
      csrfToken,
      email: "smoke-register@roche.com",
      password: "Smokepassword123",
      callbackUrl: `${BASE}/calculator`,
    }),
    redirect: "manual",
  });
  store(repLogin);
  const repList = await fetch(`${BASE}/api/admin/users`, { headers: { cookie: cookies() } });
  console.log(`  ${repList.status === 403 ? "✓" : "✗"} non-admin GET /api/admin/users refused (${repList.status})`);
}

/**
 * Proves admin edits to MasterAssay/MasterItem/TpbEntry actually change the
 * live calculation engine's output, not just that a row saved — the
 * strongest possible check that the admin console is wired to the real
 * formula. Idempotent: reuses fixture rows by code/materialNo across reruns
 * instead of erroring on a uniqueness conflict.
 */
async function testAdminMasterData() {
  console.log("Admin master data + TPB (engine-effect proof):");

  const apiGet = async (path: string) => {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookieHeader() } });
    return { res, body: await res.json().catch(() => ({})) };
  };
  const apiSend = async (path: string, method: string, payload: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify(payload),
    });
    return { res, body: await res.json().catch(() => ({})) };
  };

  const ASSAY_CODE = "ZZSMOKE";
  const ITEM_MATERIAL = "ZZSMOKE-ITEM";
  const ASSAY_MATERIAL = "ZZSMOKE-ASSAY";

  // --- find-or-create the throwaway S6800 assay ---
  // batchRow matters here, not just cosmetically: a BATCH-driver item's units
  // come from batches.ts's grouping by batchRow — an assay with no batchRow
  // forms no batch group at all, so a BATCH item applying to it computes 0
  // units silently (no error, just an absent line). A unique batchRow (well
  // outside real data's range) gives the fixture its own solo batch group.
  const FIXTURE_BATCH_ROW = 999001;
  const { body: assayList } = await apiGet("/api/admin/master/assays?system=S6800");
  let assay = (assayList.assays as { id: string; code: string }[] | undefined)?.find((a) => a.code === ASSAY_CODE);
  if (!assay) {
    const { res, body } = await apiSend("/api/admin/master/assays", "POST", {
      system: "S6800",
      code: ASSAY_CODE,
      materialNo: ASSAY_MATERIAL,
      description: "Smoke-test fixture assay",
      packSize: 100,
      price: 1000,
      batchRow: FIXTURE_BATCH_ROW,
      batchLabel: "Smoke-test fixture",
    });
    console.log(`  ${res.status === 200 ? "✓" : "✗"} create fixture MasterAssay (${res.status})`);
    assay = body.assay;
  } else {
    await apiSend(`/api/admin/master/assays/${assay.id}`, "PATCH", { active: true, batchRow: FIXTURE_BATCH_ROW });
  }

  const dupAssay = await apiSend("/api/admin/master/assays", "POST", {
    system: "S6800",
    code: ASSAY_CODE,
    materialNo: `${ASSAY_MATERIAL}-DUP`,
    description: "dup",
    packSize: 1,
  });
  console.log(`  ${dupAssay.res.status === 409 ? "✓" : "✗"} duplicate [system,code] rejected (${dupAssay.res.status})`);

  // --- find-or-create the BATCH-driver item, appliesToAll so it
  //     automatically picks up the fixture assay on this system ---
  const { body: itemList } = await apiGet("/api/admin/master/items?system=S6800");
  let item = (itemList.items as { id: string; materialNo: string; consumption: number }[] | undefined)?.find(
    (i) => i.materialNo === ITEM_MATERIAL,
  );
  if (!item) {
    const { res, body } = await apiSend("/api/admin/master/items", "POST", {
      system: "S6800",
      materialNo: ITEM_MATERIAL,
      description: "Smoke-test fixture item",
      group: "Generic",
      optional: false,
      onDemand: false,
      packSize: 1,
      consumption: 1,
      coverage: 1,
      price: 100,
      driver: "BATCH",
      appliesToAll: true,
      appliesTo: [],
    });
    console.log(`  ${res.status === 200 ? "✓" : "✗"} create fixture MasterItem (${res.status})`);
    item = body.item;
  } else if (item.consumption !== 1) {
    const { body } = await apiSend(`/api/admin/master/items/${item.id}`, "PATCH", { consumption: 1, active: true });
    item = body.item;
  } else {
    await apiSend(`/api/admin/master/items/${item.id}`, "PATCH", { active: true });
  }

  const dupItem = await apiSend("/api/admin/master/items", "POST", {
    system: "S6800",
    materialNo: ITEM_MATERIAL,
    description: "dup",
    group: "Generic",
    optional: false,
    onDemand: false,
    packSize: 1,
    consumption: 1,
    coverage: 1,
    driver: "TEST",
    appliesToAll: true,
    appliesTo: [],
  });
  console.log(`  ${dupItem.res.status === 409 ? "✓" : "✗"} duplicate [system,materialNo] rejected (${dupItem.res.status})`);

  // --- set a known TPB (tpb=10 -> 1000 tests = 100 batches = 100 units) ---
  await apiSend("/api/admin/tpb", "PATCH", {
    entries: [{ action: "upsert", system: "S6800", code: ASSAY_CODE, tpb: 10, confidence: "normal" }],
  });

  const calcAt = async (tpb: number) => {
    const { res, body } = await apiSend("/api/calculate", "POST", { testsBySys: { "6800": { [ASSAY_CODE]: 1000 } } });
    const line = (body.lines as { materialNo: string; qty: number }[] | undefined)?.find(
      (l) => l.materialNo === ITEM_MATERIAL,
    );
    return { ok: res.ok, qty: line?.qty, present: !!line, tpb };
  };

  const before = await calcAt(10);
  console.log(`  ${before.ok && before.qty === 100 ? "✓" : "✗"} tpb=10 -> 100 batches -> qty ${before.qty} (expected 100)`);

  // Doubling the TPB should halve the batch count and thus the item qty —
  // the strongest possible proof the TPB screen is wired to the real formula.
  await apiSend("/api/admin/tpb", "PATCH", {
    entries: [{ action: "upsert", system: "S6800", code: ASSAY_CODE, tpb: 50, confidence: "normal" }],
  });
  const afterTpbChange = await calcAt(50);
  console.log(
    `  ${afterTpbChange.ok && afterTpbChange.qty === 20 ? "✓" : "✗"} tpb=50 -> 20 batches -> qty ${afterTpbChange.qty} (expected 20)`,
  );

  // Doubling consumption should double the qty back up.
  await apiSend(`/api/admin/master/items/${item!.id}`, "PATCH", { consumption: 2 });
  const afterConsumptionChange = await calcAt(50);
  console.log(
    `  ${afterConsumptionChange.ok && afterConsumptionChange.qty === 40 ? "✓" : "✗"} consumption=2 -> qty ${afterConsumptionChange.qty} (expected 40)`,
  );

  // Deactivating the item must drop it from the response entirely.
  await apiSend(`/api/admin/master/items/${item!.id}`, "PATCH", { active: false, consumption: 1 });
  const afterDeactivate = await calcAt(50);
  console.log(`  ${!afterDeactivate.present ? "✓" : "✗"} deactivated item absent from /api/calculate`);

  // Leave both fixtures deactivated — this DB is the same one the real app
  // (and real reps, via dev-auth) reads from, so a fixture left active would
  // show up in the live Calculator's assay dropdown and item list, not just
  // in this script. (Confirmed the hard way: an earlier version of this test
  // reactivated at the end "for the next rerun" and it leaked into a real
  // screenshot.) The find-or-create logic above already reactivates both
  // rows for the duration of a rerun, so nothing is lost by leaving them off
  // here — only restore the TPB value, which isn't visible anywhere unless
  // the item is active.
  await apiSend(`/api/admin/master/assays/${assay!.id}`, "PATCH", { active: false });
  await apiSend("/api/admin/tpb", "PATCH", {
    entries: [{ action: "upsert", system: "S6800", code: ASSAY_CODE, tpb: 10, confidence: "normal" }],
  });
}

/**
 * Exercises the file-upload import endpoints specifically (multipart
 * parsing, CSV/xlsx header-name matching, string->typed coercion) — the
 * engine-effect proof above already covers the underlying apply logic via
 * the JSON PATCH path, so this only needs to prove the file layer works.
 */
async function testMasterDataImportExport() {
  console.log("Master data + TPB import/export (file upload):");

  const apiGetText = async (path: string) => {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookieHeader() } });
    return { res, text: await res.text() };
  };
  const upload = async (path: string, filename: string, contents: string | Buffer) => {
    const form = new FormData();
    form.append("file", new Blob([contents as never]), filename);
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { cookie: cookieHeader() }, body: form });
    return { res, body: await res.json().catch(() => ({})) };
  };

  // CSV round-trip: exporting then re-importing the exact same file must
  // update every row it already knows about and create none, with no errors.
  for (const kind of ["assays", "items"] as const) {
    const { res: exportRes, text: csv } = await apiGetText(`/api/admin/master/${kind}/export`);
    // Quote-aware row count — a naive split("\n") overcounts whenever a
    // description/notes cell has an embedded newline.
    const rowCount = parseCsvRecords(csv).length;
    console.log(`  ${exportRes.status === 200 && rowCount > 0 ? "✓" : "✗"} export ${kind} CSV (${exportRes.status}, ${rowCount} rows)`);

    const { res: importRes, body } = await upload(`/api/admin/master/${kind}/import`, `${kind}.csv`, csv);
    const clean = importRes.status === 200 && body.created === 0 && (body.rowErrors ?? []).length === 0;
    console.log(
      `  ${clean ? "✓" : "✗"} round-trip re-import ${kind} (created=${body.created}, updated=${body.updated}, errors=${(body.rowErrors ?? []).length})`,
    );
  }

  // TPB xlsx import: a minimal in-memory workbook rather than depending on a
  // file on praditww's Windows desktop existing/being reachable.
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("TPB by Assay");
  sheet.addRow(["System", "Assay Code", "Test per Batch (TPB)", "Months with data", "Total Runs", "Total Samples", "Confidence", "Notes"]);
  sheet.addRow(["cobas 6800/8800", "ZZSMOKE", 15, "1/1", 10, 100, "normal", "smoke test"]);
  const xlsxBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  const { res: tpbRes, body: tpbBody } = await upload("/api/admin/tpb/import", "tpb.xlsx", xlsxBuffer);
  console.log(
    `  ${tpbRes.status === 200 && tpbBody.imported === 1 && (tpbBody.rowErrors ?? []).length === 0 ? "✓" : "✗"} xlsx import matches by header name (imported=${tpbBody.imported})`,
  );

  // Restore tpb=10 so testAdminMasterData's own baseline assertion still
  // holds regardless of which test ran most recently.
  await fetch(`${BASE}/api/admin/tpb`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: cookieHeader() },
    body: JSON.stringify({ entries: [{ action: "upsert", system: "S6800", code: "ZZSMOKE", tpb: 10, confidence: "normal" }] }),
  });
}

async function main() {
  await testSelfRegistration();

  // next-auth credentials flow: csrf token -> callback -> session cookie.
  const csrfRes = await get("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  // Provider id is "dev" (src/auth.ts), not the default "credentials".
  const loginRes = await fetch(`${BASE}/api/auth/callback/dev`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken, email: EMAIL, callbackUrl: `${BASE}/calculator` }),
    redirect: "manual",
  });
  storeCookies(loginRes);

  const session = (await (await get("/api/auth/session")).json()) as
    | { user?: { email?: string; role?: string } }
    | null;
  console.log(`signed in as ${session?.user?.email ?? "(nobody)"} role=${session?.user?.role ?? "-"}`);
  if (!session?.user?.email) {
    throw new Error(
      `dev-auth login failed (login status ${loginRes.status}). ` +
        "Server needs DEV_AUTH=true, and the email must match ALLOWED_EMAIL_DOMAINS.",
    );
  }

  await testAdminConsole(session.user as { id?: string; email?: string; role?: string });
  await testAdminMasterData();
  await testMasterDataImportExport();

  const marker = (html: string, needle: string) => (html.includes(needle) ? "✓" : "✗");

  const calc = await get("/calculator", "follow");
  const calcHtml = await calc.text();
  console.log(`GET /calculator  ${calc.status}`);
  console.log(`  ${marker(calcHtml, "FOC Calculator")} heading`);
  console.log(`  ${marker(calcHtml, "1. Account")} account step`);
  console.log(`  ${marker(calcHtml, "2. Main reagents")} reagent step`);
  console.log(`  ${marker(calcHtml, "Disposable Gloves")} catalogue loaded from the database`);
  console.log(`  ${marker(calcHtml, 'role="combobox"')} accessible account picker`);

  // Third party FOC only shows once an order is calculated (client-side state
  // this script can't drive without a browser) — on a fresh page it must be
  // absent, not just present-somewhere.
  console.log(
    `  ${!calcHtml.includes("Third party FOC") ? "✓" : "✗"} Third party FOC hidden until an order is calculated`,
  );

  // The category washes are only real if Tailwind actually emitted the rules —
  // a typo'd token name silently produces no class at all.
  const css = await (await get(/href="([^"]*\.css[^"]*)"/.exec(calcHtml)?.[1] ?? "/", "follow")).text();
  for (const cat of ["reagent", "qc", "common", "additional", "choice"]) {
    const bg = css.includes(`--color-cat-${cat}:`) || css.includes(`bg-cat-${cat}`);
    const edge = css.includes(`--color-cat-${cat}-edge:`) || css.includes(`border-l-cat-${cat}-edge`);
    console.log(`  ${bg && edge ? "✓" : "✗"} cat-${cat} wash + edge compiled into the stylesheet`);
  }

  // No calculated order on a fresh page, so nothing to check about Order
  // review / Third party FOC / totals ordering here — that needs a browser
  // driving the client-side calculate step (see the Playwright check once
  // installed; blocked on missing system libs, see memory).
  console.log("  – no preview on a fresh page, so no Order review to place (expected)");
  console.log(`  ${!calcHtml.includes("items for this order.") ? "✓" : "✗"} no empty category placeholders`);

  const history = await get("/history", "follow");
  const historyHtml = await history.text();
  console.log(`GET /history     ${history.status}`);
  console.log(`  ${marker(historyHtml, "submissions")} list rendered`);

  // Find a real submission to exercise the detail page and both exports.
  const id = /href="\/history\/([a-z0-9]+)"/.exec(historyHtml)?.[1];
  if (!id) {
    console.log("  (no submissions in the database — skipping detail and export checks)");
    return;
  }

  const detail = await get(`/history/${id}`, "follow");
  const detailHtml = await detail.text();
  console.log(`GET /history/${id.slice(0, 8)}…  ${detail.status}`);
  console.log(`  ${marker(detailHtml, "REF ")} REF prefix on material numbers`);
  console.log(`  ${marker(detailHtml, "DKSH")} DKSH column`);
  console.log(`  ${marker(detailHtml, "Download PDF")} PDF button`);
  console.log(`  ${marker(detailHtml, "Download Excel")} Excel button`);

  for (const [label, path] of [["xlsx", `/api/submissions/${id}/xlsx`], ["pdf", `/api/submissions/${id}/pdf`]] as const) {
    const res = await get(path);
    const type = res.headers.get("content-type") ?? "";
    const disp = res.headers.get("content-disposition") ?? "";
    if (res.ok) {
      const body = Buffer.from(await res.arrayBuffer());
      // Saved so the document itself can be inspected — see
      // scripts/pdf-text.mts and scripts/dump-xlsx.mts.
      const out = `/tmp/smoke-export.${label}`;
      writeFileSync(out, body);
      console.log(`GET ${label.padEnd(4)} export  ${res.status}  ${body.length.toLocaleString()} bytes -> ${out}`);
      console.log(`  ${type.includes(label === "pdf" ? "pdf" : "spreadsheetml") ? "✓" : "✗"} content-type`);
      console.log(`  ${disp.includes("attachment") ? "✓" : "✗"} ${disp}`);
    } else {
      const body = await res.text();
      console.log(`GET ${label.padEnd(4)} export  ${res.status}  ${body.slice(0, 160)}`);
    }
  }

  const anon = await fetch(`${BASE}/api/submissions/${id}/xlsx`, { redirect: "manual" });
  console.log(`unauthenticated export -> ${anon.status} ${anon.status === 401 ? "✓ refused" : "✗ should be 401"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
