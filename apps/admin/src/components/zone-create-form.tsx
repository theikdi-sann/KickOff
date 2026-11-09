"use client";

import { useState } from "react";
import { adminUpdateZoneSchema, bahtToSatang } from "@xclub/shared";
import type { AdminZoneInput } from "@/lib/queries/matches";

interface ZoneCreateFormProps {
  submitting?: boolean;
  onSubmit: (input: AdminZoneInput) => Promise<void> | void;
}

export function ZoneCreateForm({ submitting = false, onSubmit }: ZoneCreateFormProps) {
  const [values, setValues] = useState({
    name: "New Stand",
    description: "Configure this zone",
    price: "400",
    color: "#0EA5E9",
    rows: "A, B",
    seatsPerRow: "10",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const rows = values.rows
      .split(",")
      .map((row) => row.trim())
      .filter(Boolean);

    const parsed = adminUpdateZoneSchema.safeParse({
      name: values.name,
      description: values.description,
      priceSatang: bahtToSatang(Number(values.price)),
      color: values.color,
      rows,
      seatsPerRow: Number(values.seatsPerRow),
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".") || "form"] = issue.message;
      setErrors(next);
      return;
    }

    setErrors({});
    try {
      await onSubmit({
        name: parsed.data.name,
        description: parsed.data.description,
        priceSatang: parsed.data.priceSatang,
        color: parsed.data.color,
        rows: parsed.data.rows,
        seatsPerRow: parsed.data.seatsPerRow,
      });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not create the zone.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Zone name" error={errors.name}>
          <input
            value={values.name}
            onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Price (THB)" error={errors.priceSatang}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.price}
            onChange={(event) => setValues((v) => ({ ...v, price: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Rows (comma separated)" error={errors.rows}>
          <input
            value={values.rows}
            onChange={(event) => setValues((v) => ({ ...v, rows: event.target.value }))}
            className="input"
            placeholder="A, B, C"
          />
        </Field>
        <Field label="Seats per row" error={errors.seatsPerRow}>
          <input
            type="number"
            min="1"
            max="100"
            value={values.seatsPerRow}
            onChange={(event) => setValues((v) => ({ ...v, seatsPerRow: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Description" error={errors.description}>
          <input
            value={values.description}
            onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Colour" error={errors.color}>
          <input
            type="color"
            value={values.color}
            onChange={(event) => setValues((v) => ({ ...v, color: event.target.value }))}
            className="input h-11 p-1"
          />
        </Field>
      </div>

      {formError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {formError}
        </p>
      ) : null}

      <button type="submit" disabled={submitting} className="btn-primary h-11 px-5 disabled:opacity-60">
        {submitting ? "Creating…" : "Create zone + seats"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-red-600">{error}</span> : null}
    </label>
  );
}
