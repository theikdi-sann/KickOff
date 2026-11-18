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
import { MatchResultDialog, type MatchResultInput } from "@/components/match-result-dialog";
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
  useZoneAvailability,
  useZones,
  useSetMatchResult,
  useSetMatchStatus,
  type AdminMatchInput,
  type AdminZoneInput,
} from "@/lib/queries/matches";
import { useTenantDisplay } from "@/lib/queries/tenant";
import {
  formatMatchDate,
  formatMatchTime,
  formatMoney,
  matchPhase,
  potentialRevenueMinorUnits,
  summariseAvailability,
  type ZoneDto,
} from "@kickoff/shared";

export default function SeatingPage() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;
  const display = useTenantDisplay();
  const { toast } = useToast();

  const matchQuery = useMatch(matchId);
  const zonesQuery = useZones(matchId);
  const salesQuery = useMatchSalesSummaries();
  const availabilityQuery = useZoneAvailability();
  const addZone = useAddZone();
  const updateZone = useUpdateZone();
  const deleteZone = useDeleteZone();
  const updateMatch = useUpdateMatch();
  const setMatchStatus = useSetMatchStatus();
  const setMatchResult = useSetMatchResult();

  const [creatingZone, setCreatingZone] = useState(false);
  const [deletingZone, setDeletingZone] = useState<ZoneDto | null>(null);
  const [editingFixture, setEditingFixture] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<"postponed" | "cancelled" | "upcoming" | null>(
    null,
  );
  const [statusReason, setStatusReason] = useState("");

  if (matchQuery.isLoading || zonesQuery.isLoading || availabilityQuery.isLoading) {
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

  if (matchQuery.error || availabilityQuery.error || !matchQuery.data) {
    const fixtureMissing = Boolean(matchQuery.error) || !matchQuery.data;
    return (
      <div className="panel p-10 text-center">
        <h1 className="display text-3xl text-slate-900">
          {fixtureMissing ? "Fixture not found" : "Seating unavailable"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {matchQuery.error instanceof Error
            ? matchQuery.error.message
            : availabilityQuery.error instanceof Error
              ? availabilityQuery.error.message
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
  // The capacity, the free seats and the potential revenue all come from the
  // database's own seat count — the zone layout is what the club asked for,
  // and it is not what the club has.
  const matchAvailability = summariseAvailability(availabilityQuery.data ?? [])[match.id];
  const capacity = matchAvailability?.capacity ?? 0;
  const sold = Math.min(capacity, salesQuery.data?.[match.id]?.ticketsSold ?? 0);
  const available = matchAvailability?.available ?? 0;
  const potential = potentialRevenueMinorUnits(matchZones, availabilityQuery.data ?? []);
  const availabilityByZone = new Map(
    (availabilityQuery.data ?? []).map((zone) => [zone.zoneId, zone]),
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
    patch: { name: string; description: string; priceMinorUnits: number; color: string },
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

  const phase = matchPhase(match);
  const canEnterResult = phase === "live" || phase === "awaitingResult" || phase === "played";
  const canChangeStatus =
    phase === "scheduled" || match.status === "postponed" || match.status === "cancelled";
  // A zone, a price and a seat are saleable inventory. Once the clock has
  // started or closed the fixture, the database refuses the write (0062) and
  // the console must not offer it either. Rescheduling reopens the fixture.
  const canConfigureSeating = phase === "scheduled";
  const paidOrders = salesQuery.data?.[match.id]?.ordersPaid ?? 0;

  const handleSaveResult = async (result: MatchResultInput) => {
    try {
      await setMatchResult.mutateAsync({ id: match.id, ...result });
      setResultOpen(false);
      toast({ title: "Result saved", description: "The fixture now shows the final score.", tone: "green" });
    } catch (caught) {
      toast({
        title: "Could not save the result",
        description: caught instanceof Error ? caught.message : "Try again in a moment.",
        tone: "red",
      });
    }
  };

  const handleStatusChange = async () => {
    if (!statusAction) return;
    if (!statusReason.trim()) {
      toast({
        title: "A reason is required",
        description: "Tell the next admin why this fixture moved.",
        tone: "red",
      });
      return;
    }
    try {
      await setMatchStatus.mutateAsync({
        id: match.id,
        status: statusAction,
        reason: statusReason.trim(),
      });
      setStatusAction(null);
      setStatusReason("");
      toast({
        title: "Fixture updated",
        description:
          statusAction === "postponed"
            ? "The fixture is postponed and off sale."
            : statusAction === "cancelled"
              ? "The fixture is cancelled and off sale. Refunds stay manual."
              : "The fixture is back on sale.",
        tone: statusAction === "upcoming" ? "green" : "amber",
      });
    } catch (caught) {
      toast({
        title: "Could not change the fixture",
        description: caught instanceof Error ? caught.message : "Try again in a moment.",
        tone: "red",
      });
    }
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
        title={`KickOff vs ${match.opponent}`}
        description="Set zone prices, rows, and seat counts. Changes are written to Supabase instantly."
        action={
          canConfigureSeating ? (
            <button type="button" onClick={() => setCreatingZone(true)} className="btn-primary">
              <Plus size={16} />
              Add zone
            </button>
          ) : undefined
        }
      />

      {!canConfigureSeating ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          Seating is locked: this fixture has started or finished. Reschedule it to a future
          kick-off to add zones, seats or prices again.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat icon={<Users size={16} />} label="Capacity" value={String(capacity)} />
        <MiniStat
          icon={<CalendarDays size={16} />}
          label="Sold"
          value={`${sold} · ${capacity ? Math.round((sold / capacity) * 100) : 0}%`}
        />
        <MiniStat icon={<Wallet size={16} />} label="Available" value={String(available)} />
        <MiniStat icon={<CircleDollarSign size={16} />} label="Gate potential" value={formatMoney(potential, display.currency)} />
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
                    {availabilityByZone.get(zone.id)?.totalSeats ?? 0} seats
                  </p>
                </div>
                <Badge tone="green">{formatMoney(zone.priceMinorUnits, display.currency)}</Badge>
                {canConfigureSeating ? (
                  <button
                    type="button"
                    onClick={() => setDeletingZone(zone)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${zone.name}`}>
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
              {canConfigureSeating ? (
                <div className="p-4">
                  <ZoneEditor
                    key={`${zone.id}-${zone.priceMinorUnits}-${zone.name}`}
                    zone={zone}
                    submitting={updateZone.isPending && updateZone.variables?.id === zone.id}
                    onSubmit={(patch) => handleUpdateZone(zone, patch)}
                  />
                </div>
              ) : null}
            </div>
          ))}

          {matchZones.length === 0 ? (
            <div className="panel">
              <EmptyState
                icon={<Plus size={20} />}
                title="No zones yet"
                description="Add a stand to start selling seats for this fixture."
                action={
                  canConfigureSeating ? (
                    <button type="button" onClick={() => setCreatingZone(true)} className="btn-primary">
                      Add first zone
                    </button>
                  ) : undefined
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
              <DetailRow icon={<CalendarDays size={14} />} label="Date" value={formatMatchDate(match.kickoffAt, { timezone: display.timezone })} />
              <DetailRow icon={<Clock3 size={14} />} label="Kick-off" value={formatMatchTime(match.kickoffAt, { timezone: display.timezone })} />
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

            {canChangeStatus ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {match.status === "upcoming" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setStatusAction("postponed")}
                      className="btn-ghost flex-1 px-3 py-2 text-[11px]">
                      Postpone
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusAction("cancelled")}
                      className="btn-ghost flex-1 px-3 py-2 text-[11px] text-red-600">
                      Cancel match
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatusAction("upcoming")}
                    className="btn-ghost w-full px-3 py-2 text-[11px]">
                    Restore fixture
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {canEnterResult ? (
            <div className="panel p-5">
              <p className="label text-pitch">Result</p>
              <h2 className="display mt-1 text-2xl text-slate-900">
                {match.homeScore !== null && match.awayScore !== null
                  ? `${match.homeScore}–${match.awayScore}`
                  : "Awaiting result"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {phase === "live"
                  ? "The match is still playing. Saving a result before full time is possible but the clock will not have closed the fixture."
                  : "Scores are entered by an admin. The clock never guesses a result."}
              </p>
              <button
                type="button"
                onClick={() => setResultOpen(true)}
                className="btn-primary mt-3 w-full">
                {match.homeScore !== null && match.awayScore !== null
                  ? "Edit result"
                  : "Enter result"}
              </button>
            </div>
          ) : null}

          <div className="relative overflow-hidden rounded-2xl bg-night p-5 text-white">
            <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full border border-white/[0.07]" />
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-gold">Stadium preview</p>
            <div className="relative mt-4 h-44 rounded-xl border border-white/10 bg-pitch-deep p-3">
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

      {resultOpen ? (
        <MatchResultDialog
          open
          match={match}
          pending={setMatchResult.isPending}
          onClose={() => setResultOpen(false)}
          onSubmit={handleSaveResult}
        />
      ) : null}

      <Modal
        open={statusAction !== null}
        onClose={() => {
          setStatusAction(null);
          setStatusReason("");
        }}
        title={
          statusAction === "postponed"
            ? "Postpone this fixture"
            : statusAction === "cancelled"
              ? "Cancel this fixture"
              : "Restore this fixture"
        }
        description={
          statusAction === "cancelled"
            ? `Sales stop immediately and every valid ticket is voided. ${
                paidOrders > 0
                  ? `${paidOrders} paid order${paidOrders === 1 ? "" : "s"} need the refund flow — nothing moves money automatically.`
                  : "There are no paid orders to refund."
              }`
            : statusAction === "postponed"
              ? "Sales stop until the club sets a new kickoff. Tickets already sold stay valid."
              : "The fixture returns to upcoming and the clock re-arms."
        }>
        <div className="space-y-4">
          <label className="block text-[11px] font-semibold text-slate-600">
            Reason (required, audited)
            <textarea
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              rows={3}
              maxLength={400}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={handleStatusChange}
            disabled={setMatchStatus.isPending}
            className={statusAction === "cancelled" ? "btn-danger w-full" : "btn-primary w-full"}>
            {setMatchStatus.isPending ? "Saving…" : "Confirm"}
          </button>
        </div>
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
