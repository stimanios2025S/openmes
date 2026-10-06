import Link from "next/link";
import { requireUser } from "@/lib/auth";

import StockTable from "@/components/StockTable";
import { Badge, Card, CardHeader, type Tone } from "@/components/ui";
import { DIVISIONS, formatQty, type DivisionCode } from "@/lib/domain";
import { loadRecentMovements, loadStock } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory — ADMEDCO & MOBILIX",
};

const MOVEMENT_TONES: Record<string, Tone> = {
  RECEIPT: "sky",
  CONSUME: "slate",
  TRANSFER_IN: "emerald",
  TRANSFER_OUT: "amber",
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ division?: string }> }) {
  const user = await requireUser();
  const requested = (await searchParams).division?.toUpperCase();
  const division: DivisionCode = user.role === "Administrator"
    ? requested === "MOBILIX" ? "MOBILIX" : "ADMEDCO"
    : user.role === "MOBILIX_Operator" ? "MOBILIX" : "ADMEDCO";
  const [stock, movements] = await Promise.all([loadStock(division), loadRecentMovements(25, division)]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Inventory</h1>
        <p className="mt-1 text-sm text-slate-400">
          {division} only · balances move as stages are closed.
        </p>
      </header>

      {[division].map((code) => {
        const factory = DIVISIONS[code];
        const rows = stock;
        const alerts = rows.filter((row) => row.status !== "OK").length;

        return (
          <Card key={code}>
            <CardHeader
              title={`${factory.name} — ${factory.title}`}
              subtitle={`Store ${factory.depot} · ${rows.length} items`}
              action={
                <div className="flex items-center gap-2">
                  {alerts > 0 ? <Badge tone="amber">{alerts} need attention</Badge> : null}
                  <Link
                    href={`/portal/${code.toLowerCase()}`}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    Open board &#8594;
                  </Link>
                </div>
              }
            />
            <StockTable rows={rows} />
          </Card>
        );
      })}

      <Card>
        <CardHeader
          title="Stock ledger"
          subtitle="Newest first. Every deduction names the work order and the station."
        />
        {movements.length === 0 ? (
          <p className="px-5 py-5 text-sm text-slate-500">No stock has moved yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800/80 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5 font-medium">Type</th>
                  <th className="px-5 py-2.5 font-medium">Material</th>
                  <th className="px-5 py-2.5 font-medium">Depot</th>
                  <th className="px-5 py-2.5 font-medium">Reference</th>
                  <th className="px-5 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-5 py-2.5 text-right font-medium">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-b border-slate-900/80 last:border-0">
                    <td className="px-5 py-2.5">
                      <Badge tone={MOVEMENT_TONES[movement.type] ?? "slate"}>
                        {movement.type.replace("_", " ").toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="font-mono text-xs text-slate-300">
                        {movement.materialCode}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">{movement.materialName}</span>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-400">
                      {movement.depot}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-slate-400">{movement.reference}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-slate-200">
                      {movement.type === "RECEIPT" || movement.type === "TRANSFER_IN" ? "+" : "−"}
                      {formatQty(movement.quantity)}{" "}
                      <span className="text-[11px] text-slate-500">{movement.unit}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-slate-400">
                      {formatQty(movement.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}


