<?php

namespace Database\Seeders;

use App\Models\BomItem;
use App\Models\Line;
use App\Models\Material;
use App\Models\MaterialType;
use App\Models\ProcessTemplate;
use App\Models\ProductType;
use App\Models\TemplateStep;
use App\Models\Tenant;
use App\Models\Warehouse;
use App\Models\WarehouseStock;
use App\Models\Workstation;
use App\Scopes\TenantScope;
use App\Services\Warehouse\WarehouseStockService;
use App\Support\ProductCatalog;
use App\Support\TenantContext;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * The closed product catalogue and its BOMs: two chairs, one route per factory.
 *
 * Chaise CANADA (PRD-CAN-01) and Chaise G21 (PRD-G21-01) are the only products
 * that can be ordered (see App\Support\ProductCatalog). Each is built through two
 * factories, so each factory owns a product row, a process template and a BOM for
 * both chairs — and each BOM lists only that factory's own materials, which is
 * what keeps the deduction on the right depot:
 *
 *  - ADMEDCO (A1-A3, materials in DEP-MP): tube and profiles, armrests (CANADA
 *    only), oval caps, sabots, welding wire, grinding discs, powder coating.
 *  - MOBILIX (M1-M2 + packaging, materials in DEP-MP-MBX): MDF and multiplex
 *    panels, threaded inserts, assembly screws, fabric/Skaï, D20 and D22 foam,
 *    zips, brand labels, polyband filters, shipping cartons.
 *
 * Nothing here has to name a depot: a work order carries a line, the line points
 * at its factory's raw-material store (DualFactorySeeder), and
 * ConsumptionLocationService deducts there. The BOMs and the depots line up
 * because the materials were put in the right factory, not because a step says
 * where to take them from.
 *
 * Per-chair quantities come from the customer's product sheet; the ones it does
 * not state (tube length, foam, fabric, screws per chair) are working values —
 * they are the BOM, editable in Admin → BOM like any other recipe.
 *
 * Idempotent — DatabaseSeeder runs this on every container start. It creates the
 * two products' rows and opening stock once and never touches a live balance.
 */
class ChaiseCatalogSeeder extends Seeder
{
    /**
     * Metal side — ADMEDCO, stocked in DEP-MP.
     *
     * code => [name, material type, unit of measure, opening stock]
     */
    private const METAL_MATERIALS = [
        'MP-TUBE-ACIER' => ['Steel tube Ø25 x 1.5 mm (frame)', 'raw_material', 'm', 2500],
        'MP-ACCOUDOIR' => ['Armrests (Chaise CANADA)', 'raw_material', 'pcs', 800],
        'MP-CACHE-OVALE' => ['Oval caps (plug for the insert holes)', 'raw_material', 'pcs', 4000],
        'MP-SABOT' => ['Rubber sabots (floor glides)', 'raw_material', 'pcs', 2000],
        'MP-FIL-SOUDURE' => ['Welding wire', 'raw_material', 'kg', 120],
        'MP-DISQUE-MEULAGE' => ['Grinding discs', 'auxiliary', 'pcs', 200],
        'MP-PEINTURE-POUDRE' => ['Powder coating paint', 'raw_material', 'kg', 150],
    ];

    /**
     * Wood and upholstery side — MOBILIX, stocked in DEP-MP-MBX.
     *
     * code => [name, material type, unit of measure, opening stock]
     */
    private const WOOD_MATERIALS = [
        'MB-PANNEAU-MDF' => ['MDF panel (wood kit — 17 chairs per panel set)', 'raw_material', 'pcs', 200],
        'MB-PANNEAU-CTP' => ['Plywood / multiplex panel (wood kit — 17 chairs per panel set)', 'raw_material', 'pcs', 200],
        'MB-INSERT-M6' => ['Threaded insert M6 x 15 mm', 'raw_material', 'pcs', 6000],
        'MB-VIS-6X15' => ['Assembly screw 6 x 15 mm', 'raw_material', 'pcs', 4000],
        'MB-TISSU-SKAI' => ['Fabric / Skaï (375 x 140 cm roll)', 'raw_material', 'm', 400],
        'MB-MOUSSE-D20' => ['Foam D20 4 cm (seat and back)', 'raw_material', 'm²', 300],
        'MB-MOUSSE-D22' => ['Foam D22 1.5 cm (side soufflets)', 'raw_material', 'm²', 150],
        'MB-ZIP' => ['Zip fastener', 'raw_material', 'm', 300],
        'MB-ETIQUETTE' => ['Brand label', 'packaging', 'pcs', 3000],
        'MB-POLYBAND' => ['Polyband filter', 'auxiliary', 'm', 200],
        'MB-CARTON' => ['Shipping carton (4 chairs)', 'packaging', 'pcs', 500],
    ];

