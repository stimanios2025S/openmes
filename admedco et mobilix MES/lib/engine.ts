import type { Prisma } from "../generated/prisma";

import {
  CHASSIS_HANDOFF,
  DIVISIONS,
  STAGE_BY_CODE,
  formatQty,
  round,
  type DivisionCode,
  type StageCode,
} from "./domain";

/**
 * The production engine.
 *
 * Both call sites — the server action behind the kanban "Complete" button and
 * the seeder that fast-forwards sample orders into mid-route positions — run
 * this same code, so a seeded batch is exactly as consistent as one the shop
 * floor advanced by hand.
 *
 * Every function takes a transaction client: the caller owns the transaction,
 * which keeps `revalidatePath` (illegal inside a transaction) in the action.
 */
type Db = Prisma.TransactionClient;

/** Thrown when a stage cannot be closed. The message is safe to show an operator. */
export class StageBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageBlocked";
  }
}

export interface ConsumedLine {
  code: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface StageOutcome {
  workOrderNumber: string;
  stage: StageCode;
  stageLabel: string;
  division: DivisionCode;
  consumed: ConsumedLine[];
  /** The inter-factory hand-off, when this stage released something to the other factory. */
  produced: ConsumedLine | null;
  nextStage: StageCode | null;
  nextDivision: DivisionCode | null;
  finished: boolean;
}

/**
 * Close the work order's current stage: deduct its bill of materials from the
 * owning factory's store, perform the inter-factory hand-off if this is
 * POUDRAGE, then advance the batch to the next station.
 */
export async function completeCurrentStage(db: Db, workOrderId: string): Promise<StageOutcome> {
  const order = await db.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      product: true,
      steps: { orderBy: { sequence: "asc" } },
    },
  });

  if (!order) {
    throw new StageBlocked("That work order no longer exists.");
  }
  if (order.status !== "IN_PROGRESS") {
    throw new StageBlocked(`${order.number} is ${order.status.toLowerCase()} and has no open stage.`);
  }

  const currentStageCode = order.currentStage as StageCode;
  const step = order.steps.find((candidate) => candidate.stage === order.currentStage);
  if (!step || step.status !== "ACTIVE") {
    throw new StageBlocked(`${order.number} has no open step at ${order.currentStage}.`);
  }

  const stage = STAGE_BY_CODE[currentStageCode];
  if (!stage) {
    throw new StageBlocked(`Stage "${order.currentStage}" is not part of the route.`);
  }

  const division = DIVISIONS[stage.division];
  const units = order.quantity;

  const bomLines = await db.bomItem.findMany({
    where: { productId: order.productId, stage: stage.code },
    include: { material: true },
  });

  const planned = bomLines.map((line) => ({
    line,
    required: round(line.qtyPerUnit * units),
  }));

  // 1. Refuse the stage rather than drive a store negative. The operator gets
  //    the material, what is needed and what is actually on the shelf.
  const shortages: string[] = [];
  for (const { line, required } of planned) {
    const level = await db.stockLevel.findUnique({
      where: {
        materialId_division: { materialId: line.materialId, division: line.material.division },
      },
    });
    const onHand = level?.onHand ?? 0;
    if (onHand + 1e-9 < required) {
      shortages.push(
        `${line.material.code} (need ${formatQty(required)} ${line.material.unit}, ${formatQty(onHand)} on hand)`,
      );
    }
  }
  if (shortages.length > 0) {
    throw new StageBlocked(`Insufficient stock at ${division.code}: ${shortages.join("; ")}.`);
  }

  // 2. Deduct the stage's materials from the owning factory's store.
  const consumed: ConsumedLine[] = [];
  for (const { line, required } of planned) {
    if (required <= 0) continue;
    const level = await db.stockLevel.update({
      where: {
        materialId_division: { materialId: line.materialId, division: line.material.division },
      },
      data: { onHand: { decrement: required } },
    });
    await db.stockMovement.create({
      data: {
        materialId: line.materialId,
        division: line.material.division,
        depot: line.material.depot,
        type: "CONSUME",
        quantity: required,
        balanceAfter: round(level.onHand),
        reference: `${order.number} · ${stage.code}`,
        workOrderId: order.id,
        stage: stage.code,
      },
    });
    consumed.push({
      code: line.material.code,
      name: line.material.name,
      quantity: required,
      unit: line.material.unit,
    });
  }

  // 3. Inter-factory hand-off: the coated chassis leaves ADMEDCO for MOBILIX.
  let produced: ConsumedLine | null = null;
  if (stage.code === CHASSIS_HANDOFF.fromStage) {
    const chassis = await db.material.findUnique({ where: { code: CHASSIS_HANDOFF.materialCode } });
    if (!chassis) {
      throw new StageBlocked(`Semi-finished item ${CHASSIS_HANDOFF.materialCode} is not configured.`);
    }

    const handoverQty = round(CHASSIS_HANDOFF.qtyPerUnit * units);
    const level = await db.stockLevel.upsert({
      where: {
        materialId_division: {
          materialId: chassis.id,
          division: CHASSIS_HANDOFF.toDivision,
        },
      },
      create: {
        materialId: chassis.id,
        division: CHASSIS_HANDOFF.toDivision,
        depot: CHASSIS_HANDOFF.toDepot,
        onHand: handoverQty,
      },
      update: { onHand: { increment: handoverQty } },
    });

    await db.stockMovement.create({
      data: {
        materialId: chassis.id,
        division: CHASSIS_HANDOFF.toDivision,
        depot: CHASSIS_HANDOFF.toDepot,
        type: "TRANSFER_IN",
        quantity: handoverQty,
        balanceAfter: round(level.onHand),
        reference: `${order.number} · ${CHASSIS_HANDOFF.fromDivision} ${stage.code} → ${CHASSIS_HANDOFF.toDepot}`,
        workOrderId: order.id,
        stage: stage.code,
      },
    });

    produced = {
      code: chassis.code,
      name: chassis.name,
      quantity: handoverQty,
      unit: chassis.unit,
    };
  }

  // 4. Advance the batch.
  await db.workOrderStep.update({
    where: { id: step.id },
    data: { status: "COMPLETED", completedAt: new Date(), passedQty: units },
  });

  const next = order.steps.find((candidate) => candidate.sequence === step.sequence + 1) ?? null;

  if (next) {
    await db.workOrderStep.update({
      where: { id: next.id },
      data: { status: "ACTIVE", startedAt: new Date() },
    });
    await db.workOrder.update({
      where: { id: order.id },
      data: { currentStage: next.stage, currentDivision: next.division },
    });
  } else {
    await db.workOrder.update({
      where: { id: order.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  return {
    workOrderNumber: order.number,
    stage: stage.code,
    stageLabel: stage.label,
    division: division.code,
    consumed,
    produced,
    nextStage: next ? (next.stage as StageCode) : null,
    nextDivision: next ? (next.division as DivisionCode) : null,
    finished: !next,
  };
}

/** One operator-facing sentence describing what closing the stage did. */
export function describeOutcome(outcome: StageOutcome): string {
  const parts: string[] = [];

  if (outcome.consumed.length > 0) {
    const drawn = outcome.consumed
      .map((line) => `${formatQty(line.quantity)} ${line.unit} ${line.code}`)
      .join(", ");
    parts.push(`drew ${drawn} from ${DIVISIONS[outcome.division].depot}`);
  }

  if (outcome.produced) {
    parts.push(
      `handed ${formatQty(outcome.produced.quantity)} ${outcome.produced.unit} ${outcome.produced.code} to ${CHASSIS_HANDOFF.toDivision}`,
    );
  }

  const where = outcome.finished
    ? `${outcome.workOrderNumber} is complete`
    : `${outcome.workOrderNumber} moved to ${outcome.nextStage}`;

  return parts.length > 0
    ? `${outcome.stage} closed at ${outcome.division} — ${where}; ${parts.join("; ")}.`
    : `${outcome.stage} closed at ${outcome.division} — ${where}.`;
}


