"use client";

import { useActionState, useEffect, useRef } from "react";

import { createWorkOrder } from "@/lib/actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { PRODUCTS } from "@/lib/domain";

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

const LABEL_CLASS = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400";

/**
 * Order creation for the two catalogue chairs. The form posts a server action;
 * field errors come back from the backend rule set, not from the browser.
 */
export default function OrderForm() {
  const [state, formAction, pending] = useActionState(createWorkOrder, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form once the order is accepted, so the next one starts blank.
  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5 px-5 py-5">
      <fieldset>
        <legend className={LABEL_CLASS}>Product</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PRODUCTS.map((product, index) => (
            <label key={product.code} className="cursor-pointer">
              <input
                type="radio"
                name="productCode"
                value={product.code}
                defaultChecked={index === 0}
                className="peer sr-only"
              />
              <div className="h-full rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition peer-checked:border-amber-500/60 peer-checked:bg-amber-500/5 peer-checked:ring-1 peer-checked:ring-amber-500/30 peer-focus-visible:ring-2 peer-focus-visible:ring-slate-400 hover:border-slate-700">
                <p className="text-sm font-semibold text-slate-100">{product.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">{product.code}</p>
                <p className="mt-1 text-xs text-slate-400">{product.tagline}</p>
                <ul className="mt-2 flex flex-wrap gap-1">
                  {product.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="rounded border border-slate-700/70 bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-slate-400"
                    >
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            </label>
          ))}
        </div>
        {state.errors.productCode ? (
          <p className="mt-2 text-xs text-rose-300">{state.errors.productCode}</p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="quantity" className={LABEL_CLASS}>
            Quantity
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={500}
            step={1}
            defaultValue={25}
            className={FIELD_CLASS}
          />
          {state.errors.quantity ? (
            <p className="mt-1.5 text-xs text-rose-300">{state.errors.quantity}</p>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-600">Whole chairs, 1 to 500.</p>
          )}
        </div>

        <div>
          <label htmlFor="dueDate" className={LABEL_CLASS}>
            Delivery deadline
          </label>
          <input id="dueDate" name="dueDate" type="date" className={FIELD_CLASS} />
          {state.errors.dueDate ? (
            <p className="mt-1.5 text-xs text-rose-300">{state.errors.dueDate}</p>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-600">Optional.</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="priority" className={LABEL_CLASS}>
          Priority
        </label>
        <select id="priority" name="priority" defaultValue="NORMAL" className={FIELD_CLASS}>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          {pending ? "Opening…" : "Create work order"}
        </button>
        <p className="text-[11px] text-slate-500">
          The order starts at COUPE and walks all ten stations.
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
