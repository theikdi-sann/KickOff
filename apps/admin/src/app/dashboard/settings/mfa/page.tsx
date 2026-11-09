"use client";

import { KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";

interface Enrollment {
  factorId: string;
  uri: string;
  secret: string;
}

export default function MfaSettingsPage() {
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshFactors = async () => {
    const { data, error: factorError } = await createClient().auth.mfa.listFactors();
    if (factorError) {
      setError(factorError.message);
      return;
    }
    const totp = data.totp.find((factor) => factor.status === "verified");
    setVerifiedFactorId(totp?.id ?? null);
  };

  useEffect(() => {
    // Async load: state is set in the promise callback, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshFactors();
  }, []);

  const startEnrollment = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `XClub Admin ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrollError) throw enrollError;
      setEnrollment({
        factorId: data.id,
        uri: data.totp.uri,
        secret: data.totp.secret,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start enrollment.");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollment.factorId,
      });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;

      setEnrollment(null);
      setCode("");
      setNotice("Two-factor authentication is now enabled for this account.");
      await refreshFactors();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify the code.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!verifiedFactorId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: unenrollError } = await createClient().auth.mfa.unenroll({
        factorId: verifiedFactorId,
      });
      if (unenrollError) throw unenrollError;
      setNotice("Two-factor authentication has been disabled.");
      await refreshFactors();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disable 2FA.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <p className="label mb-1 text-pitch">Account security</p>
        <h1 className="display text-4xl leading-none text-slate-900">TWO-FACTOR AUTHENTICATION</h1>
        <p className="mt-2 text-sm text-slate-500">
          Production admin accounts must use an authenticator app. Codes rotate every 30 seconds.
        </p>
      </header>

      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-pitch">
            {verifiedFactorId ? <ShieldCheck size={19} /> : <ShieldOff size={19} />}
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-900">
              {verifiedFactorId ? "Authenticator app is enabled" : "Authenticator app is not set up"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {verifiedFactorId
                ? "You will be asked for a code after entering your password."
                : "Add TOTP to protect refunds, gate overrides, and pricing changes."}
            </p>
          </div>
          {verifiedFactorId ? (
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-60">
              Disable
            </button>
          ) : enrollment ? null : (
            <button
              type="button"
              onClick={startEnrollment}
              disabled={busy}
              className="btn-primary h-9 px-3 text-xs disabled:opacity-60">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Set up
            </button>
          )}
        </div>
      </section>

      {enrollment ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Scan with your authenticator app</h2>
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <QRCodeSVG value={enrollment.uri} size={168} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500">Can&apos;t scan? Enter this key manually:</p>
              <code className="mt-2 block break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {enrollment.secret}
              </code>
              <form onSubmit={confirmEnrollment} className="mt-4 space-y-3">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm tracking-[0.3em] outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy || code.length !== 6}
                    className="btn-primary h-10 flex-1 text-xs disabled:opacity-60">
                    {busy ? "Verifying…" : "Verify and enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnrollment(null);
                      setCode("");
                    }}
                    className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-600">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
