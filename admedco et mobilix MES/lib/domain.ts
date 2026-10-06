/**
 * ADMEDCO & MOBILIX — single source of truth for the plant.
 *
 * The seeder and the runtime production engine both read this file, so the
 * catalogue, the stage route and every bill of materials cannot drift apart.
 *
 * This module is intentionally free of any database or Node-only import: the
 * browser components import it too.
 */

export type DivisionCode = "ADMEDCO" | "MOBILIX";

export type StageCode =
  | "COUPE"
  | "USINAGE"
  | "SOUDAGE"
  | "MEULAGE"
  | "VISSAGE"
  | "POUDRAGE"
  | "DECOUPE-BOIS"
  | "COUTURE"
  | "TAPISSAGE"
  | "ASSEMBLAGE";

/** Literal Tailwind classes — never build these by interpolation or the JIT will miss them. */
export interface AccentTheme {
  text: string;
  bg: string;
  softBg: string;
  border: string;
  ring: string;
  dot: string;
}

export interface DivisionDef {
  code: DivisionCode;
  /** Trading name shown on the shop floor. */
  name: string;
  /** What the division does. */
  title: string;
  /** Raw-material store this factory consumes from. */
  depot: string;
  /** Finished-goods store. */
  finishDepot: string;
  /** Labour rate used when valuing the work, in dirhams per hour. */
  labourRate: number;
  accent: AccentTheme;
}

export const DIVISIONS: Record<DivisionCode, DivisionDef> = {
  ADMEDCO: {
    code: "ADMEDCO",
    name: "ADMEDCO",
    title: "Metal Fabrication Division",
    depot: "DEP-MP",
    finishDepot: "DEP-PF-ADM",
    labourRate: 45,
    accent: {
      text: "text-amber-400",
      bg: "bg-amber-500",
      softBg: "bg-amber-500/10",
      border: "border-amber-500/40",
      ring: "ring-amber-500/30",
      dot: "bg-amber-400",
    },
  },
  MOBILIX: {
    code: "MOBILIX",
    name: "MOBILIX",
    title: "Wood & Upholstery Division",
    depot: "DEP-MP-MBX",
    finishDepot: "DEP-PF-MBX",
    labourRate: 40,
    accent: {
      text: "text-emerald-400",
      bg: "bg-emerald-500",
      softBg: "bg-emerald-500/10",
      border: "border-emerald-500/40",
      ring: "ring-emerald-500/30",
      dot: "bg-emerald-400",
    },
  },
};

export const DIVISION_ORDER: DivisionCode[] = ["ADMEDCO", "MOBILIX"];

export interface StageDef {
  code: StageCode;
  /** English label for the station. */
  label: string;
  division: DivisionCode;
  /** Position on the plant-wide ten-stage route, 1-based. */
  sequence: number;
  description: string;
}

/**
 * The route a chair walks: six metal stages at ADMEDCO, then four wood and
 * upholstery stages at MOBILIX. The batch is handed over after POUDRAGE.
 */
