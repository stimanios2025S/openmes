"use client";

import { useActionState } from "react";

import { changePassword } from "@/lib/account-actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

const LABEL_CLASS = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400";

/**
 * Self-service password change. Rule set lives on the server
 * (`lib/account-actions.ts`); this form only mirrors the shape for good UX.
 */
export default function AccountForm() {
  const [state, formAction, pending] = useActionState(changePassword, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5 px-5 py-5">
      <div>
        <label htmlFor="currentPassword" className={LABEL_CLASS}>
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={FIELD_CLASS}
        />
        {state.errors.currentPassword ? (
          <p className="mt-1.5 text-xs text-rose-300">{state.errors.currentPassword}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="newPassword" className={LABEL_CLASS}>
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            className={FIELD_CLASS}
          />
          {state.errors.newPassword ? (
            <p className="mt-1.5 text-xs text-rose-300">{state.errors.newPassword}</p>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-600">At least 12 characters.</p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className={LABEL_CLASS}>
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className={FIELD_CLASS}
          />
          {state.errors.confirmPassword ? (
            <p className="mt-1.5 text-xs text-rose-300">{state.errors.confirmPassword}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          {pending ? "Saving…" : "Change password"}
        </button>
        <p className="text-[11px] text-slate-500">
          Changing your password signs out every other device.
        </p>
      </div>

      {state.status !== "idle" && state.message ? (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs leading-snug ${
            state.status === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
