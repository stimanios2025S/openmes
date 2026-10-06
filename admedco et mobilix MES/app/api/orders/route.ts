import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PRODUCTS, FULL_ROUTE, STAGE_BY_CODE } from "@/lib/domain";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  return NextResponse.json(await prisma.workOrder.findMany({ where: user.role === "Administrator" ? {} : { currentDivision: user.role.replace("_Operator", "") }, include: { product: true, steps: true }, orderBy: { createdAt: "desc" } }));
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (user.role !== "Administrator") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { productCode?: string; quantity?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 422 }); }
  if (!PRODUCTS.some(p => p.code === body.productCode) || !Number.isInteger(body.quantity) || (body.quantity ?? 0) < 1 || (body.quantity ?? 0) > 500) return NextResponse.json({ error: "Choose a catalogue product and a whole quantity between 1 and 500." }, { status: 422 });
  const product = await prisma.product.findUnique({ where: { code: body.productCode } });
  if (!product) return NextResponse.json({ error: "Catalogue not seeded" }, { status: 503 });
  const order = await prisma.$transaction(async tx => {
    const counter = await tx.orderCounter.upsert({ where: { year: new Date().getFullYear() }, create: { year: new Date().getFullYear(), value: 1 }, update: { value: { increment: 1 } } });
    return tx.workOrder.create({ data: { number: `WO-${counter.year}-${String(counter.value).padStart(4, "0")}`, productId: product.id, quantity: body.quantity!, currentStage: FULL_ROUTE[0], currentDivision: "ADMEDCO", steps: { create: FULL_ROUTE.map((stage, index) => ({ stage, division: STAGE_BY_CODE[stage].division, sequence: index + 1, status: index === 0 ? "ACTIVE" : "PENDING" })) } } });
  });
  revalidatePath("/");
  revalidatePath("/portal/admedco");
  return NextResponse.json(order, { status: 201 });
}



