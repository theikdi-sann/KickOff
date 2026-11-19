"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { adminCreateMatchSchema, brand, majorToMinorUnits } from "@kickoff/shared";
import { VenueZoneForm } from "@/components/venue-zone-form";
import type {
  AdminCreateMatchInput,
  AdminDraftGate,
  AdminDraftZone,
} from "@/lib/queries/matches";
import { useGates } from "@/lib/queries/gates";
import {
  useVenueLayout,
  useVenues,
  type AdminVenue,
  type AdminVenueZone,
  type VenueZoneInput,
} from "@/lib/queries/venues";

const DEFAULT_COLORS: [string, string] = [brand.primary, brand.primaryDark];
const DEFAULT_ACCENT = brand.accent;
const GATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

interface CreateFixtureFormProps {
  submitting?: boolean;
  onSubmit: (input: AdminCreateMatchInput) => Promise<void> | void;
}

interface DraftGate {
  id: string;
  name: string;
  /** "" = whole ground, `id:<venue zone>` or `key:<draft zone>`. */
  stand: string;
}

interface NewVenueValues {
  name: string;
  city: string;
  address: string;
}

const EMPTY_VENUE: NewVenueValues = { name: "", city: "", address: "" };

/**
 * The whole fixture draft in one dialog: match, ground, stands and gates.
 * Nothing is written until the final call, and that call is atomic — a wrong
 * zone or gate leaves no orphan venue behind.
 *
 * The sections are stacked inside the page's single `Modal`; opening another
 * modal here would stack Escape handlers and close the wrong layer.
 */
