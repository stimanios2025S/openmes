import BoardPage from "@/components/BoardPage";
import { requireDivision } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page() { await requireDivision("MOBILIX"); return <BoardPage division="MOBILIX" />; }
