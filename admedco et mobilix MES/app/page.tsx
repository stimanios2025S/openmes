import Link from "next/link";
import { requireUser, homeFor } from "@/lib/auth";
import { redirect } from "next/navigation";

import OrderForm from "@/components/OrderForm";
import { Badge, Card, CardHeader, Stat, type Tone } from "@/components/ui";
import { CHASSIS_HANDOFF, DIVISIONS, DIVISION_ORDER, DIVISION_STAGES, formatQty } from "@/lib/domain";
import { loadChassisBuffer, loadPlantSummary, loadRecentMovements } from "@/lib/queries";

export const dynamic = "force-dynamic";

const MOVEMENT_TONES: Record<string, Tone> = {
  RECEIPT: "sky",
  CONSUME: "slate",
  TRANSFER_IN: "emerald",
  TRANSFER_OUT: "amber",
};

const MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: "Receipt",
  CONSUME: "Consumed",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
};

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role !== "Administrator") redirect(homeFor(user.role));
  const [summary, chassis, movements] = await Promise.all([
    loadPlantSummary(),
    loadChassisBuffer(),
    loadRecentMovements(8),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Plant overview</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Two factories, ten stations, one route. Every chair is cut, welded and coated at ADMEDCO,
          then cut, sewn, upholstered and assembled at MOBILIX.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Active work orders"
          value={summary.activeOrders}
          hint={`${summary.activeByDivision.ADMEDCO} at ADMEDCO · ${summary.activeByDivision.MOBILIX} at MOBILIX`}
        />
        <Stat
          label="Units in production"
          value={formatQty(summary.unitsInProgress)}
          accent="amber"
          hint="Chairs currently on the floor"
        />
        <Stat
          label="Chairs completed"
          value={formatQty(summary.unitsCompleted)}
          accent="emerald"
          hint={`${summary.completedOrders} work orders closed`}
        />
        <Stat
          label="Materials below reorder"
          value={summary.lowStock.length}
          accent={summary.lowStock.length > 0 ? "rose" : "slate"}
          hint={summary.lowStock.length > 0 ? "Needs a purchase order" : "Every store is healthy"}
        />
      </div>

      <Card>
        <CardHeader
          title="Inter-factory hand-off"
          subtitle="ADMEDCO releases the coated chassis; MOBILIX cannot assemble a chair without it."
        />
        <div className="flex flex-wrap items-center gap-3 px-5 py-5">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">ADMEDCO</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              POUDRAGE · {DIVISIONS.ADMEDCO.depot}
            </p>
          </div>

          <div className="flex flex-col items-center gap-0.5 px-2">
            <span className="font-mono text-[10px] text-slate-500">
              {CHASSIS_HANDOFF.materialCode}
            </span>
            <span className="text-lg text-slate-600">&#8594;</span>
            <span className="text-[10px] text-slate-500">1 per chair</span>
          </div>

          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">MOBILIX</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              ASSEMBLAGE · {CHASSIS_HANDOFF.toDepot}
            </p>
          </div>

          <div className="ms-auto rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Chassis buffer</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-100">
              {formatQty(chassis)}{" "}
              <span className="text-xs font-normal text-slate-500">pcs</span>
            </p>
            <p className="text-[11px] text-slate-500">
              {summary.awaitingHandoff} batch{summary.awaitingHandoff === 1 ? "" : "es"} awaiting
              coating
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="New work order"
            subtitle="The catalogue is closed to the two chairs below."
          />
          <OrderForm />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Recent stock movements"
              subtitle="Receipts, deductions and the chassis hand-off."
              action={
                <Link href="/inventory" className="text-xs text-slate-400 hover:text-slate-200">
                  Open inventory &#8594;
                </Link>
              }
            />
            {movements.length === 0 ? (
              <p className="px-5 py-5 text-sm text-slate-500">No stock has moved yet.</p>
            ) : (
              <ul className="divide-y divide-slate-900/80">
                {movements.map((movement) => (
                  <li
                    key={movement.id}
                    className="flex items-start justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs text-slate-200">
                        <span className="font-mono text-slate-300">{movement.materialCode}</span> ·{" "}
                        {movement.reference}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {MOVEMENT_LABELS[movement.type] ?? movement.type} · {movement.depot}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums text-slate-300">
                        {movement.type === "RECEIPT" || movement.type === "TRANSFER_IN" ? "+" : "−"}
                        {formatQty(movement.quantity)} {movement.unit}
                      </span>
                      <Badge tone={MOVEMENT_TONES[movement.type] ?? "slate"}>
                        {movement.type === "TRANSFER_IN" ? "handoff" : movement.type.toLowerCase()}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Below reorder point"
              subtitle="Materials a planner should act on."
            />
            {summary.lowStock.length === 0 ? (
              <p className="px-5 py-5 text-sm text-slate-500">
                Every store is above its reorder point.
              </p>
            ) : (
              <ul className="divide-y divide-slate-900/80">
                {summary.lowStock.map((material) => (
                  <li
                    key={material.code}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div>
                      <p className="text-xs text-slate-200">
                        <span className="font-mono">{material.code}</span> · {material.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{material.division}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-amber-300">
                      {formatQty(material.onHand)} {material.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {DIVISION_ORDER.map((code) => {
          const factory = DIVISIONS[code];
          return (
            <Link
              key={code}
              href={`/portal/${code.toLowerCase()}`}
              className="group rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 transition hover:border-slate-700"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${factory.accent.dot}`} />
                  <span className="text-sm font-semibold text-slate-100">{factory.name}</span>
                </span>
                <span className="text-xs text-slate-500 group-hover:text-slate-300">
                  {summary.activeByDivision[code]} batches &#8594;
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{factory.title}</p>
              <ul className="mt-3 flex flex-wrap gap-1">
                {DIVISION_STAGES[code].map((stage) => (
                  <li
                    key={stage.code}
                    className="rounded border border-slate-700/70 bg-slate-950/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
                  >
                    {stage.code}
                  </li>
                ))}
              </ul>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

