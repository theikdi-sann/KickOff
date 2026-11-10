"use client";

import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function MfaChallengePage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.currentLevel === "aal2") {
        router.replace("/dashboard");
        return;
      }

      const { data, error: factorError } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (factorError) {
        setError(factorError.message);
        setLoading(false);
        return;
      }

      const totp = data.totp.find((factor) => factor.status === "verified");
      if (!totp) {
        router.replace("/dashboard");
        return;
      }
      setFactorId(totp.id);
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [router]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId) return;
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed.");
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-app px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <Badge tone="gold">Staff access</Badge>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-pitch">
            <ShieldCheck size={22} />
          </div>
          <h1 className="display mt-5 text-4xl leading-none text-slate-900">TWO-FACTOR CHECK</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Enter the 6-digit code from your authenticator app to finish signing in.
          </p>

          <form onSubmit={handleVerify} className="mt-6 space-y-4">
            <div>
              <label className="label mb-1.5 block" htmlFor="code">
                Authentication code
              </label>
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-600/10">
                <KeyRound size={16} className="text-slate-400" />
                <input
                  id="code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="h-12 flex-1 bg-transparent text-sm tracking-[0.3em] text-slate-900 outline-none placeholder:tracking-normal placeholder:text-slate-400"
                />
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || code.length !== 6 || !factorId}
              className="btn-primary h-12 w-full disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? "Verifying…" : "Verify and continue"}
            </button>
          </form>

          <button
            type="button"
            onClick={async () => {
              await createClient().auth.signOut();
              router.replace("/login");
            }}
            className="mt-4 w-full text-center text-xs font-medium text-slate-500 hover:text-slate-700">
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
