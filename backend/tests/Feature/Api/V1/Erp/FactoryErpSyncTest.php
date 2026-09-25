<?php

namespace Tests\Feature\Api\V1\Erp;

use App\Enums\ApiScope;
use App\Models\ApiKey;
use App\Models\Batch;
use App\Models\BatchStep;
use App\Models\BatchStepLotConsumption;
use App\Models\Line;
use App\Models\MaterialLot;
use App\Models\ProcessTemplate;
use App\Models\ProductType;
use App\Models\Tenant;
use App\Models\WorkOrder;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The ERP contract for the two factories (step 3): a work order pushed into a
 * named factory's portal, and the completion event the ERP is told about when a
 * station closes a step.
 */
class FactoryErpSyncTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $admedco;

    private Tenant $mobilix;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admedco = Tenant::create(['name' => 'ADMEDCO', 'code' => Tenant::CODE_ADMEDCO, 'hourly_rate' => 45.00]);
        $this->mobilix = Tenant::create(['name' => 'MOBILIX', 'code' => Tenant::CODE_MOBILIX, 'hourly_rate' => 40.00]);

        // Master data for ADMEDCO, created under its own tenant context so the
        // has-tenant hook stamps it — the same way the importer will look it up.
        app(TenantContext::class)->set($this->admedco->id);
        Line::factory()->create(['code' => 'A1', 'name' => 'Atelier A1 - Tôle']);
        $product = ProductType::factory()->create(['code' => 'P1']);
        ProcessTemplate::factory()->withSteps(2)->create([
            'product_type_id' => $product->id,
            'is_active' => true,
        ]);

        app(TenantContext::class)->set($this->mobilix->id);
        Line::factory()->create(['code' => 'M1', 'name' => 'Atelier M1 - Découpe Bois']);

        app(TenantContext::class)->clear();
    }

    private function keyFor(?Tenant $factory, array $scopes): string
    {
        [, $plaintext] = ApiKey::issue([
            'name' => 'Factory ERP key',
            'scopes' => array_map(fn (ApiScope $s) => $s->value, $scopes),
            'tenant_id' => $factory?->id,
        ]);

        return $plaintext;
    }

    private function order(array $overrides = []): array
    {
        return array_merge([
            'order_no' => 'ADM-1001',
            'line_code' => 'A1',
            'product_type_code' => 'P1',
            'planned_qty' => 120,
        ], $overrides);
    }

    public function test_inject_writes_the_order_into_the_named_factory(): void
    {
        $key = $this->keyFor($this->admedco, [ApiScope::OrdersImport]);

        $response = $this->withHeader('X-Api-Key', $key)->postJson('/api/v1/work-orders/inject', [
            'factory' => 'ADMEDCO',
            'order' => $this->order(),
        ]);

        $response->assertCreated();
        $this->assertSame('ADMEDCO', $response->json('data.factory'));
        $this->assertTrue($response->json('data.applied'));
        $this->assertSame('/portal/admedco', parse_url($response->json('data.portal_url'), PHP_URL_PATH));

        $this->assertDatabaseHas('work_orders', [
            'order_no' => 'ADM-1001',
            'tenant_id' => $this->admedco->id,
        ]);
        $this->assertDatabaseMissing('work_orders', ['tenant_id' => $this->mobilix->id]);
    }

    public function test_inject_accepts_a_lowercase_factory_code(): void
    {
        $key = $this->keyFor($this->admedco, [ApiScope::OrdersImport]);

        $this->withHeader('X-Api-Key', $key)->postJson('/api/v1/work-orders/inject', [
            'factory' => 'admedco',
            'order' => $this->order(['order_no' => 'ADM-1002']),
        ])->assertCreated();

        $this->assertDatabaseHas('work_orders', ['order_no' => 'ADM-1002', 'tenant_id' => $this->admedco->id]);
    }

    public function test_inject_refuses_a_key_belonging_to_the_other_factory(): void
    {
        // An ADMEDCO credential must not be a write primitive against MOBILIX.
        $key = $this->keyFor($this->admedco, [ApiScope::OrdersImport]);

        $this->withHeader('X-Api-Key', $key)->postJson('/api/v1/work-orders/inject', [
            'factory' => 'MOBILIX',
            'order' => $this->order(['order_no' => 'MBX-9001', 'line_code' => 'M1']),
        ])->assertForbidden();

        $this->assertDatabaseMissing('work_orders', ['order_no' => 'MBX-9001']);
    }

    public function test_inject_rejects_a_factory_without_a_portal(): void
    {
        $key = $this->keyFor(null, [ApiScope::OrdersImport]);

        $this->withHeader('X-Api-Key', $key)->postJson('/api/v1/work-orders/inject', [
            'factory' => 'RENAULT',
            'order' => $this->order(),
        ])->assertStatus(422)->assertJsonValidationErrors('factory');
    }

    public function test_inject_reports_a_bad_line_reference_without_creating_anything(): void
    {
        $key = $this->keyFor($this->admedco, [ApiScope::OrdersImport]);

        $response = $this->withHeader('X-Api-Key', $key)->postJson('/api/v1/work-orders/inject', [
            'factory' => 'ADMEDCO',
            'order' => $this->order(['order_no' => 'ADM-1003', 'line_code' => 'A9']),
        ]);

        $response->assertStatus(422);
        $this->assertFalse($response->json('data.applied'));
        $this->assertDatabaseMissing('work_orders', ['order_no' => 'ADM-1003']);
    }

    public function test_inject_requires_the_orders_import_scope(): void
    {
        $key = $this->keyFor($this->admedco, [ApiScope::ProductionRead]);

        $this->withHeader('X-Api-Key', $key)->postJson('/api/v1/work-orders/inject', [
            'factory' => 'ADMEDCO',
            'order' => $this->order(),
        ])->assertForbidden();
    }

    public function test_inject_requires_an_api_key(): void
    {
        $this->postJson('/api/v1/work-orders/inject', [
            'factory' => 'ADMEDCO',
            'order' => $this->order(),
        ])->assertStatus(401);
    }

    public function test_job_completed_reports_output_consumption_and_labour_cost(): void
    {
        $step = $this->completedStep();
        $key = $this->keyFor($this->admedco, [ApiScope::ProductionRead]);

        $response = $this->withHeader('X-Api-Key', $key)->postJson('/api/v1/events/job-completed', [
            'batch_step_id' => $step->id,
        ]);

        $response->assertOk();
        $this->assertSame('ADMEDCO', $response->json('data.factory'));
        $this->assertSame('ADM-2001', $response->json('data.order_no'));
        $this->assertSame(120.0, (float) $response->json('data.produced_qty'));
        $this->assertSame(2.0, (float) $response->json('data.labour_hours'));
        // 2 h at the factory's own rate of 45 DH/h — MOBILIX's completions are
        // costed at 40, which is the whole point of the rate living on the tenant.
        $this->assertSame(90.0, (float) $response->json('data.labour_cost'));
        $this->assertSame('RM-1', $response->json('data.raw_materials.0.material_code'));
        $this->assertSame(6.5, (float) $response->json('data.raw_materials.0.quantity'));
    }

    public function test_job_completed_requires_the_production_read_scope(): void
    {
        $step = $this->completedStep();
        $key = $this->keyFor($this->admedco, [ApiScope::OrdersImport]);

        $this->withHeader('X-Api-Key', $key)->postJson('/api/v1/events/job-completed', [
            'batch_step_id' => $step->id,
        ])->assertForbidden();
    }

    public function test_job_completed_rejects_an_unknown_step(): void
    {
        $key = $this->keyFor($this->admedco, [ApiScope::ProductionRead]);

        $this->withHeader('X-Api-Key', $key)->postJson('/api/v1/events/job-completed', [
            'batch_step_id' => 999999,
        ])->assertStatus(422)->assertJsonValidationErrors('batch_step_id');
    }

    /** A finished step on an ADMEDCO order: 120 pieces passed, 2 h booked, one consumption. */
    private function completedStep(): BatchStep
    {
        app(TenantContext::class)->set($this->admedco->id);

        $workOrder = WorkOrder::factory()->create([
            'order_no' => 'ADM-2001',
            'tenant_id' => $this->admedco->id,
            'status' => WorkOrder::STATUS_IN_PROGRESS,
        ]);

        $batch = Batch::factory()->create(['work_order_id' => $workOrder->id]);

        $step = BatchStep::factory()->done()->create([
            'batch_id' => $batch->id,
            'passed_qty' => 120,
            'duration_minutes' => 90,
            // The operator-confirmed actual wins over the recorded wall clock.
            'actual_elapsed_minutes' => 120,
        ]);

        $lot = MaterialLot::factory()->create([
            'material_id' => \App\Models\Material::factory()->create(['code' => 'RM-1', 'name' => 'Tôle'])->id,
        ]);

        BatchStepLotConsumption::create([
            'batch_step_id' => $step->id,
            'material_lot_id' => $lot->id,
            'quantity_consumed' => 6.5,
            'consumed_at' => now(),
        ]);

        app(TenantContext::class)->clear();

        return $step;
    }
}
