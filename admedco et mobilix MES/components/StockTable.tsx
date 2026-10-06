import { formatQty } from "@/lib/domain";
import type { StockRow } from "@/lib/queries";

function statusTone(status: StockRow["status"]): string {
  switch (status) {
    case "OUT":
      return "border-rose-500/40 bg-rose-500/10 text-rose-300";
    case "LOW":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    default:
      return "border-slate-600/40 bg-slate-500/10 text-slate-400";
  }
}

export default function StockTable({ rows }: { rows: StockRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-800/80 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-5 py-2.5 font-medium">Code</th>
            <th className="px-5 py-2.5 font-medium">Material</th>
            <th className="px-5 py-2.5 text-right font-medium">On hand</th>
            <th className="px-5 py-2.5 text-right font-medium">Reorder at</th>
            <th className="px-5 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} className="border-b border-slate-900/80 last:border-0">
              <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-slate-300">
                {row.code}
              </td>
              <td className="px-5 py-2.5 text-slate-300">
                {row.name}
                {row.semiFinished ? (
                  <span className="ml-2 rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">
                    semi-finished
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-5 py-2.5 text-right font-medium tabular-nums text-slate-100">
                {formatQty(row.onHand)}{" "}
                <span className="text-[11px] font-normal text-slate-500">{row.unit}</span>
              </td>
              <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-slate-500">
                {formatQty(row.reorderPoint)}
              </td>
              <td className="px-5 py-2.5">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(row.status)}`}
                >
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