export const STAGES: StageDef[] = [
  {
    code: "COUPE",
    label: "Cutting",
    division: "ADMEDCO",
    sequence: 1,
    description: "Tube and plate cut to length",
  },
  {
    code: "USINAGE",
    label: "Machining",
    division: "ADMEDCO",
    sequence: 2,
    description: "Chassis plate drilled and machined",
  },
  {
    code: "SOUDAGE",
    label: "Welding",
    division: "ADMEDCO",
    sequence: 3,
    description: "Chassis welded square",
  },
  {
    code: "MEULAGE",
    label: "Grinding",
    division: "ADMEDCO",
    sequence: 4,
    description: "Weld dressing and finishing",
  },
  {
    code: "VISSAGE",
    label: "Screwing",
    division: "ADMEDCO",
    sequence: 5,
    description: "Brackets and armrests fitted",
  },
  {
    code: "POUDRAGE",
    label: "Powder coating",
    division: "ADMEDCO",
    sequence: 6,
    description: "Chassis coated — releases the painted chassis to MOBILIX",
  },
  {
    code: "DECOUPE-BOIS",
    label: "Wood cutting",
    division: "MOBILIX",
    sequence: 7,
    description: "Plywood seat and back cut, inserts pressed",
  },
  {
    code: "COUTURE",
    label: "Sewing",
    division: "MOBILIX",
    sequence: 8,
    description: "Foam and fabric cut and sewn",
  },
  {
    code: "TAPISSAGE",
    label: "Upholstery",
    division: "MOBILIX",
    sequence: 9,
    description: "Cover stapled over the foam",
  },
  {
    code: "ASSEMBLAGE",
    label: "Final assembly",
    division: "MOBILIX",
    sequence: 10,
    description: "Painted chassis, caps and sabots fitted — chair complete",
  },
];

export const STAGE_BY_CODE: Record<StageCode, StageDef> = STAGES.reduce(
  (accumulator, stage) => {
    accumulator[stage.code] = stage;
    return accumulator;
  },
  {} as Record<StageCode, StageDef>,
);

export const DIVISION_STAGES: Record<DivisionCode, StageDef[]> = {
  ADMEDCO: STAGES.filter((stage) => stage.division === "ADMEDCO"),
  MOBILIX: STAGES.filter((stage) => stage.division === "MOBILIX"),
};

/** The full ten-stage route every chair follows, in order. */
export const FULL_ROUTE: StageCode[] = STAGES.map((stage) => stage.code);

/* ------------------------------------------------------------------ */
/* Inter-factory hand-off                                              */
/* ------------------------------------------------------------------ */

/**
 * Completing POUDRAGE at ADMEDCO releases one painted chassis per chair into
 * MOBILIX's raw-material store, where ASSEMBLAGE consumes it.
 */
export const CHASSIS_HANDOFF = {
  fromStage: "POUDRAGE" as StageCode,
  fromDivision: "ADMEDCO" as DivisionCode,
  materialCode: "SF-CHASSIS-PEINT",
  toDivision: "MOBILIX" as DivisionCode,
  toDepot: DIVISIONS.MOBILIX.depot,
  qtyPerUnit: 1,
};

/* ------------------------------------------------------------------ */
/* Materials and stores                                                */
/* ------------------------------------------------------------------ */

export interface MaterialDef {
  code: string;
  name: string;
  unit: string;
  division: DivisionCode;
  /** Opening balance booked as a RECEIPT when the plant is seeded. */
  openingStock: number;
  reorderPoint: number;
}

