"use client";

import { Globe, PauseCircle, PlayCircle, PlugZap, Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isValidClubSlug } from "@kickoff/shared";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  SectionTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from "@/components/ui";
import {
  usePlatformTenants,
  useProvisionTenant,
  useSetApplicationFeeBps,
  useSetTenantStatus,
  useStripeOnboard,
  type PlatformTenant,
} from "@/lib/queries/platform";
import { useSession } from "@/lib/use-session";

/**
 * The platform console (ADR-004 §3): the tenant *registry* and the three
 * cross-club controls — suspend/restore, the platform fee, provisioning —
 * plus the Stripe onboarding link. Row-level club data is deliberately absent:
 * a platform operator configures clubs, they do not read them.
 *
 * Every write here is a guarded RPC (0054) or the `stripe-onboard` Edge
 * function; this screen is the client boundary on top of the proxy's, and it
 * refuses a session without the platform claim before rendering anything.
 */

/** Where Stripe onboarding sends the club's owner back to. */
const ONBOARDING_COUNTRIES = [
  { code: "TH", label: "Thailand" },
  { code: "GB", label: "United Kingdom" },
  { code: "SG", label: "Singapore" },
  { code: "US", label: "United States" },
] as const;

/** The currencies a new club may be priced in (0040's three-letter check). */
const PROVISION_CURRENCIES = ["THB", "USD", "EUR", "GBP", "SGD"] as const;

/** The fee is basis points of the order — the database's own bounds (0040). */
const MIN_FEE_BPS = 0;
const MAX_FEE_BPS = 10000; // 100%

const EMPTY_FORM = { name: "", slug: "", currency: "THB" };