export function CreateFixtureForm({ submitting = false, onSubmit }: CreateFixtureFormProps) {
  const venuesQuery = useVenues();
  const gatesQuery = useGates();
  const venues = venuesQuery.data ?? [];

  const [values, setValues] = useState({
    opponent: "",
    opponentShort: "",
    kickoffAt: "",
    competition: "Thai Premier League",
    homeAway: "home" as "home" | "away",
  });
  const [creatingVenue, setCreatingVenue] = useState(false);
  const [venueId, setVenueId] = useState("");
  const [newVenue, setNewVenue] = useState<NewVenueValues>(EMPTY_VENUE);
  const [draftZones, setDraftZones] = useState<AdminDraftZone[]>([]);
  const [zoneSeq, setZoneSeq] = useState(1);
  const [zoneFormKey, setZoneFormKey] = useState(0);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [selectedGateIds, setSelectedGateIds] = useState<string[] | null>(null);
  const [draftGates, setDraftGates] = useState<DraftGate[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const homeVenue = venues.find((venue) => venue.isHome);
  const awayVenues = venues.filter((venue) => !venue.isHome);
  const defaultVenue = values.homeAway === "home" ? homeVenue : awayVenues[0];
  const selectedVenue: AdminVenue | undefined = creatingVenue
    ? undefined
    : (venues.find((venue) => venue.id === venueId) ?? defaultVenue);
  const layoutQuery = useVenueLayout(selectedVenue?.id);
  const existingZones: AdminVenueZone[] = selectedVenue ? (layoutQuery.data ?? []) : [];
  const venueGates = (gatesQuery.data ?? []).filter(
    (gate) => gate.active && gate.venueId === selectedVenue?.id,
  );
  const effectiveGateIds = selectedGateIds ?? venueGates.map((gate) => gate.id);
  const totalZones = existingZones.length + draftZones.length;
  const totalGates = effectiveGateIds.length + draftGates.length;
  const canCreateHome = !homeVenue;
  const canCreateGround = values.homeAway === "away" || canCreateHome;

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const clearExistingStands = (gates: DraftGate[]) =>
    gates.map((gate) => (gate.stand.startsWith("key:") ? gate : { ...gate, stand: "" }));

  const resetVenueChoices = () => {
    setSelectedGateIds(null);
    setPrices({});
    setDraftGates((gates) => clearExistingStands(gates));
  };

  const chooseVenue = (id: string) => {
    setCreatingVenue(false);
    setVenueId(id);
    resetVenueChoices();
  };

  const chooseNewVenue = () => {
    if (!canCreateGround) return;
    setCreatingVenue(true);
    setVenueId("");
    setNewVenue(EMPTY_VENUE);
    setSelectedGateIds([]);
    setPrices({});
    setDraftGates((gates) => clearExistingStands(gates));
  };

  const changeHomeAway = (homeAway: "home" | "away") => {
    setValues((current) => ({ ...current, homeAway }));
    setCreatingVenue(false);
    setVenueId("");
    resetVenueChoices();
  };

  const addZone = async (input: VenueZoneInput) => {
    const key = `stand-${zoneSeq}`;
    setZoneSeq((current) => current + 1);
    setDraftZones((current) => [...current, { key, ...input }]);
    setZoneFormKey((current) => current + 1);
  };

  const removeZone = (key: string) => {
    setDraftZones((current) => current.filter((zone) => zone.key !== key));
    // A gate cannot point at a stand that is no longer in the draft.
    setDraftGates((gates) =>
      gates.map((gate) => (gate.stand === `key:${key}` ? { ...gate, stand: "" } : gate)),
    );
  };

  const addGate = () => {
    setDraftGates((current) => [...current, { id: "", name: "", stand: "" }]);
  };

  const removeGate = (index: number) => {
    setDraftGates((current) => current.filter((_, position) => position !== index));
  };

  const updateGate = (index: number, patch: Partial<DraftGate>) => {
    setDraftGates((current) =>
      current.map((gate, position) => (position === index ? { ...gate, ...patch } : gate)),
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const kickoffIso = values.kickoffAt ? new Date(values.kickoffAt).toISOString() : "";
    const parsed = adminCreateMatchSchema.safeParse({
      ...values,
      venue: selectedVenue?.name ?? newVenue.name,
      kickoffAt: kickoffIso,
      posterColors: DEFAULT_COLORS,
      accent: DEFAULT_ACCENT,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join(".") || "form"] = issue.message;
      }
      setErrors(next);
      return;
    }

    if (!selectedVenue && !creatingVenue) {
      setFormError(
        values.homeAway === "home"
          ? "This club has no home venue yet. Create it here or on the Venues page."
          : "Choose or add an away ground before creating a fixture.",
      );
      return;
    }
    if (creatingVenue && values.homeAway === "home" && !canCreateHome) {
      setFormError("This club already has a home venue. Manage it on the Venues page.");
      return;
    }
    if (creatingVenue && !newVenue.name.trim()) {
      setFormError("Give the new ground a name.");
      return;
    }
    if (totalZones === 0) {
      setFormError("Add at least one stand to the ground before creating a fixture.");
      return;
    }
    if (totalGates === 0) {
      setFormError("Add or select at least one gate so the fixture can be scanned.");
      return;
    }

    const seenGateIds = new Set(venueGates.map((gate) => gate.id));
    for (const gate of draftGates) {
      const id = gate.id.trim();
      if (!GATE_ID_PATTERN.test(id)) {
        setFormError(`Gate “${id || "unnamed"}” needs a code of 2–32 lowercase letters, numbers or dashes.`);
        return;
      }
      if (gate.name.trim() === "") {
        setFormError(`Gate “${id}” needs a display name.`);
        return;
      }
      if (seenGateIds.has(id)) {
        setFormError(`Gate code “${id}” is already used at this ground.`);
        return;
      }
      seenGateIds.add(id);
    }

    const zonePrices: Record<string, number> = {};
    for (const zone of existingZones) {
      const entered = prices[zone.id] ?? String(zone.defaultPriceMinorUnits / 100);
      const price = Number(entered);
      if (!Number.isFinite(price) || price < 0) {
        setFormError(`Enter a valid price for ${zone.name}.`);
        return;
      }
      zonePrices[zone.id] = majorToMinorUnits(price, "THB");
    }

    setErrors({});
    try {
      const draftGatePayload: AdminDraftGate[] = draftGates.map((gate) => {
        const base = { id: gate.id.trim(), name: gate.name.trim(), active: true };
        if (gate.stand.startsWith("key:")) {
          return { ...base, zoneKey: gate.stand.slice(4) };
        }
        if (gate.stand.startsWith("id:")) {
          return { ...base, zoneId: gate.stand.slice(3) };
        }
        return base;
      });

      const payload: AdminCreateMatchInput = {
        ...(parsed.data as AdminCreateMatchInput),
        venueId: selectedVenue?.id,
        newVenue: creatingVenue
          ? {
              name: newVenue.name.trim(),
              city: newVenue.city.trim() || null,
              address: newVenue.address.trim() || null,
              isHome: values.homeAway === "home",
            }
          : undefined,
        draftZones,
        draftGates: draftGatePayload,
        gateIds: selectedVenue ? effectiveGateIds : [],
        zonePrices,
      };
      await onSubmit(payload);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not create the fixture.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section
        section="match"
        step={1}
        title="Match"
        description="Who, when and where the fixture sits in the season.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Opponent" error={errors.opponent}>
            <input
              value={values.opponent}
              onChange={(event) => set("opponent")(event.target.value)}
              className="input"
              placeholder="Bangkok Rovers"
            />
          </Field>
          <Field label="Short code" error={errors.opponentShort}>
            <input
              value={values.opponentShort}
              onChange={(event) => set("opponentShort")(event.target.value.toUpperCase())}
              maxLength={8}
              className="input"
              placeholder="BKR"
            />
          </Field>
          <Field label="Kick-off" error={errors.kickoffAt}>
            <input
              type="datetime-local"
              value={values.kickoffAt}
              onChange={(event) => set("kickoffAt")(event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Competition" error={errors.competition}>
            <input
              value={values.competition}
              onChange={(event) => set("competition")(event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Home / away" error={errors.homeAway}>
            <select
              value={values.homeAway}
              onChange={(event) => changeHomeAway(event.target.value as "home" | "away")}
              className="input">
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section
        section="venue"
        step={2}
        title="Venue"
        description="Use a ground you already have, or build the one this fixture needs.">
        {creatingVenue ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ground name" error={errors.venue}>
                <input
                  value={newVenue.name}
                  onChange={(event) =>
                    setNewVenue((current) => ({ ...current, name: event.target.value }))
                  }
                  className="input"
                  placeholder="Away ground name"
                />
              </Field>
              <Field label="City">
                <input
                  value={newVenue.city}
                  onChange={(event) =>
                    setNewVenue((current) => ({ ...current, city: event.target.value }))
                  }
                  className="input"
                  placeholder="City"
                />
              </Field>
              <Field label="Address">
                <input
                  value={newVenue.address}
                  onChange={(event) =>
                    setNewVenue((current) => ({ ...current, address: event.target.value }))
                  }
                  className="input"
                  placeholder="Street address"
                />
              </Field>
            </div>
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              The ground and its stands are created with the fixture. Manage the club’s home
              ground on the <strong>Venues page</strong>.
            </p>
            {venues.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setCreatingVenue(false);
                  setVenueId(defaultVenue?.id ?? "");
                  resetVenueChoices();
                }}
                className="btn-ghost px-3 py-2 text-[11px]">
                Use an existing venue
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Ground">
              <select
                value={selectedVenue?.id ?? ""}
                onChange={(event) => chooseVenue(event.target.value)}
                className="input">
                {selectedVenue ? null : <option value="">Choose a venue…</option>}
                {(values.homeAway === "home"
                  ? homeVenue
                    ? [homeVenue]
                    : []
                  : awayVenues
                ).map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                    {venue.isHome ? " · Home" : ""}
                    {venue.capacity > 0 ? ` · ${venue.capacity} seats` : ""}
                  </option>
                ))}
              </select>
            </Field>

            {values.homeAway === "home" && homeVenue ? (
              <p className="text-[11px] text-slate-500">
                This club already has a home venue. To change it, use the{" "}
                <strong>Venues page</strong>.
              </p>
            ) : (
              <button
                type="button"
                onClick={chooseNewVenue}
                disabled={!canCreateGround}
                className="btn-ghost px-3 py-2 text-[11px] disabled:opacity-50">
                {values.homeAway === "home" ? "Create the home venue" : "Add a new away venue"}
              </button>
            )}
          </div>
        )}
      </Section>

      <Section
        section="zones"
        step={3}
        title="Zones"
        description="Stands, their generated seats and the price this fixture charges for each.">
        {existingZones.length > 0 ? (
          <div className="space-y-2">
            <span className="label block">Stands already at this ground</span>
            {existingZones.map((zone) => (
              <div
                key={zone.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <span
                  className="h-8 w-1.5 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800">{zone.name}</p>
                  <p className="text-[10px] text-slate-400">
                    {zone.capacity} seats · {zone.rows.length} rows × {zone.seatsPerRow} · geometry
                    is locked once a stand exists
                  </p>
                </div>
                <label className="text-[10px] font-semibold text-slate-500">
                  Price (THB)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={prices[zone.id] ?? String(zone.defaultPriceMinorUnits / 100)}
                    onChange={(event) =>
                      setPrices((current) => ({ ...current, [zone.id]: event.target.value }))
                    }
                    className="input mt-1 w-28"
                  />
                </label>
              </div>
            ))}
          </div>
        ) : null}

        {draftZones.length > 0 ? (
          <div className="space-y-2">
            <span className="label block">New stands in this draft</span>
            {draftZones.map((zone) => (
              <div
                key={zone.key}
                className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5">
                <span
                  className="h-8 w-1.5 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800">{zone.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {zone.rows.length * zone.seatsPerRow} seats · {zone.rows.length} rows ×{" "}
                    {zone.seatsPerRow} · {zone.defaultPriceMinorUnits / 100} THB default
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeZone(zone.key)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                  aria-label={`Remove ${zone.name}`}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-xl border border-dashed border-slate-300 p-3">
          <span className="label mb-2 block">Add a stand</span>
          <VenueZoneForm key={zoneFormKey} submitting={submitting} onSubmit={addZone} />
        </div>
        {totalZones === 0 ? (
          <p className="text-[11px] text-amber-600">
            A fixture needs at least one stand before it can sell seats.
          </p>
        ) : null}
      </Section>

      <Section
        section="gates"
        step={4}
        title="Gates"
        description="Turnstiles are permanent venue-level gates: they appear on the Gates page and outlive this fixture.">
        {venueGates.length > 0 ? (
          <div className="space-y-2">
            <span className="label block">Gates already at this ground</span>
            <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 p-3">
              {venueGates.map((gate) => (
                <label key={gate.id} className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={effectiveGateIds.includes(gate.id)}
                    onChange={() =>
                      setSelectedGateIds(
                        effectiveGateIds.includes(gate.id)
                          ? effectiveGateIds.filter((id) => id !== gate.id)
                          : [...effectiveGateIds, gate.id],
                      )
                    }
                  />
                  {gate.name} ({gate.id})
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {draftGates.length > 0 ? (
          <div className="space-y-2">
            <span className="label block">New gates in this draft</span>
            {draftGates.map((gate, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 sm:grid-cols-2">
                <Field label="Gate code">
                  <input
                    value={gate.id}
                    onChange={(event) =>
                      updateGate(index, { id: event.target.value.toLowerCase() })
                    }
                    className="input font-mono text-xs"
                    placeholder="gate-2"
                  />
                </Field>
                <Field label="Display name">
                  <input
                    value={gate.name}
                    onChange={(event) => updateGate(index, { name: event.target.value })}
                    className="input"
                    placeholder="East Gate"
                  />
                </Field>
                <Field label="Stand">
                  <select
                    value={gate.stand}
                    onChange={(event) => updateGate(index, { stand: event.target.value })}
                    className="input">
                    <option value="">Whole ground</option>
                    {existingZones.map((zone) => (
                      <option key={zone.id} value={`id:${zone.id}`}>
                        {zone.name}
                      </option>
                    ))}
                    {draftZones.map((zone) => (
                      <option key={zone.key} value={`key:${zone.key}`}>
                        {zone.name} · new
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    onClick={() => removeGate(index)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-semibold text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={addGate}
          className="btn-ghost px-3 py-2 text-[11px]">
          <Plus size={12} /> Add a gate
        </button>
        {totalGates === 0 ? (
          <p className="text-[11px] text-amber-600">
            Add at least one gate so supporters can be admitted.
          </p>
        ) : null}
      </Section>

      {formError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary h-11 px-5 disabled:opacity-60">
        {submitting ? "Creating fixture…" : "Create fixture"}
      </button>
    </form>
  );
}

function Section({
  section,
  step,
  title,
  description,
  children,
}: {
  section: string;
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-section={section}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-start gap-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
          {step}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-[11px] text-slate-500">{description}</p>
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
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
    <label className="block text-[11px] font-semibold text-slate-600">
      {label}
      <div className="mt-1 font-normal">{children}</div>
      {error ? <span className="mt-1 block text-[11px] text-red-600">{error}</span> : null}
    </label>
  );
}
