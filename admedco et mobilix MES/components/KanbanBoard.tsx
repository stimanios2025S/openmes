import {
  CHASSIS_HANDOFF,
  DIVISION_STAGES,
  DIVISIONS,
  formatDate,
  type DivisionCode,
} from "@/lib/domain";
import type { BoardOrder } from "@/lib/queries";

import CompleteStageButton from "./CompleteStageButton";
import { Badge, EmptyState, ProgressBar } from "./ui";

/**
 * One factory's workstation board: a column per stage, a card per batch
 * standing at that station.
 */
export default function KanbanBoard({
  division,
  orders,
}: {
  division: DivisionCode;
  orders: BoardOrder[];
}) {
  const factory = DIVISIONS[division];
  const stages = DIVISION_STAGES[division];

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const cards = orders.filter((order) => order.currentStage === stage.code);

        return (
          <div
            key={stage.code}
            className="flex w-[286px] shrink-0 flex-col rounded-2xl border border-slate-800/80 bg-slate-950/50"
          >
            <header className="border-b border-slate-800/80 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${factory.accent.dot}`} />
                  <span className="font-mono text-xs font-semibold tracking-wider text-slate-200">
                    {stage.code}
                  </span>
                </span>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                  {cards.length}
                </span>
              </div>
              <p className={`mt-1 text-xs font-medium ${factory.accent.text}`}>{stage.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{stage.description}</p>

              {stage.code === CHASSIS_HANDOFF.fromStage ? (
                <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[10px] leading-snug text-emerald-300">
                  Releases {CHASSIS_HANDOFF.materialCode} to {CHASSIS_HANDOFF.toDivision} ·{" "}
                  {CHASSIS_HANDOFF.toDepot}
                </p>
              ) : null}

              {stage.code === "ASSEMBLAGE" ? (
                <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[10px] leading-snug text-emerald-300">
                  Consumes 1 × {CHASSIS_HANDOFF.materialCode} from {DIVISIONS.MOBILIX.depot}
                </p>
              ) : null}
            </header>

            <div className="flex flex-1 flex-col gap-3 p-3">
              {cards.length === 0 ? (
                <EmptyState>No batch at this station</EmptyState>
              ) : (
                cards.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{order.number}</span>
                      {order.priority === "HIGH" ? <Badge tone="rose">High</Badge> : null}
                    </div>

                    <p className="mt-1.5 text-sm font-semibold text-slate-100">{order.productName}</p>
                    <p className="text-[11px] text-slate-500">
                      {order.productCode} · {order.quantity} pcs
                    </p>

                    <div className="mt-2.5">
                      <ProgressBar
                        value={order.completedSteps}
                        max={order.totalSteps}
                        barClass={factory.accent.bg}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        step {order.completedSteps + 1} of {order.totalSteps} · due{" "}
                        {formatDate(order.dueDate)}
                      </p>
                    </div>

                    <CompleteStageButton
                      workOrderId={order.id}
                      stage={stage.code}
                      accentBg={factory.accent.bg}
                      accentRing={factory.accent.ring}
                    />
                  </article>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
