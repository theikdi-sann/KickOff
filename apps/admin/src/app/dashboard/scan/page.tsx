"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Clipboard,
  Clock3,
  QrCode,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge, SectionTitle } from "@/components/ui";
import { useAdmin } from "@/lib/store";
import { formatMatchDate, formatMatchTime, formatTHB, type ScanResult } from "@xclub/shared";

export default function ScanPage() {
  const { validateTicket, tickets, usedTicketIds } = useAdmin();
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  const demoPass = tickets.find((ticket) => ticket.status === "valid") ?? tickets[0];
  const recent = tickets
    .filter((ticket) => ticket.status === "used")
    .sort((a, b) => new Date(b.usedAt ?? 0).getTime() - new Date(a.usedAt ?? 0).getTime())
    .slice(0, 5);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => undefined);
    };
  }, []);

  const handleCode = (raw: string) => {
    if (!raw.trim()) return;
    const next = validateTicket(raw);
    setResult(next);
    setSessionCount((count) => count + 1);
    setScanning(false);
    const current = scannerRef.current;
    scannerRef.current = null;
    if (current) {
      current
        .stop()
        .then(() => current.clear())
        .catch(() => undefined);
    }
    setManual("");
  };

  const toggleCamera = async () => {
    if (scanning) {
      await scannerRef.current?.stop().catch(() => undefined);
      scannerRef.current?.clear();
      scannerRef.current = null;
      setScanning(false);
      return;
    }

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
        (decoded) => handleCode(decoded),
        () => undefined,
      );
    } catch (error) {
      setScanning(false);
      const message = error instanceof Error ? error.message : "Camera could not be started.";
      setCameraError(
        message.includes("Permission") || message.includes("NotAllowed")
          ? "Camera permission was denied. Allow camera access or paste the pass code manually."
          : "No camera available in this browser. Use the manual entry or test pass below.",
      );
    }
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Gate operations"
        title="Gate validation"
        description="Scan a digital pass QR or paste the payload to mark a ticket as used."
        action={
          <div className="flex items-center gap-2">
            <Badge tone="green">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Gate 2 online
            </Badge>
            <Badge tone="muted">{sessionCount} scans this session</Badge>
          </div>
        }
      />

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
                className={scanning ? "btn-ghost" : "btn-primary"}>
                {scanning ? <CameraOff size={15} /> : <Camera size={15} />}
                {scanning ? "Stop camera" : "Start camera"}
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
                      Secure mock validation
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
                  placeholder="Paste an XCLUB-MOCK-V1: payload here…"
                  className="input min-h-[80px] resize-y font-mono text-[10px] leading-5"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => setManual(demoPass?.qrPayload ?? "")} className="btn-ghost px-3 py-2 text-[11px]">
                    <Clipboard size={13} />
                    Use demo pass
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCode(manual)}
                    disabled={!manual.trim()}
                    className="btn-primary">
                    <QrCode size={14} />
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
              <Badge tone="muted">{usedTicketIds.length} total</Badge>
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {recent.map((ticket) => (
                <div key={ticket.id} className="flex items-center gap-3 py-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-pitch">
                    <CheckCircle2 size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {ticket.holder} · {ticket.zoneName} {ticket.seatLabel}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {ticket.matchLabel} · {ticket.usedAt ? formatMatchTime(ticket.usedAt) : "—"}
                    </p>
                  </div>
                  <Badge tone="green">Admitted</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div
            className={`rounded-2xl border p-5 transition ${
              result
                ? result.ok
                  ? "border-emerald-200 bg-emerald-50"
                  : result.code === "used"
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
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                      result.ok
                        ? "bg-emerald-600 text-white"
                        : result.code === "used"
                          ? "bg-amber-500 text-white"
                          : "bg-red-600 text-white"
                    }`}>
                    {result.ok ? (
                      <CheckCircle2 size={22} />
                    ) : result.code === "used" ? (
                      <Clock3 size={22} />
                    ) : (
                      <XCircle size={22} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[9px] font-bold uppercase tracking-[0.14em] ${
                        result.ok ? "text-emerald-700" : result.code === "used" ? "text-amber-700" : "text-red-700"
                      }`}>
                      {result.ok ? "Valid pass" : result.code === "used" ? "Already used" : "Rejected"}
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
                      <Badge tone={result.ok ? "green" : "muted"}>{result.ticket.status}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                      <TicketInfo label="Stand" value={result.ticket.zoneName} />
                      <TicketInfo label="Row" value={result.ticket.row} />
                      <TicketInfo label="Seat" value={String(result.ticket.number)} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                      <span>{formatMatchDate(result.ticket.kickoffAt)} · {formatMatchTime(result.ticket.kickoffAt)}</span>
                      <span>{formatTHB(result.ticket.priceSatang)}</span>
                    </div>
                  </div>
                ) : null}

                <button type="button" onClick={() => setResult(null)} className="btn-primary mt-4 w-full">
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
            {demoPass ? (
              <div className="p-5">
                <div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-4">
                  <QRCodeSVG value={demoPass.qrPayload} size={164} level="M" />
                </div>
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-800">{demoPass.holder}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {demoPass.matchLabel} · {demoPass.zoneName} {demoPass.seatLabel}
                  </p>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-slate-400">
                    Valid mock pass · scan to test entry
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setManual(demoPass.qrPayload);
                    handleCode(demoPass.qrPayload);
                  }}
                  className="btn-gold mt-3 w-full">
                  <ShieldCheck size={14} />
                  Validate demo pass now
                </button>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">No valid pass in the mock store.</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="text-xs font-semibold text-slate-800">Validation rules</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Each pass can be scanned once. The second scan returns “Already scanned”. Real
                  HMAC-signed tokens replace this mock payload in Phase C.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
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