    /**
     * The products, in the customer's own naming — "Chaise CANADA" and
     * "Chaise G21" are what the shop floor and the ERP call them.
     */
    private const PRODUCTS = [
        ProductCatalog::CHAISE_CANADA => [
            'name' => 'Chaise CANADA',
            'description' => 'Metal chassis with armrests — ADMEDCO route (A1-A3), wood and upholstery MOBILIX (M1-M2).',
        ],
        ProductCatalog::CHAISE_G21 => [
            'name' => 'Chaise G21',
            'description' => 'Standard metal chassis, no armrests — ADMEDCO route (A1-A3), wood and upholstery MOBILIX (M1-M2).',
        ],
    ];

    /**
     * Each factory's route per chair: ordered steps and what each one consumes.
     *
     * A BOM row is [material code, quantity per chair, consumed_at]. `start` rows
     * are taken when the batch starts, `during` rows when their own step is
     * allocated, `end` rows when the batch ends — MaterialAllocationService reads
     * exactly that out of the work order's process snapshot.
     */
    private const ROUTES = [
        Tenant::CODE_ADMEDCO => [
            ProductCatalog::CHAISE_CANADA => [
                ['atelier' => 'A1', 'name' => 'Frame cutting and forming', 'minutes' => 2, 'bom' => [
                    ['MP-TUBE-ACIER', '2.4000', 'start'],
                ]],
                ['atelier' => 'A2', 'name' => 'Welding and assembly (with armrests)', 'minutes' => 6, 'bom' => [
                    ['MP-ACCOUDOIR', '2.0000', 'during'],
                    ['MP-CACHE-OVALE', '6.0000', 'during'],
                    ['MP-SABOT', '4.0000', 'during'],
                    ['MP-FIL-SOUDURE', '0.0800', 'during'],
                    ['MP-DISQUE-MEULAGE', '0.0500', 'during'],
                ]],
                ['atelier' => 'A3', 'name' => 'Powder coating', 'minutes' => 3, 'bom' => [
                    ['MP-PEINTURE-POUDRE', '0.1200', 'during'],
                ]],
            ],
            ProductCatalog::CHAISE_G21 => [
                ['atelier' => 'A1', 'name' => 'Frame cutting and forming', 'minutes' => 2, 'bom' => [
                    ['MP-TUBE-ACIER', '2.4000', 'start'],
                ]],
                ['atelier' => 'A2', 'name' => 'Welding and assembly (standard chassis)', 'minutes' => 5, 'bom' => [
                    ['MP-CACHE-OVALE', '8.0000', 'during'],
                    ['MP-SABOT', '4.0000', 'during'],
                    ['MP-FIL-SOUDURE', '0.0800', 'during'],
                    ['MP-DISQUE-MEULAGE', '0.0500', 'during'],
                ]],
                ['atelier' => 'A3', 'name' => 'Powder coating', 'minutes' => 3, 'bom' => [
                    ['MP-PEINTURE-POUDRE', '0.1200', 'during'],
                ]],
            ],
        ],
        Tenant::CODE_MOBILIX => [
            ProductCatalog::CHAISE_CANADA => [
                ['atelier' => 'M1', 'name' => 'Wood and foam cutting', 'minutes' => 3, 'bom' => [
                    // One MDF panel + one multiplex panel make 17 chair kits:
                    // 1 / 17 = 0.0588 of each sheet per chair.
                    ['MB-PANNEAU-MDF', '0.0588', 'start'],
                    ['MB-PANNEAU-CTP', '0.0588', 'start'],
                    ['MB-MOUSSE-D20', '0.9000', 'start'],
                    ['MB-MOUSSE-D22', '0.3000', 'start'],
                ]],
                ['atelier' => 'M2', 'name' => 'Upholstery and assembly (with armrests)', 'minutes' => 8, 'bom' => [
                    ['MB-INSERT-M6', '12.0000', 'during'],
                    ['MB-VIS-6X15', '8.0000', 'during'],
                    ['MB-TISSU-SKAI', '1.2000', 'during'],
                    ['MB-ZIP', '1.2000', 'during'],
                    ['MB-ETIQUETTE', '1.0000', 'during'],
                    ['MB-POLYBAND', '0.5000', 'during'],
                ]],
                ['atelier' => 'M2', 'name' => 'Packaging (4 chairs per carton)', 'minutes' => 1, 'bom' => [
                    // One carton per four chairs: a quarter of a carton per chair.
                    ['MB-CARTON', '0.2500', 'end'],
                ]],
            ],
            ProductCatalog::CHAISE_G21 => [
                ['atelier' => 'M1', 'name' => 'Wood and foam cutting', 'minutes' => 3, 'bom' => [
                    ['MB-PANNEAU-MDF', '0.0588', 'start'],
                    ['MB-PANNEAU-CTP', '0.0588', 'start'],
                    ['MB-MOUSSE-D20', '0.9000', 'start'],
                    ['MB-MOUSSE-D22', '0.3000', 'start'],
                ]],
                ['atelier' => 'M2', 'name' => 'Upholstery and assembly (standard chassis)', 'minutes' => 7, 'bom' => [
                    ['MB-INSERT-M6', '8.0000', 'during'],
                    ['MB-VIS-6X15', '8.0000', 'during'],
                    ['MB-TISSU-SKAI', '1.2000', 'during'],
                    ['MB-ZIP', '1.2000', 'during'],
                    ['MB-ETIQUETTE', '1.0000', 'during'],
                    ['MB-POLYBAND', '0.5000', 'during'],
                ]],
                ['atelier' => 'M2', 'name' => 'Packaging (4 chairs per carton)', 'minutes' => 1, 'bom' => [
                    ['MB-CARTON', '0.2500', 'end'],
                ]],
            ],
        ],
    ];

