import type { DivisionCode } from "@/lib/domain";
import { DIVISIONS, DIVISION_STAGES } from "@/lib/domain";
import { loadBoardOrders } from "@/lib/queries";

import KanbanBoard from "./KanbanBoard";
import { Card } from "./ui";

/**
 * One factory's shop-floor board. Both division pages render this, so the two
 * boards cannot drift apart.
 */
export default async function BoardPage({ division }: { division: DivisionCode }) {
  const factory = DIVISIONS[division];
  const stages = DIVISION_STAGES[division];
  const orders = await loadBoardOrders(division);

  const units = orders.reduce((total, order) => total + order.quantity, 0);
  const busiest = stages
    .map((stage) => ({
      stage,
      count: orders.filter((order) => order.currentStage === stage.code).length,
    }))
    .sort((a, b) => b.count - a.count)[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${factory.accent.text}`}>
            {factory.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-100">{factory.title}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {stages.length} stations · drawing from <span className="font-mono">{factory.depot}</span>{" "}
            · labour {factory.labourRate} DH/h
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Batches here</p>
            <p className="text-xl font-semibold tabular-nums text-slate-100">{orders.length}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Units</p>
            <p className="text-xl font-semibold tabular-nums text-slate-100">{units}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Busiest station</p>
            <p className="font-mono text-xl font-semibold text-slate-100">
              {busiest && busiest.count > 0 ? busiest.stage.code : "—"}
            </p>
          </div>
        </div>
      </header>

      {orders.length === 0 ? (
        <Card className="px-5 py-6">
          <p className="text-sm text-slate-400">
            No batch is standing at {factory.name} right now. Create a work order on the dashboard —
            it enters the line at COUPE and reaches this factory{" "}
            {division === "MOBILIX" ? "after ADMEDCO completes POUDRAGE." : "immediately."}
          </p>
        </Card>
      ) : null}

      <KanbanBoard division={division} orders={orders} />
    </div>
  );
}