export default function PlatformPage() {
  const session = useSession();
  const { toast } = useToast();

  const registry = usePlatformTenants();
  const setStatus = useSetTenantStatus();
  const setFee = useSetApplicationFeeBps();
  const provision = useProvisionTenant();
  const onboard = useStripeOnboard();

  const [pendingSuspend, setPendingSuspend] = useState<PlatformTenant | null>(null);
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});
  const [countries, setCountries] = useState<Record<string, string>>({});
  const [form, setForm] = useState(EMPTY_FORM);

  // Stripe returns here on both exits (`return_url` / `refresh_url`): say
  // what happened instead of landing the operator on an unchanged page. The
  // parameter is consumed once and stripped, so a refresh stays quiet.
  const announcedReturn = useRef(false);
  useEffect(() => {
    if (announcedReturn.current) return;
    announcedReturn.current = true;

    const params = new URLSearchParams(window.location.search);
    const onboarding = params.get("onboarding");
    if (!onboarding) return;
    params.delete("onboarding");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );

    if (onboarding === "complete") {
      toast({
        title: "Returned from Stripe",
        description:
          "If the form was submitted, Stripe activates the account — this page records the account itself.",
        tone: "green",
      });
    } else {
      toast({
        title: "Stripe restarted the onboarding",
        description: "Open Onboard again — it resumes the same account.",
        tone: "amber",
      });
    }
  }, [toast]);

  if (session.status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Client boundary: the proxy already refuses this session, and a cached
  // page must not flash the cross-club console to a club account either.
  if (!session.isPlatform) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-pitch text-xl font-bold text-gold">
            K
          </div>
          <h1 className="display mt-5 text-3xl text-slate-900">Platform access required</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This console is for KickOff platform operators. Club accounts manage their own club.
          </p>
        </div>
      </div>
    );
  }

  const clubs = registry.data ?? [];

  const notifyError = (title: string, error: { message: string }) =>
    toast({ title, description: error.message, tone: "red" });

  const handleStatus = (club: PlatformTenant, status: "active" | "suspended") => {
    setPendingSuspend(null);
    setStatus.mutate(
      { tenantId: club.id, status },
      {
        onSuccess: () =>
          toast({
            title: status === "suspended" ? `${club.name} suspended` : `${club.name} restored`,
            description:
              status === "suspended"
                ? "The club keeps its data; its staff and fans lose access."
                : "The club's staff and fans have access again.",
            tone: "green",
          }),
        onError: (error) => notifyError("The status change failed", error),
      },
    );
  };

  const handleFee = (club: PlatformTenant) => {
    const draft = (feeDrafts[club.id] ?? String(club.application_fee_bps)).trim();
    const feeBps = Number(draft);
    // An empty or non-numeric draft is never a fee: `Number('')` is 0, and
    // an accidental zero rate would silently take nothing from every order.
    if (draft === "" || !Number.isInteger(feeBps) || feeBps < MIN_FEE_BPS || feeBps > MAX_FEE_BPS) {
      toast({
        title: "Fee out of range",
        description: `The platform fee must be between ${MIN_FEE_BPS} and ${MAX_FEE_BPS} basis points (0–100%).`,
        tone: "red",
      });
      return;
    }
    setFee.mutate(
      { tenantId: club.id, feeBps },
      {
        onSuccess: () => {
          setFeeDrafts((current) => {
            const next = { ...current };
            delete next[club.id];
            return next;
          });
          toast({ title: `${club.name} fee updated`, tone: "green" });
        },
        onError: (error) => notifyError("The fee change failed", error),
      },
    );
  };

  const handleOnboard = (club: PlatformTenant) => {
    const country = countries[club.id] ?? ONBOARDING_COUNTRIES[0].code;
    onboard.mutate(
      { tenantId: club.id, country },
      {
        // Same tab, not a popup: this callback runs after a network call,
        // where popup blockers silently swallow `window.open` — the link
        // would never open. The link's `return_url` brings the operator
        // straight back here.
        onSuccess: (result) => {
          window.location.assign(result.url);
        },
        onError: (error) => notifyError("Could not start onboarding", error),
      },
    );
  };

  const canProvision = form.name.trim().length > 0 && isValidClubSlug(form.slug);

  const handleProvision = (event: FormEvent) => {
    event.preventDefault();
    if (!canProvision) {
      toast({
        title: "Check the club details",
        description: "A name and a lowercase slug (a-z, 0-9, single hyphens) are required.",
        tone: "red",
      });
      return;
    }
    provision.mutate(
      { name: form.name.trim(), slug: form.slug, currency: form.currency },
      {
        onSuccess: () => {
          toast({ title: `${form.name.trim()} provisioned`, tone: "green" });
          setForm(EMPTY_FORM);
        },
        onError: (error) => notifyError("Provisioning failed", error),
      },
    );
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="KickOff platform"
        title="Platform"
        description="Every club on the deployment: its status, its platform fee and its Stripe account. Club data stays behind each club's own admin."
        action={
          <Badge tone="muted">
            <Globe size={11} /> {clubs.length} {clubs.length === 1 ? "club" : "clubs"}
          </Badge>
        }
      />

      <section className="panel overflow-hidden">
        {registry.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : registry.isError ? (
          <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            The registry could not be loaded: {(registry.error as Error).message}
          </div>
        ) : clubs.length === 0 ? (
          <EmptyState
            icon={<Globe size={20} />}
            title="No clubs yet"
            description="Provision the first club below."
          />
        ) : (
          <Table caption="The clubs on this deployment">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Club</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Platform fee</TableHeaderCell>
                <TableHeaderCell>Stripe</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clubs.map((club) => {
                const draft = (feeDrafts[club.id] ?? String(club.application_fee_bps)).trim();
                const feeChanged = draft !== String(club.application_fee_bps);
                const busy = setStatus.isPending || setFee.isPending || onboard.isPending;
                return (
                  <TableRow key={club.id}>
                    <TableCell>
                      <p className="text-sm font-semibold text-slate-900">{club.name}</p>
                      <p className="text-xs text-slate-500">{club.slug}</p>
                    </TableCell>
                    <TableCell>
                      <Badge tone={club.status === "active" ? "green" : "red"}>
                        {club.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={MIN_FEE_BPS}
                          max={MAX_FEE_BPS}
                          value={draft}
                          onChange={(event) =>
                            setFeeDrafts((current) => ({ ...current, [club.id]: event.target.value }))
                          }
                          aria-label={`Platform fee for ${club.name} in basis points`}
                          className="input w-24"
                        />
                        <span className="text-xs text-slate-500">bps</span>
                        <button
                          type="button"
                          onClick={() => handleFee(club)}
                          disabled={!feeChanged || setFee.isPending}
                          className="btn-ghost">
                          {setFee.isPending ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {club.stripe_account_id ? (
                        // What the column records: an account exists. Whether
                        // Stripe has *activated* it (the owner finished the
                        // form) is Stripe's state to read — see PLAN's notes.
                        <Badge tone="green">Account created</Badge>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={countries[club.id] ?? ONBOARDING_COUNTRIES[0].code}
                            onChange={(event) =>
                              setCountries((current) => ({ ...current, [club.id]: event.target.value }))
                            }
                            aria-label={`Onboarding country for ${club.name}`}
                            className="input w-28">
                            {ONBOARDING_COUNTRIES.map((country) => (
                              <option key={country.code} value={country.code}>
                                {country.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleOnboard(club)}
                            disabled={busy}
                            className="btn-primary">
                            <PlugZap size={13} /> {onboard.isPending ? "Working…" : "Onboard"}
                          </button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {club.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => setPendingSuspend(club)}
                          disabled={busy}
                          className="btn-danger">
                          <PauseCircle size={13} /> Suspend
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStatus(club, "active")}
                          disabled={busy}
                          className="btn-primary">
                          <PlayCircle size={13} /> {setStatus.isPending ? "Restoring…" : "Restore"}
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="panel p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-pitch">
            <Plus size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Provision a club</h2>
            <p className="mt-1 text-xs text-slate-500">
              Creates the club row and its staff vocabulary. The slug is permanent — it is what the
              white-label app binds to at sign-in.
            </p>
          </div>
        </div>

        <form onSubmit={handleProvision} className="mt-5 grid gap-4 sm:grid-cols-4">
          <label className="block">
            <span className="label mb-1.5 block">Club name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="South London FC"
              className="input"
            />
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Slug</span>
            <input
              value={form.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="south-london-fc"
              className="input"
            />
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Currency</span>
            <select
              value={form.currency}
              onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}
              className="input">
              {PROVISION_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={!canProvision || provision.isPending} className="btn-primary w-full">
              {provision.isPending ? "Provisioning…" : "Provision"}
            </button>
          </div>
        </form>
      </section>

      <ConfirmDialog
        open={pendingSuspend !== null}
        title={`Suspend ${pendingSuspend?.name ?? ""}?`}
        description="The club keeps every row it has; its staff and fans lose access until it is restored. The change is audited."
        confirmLabel="Suspend club"
        busy={setStatus.isPending}
        onConfirm={() => {
          if (pendingSuspend) handleStatus(pendingSuspend, "suspended");
        }}
        onClose={() => setPendingSuspend(null)}
      />
    </div>
  );
}