    public function run(): void
    {
        $context = app(TenantContext::class);

        foreach ([Tenant::CODE_ADMEDCO, Tenant::CODE_MOBILIX] as $code) {
            $tenant = Tenant::findByCode($code);
            $depot = $tenant ? $this->rawDepot($tenant) : null;

            if (! $tenant || ! $depot) {
                // DualFactorySeeder runs immediately before this one and creates
                // both. Reaching here means the factories are not there, and a
                // catalogue pointing at no depot would deduct nothing.
                throw new RuntimeException("Chaise catalogue needs the {$code} factory and its raw-material depot — run DualFactorySeeder first.");
            }

            // Scopes and the creating hook resolve the tenant from this context
            // (a seeder has no authenticated user), so every row written below is
            // stamped with — and looked up in — the factory being seeded.
            $context->set($tenant->id);

            try {
                $this->workstations($tenant);
                $materials = $this->materials($tenant, $depot);
                $this->products($tenant, $materials);
                $this->retireEverythingElse($tenant);
            } finally {
                $context->clear();
            }
        }
    }

    /** The factory's raw-material store — where its BOM deducts from. */
    private function rawDepot(Tenant $tenant): ?Warehouse
    {
        return Warehouse::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('kind', Warehouse::KIND_RAW_MATERIAL)
            ->orderByDesc('is_default')
            ->first();
    }

    /**
     * One station per atelier, so a factory portal has somewhere to run a step.
     *
     * Steps deliberately name no station: the atelier is the resource, and pinning
     * a step to one machine would make the routing guard refuse every other one.
     */
    private function workstations(Tenant $tenant): void
    {
        $lines = Line::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('is_active', true)
            ->get();

        foreach ($lines as $line) {
            Workstation::updateOrCreate(
                ['code' => $line->code.'-WS'],
                ['line_id' => $line->id, 'name' => 'Workstation '.$line->code, 'is_active' => true],
            );
        }
    }

