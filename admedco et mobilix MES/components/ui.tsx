import type { ReactNode } from "react";

/**
 * Presentational primitives.
 *
 * Every tone is a literal class string: Tailwind cannot see interpolated class
 * names, so tones are looked up rather than built.
 */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-800/80 bg-slate-900/40 ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-100">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

const BADGE_TONES = {
  slate: "border-slate-600/40 bg-slate-500/10 text-slate-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  rose: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-300",
} as const;

export type Tone = keyof typeof BADGE_TONES;

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const STAT_ACCENTS = {
  slate: "text-slate-100",
  amber: "text-amber-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
} as const;

export function Stat({
  label,
  value,
  hint,
  accent = "slate",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: keyof typeof STAT_ACCENTS;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${STAT_ACCENTS[accent]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  barClass,
}: {
  value: number;
  max: number;
  barClass: string;
}) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-800 px-4 py-6 text-center text-xs text-slate-600">
      {children}
    </div>
  );
}
