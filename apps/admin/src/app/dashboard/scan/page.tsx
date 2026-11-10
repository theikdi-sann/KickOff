"use client";

import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Clipboard,
  Clock3,
  DoorOpen,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, SectionTitle } from "@/components/ui";
import { useGates } from "@/lib/queries/gates";
import {
  useOfflineQueue,
  useScan,
  useScanDemo,
  useScanEvents,
  useScanStats,
  useUndoScan,
} from "@/lib/queries/scan";
import type { ScanOutcome } from "@/lib/scan-api";
import {
  formatMatchDate,
  formatMatchTime,
  formatTHB,
  type ScanResultCode,
  type TicketDto,
} from "@xclub/shared";

const GATE_STORAGE_KEY = "xclub.gate.v1";
const UNDO_WINDOW_MS = 60_000;

type DisplayCode = ScanResultCode | "queued" | "error";

interface DisplayResult {
  ok: boolean;
  code: DisplayCode;
  title: string;
  message: string;
  ticket?: TicketDto;
  scanEventId?: string;
  gateId: string;
}

function displayFromOutcome(outcome: ScanOutcome, gateId: string): DisplayResult {
  return {
    ok: outcome.code === "valid" ? true : outcome.ok,
    code: outcome.code,
    title: outcome.title,
    message: outcome.message,
    ticket: "ticket" in outcome ? outcome.ticket : undefined,
    scanEventId: "scanEventId" in outcome ? outcome.scanEventId : undefined,
    gateId,
  };
}

const RESULT_LABEL: Record<DisplayCode, string> = {
  valid: "Valid pass",
  used: "Already scanned",
  invalid: "Rejected",
  wrong_match: "Wrong fixture",
  queued: "Queued offline",
  error: "Scan failed",
};

function toneFor(code: DisplayCode): "green" | "gold" | "red" {
  if (code === "valid") return "green";
  if (code === "used" || code === "queued") return "gold";
  return "red";
}

