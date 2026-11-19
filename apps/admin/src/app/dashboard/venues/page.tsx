"use client";

import { Building2, Home, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
  useUpdateVenue,
  useVenues,
  type AdminVenue,
  type AdminVenueInput,
} from "@/lib/queries/venues";
import { VenueLayoutEditor } from "@/components/venue-layout-editor";

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
        <VenueLayoutEditor venue={layoutVenue} onClose={() => setLayoutVenue(null)} />
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
