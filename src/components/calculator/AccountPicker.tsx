"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AccountDTO } from "@/lib/dto";

/** Long enough to be useful, short enough to stay scrollable. */
const MAX_RESULTS = 50;

export function AccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: AccountDTO[];
  value: AccountDTO | null;
  onChange: (a: AccountDTO | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const inputId = `${baseId}-input`;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { filtered, totalMatches } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? accounts.filter(
          (a) =>
            a.accountName.toLowerCase().includes(q) || a.accountNumber.toLowerCase().includes(q),
        )
      : accounts;
    return { filtered: matches.slice(0, MAX_RESULTS), totalMatches: matches.length };
  }, [accounts, query]);

  // Arrow-keying past the fold has to scroll the list, not just move the ring.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function select(account: AccountDTO) {
    onChange(account);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (filtered.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + filtered.length) % filtered.length);
      return;
    }
    if (event.key === "Enter" && open && filtered[active]) {
      event.preventDefault();
      select(filtered[active]);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const hiddenMatches = totalMatches - filtered.length;

  return (
    <div className="relative" ref={boxRef}>
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-muted">
        Account
      </label>
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{value.accountName}</div>
            <div className="text-xs text-muted">Account no. {value.accountNumber}</div>
          </div>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-brand hover:underline"
            onClick={() => {
              onChange(null);
              setQuery("");
              setOpen(true);
              // Focus follows the affordance the user just activated.
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <input
          id={inputId}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${baseId}-opt-${filtered[active].id}` : undefined}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Reset the highlight here rather than in an effect: the list is
            // about to be rebuilt, so index 0 is the only safe position.
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search account name or number…"
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      )}

      {open && !value && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Accounts"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg"
        >
          {filtered.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-sm text-muted">No matching accounts</li>
          )}
          {filtered.map((a, index) => (
            <li
              key={a.id}
              id={`${baseId}-opt-${a.id}`}
              role="option"
              aria-selected={index === active}
              data-active={index === active}
              // Mouse-down would blur the input and close the list first.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(a)}
              className={
                "cursor-pointer px-3 py-2 " + (index === active ? "bg-brand-tint" : "")
              }
            >
              <div className="text-sm text-ink">{a.accountName}</div>
              <div className="text-xs text-muted">Account no. {a.accountNumber}</div>
            </li>
          ))}
          {hiddenMatches > 0 && (
            <li role="presentation" className="border-t border-line px-3 py-2 text-xs text-muted">
              Showing {filtered.length} of {totalMatches} — keep typing to narrow the list.
            </li>
          )}
        </ul>
      )}
      <p aria-live="polite" className="sr-only">
        {open && !value ? `${totalMatches} accounts match` : ""}
      </p>
    </div>
  );
}
