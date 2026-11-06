"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "green" | "gold" | "red" | "muted" | "blue" | "dark";

const tones: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  gold: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  muted: "bg-slate-100 text-slate-600 border-slate-200",
  blue: "bg-sky-50 text-sky-700 border-sky-200",
  dark: "bg-white/10 text-white border-white/15",
};

export function Badge({
  children,
  tone = "green",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-night/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl",
          wide ? "max-w-3xl" : "max-w-lg",
        )}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="display text-2xl leading-6 text-slate-900">{title}</h2>
            {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white/95 px-5 py-3 backdrop-blur">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="label mb-1 text-pitch">{eyebrow}</p> : null}
        <h1 className="display text-3xl leading-8 text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
