import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StageBlocked, completeCurrentStage } from "@/lib/engine";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  const order = await prisma.workOrder.findUnique({ where: { id }, select: { currentDivision: true } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "Administrator" && user.role !== `${order.currentDivision}_Operator`) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { const outcome = await prisma.$transaction(tx => completeCurrentStage(tx, id));
    for (const path of ["/", "/inventory", "/portal/admedco", "/portal/mobilix"]) revalidatePath(path);
    return NextResponse.json(outcome); }
  catch (error) { if (error instanceof StageBlocked) return NextResponse.json({ error: error.message }, { status: 422 }); throw error; }
}

