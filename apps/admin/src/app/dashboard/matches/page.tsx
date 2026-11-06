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

import { Badge, Modal, SectionTitle } from "@/components/ui";
import { useAdmin, type MatchInput } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  formatMatchDate,
  formatMatchTime,
  formatTHB,
  zoneAvailability,
  type Match,
} from "@xclub/shared";

type Filter = "all" | "upcoming" | "completed";

export default function MatchesPage() {
  const router = useRouter();
  const { matches, zones, addMatch, updateMatch, deleteMatch } = useAdmin();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Match | null>(null);

  const filtered = useMemo(() => {
    return [...matches]
      .filter((match) => (filter === "all" ? true : match.status === filter))
      .filter((match) => match.opponent.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "upcoming" ? -1 : 1;
        return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
      });
  }, [matches, filter, query]);

  const handleCreate = (input: MatchInput) => {
    const match = addMatch(input);
    setCreating(false);
    router.push(`/dashboard/matches/${match.id}`);
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
                  ? matches.length
                  : matches.filter((match) => match.status === value).length}
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

      <div className="space-y-2.5">
        {filtered.map((match) => {
          const matchZones = zones.filter((zone) => zone.matchId === match.id);
          const capacity = matchZones.reduce((sum, zone) => sum + zone.rows.length * zone.seatsPerRow, 0);
          const available = matchZones.reduce((sum, zone) => sum + zoneAvailability(zone).available, 0);
          const sold = capacity - available;
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
                    {completed ? `${match.homeScore}–${match.awayScore}` : "Home"}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="display truncate text-2xl leading-6 text-slate-900">
                      XClub vs {match.opponent}
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
                    onClick={() => {
                      if (window.confirm(`Delete XClub vs ${match.opponent} and its seating?`)) {
                        deleteMatch(match.id);
                      }
                    }}
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

        {filtered.length === 0 ? (
          <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-pitch">
              <CalendarDays size={22} />
            </div>
            <h2 className="display mt-4 text-2xl text-slate-900">No fixtures found</h2>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
              Try a different filter or create a new fixture to configure its seating.
            </p>
            <button type="button" onClick={() => setCreating(true)} className="btn-primary mt-4">
              <Plus size={15} />
              New fixture
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex items-center gap-2 text-[10px] text-slate-400">
        <Users size={12} />
        Seating availability is generated from the zone layout. Mock sold seats are deterministic per
        zone.
      </div>

      {creating ? (
        <MatchModal
          open
          key="create-fixture"
          onClose={() => setCreating(false)}
          onSubmit={handleCreate}
          title="Create fixture"
          description="New fixtures start with three editable seating zones."
          submitLabel="Create & configure seating"
        />
      ) : null}

      {editing ? (
        <MatchModal
          open
          key={editing.id}
          onClose={() => setEditing(null)}
          onSubmit={(input) => {
            updateMatch(editing.id, input);
            setEditing(null);
          }}
          title="Edit fixture"
          description="Update match details. Seating zones are managed separately."
          submitLabel="Save changes"
          initial={editing}
        />
      ) : null}
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

function MatchModal({
  open,
  onClose,
  onSubmit,
  title,
  description,
  submitLabel,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: MatchInput) => void;
  title: string;
  description: string;
  submitLabel: string;
  initial?: Match;
}) {
  const initialDate = initial ? initial.kickoffAt.slice(0, 10) : "2026-11-14";
  const initialTime = initial ? initial.kickoffAt.slice(11, 16) : "18:00";
  const [form, setForm] = useState({
    opponent: initial?.opponent ?? "",
    opponentShort: initial?.opponentShort ?? "",
    date: initialDate,
    time: initialTime,
    venue: initial?.venue ?? "XClub Arena",
    competition: initial?.competition ?? "Thai Premier League",
    homeAway: initial?.homeAway ?? "home",
    status: initial?.status ?? "upcoming",
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (form.opponent.trim().length < 2) {
      setError("Enter the opponent name.");
      return;
    }
    if (!form.date || !form.time) {
      setError("Choose a kickoff date and time.");
      return;
    }
    setError(null);
    onSubmit({
      opponent: form.opponent.trim(),
      opponentShort:
        (form.opponentShort || form.opponent.replace(/\s+/g, "").slice(0, 3)).toUpperCase(),
      kickoffAt: `${form.date}T${form.time}:00+07:00`,
      venue: form.venue,
      competition: form.competition,
      homeAway: form.homeAway as "home" | "away",
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div>
            <label className="label mb-1.5 block">Opponent</label>
            <input
              value={form.opponent}
              onChange={(event) => setForm({ ...form, opponent: event.target.value })}
              className="input"
              placeholder="Bangkok Rovers"
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Short code</label>
            <input
              value={form.opponentShort}
              onChange={(event) => setForm({ ...form, opponentShort: event.target.value.slice(0, 3) })}
              className="input uppercase"
              placeholder="BKR"
              maxLength={3}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1.5 block">Kickoff date</label>
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Kickoff time</label>
            <input
              type="time"
              value={form.time}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label mb-1.5 block">Venue</label>
          <input
            value={form.venue}
            onChange={(event) => setForm({ ...form, venue: event.target.value })}
            className="input"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1.5 block">Competition</label>
            <input
              value={form.competition}
              onChange={(event) => setForm({ ...form, competition: event.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Home / away</label>
            <select
              value={form.homeAway}
              onChange={(event) =>
                setForm({ ...form, homeAway: event.target.value as "home" | "away" })
              }
              className="input">
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
