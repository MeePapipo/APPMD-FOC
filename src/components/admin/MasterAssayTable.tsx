"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROW_HOVER } from "@/lib/hoverStyles";

type System = "S6800" | "S5800" | "S4800";

export type MasterAssayRow = {
  id: string;
  system: System;
  code: string;
  materialNo: string;
  description: string;
  dkshCode: string | null;
  batchRow: number | null;
  batchLabel: string | null;
  packSize: number;
  price: number | null;
  category: string | null;
  usageType: string | null;
  usageGroup: string | null;
  packText: string | null;
  unitText: string | null;
  active: boolean;
};

const SYSTEM_LABELS: Record<System, string> = {
  S6800: "cobas 6800/8800",
  S5800: "cobas 5800",
  S4800: "cobas 4800",
};

type FormState = {
  system: System;
  code: string;
  materialNo: string;
  description: string;
  dkshCode: string;
  batchRow: string;
  batchLabel: string;
  packSize: string;
  price: string;
  category: string;
  usageType: string;
  usageGroup: string;
  packText: string;
  unitText: string;
};

const EMPTY_FORM: FormState = {
  system: "S6800",
  code: "",
  materialNo: "",
  description: "",
  dkshCode: "",
  batchRow: "",
  batchLabel: "",
  packSize: "",
  price: "",
  category: "",
  usageType: "",
  usageGroup: "",
  packText: "",
  unitText: "",
};

function toForm(row: MasterAssayRow): FormState {
  return {
    system: row.system,
    code: row.code,
    materialNo: row.materialNo,
    description: row.description,
    dkshCode: row.dkshCode ?? "",
    batchRow: row.batchRow?.toString() ?? "",
    batchLabel: row.batchLabel ?? "",
    packSize: row.packSize.toString(),
    price: row.price?.toString() ?? "",
    category: row.category ?? "",
    usageType: row.usageType ?? "",
    usageGroup: row.usageGroup ?? "",
    packText: row.packText ?? "",
    unitText: row.unitText ?? "",
  };
}

function toPayload(form: FormState) {
  return {
    system: form.system,
    code: form.code.trim(),
    materialNo: form.materialNo.trim(),
    description: form.description.trim(),
    dkshCode: form.dkshCode.trim() || null,
    batchRow: form.batchRow.trim() === "" ? null : Number(form.batchRow),
    batchLabel: form.batchLabel.trim() || null,
    packSize: Number(form.packSize),
    price: form.price.trim() === "" ? null : Number(form.price),
    category: form.category.trim() || null,
    usageType: form.usageType.trim() || null,
    usageGroup: form.usageGroup.trim() || null,
    packText: form.packText.trim() || null,
    unitText: form.unitText.trim() || null,
  };
}

function AssayForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
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
        Code
        <input value={form.code} onChange={(e) => onChange({ code: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Material No.
        <input value={form.materialNo} onChange={(e) => onChange({ materialNo: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
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
        Pack size (tests/box)
        <input type="number" min={1} value={form.packSize} onChange={(e) => onChange({ packSize: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Price (THB)
        <input type="number" min={0} value={form.price} onChange={(e) => onChange({ price: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs font-medium text-muted">
        Batch row {form.system === "S4800" && <span className="text-muted">(n/a for 4800)</span>}
        <input type="number" value={form.batchRow} disabled={form.system === "S4800"} onChange={(e) => onChange({ batchRow: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm disabled:opacity-50" />
      </label>
      <label className="text-xs font-medium text-muted">
        Batch label
        <input value={form.batchLabel} disabled={form.system === "S4800"} onChange={(e) => onChange({ batchLabel: e.target.value })} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm disabled:opacity-50" />
      </label>
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
      <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="button" size="sm" onClick={onSubmit} disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
      </div>
    </div>
  );
}

export function MasterAssayTable({ initialAssays }: { initialAssays: MasterAssayRow[] }) {
  const [assays, setAssays] = useState(initialAssays);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(row: MasterAssayRow) {
    setEditingId(row.id);
    setEditForm(toForm(row));
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/master/assays/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(editForm)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Update failed. Please try again.");
      setAssays((prev) => prev.map((a) => (a.id === editingId ? body.assay : a)));
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: MasterAssayRow) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/master/assays/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Update failed. Please try again.");
      setAssays((prev) => prev.map((a) => (a.id === row.id ? body.assay : a)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createAssay() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/master/assays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(addForm)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Create failed. Please try again.");
      setAssays((prev) => [...prev, body.assay]);
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
          <AssayForm
            form={addForm}
            onChange={(patch) => setAddForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={createAssay}
            onCancel={() => setAdding(false)}
            submitting={busy}
            submitLabel="Add assay"
          />
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
            Add assay
          </Button>
        )}
      </div>

      <div className="divide-y divide-line border-y border-line">
        {assays.map((row) => (
          <div key={row.id} className={cn("py-3", ROW_HOVER)}>
            {editingId === row.id ? (
              <AssayForm
                form={editForm}
                onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
                onSubmit={saveEdit}
                onCancel={() => setEditingId(null)}
                submitting={busy}
                submitLabel="Save"
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-ink">{row.code}</h4>
                    <Badge tone="neutral">{SYSTEM_LABELS[row.system]}</Badge>
                    {!row.active && <Badge tone="negative">Deactivated</Badge>}
                  </div>
                  <p className="text-xs text-muted">{row.description}</p>
                  <p className="font-mono text-xs text-muted">
                    REF {row.materialNo}
                    {row.dkshCode ? ` · DKSH ${row.dkshCode}` : ""} · {row.packSize} tests/box
                    {row.price !== null ? ` · ${row.price.toLocaleString()} THB` : ""}
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