export default function ScanPage() {
  const queryClient = useQueryClient();
  const { data: gates, isLoading: gatesLoading } = useGates();
  const [gateId, setGateId] = useState<string>(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem(GATE_STORAGE_KEY) ?? ""),
  );
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [undoDeadline, setUndoDeadline] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  const activeGates = useMemo(() => (gates ?? []).filter((gate) => gate.active), [gates]);
  const selectedGate =
    (gates ?? []).find((gate) => gate.id === gateId) ?? activeGates[0] ?? null;

  const scan = useScan(selectedGate?.id);
  const undo = useUndoScan(selectedGate?.id);
  const demo = useScanDemo(selectedGate?.id);
  const events = useScanEvents({ gateId: selectedGate?.id, limit: 6 });
  const stats = useScanStats();
  const queue = useOfflineQueue();

  useEffect(() => {
    if (!undoDeadline) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [undoDeadline]);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => undefined);
    };
  }, []);

  const undoRemaining = undoDeadline
    ? Math.max(0, Math.ceil((undoDeadline - nowTick) / 1000))
    : 0;

  const stopCamera = () => {
    const current = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (current) {
      current
        .stop()
        .then(() => current.clear())
        .catch(() => undefined);
    }
  };

  const chooseGate = (id: string) => {
    setGateId(id);
    setResult(null);
    setNotice(null);
    setUndoDeadline(null);
    window.localStorage.setItem(GATE_STORAGE_KEY, id);
  };

  const handleCode = async (raw: string) => {
    if (!raw.trim() || !selectedGate) return;
    stopCamera();
    setManual("");
    setCameraError(null);
    setNotice(null);

    try {
      const outcome = await scan.mutateAsync({ qr: raw });
      const display = displayFromOutcome(outcome, selectedGate.id);
      setResult(display);
      queue.refresh();
      setSessionCount((count) => count + 1);
      setNowTick(Date.now());
      setUndoDeadline(
        display.code === "valid" && display.scanEventId ? Date.now() + UNDO_WINDOW_MS : null,
      );
    } catch (error) {
      setResult({
        ok: false,
        code: "error",
        title: "Scan failed",
        message: error instanceof Error ? error.message : "The gate could not reach the server.",
        gateId: selectedGate.id,
      });
      setUndoDeadline(null);
    }
  };

  const handleUndo = async () => {
    if (!result?.scanEventId) return;
    setNotice(null);
    try {
      await undo.mutateAsync(result.scanEventId);
      setResult(null);
      setUndoDeadline(null);
      setNotice("Scan undone. The pass is valid again.");
      void queryClient.invalidateQueries({ queryKey: ["scan-events"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not undo the scan.");
    }
  };

  const syncQueue = async () => {
    setNotice(null);
    try {
      const report = await queue.sync();
      void queryClient.invalidateQueries({ queryKey: ["scan-events"] });
      void queryClient.invalidateQueries({ queryKey: ["scan-stats"] });
      setNotice(
        report.synced > 0
          ? `Synced ${report.synced} queued scan${report.synced === 1 ? "" : "s"}.`
          : report.stopped
            ? "Still offline — queued scans will retry when the connection returns."
            : "Queue is empty.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not sync the queue.");
    }
  };

  const toggleCamera = async () => {
    if (starting) return;
    if (scanning) {
      stopCamera();
      return;
    }

    setStarting(true);
    setCameraError(null);
    setResult(null);
    setScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("xclub-gate-scanner", { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
        (decoded) => {
          void handleCode(decoded);
        },
        () => undefined,
      );
    } catch (error) {
      setScanning(false);
      const message = error instanceof Error ? error.message : "Camera could not be started.";
      setCameraError(
        message.includes("Permission") || message.includes("NotAllowed")
          ? "Camera permission was denied. Allow camera access or paste the pass payload manually."
          : "No camera available in this browser. Use the manual entry or the demo pass below.",
      );
    } finally {
      setStarting(false);
    }
  };

  const demoPayload = demo.data?.payload ?? "";

  return (
    <div>
      <SectionTitle
        eyebrow="Gate operations"
        title="Gate validation"
        description="Scan a signed supporter pass or paste the payload. Every attempt is audited against this gate."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {selectedGate ? (
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
                <DoorOpen size={14} className="text-slate-400" />
                <select
                  value={selectedGate.id}
                  onChange={(event) => chooseGate(event.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-700 outline-none">
                  {(gates ?? []).map((gate) => (
                    <option key={gate.id} value={gate.id}>
                      {gate.name} ({gate.id})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Badge tone={queue.count > 0 ? "gold" : "green"}>
              {queue.count > 0 ? <WifiOff size={11} /> : <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              {queue.count > 0 ? `${queue.count} queued` : "Online"}
            </Badge>
            <Badge tone="muted">{sessionCount} scans this session</Badge>
          </div>
        }
      />

      {gatesLoading ? (
        <div className="panel flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading gates…
        </div>
      ) : !selectedGate ? (
        <div className="panel p-8 text-center text-sm text-slate-500">
          No active gate is configured. Add one on the Gates page first.
        </div>
      ) : (
        <>
          {!selectedGate.matchId ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              {selectedGate.name} has no fixture assigned. Scans will be rejected until an admin
              assigns one on the Gates page.
            </div>
          ) : (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <ShieldCheck size={15} className="text-pitch" />
              Admitting <span className="font-semibold text-slate-800">{selectedGate.matchLabel}</span>
              {selectedGate.kickoffAt ? (
                <span className="text-slate-400">
                  · {formatMatchDate(selectedGate.kickoffAt)} {formatMatchTime(selectedGate.kickoffAt)}
                </span>
              ) : null}
              <span className="text-slate-400">· window opens 2h before and closes 2h after kick-off</span>
            </div>
          )}

          {notice ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
              {notice}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <div className="space-y-4">
              <div className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <p className="label text-pitch">Live scanner</p>
                    <h2 className="display mt-0.5 text-2xl text-slate-900">Camera validation</h2>
                  </div>
                  <button
                    type="button"
                    onClick={toggleCamera}
                    disabled={starting}
                    className={scanning ? "btn-ghost" : "btn-primary"}>
                    {starting ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : scanning ? (
                      <CameraOff size={15} />
                    ) : (
                      <Camera size={15} />
                    )}
                    {starting ? "Starting…" : scanning ? "Stop camera" : "Start camera"}
                  </button>
                </div>

                <div className="p-5">
                  <div className="relative overflow-hidden rounded-2xl bg-night">
                    <div
                      id="xclub-gate-scanner"
                      className="mx-auto flex min-h-[300px] w-full items-center justify-center [&_video]:w-full [&_video]:object-cover"
                    />
                    {!scanning ? (
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                        <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/15 bg-white/[0.06] text-gold">
                          <ScanLine size={30} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Camera is off</p>
                          <p className="mt-1 text-[11px] text-emerald-50/40">
                            Start the camera to scan a supporter pass
                          </p>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-emerald-50/30">
                          <ShieldCheck size={11} />
                          HMAC-signed · audited
                        </div>
                      </div>
                    ) : null}
                    {scanning ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="relative h-56 w-56 rounded-3xl border-2 border-gold/70">
                          <span className="absolute -left-1 -top-1 h-6 w-6 rounded-tl-xl border-l-2 border-t-2 border-gold" />
                          <span className="absolute -right-1 -top-1 h-6 w-6 rounded-tr-xl border-r-2 border-t-2 border-gold" />
                          <span className="absolute -bottom-1 -left-1 h-6 w-6 rounded-bl-xl border-b-2 border-l-2 border-gold" />
                          <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-br-xl border-b-2 border-r-2 border-gold" />
                          <span className="absolute inset-x-4 top-1/2 h-px animate-pulse bg-gold/70" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {cameraError ? (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
                      <CameraOff size={14} className="mt-0.5 shrink-0" />
                      {cameraError}
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <label className="label mb-1.5 block">Manual pass payload</label>
                    <textarea
                      value={manual}
                      onChange={(event) => setManual(event.target.value)}
                      placeholder="Paste an XCLUB-V2: payload here…"
                      className="input min-h-[80px] resize-y font-mono text-[10px] leading-5"
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setManual(demoPayload)}
                          disabled={!demoPayload}
                          className="btn-ghost px-3 py-2 text-[11px] disabled:opacity-50">
                          <Clipboard size={13} />
                          Use demo pass
                        </button>
                        {queue.count > 0 ? (
                          <button
                            type="button"
                            onClick={syncQueue}
                            disabled={queue.syncing}
                            className="btn-ghost px-3 py-2 text-[11px]">
                            <RefreshCw size={13} className={queue.syncing ? "animate-spin" : ""} />
                            Sync now
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCode(manual)}
                        disabled={!manual.trim() || scan.isPending}
                        className="btn-primary">
                        {scan.isPending ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
                        Validate code
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="label text-pitch">Recent entries</p>
                    <h2 className="display mt-0.5 text-2xl text-slate-900">Scanned passes</h2>
                  </div>
                  <Badge tone="muted">{stats.data?.total ?? 0} total</Badge>
                </div>
                <div className="mt-3 divide-y divide-slate-100">
                  {events.isLoading ? (
                    <div className="flex items-center gap-2 py-6 text-xs text-slate-500">
                      <Loader2 size={13} className="animate-spin" /> Loading gate log…
                    </div>
                  ) : (events.data ?? []).length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">
                      No scans recorded at this gate yet.
                    </p>
                  ) : (
                    (events.data ?? []).map((event) => (
                      <div key={event.id} className="flex items-center gap-3 py-3">
                        <div
                          className={`grid h-8 w-8 place-items-center rounded-lg ${
                            event.result === "valid"
                              ? "bg-emerald-50 text-pitch"
                              : event.result === "used"
                                ? "bg-amber-50 text-amber-600"
                                : "bg-red-50 text-red-600"
                          }`}>
                          {event.result === "valid" ? (
                            <CheckCircle2 size={14} />
                          ) : event.result === "used" ? (
                            <Clock3 size={14} />
                          ) : (
                            <XCircle size={14} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {event.holder}
                            {event.seatLabel ? ` · ${event.zoneName} ${event.seatLabel}` : ""}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {event.matchLabel} · {formatMatchTime(event.createdAt)}
                            {event.undoneAt ? " · undone" : ""}
                          </p>
                        </div>
                        <Badge tone={event.result === "valid" ? "green" : event.result === "used" ? "gold" : "red"}>
                          {RESULT_LABEL[event.result]}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div
                className={`rounded-2xl border p-5 transition ${
                  result
                    ? result.code === "valid"
                      ? "border-emerald-200 bg-emerald-50"
                      : result.code === "used" || result.code === "queued"
                        ? "border-amber-200 bg-amber-50"
                        : "border-red-200 bg-red-50"
                    : "border-slate-200 bg-white"
                }`}>
                {!result ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                      <ScanLine size={26} />
                    </div>
                    <h2 className="display mt-4 text-2xl text-slate-900">Awaiting a pass</h2>
                    <p className="mt-1 max-w-[240px] text-xs leading-5 text-slate-500">
                      Start the camera or paste a pass payload. The result will appear here.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start gap-3">
                      <div
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white ${
                          result.code === "valid"
                            ? "bg-emerald-600"
                            : result.code === "used" || result.code === "queued"
                              ? "bg-amber-500"
                              : "bg-red-600"
                        }`}>
                        {result.code === "valid" ? (
                          <CheckCircle2 size={22} />
                        ) : result.code === "used" || result.code === "queued" ? (
                          <Clock3 size={22} />
                        ) : (
                          <XCircle size={22} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[9px] font-bold uppercase tracking-[0.14em] ${
                            result.code === "valid"
                              ? "text-emerald-700"
                              : result.code === "used" || result.code === "queued"
                                ? "text-amber-700"
                                : "text-red-700"
                          }`}>
                          {RESULT_LABEL[result.code]}
                        </p>
                        <h2 className="display mt-0.5 text-2xl leading-6 text-slate-900">{result.title}</h2>
                        <p className="mt-1.5 text-xs leading-5 text-slate-600">{result.message}</p>
                      </div>
                    </div>

                    {result.ticket ? (
                      <div className="mt-4 rounded-xl border border-black/5 bg-white/70 p-3.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                              {result.ticket.matchLabel}
                            </p>
                            <p className="mt-1 text-sm font-bold text-slate-900">{result.ticket.holder}</p>
                          </div>
                          <Badge tone={toneFor(result.code)}>{result.ticket.status}</Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                          <TicketInfo label="Stand" value={result.ticket.zoneName} />
                          <TicketInfo label="Row" value={result.ticket.row} />
                          <TicketInfo label="Seat" value={String(result.ticket.number)} />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                          <span>
                            {formatMatchDate(result.ticket.kickoffAt)} · {formatMatchTime(result.ticket.kickoffAt)}
                          </span>
                          <span>{formatTHB(result.ticket.priceSatang)}</span>
                        </div>
                      </div>
                    ) : null}

                    {result.code === "valid" && result.scanEventId && undoRemaining > 0 ? (
                      <button
                        type="button"
                        onClick={handleUndo}
                        disabled={undo.isPending}
                        className="btn-ghost mt-4 w-full justify-center">
                        {undo.isPending ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                        Undo scan ({undoRemaining}s)
                      </button>
                    ) : null}

                    <button type="button" onClick={() => setResult(null)} className="btn-primary mt-2 w-full">
                      <ScanLine size={14} />
                      Scan next pass
                    </button>
                  </div>
                )}
              </div>

              <div className="panel overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="label text-pitch">Test pass</p>
                  <h2 className="display mt-0.5 text-2xl text-slate-900">Scan a sample QR</h2>
                </div>
                {demo.isLoading ? (
                  <div className="flex items-center justify-center gap-2 p-6 text-xs text-slate-500">
                    <Loader2 size={13} className="animate-spin" /> Preparing a valid pass…
                  </div>
                ) : demo.error ? (
                  <div className="p-5 text-xs text-slate-500">
                    {demo.error instanceof Error ? demo.error.message : "No demo pass available."}
                  </div>
                ) : demo.data ? (
                  <div className="p-5">
                    <div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-4">
                      <QRCodeSVG value={demo.data.payload} size={164} level="M" />
                    </div>
                    <div className="mt-4 rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-800">
                        {demo.data.ticket?.holder ?? "XClub fan"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {demo.data.ticket?.matchLabel} · {demo.data.ticket?.zoneName}{" "}
                        {demo.data.ticket?.seatLabel}
                      </p>
                      <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-slate-400">
                        Real signed pass · scanning admits this ticket, undo within 60s to restore it
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCode(demo.data!.payload)}
                      disabled={scan.isPending}
                      className="btn-gold mt-3 w-full">
                      <ShieldCheck size={14} />
                      Validate demo pass now
                    </button>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No valid ticket is available for this fixture.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Validation rules</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      Passes are HMAC-signed and valid once. The gate admits only its assigned
                      fixture, from 2h before to 2h after kick-off. A second scan returns “Already
                      scanned”; an accepted scan can be undone for 60 seconds.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TicketInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-800">{value}</p>
    </div>
  );
}
