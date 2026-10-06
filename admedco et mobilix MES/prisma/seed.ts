/**
 * Seed the plant: baseline stock, the two-product catalogue with its bills of
 * materials, and a set of live work orders spread across both factories.
 *
 * The sample orders are fast-forwarded with the *real* production engine, so a
 * seeded batch is exactly as consistent as one the shop floor advanced by hand —
 * materials drawn, chassis handed over, steps and ledger in agreement.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "../generated/prisma";

import {
  DIVISIONS,
  FULL_ROUTE,
  MATERIALS,
  PRODUCTS,
  SEMI_FINISHED_CODES,
  STAGE_BY_CODE,
  round,
  type StageCode,
} from "../lib/domain";
import { completeCurrentStage } from "../lib/engine";
import { passwordHash } from "../lib/password";

const prisma = new PrismaClient();

interface SampleOrder {
  product: string;
  quantity: number;
  priority: "NORMAL" | "HIGH";
  /** Days from today; negative means the deadline has already passed. */
  dueInDays: number;
  /** Park the batch at this stage. Ignored when `complete` is set. */
  stopAt?: StageCode;
  complete?: boolean;
}

const SAMPLE_ORDERS: SampleOrder[] = [
  // Mid-route in the metal shop.
  { product: "PRD-CAN-01", quantity: 12, priority: "HIGH", dueInDays: 4, stopAt: "SOUDAGE" },
  { product: "PRD-CAN-01", quantity: 8, priority: "NORMAL", dueInDays: 7, stopAt: "POUDRAGE" },
  // Not yet started.
  { product: "PRD-G21-01", quantity: 20, priority: "NORMAL", dueInDays: 12, stopAt: "COUPE" },
  // Handed over, on the wood side.
  { product: "PRD-G21-01", quantity: 6, priority: "HIGH", dueInDays: 2, stopAt: "TAPISSAGE" },
  { product: "PRD-CAN-01", quantity: 10, priority: "NORMAL", dueInDays: 9, stopAt: "DECOUPE-BOIS" },
  // Finished, to give the completed counters something to show.
  { product: "PRD-CAN-01", quantity: 25, priority: "NORMAL", dueInDays: -3, complete: true },
];

async function resetTables(): Promise<void> {
  // Children before parents: SQLite enforces the foreign keys.
  await prisma.stockMovement.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.workOrderStep.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.bomItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.material.deleteMany();
}

async function seedMaterials(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const material of MATERIALS) {
    const depot = DIVISIONS[material.division].depot;
    const row = await prisma.material.create({
      data: {
        code: material.code,
        name: material.name,
        unit: material.unit,
        division: material.division,
        depot,
        reorderPoint: material.reorderPoint,
        semiFinished: SEMI_FINISHED_CODES.has(material.code),
      },
    });
    ids.set(material.code, row.id);

    await prisma.stockLevel.create({
      data: {
        materialId: row.id,
        division: material.division,
        depot,
        onHand: material.openingStock,
      },
    });

    if (material.openingStock > 0) {
      await prisma.stockMovement.create({
        data: {
          materialId: row.id,
          division: material.division,
          depot,
          type: "RECEIPT",
          quantity: material.openingStock,
          balanceAfter: material.openingStock,
          reference: "Opening balance",
        },
      });
    }
  }

  return ids;
}

async function seedCatalogue(materialIds: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const product of PRODUCTS) {
    const row = await prisma.product.create({
      data: {
        code: product.code,
        name: product.name,
        tagline: product.tagline,
        hasArmrests: product.hasArmrests,
        insertCount: product.insertCount,
        capCount: product.capCount,
        sabotCount: product.sabotCount,
      },
    });
    ids.set(product.code, row.id);

    for (const line of product.bom) {
      const materialId = materialIds.get(line.material);
      if (!materialId) {
        throw new Error(`BOM for ${product.code} references unknown material ${line.material}`);
      }
      await prisma.bomItem.create({
        data: {
          productId: row.id,
          materialId,
          stage: line.stage,
          qtyPerUnit: line.qtyPerUnit,
        },
      });
    }
  }

  return ids;
}