export const MATERIALS: MaterialDef[] = [
  // ADMEDCO — DEP-MP
  { code: "MP-TUBE-AC", name: "Steel tube 25 × 25 × 2", unit: "m", division: "ADMEDCO", openingStock: 500, reorderPoint: 120 },
  { code: "MP-PLAT-AC", name: "Steel plate 2 mm", unit: "kg", division: "ADMEDCO", openingStock: 400, reorderPoint: 100 },
  { code: "MP-FIL-SOUD", name: "MIG welding wire", unit: "kg", division: "ADMEDCO", openingStock: 60, reorderPoint: 15 },
  { code: "MP-DISQ-MEUL", name: "Grinding disc", unit: "pcs", division: "ADMEDCO", openingStock: 80, reorderPoint: 20 },
  { code: "MP-VIS-M6", name: "M6 chassis screw", unit: "pcs", division: "ADMEDCO", openingStock: 1200, reorderPoint: 300 },
  { code: "MP-BRAS-AC", name: "Armrest bracket (CANADA only)", unit: "pcs", division: "ADMEDCO", openingStock: 300, reorderPoint: 80 },
  { code: "MP-POUDRE-EP", name: "Epoxy coating powder", unit: "kg", division: "ADMEDCO", openingStock: 90, reorderPoint: 80 },

  // MOBILIX — DEP-MP-MBX
  { code: "MP-BOIS-PLAC", name: "Plywood panel 18 mm", unit: "m²", division: "MOBILIX", openingStock: 200, reorderPoint: 50 },
  { code: "MP-MOUSSE", name: "Foam block 40 mm", unit: "m²", division: "MOBILIX", openingStock: 150, reorderPoint: 40 },
  { code: "MP-TISSU", name: "Upholstery fabric", unit: "m²", division: "MOBILIX", openingStock: 250, reorderPoint: 60 },
  { code: "MP-FIL-COUT", name: "Sewing thread", unit: "kg", division: "MOBILIX", openingStock: 20, reorderPoint: 5 },
  { code: "MP-AGRAFE", name: "Upholstery staple", unit: "pcs", division: "MOBILIX", openingStock: 8000, reorderPoint: 2000 },
  { code: "MP-INSERT-M6", name: "M6 threaded insert", unit: "pcs", division: "MOBILIX", openingStock: 2000, reorderPoint: 500 },
  { code: "MP-CAP-OVAL", name: "Oval cap", unit: "pcs", division: "MOBILIX", openingStock: 800, reorderPoint: 200 },
  { code: "MP-SABOT", name: "Glide sabot", unit: "pcs", division: "MOBILIX", openingStock: 600, reorderPoint: 150 },

  { code: "MP-CARTON", name: "Shipping carton", unit: "pcs", division: "MOBILIX", openingStock: 200, reorderPoint: 40 },

  // Produced by ADMEDCO POUDRAGE, consumed by MOBILIX ASSEMBLAGE.
  { code: "SF-CHASSIS-PEINT", name: "Painted chassis (semi-finished)", unit: "pcs", division: "MOBILIX", openingStock: 0, reorderPoint: 8 },
];

export const MATERIAL_BY_CODE: Record<string, MaterialDef> = MATERIALS.reduce(
  (accumulator, material) => {
    accumulator[material.code] = material;
    return accumulator;
  },
  {} as Record<string, MaterialDef>,
);

/** Semi-finished items are produced by a step, never received from a supplier. */
export const SEMI_FINISHED_CODES = new Set<string>([CHASSIS_HANDOFF.materialCode]);

export function materialsForDivision(division: DivisionCode): MaterialDef[] {
  return MATERIALS.filter((material) => material.division === division);
}

/* ------------------------------------------------------------------ */
/* Catalogue — two chairs, nothing else                                */
/* ------------------------------------------------------------------ */

export interface BomLine {
  material: string;
  /** Stage that physically takes the item off the shelf. */
  stage: StageCode;
  qtyPerUnit: number;
}

export interface ProductDef {
  code: string;
  name: string;
  tagline: string;
  highlights: string[];
  hasArmrests: boolean;
  insertCount: number;
  capCount: number;
  sabotCount: number;
  bom: BomLine[];
}

export const PRODUCTS: ProductDef[] = [
  {
    code: "PRD-CAN-01",
    name: "Chaise CANADA",
    tagline: "Metal chassis with armrests",
    highlights: ["12 M6 inserts", "6 oval caps", "4 sabots", "2 armrests"],
    hasArmrests: true,
    insertCount: 12,
    capCount: 6,
    sabotCount: 4,
    bom: [
      { material: "MP-TUBE-AC", stage: "COUPE", qtyPerUnit: 3.2 },
      { material: "MP-PLAT-AC", stage: "USINAGE", qtyPerUnit: 2.2 },
      { material: "MP-FIL-SOUD", stage: "SOUDAGE", qtyPerUnit: 0.35 },
      { material: "MP-DISQ-MEUL", stage: "MEULAGE", qtyPerUnit: 0.25 },
      { material: "MP-VIS-M6", stage: "VISSAGE", qtyPerUnit: 6 },
      { material: "MP-BRAS-AC", stage: "VISSAGE", qtyPerUnit: 2 },
      { material: "MP-POUDRE-EP", stage: "POUDRAGE", qtyPerUnit: 0.45 },
      { material: "MP-BOIS-PLAC", stage: "DECOUPE-BOIS", qtyPerUnit: 0.85 },
      { material: "MP-INSERT-M6", stage: "DECOUPE-BOIS", qtyPerUnit: 12 },
      { material: "MP-MOUSSE", stage: "COUTURE", qtyPerUnit: 0.9 },
      { material: "MP-TISSU", stage: "COUTURE", qtyPerUnit: 1.2 },
      { material: "MP-FIL-COUT", stage: "COUTURE", qtyPerUnit: 0.1 },
      { material: "MP-AGRAFE", stage: "TAPISSAGE", qtyPerUnit: 40 },
      { material: "SF-CHASSIS-PEINT", stage: "ASSEMBLAGE", qtyPerUnit: 1 },
      { material: "MP-CARTON", stage: "ASSEMBLAGE", qtyPerUnit: 0.25 },
      { material: "MP-CAP-OVAL", stage: "ASSEMBLAGE", qtyPerUnit: 6 },
      { material: "MP-SABOT", stage: "ASSEMBLAGE", qtyPerUnit: 4 },
    ],
  },
  {
    code: "PRD-G21-01",
    name: "Chaise G21",
    tagline: "Standard metal chassis, no armrests",
    highlights: ["8 M6 inserts", "8 oval caps", "4 sabots", "No armrests"],
    hasArmrests: false,
    insertCount: 8,
    capCount: 8,
    sabotCount: 4,
    bom: [
      { material: "MP-TUBE-AC", stage: "COUPE", qtyPerUnit: 2.8 },
      { material: "MP-PLAT-AC", stage: "USINAGE", qtyPerUnit: 1.2 },
      { material: "MP-FIL-SOUD", stage: "SOUDAGE", qtyPerUnit: 0.28 },
      { material: "MP-DISQ-MEUL", stage: "MEULAGE", qtyPerUnit: 0.2 },
      { material: "MP-VIS-M6", stage: "VISSAGE", qtyPerUnit: 4 },
      { material: "MP-POUDRE-EP", stage: "POUDRAGE", qtyPerUnit: 0.38 },
      { material: "MP-BOIS-PLAC", stage: "DECOUPE-BOIS", qtyPerUnit: 0.7 },
      { material: "MP-INSERT-M6", stage: "DECOUPE-BOIS", qtyPerUnit: 8 },
      { material: "MP-MOUSSE", stage: "COUTURE", qtyPerUnit: 0.75 },
      { material: "MP-TISSU", stage: "COUTURE", qtyPerUnit: 1.2 },
      { material: "MP-FIL-COUT", stage: "COUTURE", qtyPerUnit: 0.08 },
      { material: "MP-AGRAFE", stage: "TAPISSAGE", qtyPerUnit: 32 },
      { material: "SF-CHASSIS-PEINT", stage: "ASSEMBLAGE", qtyPerUnit: 1 },
      { material: "MP-CARTON", stage: "ASSEMBLAGE", qtyPerUnit: 0.25 },
      { material: "MP-CAP-OVAL", stage: "ASSEMBLAGE", qtyPerUnit: 8 },
      { material: "MP-SABOT", stage: "ASSEMBLAGE", qtyPerUnit: 4 },
    ],
  },
];

export const PRODUCT_BY_CODE: Record<string, ProductDef> = PRODUCTS.reduce(
  (accumulator, product) => {
    accumulator[product.code] = product;
    return accumulator;
  },
  {} as Record<string, ProductDef>,
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Stock maths is decimal-sensitive; keep balances tidy. */
export function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const quantityFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
});

export function formatQty(value: number): string {
  return quantityFormatter.format(round(value));
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

