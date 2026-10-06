import { DIVISIONS, MATERIALS, SEMI_FINISHED_CODES, round, type DivisionCode } from "./domain";
import { prisma } from "./db";

/** A work order as the kanban board needs it — plain, serialisable values only. */
export interface BoardOrder {
  id: string;
  number: string;
  productCode: string;
  productName: string;
  quantity: number;
  currentStage: string;
  priority: string;
  dueDate: string | null;
  completedSteps: number;
  totalSteps: number;
}

export async function loadBoardOrders(division: DivisionCode): Promise<BoardOrder[]> {
  const orders = await prisma.workOrder.findMany({
    where: { status: "IN_PROGRESS", currentDivision: division },
    include: {
      product: { select: { code: true, name: true } },
      steps: { select: { status: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  return orders.map((order) => ({
    id: order.id,
    number: order.number,
    productCode: order.product.code,
    productName: order.product.name,
    quantity: order.quantity,
    currentStage: order.currentStage,
    priority: order.priority,
    dueDate: order.dueDate ? order.dueDate.toISOString() : null,
    completedSteps: order.steps.filter((step) => step.status === "COMPLETED").length,
    totalSteps: order.steps.length,
  }));
}

export interface StockRow {
  materialId: string;
  code: string;
  name: string;
  unit: string;
  depot: string;
  onHand: number;
  reorderPoint: number;
  semiFinished: boolean;
  /** OK | LOW | OUT */
  status: "OK" | "LOW" | "OUT";
}

function statusFor(onHand: number, reorderPoint: number): StockRow["status"] {
  if (onHand <= 0) return "OUT";
  if (onHand < reorderPoint) return "LOW";
  return "OK";
}

/**
 * Stock rows for a factory's store. Every material the factory owns is listed,
 * including any the seeder has not yet opened a balance for.
 */
export async function loadStock(division: DivisionCode): Promise<StockRow[]> {
  const levels = await prisma.stockLevel.findMany({
    where: { division },
    include: { material: { select: { code: true, name: true, unit: true, depot: true, reorderPoint: true } } },
  });

  const byCode = new Map(
    levels.map((level) => [
      level.material.code,
      {
        materialId: level.materialId,
        code: level.material.code,
        name: level.material.name,
        unit: level.material.unit,
        depot: level.depot,
        onHand: round(level.onHand),
        reorderPoint: level.material.reorderPoint,
        semiFinished: SEMI_FINISHED_CODES.has(level.material.code),
        status: statusFor(level.onHand, level.material.reorderPoint),
      } satisfies StockRow,
    ]),
  );

  return MATERIALS.filter((material) => material.division === division)
    .map((material) => {
      const existing = byCode.get(material.code);
      if (existing) return existing;
      return {
        materialId: material.code,
        code: material.code,
        name: material.name,
        unit: material.unit,
        depot: DIVISIONS[division].depot,
        onHand: 0,
        reorderPoint: material.reorderPoint,
        semiFinished: SEMI_FINISHED_CODES.has(material.code),
        status: "OUT" as const,
      } satisfies StockRow;
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

export interface MovementRow {
  id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  unit: string;
  materialCode: string;
  materialName: string;
  depot: string;
  division: string;
  reference: string;
  createdAt: string;
}

export async function loadRecentMovements(limit = 25, division?: DivisionCode): Promise<MovementRow[]> {
  const movements = await prisma.stockMovement.findMany({
    where: division ? { division } : undefined,
    include: { material: { select: { code: true, name: true, unit: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });

  return movements.map((movement) => ({
    id: movement.id,
    type: movement.type,
    quantity: round(movement.quantity),
    balanceAfter: round(movement.balanceAfter),
    unit: movement.material.unit,
    materialCode: movement.material.code,
    materialName: movement.material.name,
    depot: movement.depot,
    division: movement.division,
    reference: movement.reference,
    createdAt: movement.createdAt.toISOString(),
  }));
}

/** The painted-chassis buffer MOBILIX assembles from. */
export async function loadChassisBuffer(): Promise<number> {
  const chassis = await prisma.material.findUnique({ where: { code: "SF-CHASSIS-PEINT" } });
  if (!chassis) return 0;
  const level = await prisma.stockLevel.findUnique({
    where: { materialId_division: { materialId: chassis.id, division: "MOBILIX" } },
  });
  return round(level?.onHand ?? 0);
}

export interface PlantSummary {
  activeOrders: number;
  unitsInProgress: number;
  completedOrders: number;
  unitsCompleted: number;
  lowStock: { code: string; name: string; onHand: number; unit: string; division: string }[];
  activeByDivision: Record<DivisionCode, number>;
  awaitingHandoff: number;
}

export async function loadPlantSummary(): Promise<PlantSummary> {
  const [active, completed] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: "IN_PROGRESS" },
      select: { quantity: true, currentDivision: true, currentStage: true },
    }),
    prisma.workOrder.aggregate({
      where: { status: "COMPLETED" },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
  ]);

  const levels = await prisma.stockLevel.findMany({
    include: { material: { select: { code: true, name: true, unit: true, reorderPoint: true } } },
  });

  const lowStock = levels
    .filter((level) => !SEMI_FINISHED_CODES.has(level.material.code))
    .filter((level) => level.onHand < level.material.reorderPoint)
    .map((level) => ({
      code: level.material.code,
      name: level.material.name,
      onHand: round(level.onHand),
      unit: level.material.unit,
      division: level.division,
    }))
    .sort((a, b) => a.onHand - b.onHand);

  return {
    activeOrders: active.length,
    unitsInProgress: active.reduce((total, order) => total + order.quantity, 0),
    completedOrders: completed._count._all,
    unitsCompleted: completed._sum.quantity ?? 0,
    lowStock,
    activeByDivision: {
      ADMEDCO: active.filter((order) => order.currentDivision === "ADMEDCO").length,
      MOBILIX: active.filter((order) => order.currentDivision === "MOBILIX").length,
    },
    awaitingHandoff: active.filter((order) => order.currentStage === "POUDRAGE").length,
  };
}