async function seedWorkOrder(
  spec: SampleOrder,
  sequence: number,
  productIds: Map<string, string>,
): Promise<string> {
  const productId = productIds.get(spec.product);
  if (!productId) {
    throw new Error(`Sample order references unknown product ${spec.product}`);
  }

  const year = new Date().getFullYear();
  const number = `WO-${year}-${String(sequence).padStart(4, "0")}`;
  const firstStage = FULL_ROUTE[0];

  const order = await prisma.workOrder.create({
    data: {
      number,
      productId,
      quantity: spec.quantity,
      status: "IN_PROGRESS",
      currentStage: firstStage,
      currentDivision: STAGE_BY_CODE[firstStage].division,
      priority: spec.priority,
      dueDate: new Date(Date.now() + spec.dueInDays * 24 * 60 * 60 * 1000),
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

  const target = spec.complete ? null : spec.stopAt;

  // Walk the batch forward through the real engine.
  for (let guard = 0; guard <= FULL_ROUTE.length + 2; guard += 1) {
    const current = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
    if (current.status !== "IN_PROGRESS") break;
    if (target && current.currentStage === target) break;
    await prisma.$transaction((tx) => completeCurrentStage(tx, order.id));
  }

  const settled = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
  return `${settled.number} · ${spec.quantity} × ${spec.product} · ${settled.status}${
    settled.status === "IN_PROGRESS" ? ` at ${settled.currentStage}` : ""
  }`;
}

async function main(): Promise<void> {
  console.log("Seeding ADMEDCO & MOBILIX — Production Management System\n");

  await resetTables();
  await prisma.orderCounter.upsert({ where: { year: new Date().getFullYear() }, create: { year: new Date().getFullYear(), value: SAMPLE_ORDERS.length }, update: { value: SAMPLE_ORDERS.length } });
  // Seeded accounts. The defaults below are DEMO credentials; set the SEED_*
  // variables in .env before the first `npm run setup` to start with your own.
  const accounts: Array<[string, string, string]> = [
    [process.env.SEED_ADMIN_EMAIL ?? "admin@factory.com", process.env.SEED_ADMIN_PASSWORD ?? "Password123!", "Administrator"],
    [process.env.SEED_ADMEDCO_EMAIL ?? "admedco@factory.com", process.env.SEED_ADMEDCO_PASSWORD ?? "Password123!", "ADMEDCO_Operator"],
    [process.env.SEED_MOBILIX_EMAIL ?? "mobilix@factory.com", process.env.SEED_MOBILIX_PASSWORD ?? "Password123!", "MOBILIX_Operator"],
  ];
  const usingDefaultPasswords = accounts.some(([, password]) => password === "Password123!");
  for (const [email, password, role] of accounts) {
    await prisma.user.upsert({
      where: { email },
      create: { email, role, passwordHash: passwordHash(password) },
      update: { role, passwordHash: passwordHash(password) },
    });
  }

  const materialIds = await seedMaterials();
  console.log(`  ${MATERIALS.length} materials booked into stock`);

  const productIds = await seedCatalogue(materialIds);
  const bomLines = PRODUCTS.reduce((total, product) => total + product.bom.length, 0);
  console.log(`  ${PRODUCTS.length} catalogue products with ${bomLines} BOM lines`);

  for (const [index, spec] of SAMPLE_ORDERS.entries()) {
    const summary = await seedWorkOrder(spec, index + 1, productIds);
    console.log(`  ${summary}`);
  }

  // Report the balances the sample orders left behind.
  const levels = await prisma.stockLevel.findMany({
    include: { material: { select: { code: true, unit: true, reorderPoint: true } } },
  });

  const low = levels.filter((level) => level.onHand < level.material.reorderPoint);
  const chassis = levels.find((level) => level.material.code === "SF-CHASSIS-PEINT");

  console.log("");
  console.log(`  Balances written for ${levels.length} store lines`);
  console.log(
    `  Painted-chassis buffer at MOBILIX: ${round(chassis?.onHand ?? 0)} pcs (SF-CHASSIS-PEINT)`,
  );
  console.log(
    low.length > 0
      ? `  Below reorder point: ${low.map((level) => `${level.material.code} (${round(level.onHand)} ${level.material.unit})`).join(", ")}`
      : "  Every store is above its reorder point",
  );

  if (usingDefaultPasswords) {
    console.log("");
    console.log("  ! These accounts still use the built-in demo password.");
    console.log("    Set SEED_*_PASSWORD in .env (before seeding) or change it at /account");
    console.log("    before exposing this app to anyone but you.");
  }

  console.log("\nDone. Start the app with: npm run dev\n");
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });




