"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

type System = "S6800" | "S5800" | "S4800";
type Driver = "BATCH" | "TEST";
type AppliesMode = "all" | "none" | "specific";

export type MasterItemRow = {
  id: string;
  system: System;
  materialNo: string;
  description: string;
  dkshCode: string | null;
  group: string;
  category: string | null;
  usageType: string | null;
  usageGroup: string | null;
  packText: string | null;
  unitText: string | null;
  priceText: string | null;
  optional: boolean;
  onDemand: boolean;
  packSize: number;
  consumption: number;
  coverage: number;
  price: number | null;
  driver: Driver;
  appliesTo: string[];
  appliesToAll: boolean;
  weights: Record<string, number> | null;
  active: boolean;
};

export type AssayOption = { system: System; code: string; description: string };

const SYSTEM_LABELS: Record<System, string> = {
  S6800: "cobas 6800/8800",
  S5800: "cobas 5800",
  S4800: "cobas 4800",
};

type FormState = {
  system: System;
  materialNo: string;
  description: string;
  dkshCode: string;
  group: string;
  category: string;
  usageType: string;
  usageGroup: string;
  packText: string;
  unitText: string;
  priceText: string;
  optional: boolean;
  onDemand: boolean;
  packSize: string;
  consumption: string;
  coverage: string;
  price: string;
  driver: Driver;
  appliesMode: AppliesMode;
  appliesTo: string[];
  weights: Record<string, string>;
};

const EMPTY_FORM: FormState = {
  system: "S6800",
  materialNo: "",
  description: "",
  dkshCode: "",
  group: "Generic",
  category: "",
  usageType: "",
  usageGroup: "",
  packText: "",
  unitText: "",
  priceText: "",
  optional: false,
  onDemand: false,
  packSize: "1",
  consumption: "1",
  coverage: "1",
  price: "",
  driver: "TEST",
  appliesMode: "all",
  appliesTo: [],
  weights: {},
};

function toForm(row: MasterItemRow): FormState {
  return {
    system: row.system,
    materialNo: row.materialNo,
    description: row.description,
    dkshCode: row.dkshCode ?? "",
    group: row.group,
    category: row.category ?? "",
    usageType: row.usageType ?? "",
    usageGroup: row.usageGroup ?? "",
    packText: row.packText ?? "",
    unitText: row.unitText ?? "",
    priceText: row.priceText ?? "",
    optional: row.optional,
    onDemand: row.onDemand,
    packSize: row.packSize.toString(),
    consumption: row.consumption.toString(),
    coverage: row.coverage.toString(),
    price: row.price?.toString() ?? "",
    driver: row.driver,
    appliesMode: row.appliesToAll ? "all" : row.appliesTo.length === 0 ? "none" : "specific",
    appliesTo: row.appliesTo,
    weights: Object.fromEntries(Object.entries(row.weights ?? {}).map(([k, v]) => [k, String(v)])),
  };
}

function toPayload(form: FormState) {
  return {
    system: form.system,
    materialNo: form.materialNo.trim(),
    description: form.description.trim(),
    dkshCode: form.dkshCode.trim() || null,
    group: form.group.trim(),
    category: form.category.trim() || null,
    usageType: form.usageType.trim() || null,
    usageGroup: form.usageGroup.trim() || null,
    packText: form.packText.trim() || null,
    unitText: form.unitText.trim() || null,
    priceText: form.priceText.trim() || null,
    optional: form.optional,
    onDemand: form.onDemand,
    packSize: Number(form.packSize),
    consumption: Number(form.consumption),
    coverage: Number(form.coverage),
    price: form.price.trim() === "" ? null : Number(form.price),
    driver: form.driver,
    appliesToAll: form.appliesMode === "all",
    appliesTo: form.appliesMode === "specific" ? form.appliesTo : [],
    weights:
      form.system === "S4800"
        ? Object.fromEntries(
            Object.entries(form.weights)
              .filter(([, v]) => v.trim() !== "")
              .map(([k, v]) => [k, Number(v)]),
          )
        : null,
  };
}

function ItemForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  assaysForSystem,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
  assaysForSystem: AssayOption[];
}) {
  const is4800 = form.system === "S4800";

  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-line-strong bg-canvas p-4 sm:grid-cols-3">
      <label className="text-xs font-medium text-muted">
        System
        <select
          value={form.system}
          onChange={(e) => onChange({ system: e.target.value as System })}
          className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm"
        >
          {(Object.keys(SYSTEM_LABELS) as System[]).map((s) => (
            <option key={s} value={s}>{SYSTEM_LABELS[s]}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-muted">
        Material No.
        <input value={form.materialNo} onChange={(e) => onChange({ materialNo: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Group
        <input value={form.group} onChange={(e) => onChange({ group: e.target.value })} placeholder="Control / Generic / Conditional / Optional" className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="sm:col-span-3 text-xs font-medium text-muted">
        Description
        <input value={form.description} onChange={(e) => onChange({ description: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        DKSH code
        <input value={form.dkshCode} onChange={(e) => onChange({ dkshCode: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Pack size
        <input type="number" min={1} value={form.packSize} onChange={(e) => onChange({ packSize: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Price (THB)
        <input type="number" min={0} value={form.price} onChange={(e) => onChange({ price: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>

      <label className="flex items-center gap-2 text-xs font-medium text-muted">
        <input type="checkbox" checked={form.optional} onChange={(e) => onChange({ optional: e.target.checked })} />
        Optional (rep must tick it)
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-muted">
        <input type="checkbox" checked={form.onDemand} onChange={(e) => onChange({ onDemand: e.target.checked })} />
        On-demand (never auto-calculated)
      </label>
      <div />

      {!is4800 && (
        <>
          <label className="text-xs font-medium text-muted">
            Driver
            <select value={form.driver} onChange={(e) => onChange({ driver: e.target.value as Driver })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm">
              <option value="BATCH">BATCH (runs)</option>
              <option value="TEST">TEST (raw tests)</option>
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Consumption (units per {form.driver === "BATCH" ? "batch" : "test"})
            <input type="number" step="any" value={form.consumption} onChange={(e) => onChange({ consumption: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-muted">
            Coverage (packaging divisor)
            <input type="number" step="any" value={form.coverage} onChange={(e) => onChange({ coverage: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
          </label>

          <fieldset className="sm:col-span-3">
            <legend className="text-xs font-medium text-muted">Applies to which assays on {SYSTEM_LABELS[form.system]}</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {(["all", "none", "specific"] as AppliesMode[]).map((mode) => (
                <label key={mode} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="appliesMode" checked={form.appliesMode === mode} onChange={() => onChange({ appliesMode: mode })} />
                  {mode === "all" ? "All assays" : mode === "none" ? "No assays (on-demand)" : "Specific codes"}
                </label>
              ))}
            </div>
            {form.appliesMode === "specific" && (
              <div className="mt-2 flex flex-wrap gap-3 rounded-lg border border-line bg-surface p-2">
                {assaysForSystem.length === 0 && <p className="text-xs text-muted">No assays on this system yet.</p>}
                {assaysForSystem.map((a) => (
                  <label key={a.code} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={form.appliesTo.includes(a.code)}
                      onChange={(e) =>
                        onChange({
                          appliesTo: e.target.checked
                            ? [...form.appliesTo, a.code]
                            : form.appliesTo.filter((c) => c !== a.code),
                        })
                      }
                    />
                    {a.code}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </>
      )}

      {is4800 && (
        <fieldset className="sm:col-span-3">
          <legend className="text-xs font-medium text-muted">
            Weight per assay (cobas 4800 only — replaces driver/consumption/coverage/applies-to entirely)
          </legend>
          <p className="mt-1 text-xs text-negative">
            Required unless on-demand — a missing weight breaks calculation for every order using this system.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {assaysForSystem.map((a) => (
              <label key={a.code} className="text-xs text-muted">
                {a.code}
                <input
                  type="number"
                  step="any"
                  value={form.weights[a.code] ?? ""}
                  onChange={(e) => onChange({ weights: { ...form.weights, [a.code]: e.target.value } })}
                  className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1 text-sm"
                />
              </label>
            ))}
            {assaysForSystem.length === 0 && <p className="text-xs text-muted">No cobas 4800 assays yet.</p>}
          </div>
        </fieldset>
      )}

      <label className="text-xs font-medium text-muted">
        Category
        <input value={form.category} onChange={(e) => onChange({ category: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Usage type
        <input value={form.usageType} onChange={(e) => onChange({ usageType: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Usage group
        <input value={form.usageGroup} onChange={(e) => onChange({ usageGroup: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Pack text
        <input value={form.packText} onChange={(e) => onChange({ packText: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Unit text
        <input value={form.unitText} onChange={(e) => onChange({ unitText: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Price text (display override)
        <input value={form.priceText} onChange={(e) => onChange({ priceText: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>

      <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="button" size="sm" onClick={onSubmit} disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
      </div>
    </div>
  );
}

export function MasterItemTable({ initialItems, assays }: { initialItems: MasterItemRow[]; assays: AssayOption[] }) {
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function assaysFor(system: System) {
    return assays.filter((a) => a.system === system);
  }

  function startEdit(row: MasterItemRow) {
    setEditingId(row.id);
    setEditForm(toForm(row));
    setError(null);
  }

  async function saveEdit(original: MasterItemRow) {
    if (!editingId) return;
    if (
      editForm.materialNo.trim() !== original.materialNo &&
      !window.confirm(
        "Renaming this item's code won't affect past orders' quantities or values — those are locked in. " +
          "But older orders' exports will show a fallback label instead of this item's group/pack/DKSH info, " +
          "since that display data is looked up live by code. Continue with the rename?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/master/items/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(editForm)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Update failed. Please try again.");
      setItems((prev) => prev.map((i) => (i.id === editingId ? body.item : i)));
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: MasterItemRow) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/master/items/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Update failed. Please try again.");
      setItems((prev) => prev.map((i) => (i.id === row.id ? body.item : i)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createItem() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/master/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(addForm)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Create failed. Please try again.");
      setItems((prev) => [...prev, body.item]);
      setAdding(false);
      setAddForm(EMPTY_FORM);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Create failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-negative/30 bg-negative-tint px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="mb-3">
        {adding ? (
          <ItemForm
            form={addForm}
            onChange={(patch) => setAddForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={createItem}
            onCancel={() => setAdding(false)}
            submitting={busy}
            submitLabel="Add item"
            assaysForSystem={assaysFor(addForm.system)}
          />
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
            Add item
          </Button>
        )}
      </div>

      <div className="divide-y divide-line border-y border-line">
        {items.map((row) => (
          <div key={row.id} className={cn("py-3", ROW_HOVER)}>
            {editingId === row.id ? (
              <ItemForm
                form={editForm}
                onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
                onSubmit={() => saveEdit(row)}
                onCancel={() => setEditingId(null)}
                submitting={busy}
                submitLabel="Save"
                assaysForSystem={assaysFor(editForm.system)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-ink">{row.description}</h4>
                    <Badge tone="neutral">{SYSTEM_LABELS[row.system]}</Badge>
                    <Badge tone="brand">{row.group}</Badge>
                    {!row.active && <Badge tone="negative">Deactivated</Badge>}
                  </div>
                  <p className="font-mono text-xs text-muted">
                    REF {row.materialNo}
                    {row.dkshCode ? ` · DKSH ${row.dkshCode}` : ""}
                  </p>
                  <p className="text-xs text-muted">
                    {row.system === "S4800"
                      ? `Weighted (${Object.keys(row.weights ?? {}).length} assay weights)`
                      : `${row.driver} · consumption ${row.consumption} · coverage ${row.coverage} · ` +
                        (row.appliesToAll ? "all assays" : row.appliesTo.length === 0 ? "no assays (on-demand)" : `${row.appliesTo.length} assay(s)`)}
                    {row.optional ? " · optional" : ""}
                    {row.onDemand ? " · on-demand" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(row)} disabled={busy}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant={row.active ? "danger" : "secondary"}
                    size="sm"
                    onClick={() => toggleActive(row)}
                    disabled={busy}
                  >
                    {row.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
