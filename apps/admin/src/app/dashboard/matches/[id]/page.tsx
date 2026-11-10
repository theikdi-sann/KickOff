"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  MapPin,
  Plus,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { MatchForm } from "@/components/match-form";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  SectionTitle,
  Skeleton,
  useToast,
} from "@/components/ui";
import { ZoneCreateForm } from "@/components/zone-create-form";
import { ZoneEditor } from "@/components/zone-editor";
import {
  useAddZone,
  useDeleteZone,
  useMatch,
  useMatchSalesSummaries,
  useUpdateMatch,
  useUpdateZone,
  useZones,
  type AdminMatchInput,
  type AdminZoneInput,
} from "@/lib/queries/matches";
import {
  formatMatchDate,
  formatMatchTime,
  formatTHB,
  type ZoneDto,
} from "@xclub/shared";

export default function SeatingPage() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;
  const { toast } = useToast();

  const matchQuery = useMatch(matchId);
  const zonesQuery = useZones(matchId);
  const salesQuery = useMatchSalesSummaries();
  const addZone = useAddZone();
  const updateZone = useUpdateZone();
  const deleteZone = useDeleteZone();
  const updateMatch = useUpdateMatch();

  const [creatingZone, setCreatingZone] = useState(false);
  const [deletingZone, setDeletingZone] = useState<ZoneDto | null>(null);
  const [editingFixture, setEditingFixture] = useState(false);

  if (matchQuery.isLoading || zonesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (matchQuery.error || !matchQuery.data) {
    return (
      <div className="panel p-10 text-center">
        <h1 className="display text-3xl text-slate-900">Fixture not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          {matchQuery.error instanceof Error
            ? matchQuery.error.message
            : "It may have been deleted or reset."}
        </p>
        <Link href="/dashboard/matches" className="btn-primary mt-5 inline-flex">
          Back to matches
        </Link>
      </div>
    );
  }

  const match = matchQuery.data;
  const matchZones = zonesQuery.data ?? [];
  const capacity = matchZones.reduce((sum, zone) => sum + zone.rows.length * zone.seatsPerRow, 0);
  const sold = Math.min(capacity, salesQuery.data?.[match.id]?.ticketsSold ?? 0);
  const available = Math.max(0, capacity - sold);
  const potential = matchZones.reduce(
    (sum, zone) => sum + zone.priceSatang * zone.rows.length * zone.seatsPerRow,
    0,
  );

  const handleAddZone = async (input: AdminZoneInput) => {
    await addZone.mutateAsync({ ...input, matchId: match.id });
    setCreatingZone(false);
    toast({
      title: "Zone created",
      description: `${input.name} and its seats are ready for sale.`,
      tone: "green",
    });
  };

  const handleUpdateZone = async (
    zone: ZoneDto,
    patch: { name: string; description: string; priceSatang: number; color: string },
  ) => {
    await updateZone.mutateAsync({ id: zone.id, matchId: zone.matchId, patch });
    toast({ title: "Zone updated", description: `${patch.name} saved.`, tone: "green" });
  };

  const handleDeleteZone = async () => {
    if (!deletingZone) return;
    try {
      await deleteZone.mutateAsync({ id: deletingZone.id, matchId: deletingZone.matchId });
      toast({
        title: "Zone deleted",
        description: `${deletingZone.name} was removed from this fixture.`,
        tone: "amber",
      });
    } catch (caught) {
      toast({
        title: "Could not delete zone",
        description: caught instanceof Error ? caught.message : "Try again in a moment.",
        tone: "red",
      });
    } finally {
      setDeletingZone(null);
    }
  };

  const handleUpdateFixture = async (input: AdminMatchInput) => {
    await updateMatch.mutateAsync({ id: match.id, patch: input });
    setEditingFixture(false);
    toast({ title: "Fixture updated", description: "Match details saved.", tone: "green" });
  };

  return (
    <div>
      <Link
        href="/dashboard/matches"
        className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 transition hover:text-pitch">
        <ArrowLeft size={13} />
        Back to matches
      </Link>

      <SectionTitle
        eyebrow="Seating configuration"
        title={`XClub vs ${match.opponent}`}
        description="Set zone prices, rows, and seat counts. Changes are written to Supabase instantly."
        action={
          <button type="button" onClick={() => setCreatingZone(true)} className="btn-primary">
            <Plus size={16} />
            Add zone
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat icon={<Users size={16} />} label="Capacity" value={String(capacity)} />
        <MiniStat
          icon={<CalendarDays size={16} />}
          label="Sold"
          value={`${sold} · ${capacity ? Math.round((sold / capacity) * 100) : 0}%`}
        />
        <MiniStat icon={<Wallet size={16} />} label="Available" value={String(available)} />
        <MiniStat icon={<CircleDollarSign size={16} />} label="Gate potential" value={formatTHB(potential)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-3">
          {matchZones.map((zone, index) => (
            <div key={zone.id} className="panel overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <div
                  className="grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold text-white"
                  style={{ backgroundColor: zone.color }}>
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">{zone.name}</p>
                  <p className="text-[10px] text-slate-400">
                    {zone.rows.length} rows · {zone.seatsPerRow} seats per row ·{" "}
                    {zone.rows.length * zone.seatsPerRow} seats
                  </p>
                </div>
                <Badge tone="green">{formatTHB(zone.priceSatang)}</Badge>
                <button
                  type="button"
                  onClick={() => setDeletingZone(zone)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${zone.name}`}>
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="p-4">
                <ZoneEditor
                  key={`${zone.id}-${zone.priceSatang}-${zone.name}`}
                  zone={zone}
                  submitting={updateZone.isPending}
                  onSubmit={(patch) => handleUpdateZone(zone, patch)}
                />
              </div>
            </div>
          ))}

          {matchZones.length === 0 ? (
            <div className="panel">
              <EmptyState
                icon={<Plus size={20} />}
                title="No zones yet"
                description="Add a stand to start selling seats for this fixture."
                action={
                  <button type="button" onClick={() => setCreatingZone(true)} className="btn-primary">
                    Add first zone
                  </button>
                }
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <p className="label text-pitch">Match details</p>
            <h2 className="display mt-1 text-2xl text-slate-900">Fixture setup</h2>
            <div className="mt-4 space-y-3 text-xs">
              <DetailRow icon={<CalendarDays size={14} />} label="Date" value={formatMatchDate(match.kickoffAt)} />
              <DetailRow icon={<Clock3 size={14} />} label="Kick-off" value={formatMatchTime(match.kickoffAt)} />
              <DetailRow icon={<MapPin size={14} />} label="Venue" value={match.venue} />
              <DetailRow icon={<Users size={14} />} label="Competition" value={match.competition} />
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Status
              </span>
              <Badge tone={match.status === "upcoming" ? "green" : "muted"}>{match.status}</Badge>
            </div>
            <button
              type="button"
              onClick={() => setEditingFixture(true)}
              className="btn-ghost mt-3 w-full">
              Edit fixture details
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-night p-5 text-white">
            <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full border border-white/[0.07]" />
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-gold">Stadium preview</p>
            <div className="relative mt-4 h-44 rounded-xl border border-white/10 bg-[#0B2417] p-3">
              <div className="absolute inset-x-12 inset-y-9 rounded-md border border-white/20">
                <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
              </div>
              {matchZones.map((zone, index) => {
                const positions = [
                  "left-1/2 top-2 h-4 w-24 -translate-x-1/2",
                  "right-2 top-1/2 h-20 w-4 -translate-y-1/2",
                  "left-2 top-1/2 h-20 w-4 -translate-y-1/2",
                  "bottom-2 left-1/2 h-4 w-24 -translate-x-1/2",
                  "right-8 top-8 h-10 w-4",
                  "left-8 bottom-8 h-10 w-4",
                ];
                return (
                  <div
                    key={zone.id}
                    className={`absolute rounded-sm ${positions[index % positions.length]}`}
                    style={{ backgroundColor: zone.color }}
                    title={zone.name}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {matchZones.map((zone) => (
                <span key={zone.id} className="flex items-center gap-1.5 text-[9px] text-white/60">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: zone.color }} />
                  {zone.name}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[11px] leading-5 text-amber-800/80">
            <span className="font-semibold text-amber-800">Inventory note:</span> seat rows and seat
            counts are locked once a zone exists, so paid orders keep their snapshot. Add a new zone
            for a different layout.
          </div>
        </div>
      </div>

      <Modal
        open={creatingZone}
        onClose={() => setCreatingZone(false)}
        title="Add zone"
        description="Choose the layout and price. Seats are generated when the zone is created."
        wide>
        <ZoneCreateForm submitting={addZone.isPending} onSubmit={handleAddZone} />
      </Modal>

      <Modal
        open={editingFixture}
        onClose={() => setEditingFixture(false)}
        title="Edit fixture"
        description="Update match details. Seating zones are managed separately."
        wide>
        <MatchForm
          initial={match}
          submitting={updateMatch.isPending}
          onSubmit={handleUpdateFixture}
        />
      </Modal>

      <ConfirmDialog
        open={deletingZone !== null}
        title="Delete zone?"
        description={
          deletingZone
            ? `${deletingZone.name} will be removed from this fixture. Seats with paid tickets cannot be deleted.`
            : undefined
        }
        confirmLabel="Delete zone"
        busy={deleteZone.isPending}
        onConfirm={() => void handleDeleteZone()}
        onClose={() => setDeletingZone(null)}
      />
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="panel flex items-center gap-3 p-4">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-pitch">{icon}</div>
      <div>
        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </span>
      <span className="text-right font-semibold text-slate-800">{value}</span>
    </div>
  );
}
