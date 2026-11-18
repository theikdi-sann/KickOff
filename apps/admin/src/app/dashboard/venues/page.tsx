"use client";

import { Building2, Home, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { majorToMinorUnits } from "@kickoff/shared";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  SectionTitle,
  Skeleton,
  useToast,
} from "@/components/ui";
import {
  useCreateVenue,
  useDeleteVenue,
  useDeleteVenueZone,
  useSaveVenueZone,
  useUpdateVenue,
  useVenueLayout,
  useVenues,
  type AdminVenue,
  type AdminVenueInput,
  type AdminVenueZone,
} from "@/lib/queries/venues";

interface VenueFormValues {
  name: string;
  city: string;
  address: string;
  isHome: boolean;
}

const emptyVenue = (): VenueFormValues => ({ name: "", city: "", address: "", isHome: false });

function venueFormFrom(venue: AdminVenue): VenueFormValues {
  return {
    name: venue.name,
    city: venue.city ?? "",
    address: venue.address ?? "",
    isHome: venue.isHome,
  };
}

export default function VenuesPage() {
  const { toast } = useToast();
  const { data: venues, isLoading, error } = useVenues();
  const createVenue = useCreateVenue();
  const updateVenue = useUpdateVenue();
  const deleteVenue = useDeleteVenue();

  const [form, setForm] = useState<VenueFormValues>(emptyVenue());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminVenue | null>(null);
  const [layoutVenue, setLayoutVenue] = useState<AdminVenue | null>(null);
  const [deleting, setDeleting] = useState<AdminVenue | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const rows = venues ?? [];
  const busy = createVenue.isPending || updateVenue.isPending;

  const openCreate = () => {
    setForm(emptyVenue());
    setFormError(null);
    setCreating(true);
  };

  const openEdit = (venue: AdminVenue) => {
    setForm(venueFormFrom(venue));
    setFormError(null);
    setEditing(venue);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Venue name is required.");
      return;
    }
    const input: AdminVenueInput = {
      name: form.name,
      city: form.city,
      address: form.address,
      isHome: form.isHome,
    };
    try {
      if (editing) {
        await updateVenue.mutateAsync({ id: editing.id, patch: input });
        toast({ title: "Venue updated", description: form.name, tone: "green" });
      } else {
        await createVenue.mutateAsync(input);
        toast({ title: "Venue added", description: form.name, tone: "green" });
      }
      closeForm();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the venue.");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteVenue.mutateAsync(deleting.id);
      toast({ title: "Venue deleted", description: deleting.name, tone: "amber" });
    } catch (caught) {
      toast({
        title: "Could not delete venue",
        description:
          caught instanceof Error ? `${deleting.name}: ${caught.message}` : "Try again in a moment.",
        tone: "red",
      });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Stadium"
        title="Venues"
        description="Each ground owns its zones, seats and gates. Fixtures pick a venue and inherit its layout."
        action={
          <button type="button" onClick={openCreate} className="btn-primary">
            <Plus size={16} />
            New venue
          </button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : error ? (
        <div className="panel p-8 text-center text-sm text-red-600">
          {error instanceof Error ? error.message : "Could not load venues."}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Building2 size={22} />}
            title="No venues yet"
            description="Add the home ground first — fixtures cannot be created without one."
            action={
              <button type="button" onClick={openCreate} className="btn-primary">
                <Plus size={15} />
                New venue
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((venue) => (
            <article key={venue.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 size={15} className="shrink-0 text-pitch" />
                    <h2 className="display text-xl leading-6 text-slate-900">{venue.name}</h2>
                    {venue.isHome ? (
                      <Badge tone="green">
                        <Home size={10} /> Home
                      </Badge>
                    ) : (
                      <Badge tone="muted">Away</Badge>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                    {[venue.city, venue.address].filter(Boolean).join(" · ") || "No address on file"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">{venue.capacity}</span> seats ·{" "}
                    {venue.zoneCount} zone{venue.zoneCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLayoutVenue(venue)}
                    className="btn-ghost px-2.5 py-1.5 text-[10px]">
                    <Layers size={11} />
                    Layout
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(venue)}
                    className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
                    aria-label={`Edit ${venue.name}`}>
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(venue)}
                    className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${venue.name}`}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={creating || editing !== null}
        onClose={closeForm}
        title={editing ? "Edit venue" : "New venue"}
        description="Home is the club's ground and is preselected for home fixtures."
        footer={
          <>
            <button type="button" onClick={closeForm} className="btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="btn-primary">
              {busy ? "Saving…" : editing ? "Save changes" : "Add venue"}
            </button>
          </>
        }>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="label mb-1.5 block">Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="input"
              placeholder="KickOff Arena"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label mb-1.5 block">City</span>
              <input
                value={form.city}
                onChange={(event) =>
                  setForm((current) => ({ ...current, city: event.target.value }))
                }
                className="input"
                placeholder="Bangkok"
              />
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Address</span>
              <input
                value={form.address}
                onChange={(event) =>
                  setForm((current) => ({ ...current, address: event.target.value }))
                }
                className="input"
                placeholder="Rama IX Road"
              />
            </label>
          </div>
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={form.isHome}
              onChange={(event) =>
                setForm((current) => ({ ...current, isHome: event.target.checked }))
              }
              className="mt-0.5"
            />
            <span>
              <span className="block font-semibold text-slate-800">This is the home ground</span>
              One per club; it is preselected for every home fixture.
            </span>
          </label>
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          ) : null}
        </form>
      </Modal>

      {layoutVenue ? (
        <VenueLayoutDialog venue={layoutVenue} onClose={() => setLayoutVenue(null)} />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete venue?"
        description={
          deleting
            ? `“${deleting.name}” can only be deleted once no fixture references it.`
            : undefined
        }
        confirmLabel="Delete venue"
        busy={deleteVenue.isPending}
        onConfirm={() => void remove()}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function VenueLayoutDialog({ venue, onClose }: { venue: AdminVenue; onClose: () => void }) {
  const { toast } = useToast();
  const layout = useVenueLayout(venue.id);
  const saveZone = useSaveVenueZone();
  const deleteZone = useDeleteVenueZone();
  const [editing, setEditing] = useState<AdminVenueZone | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminVenueZone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    name: "",
    description: "",
    color: "#22C55E",
    rows: "A,B,C,D,E,F",
    seatsPerRow: "12",
    price: "350",
  });

  const current = layout.data ?? [];
  const capacity = current.reduce((total, zone) => total + zone.capacity, 0);

  const openCreate = () => {
    setEditing(null);
    setValues({ name: "", description: "", color: "#22C55E", rows: "A,B,C,D,E,F", seatsPerRow: "12", price: "350" });
    setError(null);
    setAdding(true);
  };

  const openEdit = (zone: AdminVenueZone) => {
    setEditing(zone);
    setValues({
      name: zone.name,
      description: zone.description,
      color: zone.color,
      rows: zone.rows.join(","),
      seatsPerRow: String(zone.seatsPerRow),
      price: String(zone.defaultPriceMinorUnits / 100),
    });
    setError(null);
    setAdding(true);
  };

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
      await saveZone.mutateAsync({
        venueId: venue.id,
        zoneId: editing?.id,
        patch: {
          name: values.name,
          description: values.description,
          color: values.color,
          rows: editing ? editing.rows : rows,
          seatsPerRow: editing ? editing.seatsPerRow : seatsPerRow,
          defaultPriceMinorUnits: priceMinorUnits,
        },
      });
      setAdding(false);
      setEditing(null);
      toast({ title: editing ? "Zone updated" : "Zone added", description: values.name, tone: "green" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the zone.");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteZone.mutateAsync({ venueId: venue.id, zoneId: deleting.id });
      toast({ title: "Zone deleted", description: deleting.name, tone: "amber" });
    } catch (caught) {
      toast({
        title: "Could not delete the zone",
        description: caught instanceof Error ? caught.message : "Try again in a moment.",
        tone: "red",
      });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`${venue.name} layout`}
        description={`${capacity} seats across ${current.length} zone${current.length === 1 ? "" : "s"}. Fixtures clone this layout when they are created.`}
        wide
        footer={
          <>
            <button type="button" onClick={onClose} className="btn-ghost">
              Close
            </button>
            <button type="button" onClick={openCreate} className="btn-primary">
              <Plus size={14} /> Add zone
            </button>
          </>
        }>
        <div className="space-y-2">
          {layout.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading layout…</p>
          ) : current.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No zones yet. Add the first stand to make this venue sellable.
            </p>
          ) : (
            current.map((zone) => (
              <div
                key={zone.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <span
                  className="h-8 w-1.5 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800">{zone.name}</p>
                  <p className="text-[10px] text-slate-400">
                    {zone.capacity} seats · {zone.rows.length} rows × {zone.seatsPerRow} ·{" "}
                    {zone.defaultPriceMinorUnits / 100} THB default
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(zone)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
                  aria-label={`Edit ${zone.name}`}>
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(zone)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${zone.name}`}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>

      {adding ? (
        <Modal
          open
          onClose={() => setAdding(false)}
          title={editing ? `Edit ${editing.name}` : "Add zone"}
          description={
            editing
              ? "Layout is locked once the zone exists. Name, colour and default price can change."
              : "Seats are generated from the rows and seats-per-row."
          }
          wide>
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
                  onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
                  className="input mt-1"
                />
              </label>
              {!editing ? (
                <>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Rows (comma separated)
                    <input
                      value={values.rows}
                      onChange={(event) => setValues((current) => ({ ...current, rows: event.target.value }))}
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
                      onChange={(event) => setValues((current) => ({ ...current, seatsPerRow: event.target.value }))}
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
              disabled={saveZone.isPending}
              className="btn-primary w-full">
              {saveZone.isPending ? "Saving…" : editing ? "Save zone" : "Add zone"}
            </button>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete zone?"
        description={
          deleting
            ? `${deleting.name} and its ${deleting.capacity} seats will be removed from the venue layout. Fixtures already created keep their copy.`
            : undefined
        }
        confirmLabel="Delete zone"
        busy={deleteZone.isPending}
        onConfirm={() => void remove()}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
