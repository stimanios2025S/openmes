import type { Metadata } from "next";
import Link from "next/link";

import BoardPage from "@/components/BoardPage";
import OrderForm from "@/components/OrderForm";
import StockTable from "@/components/StockTable";
import { Card, CardHeader, Stat } from "@/components/ui";
import { requireDivision } from "@/lib/auth";
import { formatQty } from "@/lib/domain";
import { loadBoardOrders, loadRecentMovements, loadStock } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ADMEDCO — Metal Fabrication Division" };

export default async function AdmedcoPortal() {
  const user = await requireDivision("ADMEDCO");
  const [orders, stock, movements] = await Promise.all([
    loadBoardOrders("ADMEDCO"),
    loadStock("ADMEDCO"),
    loadRecentMovements(5, "ADMEDCO"),
  ]);
  const lowStock = stock.filter((item) => item.status !== "OK");

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-slate-900/80 to-slate-950 p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">ADMEDCO / metal shop</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-100">ADMEDCO — Metal Fabrication Division</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Control the six metal fabrication stations, track your raw materials in DEP-MP, and hand painted chassis over after powder coating.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-xs">
          <a href="#workstations" className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-slate-950">Workstations</a>
          <a href="#materials" className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200">ADMEDCO stock</a>
          {user.role === "Administrator" && <a href="#new-order" className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200">New work order</a>}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active ADMEDCO batches" value={orders.length} accent="amber" hint="On the metal shop floor" />
        <Stat label="Units in metal production" value={formatQty(orders.reduce((sum, order) => sum + order.quantity, 0))} hint="Across six stations" />
        <Stat label="Materials needing attention" value={lowStock.length} accent={lowStock.length ? "rose" : "slate"} hint="DEP-MP only" />
      </div>

      {user.role === "Administrator" && (
        <section id="new-order" className="scroll-mt-24">
          <Card>
            <CardHeader title="Create a work order" subtitle="Only the administrator can open a CANADA or G21 chair order. Every order starts at COUPE." />
            <OrderForm />
          </Card>
        </section>
      )}

      <section id="workstations" className="scroll-mt-24">
        <BoardPage division="ADMEDCO" />
      </section>

      <section id="materials" className="scroll-mt-24 space-y-4">
        <Card>
          <CardHeader title="ADMEDCO raw-material depot" subtitle="DEP-MP · metal fabrication materials only" action={<Link href="/inventory?division=admedco" className="text-xs text-amber-300 hover:underline">Full ADMEDCO ledger →</Link>} />
          <StockTable rows={stock} />
        </Card>
        <Card>
          <CardHeader title="Recent ADMEDCO movements" subtitle="Stock consumed at each station and painted chassis transferred out." />
          {movements.length ? (
            <ul className="divide-y divide-slate-800 px-5 text-xs text-slate-300">
              {movements.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{item.materialCode} · {item.reference}</span><span className="font-mono">{item.type} · {formatQty(item.quantity)} {item.unit}</span></li>)}
            </ul>
          ) : <p className="px-5 py-5 text-sm text-slate-500">No material movements yet.</p>}
        </Card>
      </section>
    </div>
  );
}
