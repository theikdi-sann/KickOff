"use client";

import { Building2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  SectionTitle,
  Skeleton,
  useToast,
} from "@/components/ui";
import { useCreateVenue, useDeleteVenue, useVenues, type AdminVenueInput } from "@/lib/queries/venues";

export default function VenuesPage() {
  const { toast } = useToast();
  const { data: venues, isLoading, error } = useVenues();
  const createVenue = useCreateVenue();
  const deleteVenue = useDeleteVenue();

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState<AdminVenueInput>({ name: "", city: "", address: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const rows = venues ?? [];

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Venue name is required.");
      return;
    }
    try {
      await createVenue.mutateAsync(form);
      setCreating(false);
      setForm({ name: "", city: "", address: "" });
      toast({ title: "Venue added", description: form.name, tone: "green" });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the venue.");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteVenue.mutateAsync(deleting.id);
      toast({ title: "Venue deleted", description: deleting.name, tone: "amber" });
    } catch (caught) {
      // The FK rejects a venue any fixture still references — say so plainly.
      toast({
        title: "Could not delete venue",
        description:
          caught instanceof Error
            ? `${deleting.name}: ${caught.message}`
            : "Try again in a moment.",
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
        description="Every ground the club plays at — fixtures pick from this list."
        action={
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
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
              <button type="button" onClick={() => setCreating(true)} className="btn-primary">
                <Plus size={15} />
                New venue
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((venue) => (
            <article key={venue.id} className="panel flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 size={15} className="shrink-0 text-pitch" />
                  <h2 className="display text-xl leading-6 text-slate-900">{venue.name}</h2>
                </div>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                  {[venue.city, venue.address].filter(Boolean).join(" · ") || "No address on file"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleting({ id: venue.id, name: venue.name })}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                aria-label={`Delete ${venue.name}`}>
                <Trash2 size={11} />
              </button>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New venue"
        description="Fixtures reference venues by name — add the ground here first.">
        <form onSubmit={handleCreate} className="space-y-4">
          <label className="block">
            <span className="label mb-1.5 block">Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="input"
              placeholder="KickOff Arena"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="label mb-1.5 block">City</span>
            <input
              value={form.city ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              className="input"
              placeholder="Bangkok"
            />
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Address</span>
            <input
              value={form.address ?? ""}
              onChange={(event) =>
                setForm((current) => ({ ...current, address: event.target.value }))
              }
              className="input"
              placeholder="KickOff Stadium, Rama IX Road"
            />
          </label>

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={createVenue.isPending}
            className="btn-primary h-11 px-5 disabled:opacity-60">
            {createVenue.isPending ? "Saving…" : "Add venue"}
          </button>
        </form>
      </Modal>

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
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
