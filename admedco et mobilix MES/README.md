# ADMEDCO & MOBILIX — Production Management System

A standalone, dual-factory MES. **Zero Docker, zero PostgreSQL, zero Caddy** — a plain
Next.js app with a SQLite file on disk.

- **ADMEDCO** — Metal Fabrication Division: `COUPE → USINAGE → SOUDAGE → MEULAGE → VISSAGE → POUDRAGE`
- **MOBILIX** — Wood & Upholstery Division: `DECOUPE-BOIS → COUTURE → TAPISSAGE → ASSEMBLAGE`

## Quick start

```bash
cd "admedco et mobilix MES"
npm install
npm run setup      # prisma generate + create the SQLite file + seed
npm run dev        # http://localhost:3000
```

`npm run setup` is idempotent enough for a fresh clone. To wipe and rebuild the plant:

```bash
npm run db:reset
```

## What it does

**Restricted catalogue — two products, nothing else.**

| Code | Product | Chassis | M6 inserts | Oval caps | Sabots |
|---|---|---|---|---|---|
| `PRD-CAN-01` | Chaise CANADA | Metal chassis **with armrests** | 12 | 6 | 4 |
| `PRD-G21-01` | Chaise G21 | Standard metal chassis | 8 | 8 | 4 |

**Administrator-only dashboard** (`/`) — create work orders for either chair, watch plant-wide
KPIs, and see the inter-factory buffer at a glance.

**Workstation kanban boards** — `/portal/admedco` shows six metal columns, `/portal/mobilix` shows four wood
and upholstery columns. The top-nav division switcher flips between them. A batch appears on
the ADMEDCO board while it stands in a metal stage and moves to the MOBILIX board the moment it
is handed over.

**Inter-factory stock hand-off** — completing `POUDRAGE` books the painted chassis into MOBILIX's
raw-material store as the semi-finished item `SF-CHASSIS-PEINT` (a `TRANSFER_IN` row in the
ledger). MOBILIX's `ASSEMBLAGE` step consumes one chassis per chair, so the wood side cannot
build a chair the metal side has not coated.

**Automated inventory deduction** — finishing any stage deducts that stage's BOM lines from the
owning factory's store: ADMEDCO draws on `DEP-MP`, MOBILIX on `DEP-MP-MBX`. A shortage blocks the
stage with a message naming the material and the shortfall, rather than driving stock negative.

## Stores

| Depot | Factory | Holds |
|---|---|---|
| `DEP-MP` | ADMEDCO | Tube, plate, welding wire, discs, screws, armrest brackets, coating powder |
| `DEP-MP-MBX` | MOBILIX | Plywood, foam, fabric, thread, staples, inserts, caps, sabots, painted chassis |

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), React server components |
| Styling | Tailwind CSS v4 |
| Database | SQLite via Prisma |
| Writes | React server actions (`lib/actions.ts`) |

## Layout

```
prisma/schema.prisma   data model
prisma/seed.ts         baseline stock, the two BOMs, sample work orders
lib/domain.ts          single source of truth: divisions, stages, materials, BOMs, hand-off rule
lib/engine.ts          the production engine: deduct, hand off, advance the batch
lib/actions.ts         server actions wrapping the engine
app/                   dashboard, the two kanban boards, inventory
components/            nav, boards, order form, stock tables
```

`lib/domain.ts` is the one file to edit to change the catalogue or a bill of materials — the
seeder and the runtime engine both read it, so they cannot drift apart.

## Environment

`.env` holds a single setting:

```
DATABASE_URL="file:./dev.db"
```

The database file is created at `prisma/dev.db` and is git-ignored.

## Accounts and access

Sign in at `/login` with password `Password123!` and one of: `admin@factory.com` (both portals and orders), `admedco@factory.com` (ADMEDCO only), `mobilix@factory.com` (MOBILIX only). Change these demonstration credentials before exposing the app beyond localhost.

The JSON API provides authenticated `GET/POST /api/orders` and `POST /api/orders/{id}/advance`. Operator reads and stage writes are confined to their own division; only administrators create orders.
