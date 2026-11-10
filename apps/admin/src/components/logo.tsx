import { cn } from "@/lib/utils";

export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold text-lg font-bold text-night shadow-sm">
        K
      </div>
      {!compact ? (
        <div>
          <div
            className={cn(
              "display text-[21px] font-bold leading-5 tracking-[0.2em]",
              dark ? "text-white" : "text-slate-900",
            )}
          >
            KICKOFF
          </div>
          <div
            className={cn(
              "mt-0.5 text-[8px] font-semibold uppercase tracking-[0.18em]",
              dark ? "text-emerald-100/50" : "text-slate-500",
            )}
          >
            Matchday operations
          </div>
        </div>
      ) : null}
    </div>
  );
}
