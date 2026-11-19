"use client";

import { useState } from "react";
import { majorToMinorUnits } from "@kickoff/shared";
import type { AdminVenueZone, VenueZoneInput } from "@/lib/queries/venues";

const DEFAULT_VALUES = {
  name: "",
  description: "",
  color: "#22C55E",
  rows: "A,B,C,D,E,F",
  seatsPerRow: "12",
  price: "350",
};

interface VenueZoneFormProps {
  /** The zone being edited; omit to create a new one. */
  zone?: AdminVenueZone | null;
  submitting?: boolean;
  onSubmit: (input: VenueZoneInput) => Promise<void> | void;
}

function valuesFrom(zone: AdminVenueZone) {
  return {
    name: zone.name,
    description: zone.description,
    color: zone.color,
    rows: zone.rows.join(","),
    seatsPerRow: String(zone.seatsPerRow),
    price: String(zone.defaultPriceMinorUnits / 100),
  };
}

/**
 * The fields for one venue zone. Geometry (rows and seats per row) is only
 * editable while the zone is being created — once it exists the seats are
 * real rows and the layout is locked everywhere.
 */
export function VenueZoneForm({ zone, submitting = false, onSubmit }: VenueZoneFormProps) {
  const editing = Boolean(zone);
  const [values, setValues] = useState(zone ? valuesFrom(zone) : DEFAULT_VALUES);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const rows = values.rows
      .split(",")
      .map((row) => row.trim().toUpperCase())
      .filter(Boolean);
    if (!values.name.trim()) {
      setError("Give the zone a name.");
      return;
    }
    if (!editing && rows.length === 0) {
      setError("Enter at least one row (for example A,B,C).");
      return;
    }
    const seatsPerRow = Number.parseInt(values.seatsPerRow, 10);
    const priceMinorUnits = majorToMinorUnits(Number(values.price), "THB");
    if (!editing && (!Number.isInteger(seatsPerRow) || seatsPerRow < 1)) {
      setError("Seats per row must be a whole number, 1 or more.");
      return;
    }

    try {
      await onSubmit({
        name: values.name,
        description: values.description,
        color: values.color,
        rows: zone ? zone.rows : rows,
        seatsPerRow: zone ? zone.seatsPerRow : seatsPerRow,
        defaultPriceMinorUnits: priceMinorUnits,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the zone.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px] font-semibold text-slate-600">
          Name
          <input
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            className="input mt-1"
            placeholder="North Stand"
          />
        </label>
        <label className="block text-[11px] font-semibold text-slate-600">
          Default price (THB)
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.price}
            onChange={(event) => setValues((current) => ({ ...current, price: event.target.value }))}
            className="input mt-1"
          />
        </label>
        <label className="block text-[11px] font-semibold text-slate-600 sm:col-span-2">
          Description
          <input
            value={values.description}
            onChange={(event) =>
              setValues((current) => ({ ...current, description: event.target.value }))
            }
            className="input mt-1"
          />
        </label>
        {!editing ? (
          <>
            <label className="block text-[11px] font-semibold text-slate-600">
              Rows (comma separated)
              <input
                value={values.rows}
                onChange={(event) =>
                  setValues((current) => ({ ...current, rows: event.target.value }))
                }
                className="input mt-1"
                placeholder="A,B,C,D,E,F"
              />
            </label>
            <label className="block text-[11px] font-semibold text-slate-600">
              Seats per row
              <input
                type="number"
                min="1"
                step="1"
                value={values.seatsPerRow}
                onChange={(event) =>
                  setValues((current) => ({ ...current, seatsPerRow: event.target.value }))
                }
                className="input mt-1"
              />
            </label>
          </>
        ) : null}
        <label className="block text-[11px] font-semibold text-slate-600">
          Colour
          <input
            type="color"
            value={values.color}
            onChange={(event) => setValues((current) => ({ ...current, color: event.target.value }))}
            className="input mt-1 h-11 p-1"
          />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="btn-primary w-full">
        {submitting ? "Saving…" : editing ? "Save zone" : "Add zone"}
      </button>
    </div>
  );
}
