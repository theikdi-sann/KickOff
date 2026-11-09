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
import { Badge, SectionTitle } from "@/components/ui";
import { useAdmin } from "@/lib/store";
import {
  formatMatchDate,
  formatMatchTime,
  formatTHB,
  zoneAvailability,
  type Zone,
} from "@xclub/shared";

export default function SeatingPage() {
  const params = useParams<{ id: string }>();
  const { matches, zones, addZone, updateZone, deleteZone } = useAdmin();
  const match = matches.find((item) => item.id === params.id);
  const matchZones = zones.filter((zone) => zone.matchId === params.id);

  if (!match) {
    return (
      <div className="panel p-10 text-center">
        <h1 className="display text-3xl text-slate-900">Fixture not found</h1>
        <p className="mt-2 text-sm text-slate-500">It may have been deleted or reset.</p>
        <Link href="/dashboard/matches" className="btn-primary mt-5 inline-flex">
          Back to matches
        </Link>
      </div>
    );
  }

  const capacity = matchZones.reduce((sum, zone) => sum + zone.rows.length * zone.seatsPerRow, 0);
  const available = matchZones.reduce((sum, zone) => sum + zoneAvailability(zone).available, 0);
  const sold = capacity - available;
  const potential = matchZones.reduce((sum, zone) => sum + zone.priceSatang * zone.rows.length * zone.seatsPerRow, 0);

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
        description="Set zone prices, rows, and seat counts. Changes are saved to the mock store instantly."
        action={
          <button type="button" onClick={() => addZone(match.id)} className="btn-primary">
            <Plus size={16} />
            Add zone
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat icon={<Users size={16} />} label="Capacity" value={String(capacity)} />
        <MiniStat icon={<CalendarDays size={16} />} label="Sold" value={`${sold} · ${capacity ? Math.round((sold / capacity) * 100) : 0}%`} />
        <MiniStat icon={<Wallet size={16} />} label="Available" value={String(available)} />
        <MiniStat icon={<CircleDollarSign size={16} />} label="Gate potential" value={formatTHB(potential)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-3">
          {matchZones.map((zone, index) => (
            <ZoneEditor
              key={zone.id}
              zone={zone}
              index={index}
              onChange={(patch) => updateZone(zone.id, patch)}
              onDelete={() => {
                if (window.confirm(`Delete ${zone.name}?`)) deleteZone(zone.id);
              }}
            />
          ))}

          {matchZones.length === 0 ? (
            <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-pitch">
                <Plus size={20} />
              </div>
              <h2 className="display mt-4 text-2xl text-slate-900">No zones yet</h2>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                Add a stand to start selling seats for this fixture.
              </p>
              <button type="button" onClick={() => addZone(match.id)} className="btn-primary mt-4">
                Add first zone
              </button>
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
            <Link href="/dashboard/matches" className="btn-ghost mt-3 w-full">
              Edit fixture details
              <ChevronRight size={14} />
            </Link>
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
            <span className="font-semibold text-amber-800">Prototype rule:</span> seat inventory is
            generated from rows × seats per row. Real holds and double-booking protection arrive with
            the Supabase transaction layer.
          </div>
        </div>
      </div>
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

function ZoneEditor({
  zone,
  index,
  onChange,
  onDelete,
}: {
  zone: Zone;
  index: number;
  onChange: (patch: Partial<Zone>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(zone.name);
  const [description, setDescription] = useState(zone.description);
  const [price, setPrice] = useState(String(zone.priceSatang / 100));
  const [rowCount, setRowCount] = useState(String(zone.rows.length));
  const [seatsPerRow, setSeatsPerRow] = useState(String(zone.seatsPerRow));
  const availability = zoneAvailability(zone);
  const capacity = zone.rows.length * zone.seatsPerRow;

  const applyRows = (next: string) => {
    setRowCount(next);
    const count = Math.max(1, Math.min(10, Number(next) || 1));
    onChange({
      rows: Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i)),
    });
  };

  const applySeats = (next: string) => {
    setSeatsPerRow(next);
    const count = Math.max(1, Math.min(24, Number(next) || 1));
    onChange({ seatsPerRow: count });
  };

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: zone.color }}>
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-800">{zone.name}</p>
          <p className="text-[10px] text-slate-400">
            {zone.rows.length} rows · {zone.seatsPerRow} seats per row · {capacity} seats
          </p>
        </div>
        <Badge tone="green">{availability.available} free</Badge>
        <button
          type="button"
          onClick={onDelete}
          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete ${zone.name}`}>
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="label mb-1 block">Zone name</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => onChange({ name: name.trim() || zone.name })}
            className="input"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label mb-1 block">Description</label>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => onChange({ description })}
            className="input"
          />
        </div>
        <div>
          <label className="label mb-1 block">Price (THB)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              ฿
            </span>
            <input
              type="number"
              min={0}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              onBlur={() => onChange({ priceSatang: Math.max(0, Math.round(Number(price || 0) * 100)) })}
              className="input pl-6"
            />
          </div>
        </div>
        <div>
          <label className="label mb-1 block">Rows</label>
          <input
            type="number"
            min={1}
            max={10}
            value={rowCount}
            onChange={(event) => applyRows(event.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label mb-1 block">Seats / row</label>
          <input
            type="number"
            min={1}
            max={24}
            value={seatsPerRow}
            onChange={(event) => applySeats(event.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label mb-1 block">Zone colour</label>
          <input
            type="color"
            value={zone.color}
            onChange={(event) => onChange({ color: event.target.value })}
            className="h-[42px] w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
          />
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.1em] text-slate-400">
          <span>Seat map preview</span>
          <span>{availability.available} available · {availability.total - availability.available} sold</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {Array.from({ length: Math.min(capacity, 96) }, (_, i) => {
            const soldSeat = (i * 7) % 11 === 0 || (i * 13) % 17 === 0;
            return (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: soldSeat ? "#DDE3DF" : zone.color, opacity: soldSeat ? 1 : 0.65 }}
              />
            );
          })}
          {capacity > 96 ? <span className="ml-1 text-[9px] text-slate-400">+{capacity - 96}</span> : null}
        </div>
      </div>
    </div>
  );
}
