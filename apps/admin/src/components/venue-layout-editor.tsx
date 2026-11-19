"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog, Modal, useToast } from "@/components/ui";
import { VenueZoneForm } from "@/components/venue-zone-form";
import {
  useDeleteVenueZone,
  useSaveVenueZone,
  useVenueLayout,
  type AdminVenue,
  type AdminVenueZone,
  type VenueZoneInput,
} from "@/lib/queries/venues";

interface VenueLayoutEditorProps {
  venue: AdminVenue;
  onClose: () => void;
}

/**
 * The physical layout of one venue: its zones, their generated seats and the
 * default price each carries. Fixtures clone this layout, so editing it only
 * changes future fixtures — a played fixture keeps its own copy.
 */
export function VenueLayoutEditor({ venue, onClose }: VenueLayoutEditorProps) {
  const { toast } = useToast();
  const layout = useVenueLayout(venue.id);
  const saveZone = useSaveVenueZone();
  const deleteZone = useDeleteVenueZone();
  const [editing, setEditing] = useState<AdminVenueZone | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminVenueZone | null>(null);

  const current = layout.data ?? [];
  const capacity = current.reduce((total, zone) => total + zone.capacity, 0);

  const openCreate = () => {
    setEditing(null);
    setAdding(true);
  };

  const openEdit = (zone: AdminVenueZone) => {
    setEditing(zone);
    setAdding(true);
  };

  const save = async (input: VenueZoneInput) => {
    const zone = editing;
    await saveZone.mutateAsync({ venueId: venue.id, zoneId: zone?.id, patch: input });
    setAdding(false);
    setEditing(null);
    toast({
      title: zone ? "Zone updated" : "Zone added",
      description: input.name,
      tone: "green",
    });
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
          <VenueZoneForm
            zone={editing}
            submitting={saveZone.isPending}
            onSubmit={save}
          />
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
