"use client";

import { useState, useTransition } from "react";

import { completeStage } from "@/lib/actions";

/**
 * Closes the batch's current stage from the kanban card.
 *
 * On success the server action revalidates the boards, so the card leaves this
 * column and reappears in the next one — the movement itself is the feedback.
 * A refusal (a material shortfall) is printed under the button.
 */
export default function CompleteStageButton({
  workOrderId,
  stage,
  accentBg,
  accentRing,
}: {
  workOrderId: string;
  stage: string;
  accentBg: string;
  accentRing: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await completeStage(workOrderId);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 ${accentBg} ${accentRing}`}
      >
        {pending ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950" />
            Closing…
          </>
        ) : (
          <>
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M3 8.5 6.2 12 13 4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Close {stage}
          </>
        )}
      </button>

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-[11px] leading-snug text-rose-200"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
