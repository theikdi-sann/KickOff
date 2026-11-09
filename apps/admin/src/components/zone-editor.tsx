"use client";

import { useState } from "react";
import { adminUpdateZoneSchema, bahtToSatang, type ZoneDto } from "@xclub/shared";

interface ZoneEditorProps {
  zone: ZoneDto;
  submitting?: boolean;
  onSubmit: (patch: {
    name: string;
    description: string;
    priceSatang: number;
    color: string;
  }) => Promise<void> | void;
}

export function ZoneEditor({ zone, submitting = false, onSubmit }: ZoneEditorProps) {
  const [values, setValues] = useState({
    name: zone.name,
    description: zone.description,
    price: String(zone.priceSatang / 100),
    color: zone.color,
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const priceSatang = bahtToSatang(Number(values.price));
    const parsed = adminUpdateZoneSchema.safeParse({
      name: values.name,
      description: values.description,
      priceSatang,
      color: values.color,
      rows: zone.rows,
      seatsPerRow: zone.seatsPerRow,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".") || "form"] = issue.message;
      setFieldErrors(next);
      return;
    }

    setFieldErrors({});
    try {
      await onSubmit({
        name: parsed.data.name,
        description: parsed.data.description,
        priceSatang: parsed.data.priceSatang,
        color: parsed.data.color,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the zone.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Zone name" error={fieldErrors.name}>
          <input
            value={values.name}
            onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Price (THB)" error={fieldErrors.priceSatang}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.price}
            onChange={(event) => setValues((v) => ({ ...v, price: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Description" error={fieldErrors.description}>
          <input
            value={values.description}
            onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Colour" error={fieldErrors.color}>
          <input
            type="color"
            value={values.color}
            onChange={(event) => setValues((v) => ({ ...v, color: event.target.value }))}
            className="input h-11 p-1"
          />
        </Field>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        Layout is locked at {zone.rows.length} rows × {zone.seatsPerRow} seats. Existing orders keep
        their snapshot price; this change only affects new sales.
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={submitting} className="btn-primary h-11 px-5 disabled:opacity-60">
        {submitting ? "Saving…" : "Save zone"}
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
