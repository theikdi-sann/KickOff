"use client";

import { useState } from "react";
import { matchPhase, type MatchDto } from "@kickoff/shared";
import { Modal } from "@/components/ui";

export interface MatchResultInput {
  homeScore: number;
  awayScore: number;
}

interface MatchResultDialogProps {
  open: boolean;
  match: Pick<
    MatchDto,
    "id" | "opponent" | "kickoffAt" | "status" | "homeScore" | "awayScore"
  >;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (result: MatchResultInput) => Promise<void> | void;
}

/**
 * One score form for the matches list and the fixture page. Saving writes both
 * scores and `completed` in one database call (0059); the dialog only supplies
 * validated integers.
 */
export function MatchResultDialog({
  open,
  match,
  pending = false,
  onClose,
  onSubmit,
}: MatchResultDialogProps) {
  const [homeScore, setHomeScore] = useState(String(match.homeScore ?? 0));
  const [awayScore, setAwayScore] = useState(String(match.awayScore ?? 0));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const home = Number.parseInt(homeScore, 10);
    const away = Number.parseInt(awayScore, 10);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
      setError("Scores are whole numbers, 0 or more.");
      return;
    }
    setError(null);
    await onSubmit({ homeScore: home, awayScore: away });
  };

  const playing = matchPhase(match) === "live";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enter the result"
      description="One save writes both scores and closes the fixture."
      wide>
      <div className="space-y-4">
        {playing ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            This match has not reached full time. Continue only if it ended early.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-[11px] font-semibold text-slate-600">
            KickOff score
            <input
              type="number"
              min={0}
              step={1}
              value={homeScore}
              onChange={(event) => setHomeScore(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block text-[11px] font-semibold text-slate-600">
            {match.opponent} score
            <input
              type="number"
              min={0}
              step={1}
              value={awayScore}
              onChange={(event) => setAwayScore(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="btn-primary w-full">
          {pending ? "Saving…" : "Save result"}
        </button>
      </div>
    </Modal>
  );
}
