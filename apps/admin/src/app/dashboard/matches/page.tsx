"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { MatchForm } from "@/components/match-form";
import { track } from "@/lib/analytics";
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
  useAllZones,
  useCreateMatch,
  useDeleteMatch,
  useMatchSalesSummaries,
  useMatches,
  useUpdateMatch,
  type AdminMatchInput,
} from "@/lib/queries/matches";
import { cn } from "@/lib/utils";
import {
  formatMatchDate,
  formatMatchTime,
  formatTHB,
  type MatchDto,
} from "@kickoff/shared";

type Filter = "all" | "upcoming" | "completed";

export default function MatchesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: matches, isLoading, error } = useMatches();
  const { data: zones } = useAllZones();
  const { data: sales } = useMatchSalesSummaries();
  const createMatch = useCreateMatch();
  const updateMatch = useUpdateMatch();
  const deleteMatch = useDeleteMatch();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MatchDto | null>(null);
  const [deleting, setDeleting] = useState<MatchDto | null>(null);

  const allMatches = useMemo(() => matches ?? [], [matches]);
  const allZones = useMemo(() => zones ?? [], [zones]);

  const filtered = useMemo(() => {
    return [...allMatches]
      .filter((match) => (filter === "all" ? true : match.status === filter))
      .filter((match) => match.opponent.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "upcoming" ? -1 : 1;
        return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
      });
  }, [allMatches, filter, query]);

  const handleCreate = async (input: AdminMatchInput) => {
    const match = await createMatch.mutateAsync(input);
    setCreating(false);
    track("fixture_created", { matchId: match.id, opponent: match.opponent });
    toast({
      title: "Fixture created",
      description: `KickOff vs ${match.opponent} is ready for seating.`,
      tone: "green",
    });
    router.push(`/dashboard/matches/${match.id}`);
  };

  const handleUpdate = async (input: AdminMatchInput) => {
    if (!editing) return;
    await updateMatch.mutateAsync({ id: editing.id, patch: input });
    setEditing(null);
    toast({ title: "Fixture updated", description: "Match details saved.", tone: "green" });
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMatch.mutateAsync(deleting.id);
      toast({
        title: "Fixture deleted",
        description: `KickOff vs ${deleting.opponent} and its zones were removed.`,
        tone: "amber",
      });
    } catch (caught) {
      toast({
        title: "Could not delete fixture",
        description: caught instanceof Error ? caught.message : "Try again in a moment.",
        tone: "red",
      });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Fixture control"
        title="Matches & seating"
        description="Create fixtures, configure zones, and control seat inventory."
        action={
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
            <Plus size={16} />
            New fixture
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {(["all", "upcoming", "completed"] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[11px] font-semibold capitalize transition",
                filter === value ? "bg-pitch text-white" : "text-slate-500 hover:text-slate-800",
              )}>
              {value}
              <span className={cn("ml-1.5 text-[9px]", filter === value ? "text-white/60" : "text-slate-400")}>
                {value === "all"
                  ? allMatches.length
                  : allMatches.filter((match) => match.status === value).length}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <Search size={14} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search opponent"
            className="w-44 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : error ? (
        <div className="panel p-8 text-center text-sm text-red-600">
          {error instanceof Error ? error.message : "Could not load fixtures."}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<CalendarDays size={22} />}
            title="No fixtures found"
            description="Try a different filter or create a new fixture to configure its seating."
            action={
              <button type="button" onClick={() => setCreating(true)} className="btn-primary">
                <Plus size={15} />
                New fixture
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((match) => {
            const matchZones = allZones.filter((zone) => zone.matchId === match.id);
            const capacity = matchZones.reduce((sum, zone) => sum + zone.rows.length * zone.seatsPerRow, 0);
            const sold = Math.min(capacity, sales?.[match.id]?.ticketsSold ?? 0);
            const minPrice = matchZones.length
              ? Math.min(...matchZones.map((zone) => zone.priceSatang))
              : 0;
            const completed = match.status === "completed";
            return (
              <div key={match.id} className="panel overflow-hidden">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div
                    className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-white"
                    style={{
                      background: `linear-gradient(135deg, ${match.posterColors[0]}, ${match.posterColors[1]})`,
                    }}>
                    <span className="display text-xl leading-5">{match.opponentShort}</span>
                    <span className="mt-0.5 text-[7px] uppercase tracking-[0.12em] text-white/55">
                      {completed ? `${match.homeScore ?? 0}–${match.awayScore ?? 0}` : "Home"}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="display truncate text-2xl leading-6 text-slate-900">
                        KickOff vs {match.opponent}
                      </h2>
                      <Badge tone={completed ? "muted" : "green"}>{match.status}</Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} />
                        {formatMatchDate(match.kickoffAt)} · {formatMatchTime(match.kickoffAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />
                        {match.venue}
                      </span>
                      <span>{match.competition}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 sm:w-[260px]">
                    <Metric label="Zones" value={String(matchZones.length)} />
                    <Metric label="Sold" value={completed ? "—" : `${sold}/${capacity}`} />
                    <Metric label="From" value={minPrice ? formatTHB(minPrice) : "—"} />
                  </div>

                  <div className="flex items-center gap-2 sm:justify-end">
                    <Link href={`/dashboard/matches/${match.id}`} className="btn-ghost px-3 py-2 text-[11px]">
                      Seating
                      <ChevronRight size={13} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setEditing(match)}
                      className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                      aria-label="Edit match">
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(match)}
                      className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete match">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {!completed ? (
                  <div className="h-1 bg-slate-100">
                    <div
                      className="h-full bg-pitch"
                      style={{ width: `${capacity ? Math.round((sold / capacity) * 100) : 0}%` }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex items-center gap-2 text-[10px] text-slate-400">
        <Users size={12} />
        Availability is calculated from the zone layout and paid tickets in Supabase.
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create fixture"
        description="New fixtures start with no zones. Add stands on the seating page."
        wide>
        <MatchForm submitting={createMatch.isPending} onSubmit={handleCreate} />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit fixture"
        description="Update match details. Seating zones are managed separately."
        wide>
        <MatchForm
          key={editing?.id ?? "edit"}
          initial={editing ?? undefined}
          submitting={updateMatch.isPending}
          onSubmit={handleUpdate}
        />
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete fixture?"
        description={
          deleting
            ? `KickOff vs ${deleting.opponent} and every zone under it will be removed. Orders already paid are kept for audit.`
            : undefined
        }
        confirmLabel="Delete fixture"
        busy={deleteMatch.isPending}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-800">{value}</p>
    </div>
  );
}
