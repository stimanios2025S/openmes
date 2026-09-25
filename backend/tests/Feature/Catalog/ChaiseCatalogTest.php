<?php

namespace Tests\Feature\Catalog;

use App\Models\Batch;
use App\Models\Line;
use App\Models\Material;
use App\Models\ProcessTemplate;
use App\Models\ProductType;
use App\Models\StockMovement;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseStock;
use App\Models\WorkOrder;
use App\Scopes\TenantScope;
use App\Services\Production\InterFactoryHandoffService;
use App\Services\WorkOrder\BatchService;
use App\Services\WorkOrder\WorkOrderService;
use App\Support\ProductCatalog;
use App\Support\TenantContext;
use Database\Seeders\ChaiseCatalogSeeder;
use Database\Seeders\DualFactorySeeder;
use Database\Seeders\MaterialTypesSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The closed two-chair catalogue (Chaise CANADA / Chaise G21): what each factory
 * may order, what each chair's BOM is made of, and where completing a job takes
 * the material from.
 *
 * The seeders run for real rather than being stubbed. The BOM quantities, the
 * materials and the depots they sit in are the deliverable itself — a drifting
 * seeder has to fail these tests, not quietly produce a plant that cannot build
 * a chair or a deduction that lands in the wrong factory's store.
 */
class ChaiseCatalogTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $admedco;

    private Tenant $mobilix;

    private User $operator;

    protected function setUp(): void
    {
        parent::setUp();

        Role::findOrCreate('Operator', 'web');

        $this->seed(MaterialTypesSeeder::class);
        $this->seed(DualFactorySeeder::class);
        $this->seed(ChaiseCatalogSeeder::class);

        $this->admedco = Tenant::findByCode(Tenant::CODE_ADMEDCO);
        $this->mobilix = Tenant::findByCode(Tenant::CODE_MOBILIX);
        $this->operator = User::factory()->create(['tenant_id' => $this->admedco->id]);
    }

    // ── the catalogue ─────────────────────────────────────────────────────────

    public function test_both_factories_own_both_chairs_and_nothing_else(): void
    {
        foreach ([$this->admedco, $this->mobilix] as $factory) {
            $catalogue = $this->inFactory($factory, fn () => ProductType::orderable()->orderBy('code')->pluck('code')->all());

            $this->assertSame(ProductCatalog::codes(), $catalogue);
        }
    }

    public function test_a_legacy_product_is_retired_so_it_can_no_longer_be_ordered(): void
    {
        $legacy = $this->inFactory($this->admedco, fn () => ProductType::create([
            'code' => 'LEGACY-01',
            'name' => 'Legacy chair',
            'is_active' => true,
        ]));

        // Still active at this point — the seeder is what retires it, the same
        // way a re-run (every container start) retires a product imported since.
        $this->assertTrue($legacy->is_active);

        $this->seed(ChaiseCatalogSeeder::class);

        $this->assertFalse($legacy->fresh()->is_active);
        $this->assertNotContains('LEGACY-01', $this->inFactory(
            $this->admedco,
            fn () => ProductType::orderable()->pluck('code')->all(),
        ));

        // Retired, not deleted: history and BOMs keep resolving the row.
        $this->assertDatabaseHas('product_types', ['id' => $legacy->id, 'deleted_at' => null]);
    }

    public function test_the_order_form_offers_only_the_two_chairs(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $supervisor = User::factory()->create(['tenant_id' => $this->admedco->id]);
        $supervisor->assignRole('Supervisor');

        $response = $this->actingAs($supervisor)->get('/supervisor/work-orders/create');

        $response->assertOk();
        $productTypes = collect($response->viewData('page')['props']['productTypes']);

        $this->assertSame(['Chaise CANADA', 'Chaise G21'], $productTypes->pluck('name')->sort()->values()->all());
    }

    // ── the recipes ───────────────────────────────────────────────────────────

    public function test_each_chair_carries_its_own_bom_in_each_factory(): void
    {
        // CANADA: armrests, 6 oval caps, 12 threaded inserts. G21: no armrests,
        // 8 oval caps, 8 threaded inserts. Both: 4 sabots, 1/4 carton per chair,
        // and one painted ADMEDCO chassis fed in at final assembly.
        // (Key order is the material code's — bomOf() sorts.)
        $expected = [
            Tenant::CODE_ADMEDCO => [
                ProductCatalog::CHAISE_CANADA => [
                    'MP-ACCOUDOIR' => '2.0000',
                    'MP-DISQUE-MEULAGE' => '0.0500',
                    'MP-FIL-SOUDURE' => '0.0800',
                    'MP-PEINTURE-POUDRE' => '0.1200',
                    'MP-TUBE-ACIER' => '2.4000',
                ],
                ProductCatalog::CHAISE_G21 => [
                    'MP-DISQUE-MEULAGE' => '0.0500',
                    'MP-FIL-SOUDURE' => '0.0800',
                    'MP-PEINTURE-POUDRE' => '0.1200',
                    'MP-TUBE-ACIER' => '2.4000',
                ],
            ],
            Tenant::CODE_MOBILIX => [
                ProductCatalog::CHAISE_CANADA => [
                    'MB-CACHE-OVALE' => '6.0000',
                    'MB-CARTON' => '0.2500',
                    'MB-ETIQUETTE' => '1.0000',
                    'MB-INSERT-M6' => '12.0000',
                    'MB-MOUSSE-D20' => '0.9000',
                    'MB-MOUSSE-D22' => '0.3000',
                    'MB-PANNEAU-CTP' => '0.0588',
                    'MB-PANNEAU-MDF' => '0.0588',
                    'MB-POLYBAND' => '0.5000',
                    'MB-SABOT' => '4.0000',
                    'MB-TISSU-SKAI' => '1.2000',
                    'MB-VIS-6X15' => '8.0000',
                    'MB-ZIP' => '1.2000',
                    'SF-CHASSIS-PEINT' => '1.0000',
                ],
                ProductCatalog::CHAISE_G21 => [
                    'MB-CACHE-OVALE' => '8.0000',
                    'MB-CARTON' => '0.2500',
                    'MB-ETIQUETTE' => '1.0000',
                    'MB-INSERT-M6' => '8.0000',
                    'MB-MOUSSE-D20' => '0.9000',
                    'MB-MOUSSE-D22' => '0.3000',
                    'MB-PANNEAU-CTP' => '0.0588',
                    'MB-PANNEAU-MDF' => '0.0588',
                    'MB-POLYBAND' => '0.5000',
                    'MB-SABOT' => '4.0000',
                    'MB-TISSU-SKAI' => '1.2000',
                    'MB-VIS-6X15' => '8.0000',
                    'MB-ZIP' => '1.2000',
                    'SF-CHASSIS-PEINT' => '1.0000',
                ],
            ],
        ];

        foreach ($expected as $factoryCode => $products) {
            $factory = Tenant::findByCode($factoryCode);

            foreach ($products as $productCode => $recipe) {
                $bom = $this->bomOf($factory, $productCode);

                $this->assertSame($recipe, $bom, "{$factoryCode} {$productCode} recipe drifted");
            }
        }
    }

    public function test_each_route_walks_its_factorys_stages_in_the_physical_order(): void
    {
        // The sequence the specification calls for, stage by stage. The template's
        // step order is the route: this is what the shop floor and the Kanban see.
        $expected = [
            Tenant::CODE_ADMEDCO => [
                'COUPE', 'USINAGE', 'SOUDAGE', 'MEULAGE', 'VISSAGE', 'POUDRAGE',
            ],
            Tenant::CODE_MOBILIX => [
                'DECOUPE-BOIS', 'COUTURE', 'TAPISSAGE', 'ASSEMBLAGE',
            ],
        ];

        foreach ($expected as $factoryCode => $stages) {
            $factory = Tenant::findByCode($factoryCode);

            foreach (ProductCatalog::codes() as $productCode) {
                $this->assertSame(
                    $stages,
                    $this->stepsOf($factory, $productCode),
                    "{$factoryCode} {$productCode} does not follow its stage sequence",
                );
            }
        }
    }

    public function test_the_metal_route_stops_at_the_metal_materials_and_the_wood_route_at_its_own(): void
    {
        // No factory's BOM may name a material the other one stocks: that is what
        // would send a deduction to the wrong depot, since a BOM row resolves the
        // material inside the tenant that owns the template.
        $metalMaterials = Material::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $this->admedco->id)->pluck('id')->all();
        $woodMaterials = Material::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $this->mobilix->id)->pluck('id')->all();

        $this->assertEmpty(array_intersect($metalMaterials, $woodMaterials));

        foreach ([ProductCatalog::CHAISE_CANADA, ProductCatalog::CHAISE_G21] as $productCode) {
            foreach ([$this->admedco, $this->mobilix] as $factory) {
                $materialIds = $this->inFactory($factory, fn () => ProcessTemplate::where('product_type_id', $this->productOf($factory, $productCode)->id)
                    ->firstOrFail()
                    ->bomItems()
                    ->pluck('material_id')
                    ->all());

                $allowed = $factory->id === $this->admedco->id ? $metalMaterials : $woodMaterials;

                $this->assertEmpty(array_diff($materialIds, $allowed));
            }
        }
    }

    // ── deduction ─────────────────────────────────────────────────────────────

    public function test_completing_an_admedco_order_deducts_from_dep_mp_and_leaves_mobilix_stock_alone(): void
    {
        $woodBefore = $this->woodBalances();

        // Booked on the cutting stage: the metal route, run somewhere other than
        // the coating station that releases the chassis buffer (asserted below).
        $this->runBatch($this->admedco, 'COUPE', ProductCatalog::CHAISE_CANADA, 40);

        $depot = $this->rawDepot($this->admedco);
        $this->assertSame('DEP-MP', $depot->code);

        // 40 chairs: 2.4 m of tube, 2 armrests, 0.08 kg of wire, one grinding
        // disc pass and 0.12 kg of powder each.
        $this->assertEqualsWithDelta(2500 - 96, $this->balance($depot, $this->admedco, 'MP-TUBE-ACIER'), 0.001);
        $this->assertEqualsWithDelta(800 - 80, $this->balance($depot, $this->admedco, 'MP-ACCOUDOIR'), 0.001);
        $this->assertEqualsWithDelta(120 - 3.2, $this->balance($depot, $this->admedco, 'MP-FIL-SOUDURE'), 0.001);
        $this->assertEqualsWithDelta(200 - 2, $this->balance($depot, $this->admedco, 'MP-DISQUE-MEULAGE'), 0.001);
        $this->assertEqualsWithDelta(150 - 40 * 0.12, $this->balance($depot, $this->admedco, 'MP-PEINTURE-POUDRE'), 0.001);

        // The other factory's depot was not touched by any of it.
        $this->assertSame($woodBefore, $this->woodBalances());
    }

    public function test_completing_a_mobilix_order_deducts_from_dep_mp_mbx_and_leaves_admedco_stock_alone(): void
    {
        // The wood side cannot assemble what the metal side has not coated: the
        // ADMEDCO batch below is what puts chassis in MOBILIX's store.
        $this->runBatch($this->admedco, 'POUDRAGE', ProductCatalog::CHAISE_G21, 40);

        $metalBefore = $this->metalBalances();

        // G21: 8 threaded inserts and 8 oval caps per chair, not CANADA's 12 and 6.
        $this->runBatch($this->mobilix, 'ASSEMBLAGE', ProductCatalog::CHAISE_G21, 40);

        $depot = $this->rawDepot($this->mobilix);
        $this->assertSame('DEP-MP-MBX', $depot->code);

        $this->assertEqualsWithDelta(6000 - 320, $this->balance($depot, $this->mobilix, 'MB-INSERT-M6'), 0.001);
        $this->assertEqualsWithDelta(4000 - 320, $this->balance($depot, $this->mobilix, 'MB-VIS-6X15'), 0.001);
        $this->assertEqualsWithDelta(4000 - 320, $this->balance($depot, $this->mobilix, 'MB-CACHE-OVALE'), 0.001);
        $this->assertEqualsWithDelta(2000 - 160, $this->balance($depot, $this->mobilix, 'MB-SABOT'), 0.001);
        $this->assertEqualsWithDelta(300 - 36, $this->balance($depot, $this->mobilix, 'MB-MOUSSE-D20'), 0.001);
        $this->assertEqualsWithDelta(200 - 2.352, $this->balance($depot, $this->mobilix, 'MB-PANNEAU-MDF'), 0.01);
        // 1/17 of a panel set per chair, and one carton per four chairs.
        $this->assertEqualsWithDelta(500 - 10, $this->balance($depot, $this->mobilix, 'MB-CARTON'), 0.001);

        $this->assertSame($metalBefore, $this->metalBalances());
    }

    // ── the hand-off ──────────────────────────────────────────────────────────

    public function test_completing_poudrage_hands_the_painted_chassis_to_mobilix(): void
    {
        $depot = $this->rawDepot($this->mobilix);

        // Nothing to assemble from until the coating station runs.
        $this->assertSame(0.0, $this->balance($depot, $this->mobilix, InterFactoryHandoffService::MATERIAL_CODE));

        $this->runBatch($this->admedco, 'COUPE', ProductCatalog::CHAISE_CANADA, 10);

        // Right factory, wrong station: cutting tube produces no chassis.
        $this->assertSame(0.0, $this->balance($depot, $this->mobilix, InterFactoryHandoffService::MATERIAL_CODE));

        $this->runBatch($this->admedco, 'POUDRAGE', ProductCatalog::CHAISE_CANADA, 40);

        // 40 coated chassis, in MOBILIX's own raw store and on its plant-wide
        // balance, ready for the assembly stage that consumes one per chair.
        $this->assertEqualsWithDelta(40, $this->balance($depot, $this->mobilix, InterFactoryHandoffService::MATERIAL_CODE), 0.001);

        $materialId = Material::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $this->mobilix->id)
            ->where('code', InterFactoryHandoffService::MATERIAL_CODE)
            ->value('id');

        $this->assertEqualsWithDelta(40, (float) Material::withoutGlobalScope(TenantScope::class)
            ->where('id', $materialId)->value('stock_quantity'), 0.001);

        // The ledger names the step it came from, so the buffer is auditable.
        $this->assertDatabaseHas('stock_movements', [
            'material_id' => $materialId,
            'warehouse_id' => $depot->id,
            'movement_type' => StockMovement::TYPE_TRANSFER,
            'source_type' => StockMovement::SOURCE_BATCH_STEP,
        ]);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * A work order booked on one of the factory's own ateliers, run to the end:
     * every step started and completed, which is what triggers end-of-batch
     * consumption. Returns nothing — the assertions read the depots.
     */
    private function runBatch(Tenant $factory, string $lineCode, string $productCode, float $qty): void
    {
        $operator = User::factory()->create(['tenant_id' => $factory->id]);

        $batch = $this->inFactory($factory, function () use ($factory, $lineCode, $productCode, $qty) {
            $line = Line::where('code', $lineCode)->firstOrFail();
            $template = ProcessTemplate::where('product_type_id', $this->productOf($factory, $productCode)->id)
                ->where('is_active', true)
                ->firstOrFail();

            $workOrder = WorkOrder::factory()->create([
                'tenant_id' => $factory->id,
                'line_id' => $line->id,
                'product_type_id' => $template->product_type_id,
                'planned_qty' => $qty,
                'process_snapshot' => $template->load('steps')->toSnapshot(),
            ]);

            return app(WorkOrderService::class)->createBatch($workOrder, $qty);
        });

        $service = app(BatchService::class);

        $this->inFactory($factory, function () use ($batch, $service, $operator) {
            foreach ($batch->steps()->orderBy('step_number')->get() as $step) {
                $service->startStep($step->fresh(), $operator);
                $service->completeStep($step->fresh(), $operator);
            }
        });

        $this->assertSame(Batch::STATUS_DONE, $batch->fresh()->status);
    }

    /** Run a callback with the tenant scope pointed at one factory. */
    private function inFactory(Tenant $factory, callable $callback): mixed
    {
        $context = app(TenantContext::class);
        $context->set($factory->id);

        try {
            return $callback();
        } finally {
            $context->clear();
        }
    }

    private function productOf(Tenant $factory, string $code): ProductType
    {
        return ProductType::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $factory->id)
            ->where('code', $code)
            ->firstOrFail();
    }

    /** The atelier of each step, in route order — the stage sequence. */
    private function stepsOf(Tenant $factory, string $productCode): array
    {
        return $this->inFactory($factory, function () use ($factory, $productCode) {
            $template = ProcessTemplate::where('product_type_id', $this->productOf($factory, $productCode)->id)->firstOrFail();

            // Step names are stored as "STAGE - what happens at it".
            return $template->steps()
                ->orderBy('step_number')
                ->pluck('name')
                ->map(fn (string $name) => explode(' - ', $name)[0])
                ->all();
        });
    }

    /** The template's recipe as material code => quantity per unit. */
    private function bomOf(Tenant $factory, string $productCode): array
    {
        return $this->inFactory($factory, function () use ($factory, $productCode) {
            $template = ProcessTemplate::where('product_type_id', $this->productOf($factory, $productCode)->id)->firstOrFail();

            return $template->bomItems()
                ->with('material')
                ->get()
                ->mapWithKeys(fn ($item) => [$item->material->code => (string) $item->quantity_per_unit])
                ->sortKeys()
                ->all();
        });
    }

    private function rawDepot(Tenant $factory): Warehouse
    {
        return Warehouse::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $factory->id)
            ->where('kind', Warehouse::KIND_RAW_MATERIAL)
            ->firstOrFail();
    }

    private function balance(Warehouse $depot, Tenant $factory, string $materialCode): float
    {
        $materialId = Material::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $factory->id)
            ->where('code', $materialCode)
            ->value('id');

        $quantity = WarehouseStock::withoutGlobalScope(TenantScope::class)
            ->where('warehouse_id', $depot->id)
            ->where('material_id', $materialId)
            ->value('quantity');

        return $quantity === null ? 0.0 : (float) $quantity;
    }

    /** Every balance in MOBILIX's raw depot, for "the other factory did not move". */
    private function woodBalances(): array
    {
        return $this->balancesIn($this->rawDepot($this->mobilix));
    }

    /** Every balance in ADMEDCO's raw depot. */
    private function metalBalances(): array
    {
        return $this->balancesIn($this->rawDepot($this->admedco));
    }

    private function balancesIn(Warehouse $depot): array
    {
        return WarehouseStock::withoutGlobalScope(TenantScope::class)
            ->where('warehouse_id', $depot->id)
            ->orderBy('material_id')
            ->pluck('quantity', 'material_id')
            ->map(fn ($quantity) => (float) $quantity)
            ->all();
    }
}
