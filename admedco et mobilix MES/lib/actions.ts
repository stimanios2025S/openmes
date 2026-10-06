"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "./db";
import { currentUser, requireUser } from "./auth";
import { StageBlocked, completeCurrentStage, describeOutcome } from "./engine";
import { FULL_ROUTE, PRODUCTS, STAGE_BY_CODE } from "./domain";
import type { FormState, StageResult } from "./forms";

function refreshPlant(): void {
  revalidatePath("/");
  revalidatePath("/admedco");
  revalidatePath("/mobilix");
  revalidatePath("/inventory");
  revalidatePath("/portal/admedco");
  revalidatePath("/portal/mobilix");
}

async function nextWorkOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const counter = await prisma.orderCounter.upsert({ where: { year }, create: { year, value: 1 }, update: { value: { increment: 1 } } });
  return `${prefix}${String(counter.value).padStart(4, "0")}`;
}

/**
 * Open a work order for one of the two catalogue chairs.
 *
 * The catalogue is closed: the posted code is checked against the allowlist in
 * `lib/domain.ts` before anything is written, so a legacy or invented product
 * code cannot be ordered.
 */
export async function createWorkOrder(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "Administrator") return { status: "error", message: "Administrator access required.", errors: {} };
  const productCode = String(formData.get("productCode") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "NORMAL").trim().toUpperCase();

  const errors: Record<string, string> = {};

  if (!PRODUCTS.some((product) => product.code === productCode)) {
    errors.productCode = "Choose one of the two catalogue products.";
  }

  const quantity = Number(quantityRaw);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
    errors.quantity = "Quantity must be a whole number between 1 and 500.";
  }

  let dueDate: Date | null = null;
  if (dueDateRaw) {
    const parsed = new Date(`${dueDateRaw}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      errors.dueDate = "Enter a valid date.";
    } else {
      dueDate = parsed;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "The work order was not created.", errors };
  }

  const product = await prisma.product.findUnique({ where: { code: productCode } });
  if (!product) {
    return {
      status: "error",
      message: "The catalogue is empty. Run `npm run setup` to seed the plant.",
      errors: {},
    };
  }

  const number = await nextWorkOrderNumber();
  const firstStage = FULL_ROUTE[0];

  const order = await prisma.workOrder.create({
    data: {
      number,
      productId: product.id,
      quantity,
      status: "IN_PROGRESS",
      currentStage: firstStage,
      currentDivision: STAGE_BY_CODE[firstStage].division,
      priority: priorityRaw === "HIGH" ? "HIGH" : "NORMAL",
      dueDate,
      steps: {
        create: FULL_ROUTE.map((stageCode, index) => ({
          stage: stageCode,
          division: STAGE_BY_CODE[stageCode].division,
          sequence: index + 1,
          status: index === 0 ? "ACTIVE" : "PENDING",
          startedAt: index === 0 ? new Date() : null,
        })),
      },
    },
  });

  refreshPlant();

  return {
    status: "ok",
    message: `${order.number} opened — ${quantity} × ${product.name}, starting at ${STAGE_BY_CODE[firstStage].label} (${firstStage}).`,
    errors: {},
  };
}

/**
 * Close the batch's current stage.
 *
 * Returns a result rather than throwing so the kanban card can print the
 * refusal — a shortage is an ordinary shop-floor outcome, not a crashed page.
 */
export async function completeStage(workOrderId: string): Promise<StageResult> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, message: "Unauthenticated." };
    const order = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { currentDivision: true } });
    if (!order) return { ok: false, message: "Work order not found." };
    if (user.role !== "Administrator" && user.role !== `${order.currentDivision}_Operator`) return { ok: false, message: "Forbidden." };
    const outcome = await prisma.$transaction((tx) => completeCurrentStage(tx, workOrderId));
    refreshPlant();
    return { ok: true, message: describeOutcome(outcome) };
  } catch (error) {
    if (error instanceof StageBlocked) {
      return { ok: false, message: error.message };
    }
    console.error("[completeStage]", error);
    return { ok: false, message: "Unexpected error closing the stage. See the server log." };
  }
}