    /**
     * The factory's own materials, with an opening balance in its own depot.
     *
     * @return array<string, Material> keyed by material code
     */
    private function materials(Tenant $tenant, Warehouse $depot): array
    {
        $specs = $tenant->code === Tenant::CODE_MOBILIX ? self::WOOD_MATERIALS : self::METAL_MATERIALS;
        $types = MaterialType::pluck('id', 'code');
        $materials = [];

        foreach ($specs as $code => [$name, $type, $unit, $stock]) {
            $material = Material::withTrashed()
                ->withoutGlobalScope(TenantScope::class)
                ->where('tenant_id', $tenant->id)
                ->where('code', $code)
                ->first();

            $attributes = [
                'name' => $name,
                'material_type_id' => $types[$type] ?? throw new RuntimeException("Material type '{$type}' is missing — run MaterialTypesSeeder first."),
                'unit_of_measure' => $unit,
                'is_active' => true,
            ];

            if ($material) {
                if ($material->trashed()) {
                    $material->restore();
                }

                // Name, type and unit are the seeder's to correct on every boot;
                // the quantities are not.
                $material->fill($attributes)->save();
            } else {
                $material = Material::create([
                    ...$attributes,
                    'tenant_id' => $tenant->id,
                    'code' => $code,
                    // Plant-wide opening balance, so a freshly installed plant can
                    // run a batch without a stock-taking step first. Written on
                    // creation only — a seeder has no business resetting the stock
                    // of a plant that is already running.
                    'stock_quantity' => $stock,
                    'min_stock_level' => 0,
                ]);
            }

            // The depot balance exists exactly once: a slot that has been emptied
            // still has its row, so its presence — not its quantity — is what says
            // "opening stock already booked".
            $this->openStock($depot, $material, $stock, $unit);
            $materials[$code] = $material;
        }

        return $materials;
    }

    /** Book the opening balance into the depot, once. */
    private function openStock(Warehouse $depot, Material $material, float $stock, string $unit): void
    {
        $slot = [
            'warehouse_id' => $depot->id,
            'material_id' => $material->id,
            'product_type_id' => null,
            'material_lot_id' => null,
        ];

        $exists = WarehouseStock::withoutGlobalScope(TenantScope::class)
            ->where($slot)
            ->exists();

        if ($exists) {
            return;
        }

        app(WarehouseStockService::class)->adjust($slot, $stock, $unit);
    }

    /**
     * The two chairs, per factory: the product row, its route and its BOM.
     *
     * @param  array<string, Material>  $materials
     */
    private function products(Tenant $tenant, array $materials): void
    {
        foreach (self::PRODUCTS as $code => $product) {
            $productType = ProductType::withoutGlobalScope(TenantScope::class)->updateOrCreate(
                ['tenant_id' => $tenant->id, 'code' => $code],
                [
                    'name' => $product['name'],
                    'description' => $product['description'],
                    'unit_of_measure' => 'pcs',
                    'is_active' => true,
                ],
            );

            $template = ProcessTemplate::withoutGlobalScope(TenantScope::class)->updateOrCreate(
                ['tenant_id' => $tenant->id, 'product_type_id' => $productType->id, 'version' => 1],
                ['name' => $product['name'].' — '.$tenant->name.' route', 'is_active' => true],
            );

            foreach (self::ROUTES[$tenant->code][$code] as $index => $step) {
                $templateStep = TemplateStep::updateOrCreate(
                    ['process_template_id' => $template->id, 'step_number' => $index + 1],
                    [
                        'name' => $step['atelier'].' - '.$step['name'],
                        'estimated_duration_minutes' => $step['minutes'],
                        'required_operators' => 1,
                    ],
                );

                foreach ($step['bom'] as $order => [$materialCode, $quantity, $consumedAt]) {
                    // keyed on the material: a template lists each one once
                    // (bom_items is unique on process_template_id + material_id).
                    BomItem::updateOrCreate(
                        [
                            'process_template_id' => $template->id,
                            'material_id' => $materials[$materialCode]->id,
                        ],
                        [
                            'template_step_id' => $templateStep->id,
                            'quantity_per_unit' => $quantity,
                            'consumed_at' => $consumedAt,
                            'sort_order' => $order,
                        ],
                    );
                }
            }
        }
    }

    /**
     * Everything else in this factory's catalogue stops being orderable.
     *
     * The rows are left alone — BOMs, revisions, work-order history and reports
     * keep resolving — only the flag the order form and the ERP inject endpoint
     * read is cleared.
     */
    private function retireEverythingElse(Tenant $tenant): void
    {
        ProductType::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('is_active', true)
            ->whereNotIn('code', ProductCatalog::codes())
            ->update(['is_active' => false]);
    }
}
