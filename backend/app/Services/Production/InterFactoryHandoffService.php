<?php

namespace App\Services\Production;

use App\Models\BatchStep;
use App\Models\Line;
use App\Models\Material;
use App\Models\StockMovement;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warehouse;
use App\Scopes\TenantScope;
use App\Services\Material\StockMovementService;
use App\Services\Warehouse\WarehouseStockService;
use App\Support\TenantContext;
use Illuminate\Support\Facades\Log;

/**
 * The one join between the two factories: a finished ADMEDCO chassis becomes a
 * MOBILIX raw component.
 *
 * ADMEDCO cuts, welds, grinds and coats the metal chassis; MOBILIX cannot start
 * final assembly without it. Nothing else in the platform crosses the tenant
 * boundary, so this is deliberately the only such service and it does exactly
 * one thing: when a batch completes the POUDRAGE station, the painted chassis it
 * produced are booked into MOBILIX's raw-material store as
 * SF-CHASSIS-PEINT — the semi-finished material MOBILIX's final-assembly step
 * consumes one of per chair.
 *
 * The credit is two-sided in the way every other receipt is: the depot balance
 * (WarehouseStock) and the plant-wide material quantity, plus a `transfer` row in
 * the stock_movements ledger naming the ADMEDCO step it came from. That ledger
 * row is what makes the hand-off auditable — "where did these 40 chassis come
 * from" is answered by the step that produced them, not by a comment.
 *
 * ADMEDCO's own side is not modelled: the platform posts no output for a
 * semi-finished good, so the chassis exists in ADMEDCO only as consumed tube,
 * armrests, wire, discs and paint. The physical transfer is the only leg booked.
 */
class InterFactoryHandoffService
{
    /** The station whose completion releases the chassis buffer. */
    public const OUTPUT_STAGE = 'POUDRAGE';

    /** The factory that produces the chassis, and the one that consumes it. */
    public const SOURCE_FACTORY = Tenant::CODE_ADMEDCO;

    public const TARGET_FACTORY = Tenant::CODE_MOBILIX;

    /** The semi-finished material the hand-off creates in the target factory. */
    public const MATERIAL_CODE = 'SF-CHASSIS-PEINT';

    public const MATERIAL_NAME = 'Painted metal chassis (ADMEDCO → MOBILIX)';

    public const MATERIAL_UNIT = 'pcs';

    public function __construct(
        private readonly WarehouseStockService $stock,
        private readonly StockMovementService $movements,
        private readonly TenantContext $context,
    ) {}

    /**
     * Book the chassis a closed batch produced into the other factory's store.
     *
     * Called from the batch-completion path, inside the caller's transaction, so
     * a failed hand-off rolls the completion back with it rather than leaving a
     * finished batch nothing can assemble from.
     *
     * A no-op when the batch did not close at the output stage, when its line
     * belongs to another factory, or when the target factory has no such
     * material — a plant that never seeded the two-chair catalogue has no
     * hand-off, and refusing to complete its batches would be the wrong way to
     * say so.
     */
    public function post(BatchStep $step, float $quantity, ?User $user = null): ?float
    {
        if ($quantity <= 0) {
            return null;
        }

        $line = $step->batch?->workOrder?->line;

        if (! $line instanceof Line || $line->code !== self::OUTPUT_STAGE) {
            return null;
        }

        $source = Tenant::find($line->tenant_id);

        if (! $source || $source->code !== self::SOURCE_FACTORY) {
            return null;
        }

        $target = Tenant::findByCode(self::TARGET_FACTORY);
        $depot = $target ? $this->rawDepot($target) : null;
        $material = $target ? $this->chassisMaterial($target) : null;

        if (! $target || ! $depot || ! $material) {
            Log::info('Chassis hand-off skipped: target factory, its raw depot or the semi-finished chassis material is missing.', [
                'source_factory' => $source->code,
                'step_id' => $step->id,
                'quantity' => $quantity,
            ]);

            return null;
        }

        return $this->credit($target, $depot, $material, $quantity, $step, $user);
    }

    /**
     * The credit itself, run with the tenant context pointed at the target
     * factory: every row it touches (depot balance, material quantity, ledger
     * entry) belongs to MOBILIX and would be filtered out — or stamped with the
     * wrong tenant — under ADMEDCO's context.
     */
    private function credit(Tenant $target, Warehouse $depot, Material $material, float $quantity, BatchStep $step, ?User $user): float
    {
        $previous = $this->context->id();
        $this->context->set($target->id);

        try {
            $this->stock->adjust([
                'warehouse_id' => $depot->id,
                'material_id' => $material->id,
                'product_type_id' => null,
                'material_lot_id' => null,
            ], $quantity, self::MATERIAL_UNIT);

            // Plant-wide quantity + audit trail. A transfer, not a receipt: the
            // goods existed already, in the other factory.
            $this->movements->record(
                material: $material,
                movementType: StockMovement::TYPE_TRANSFER,
                signedQuantity: $quantity,
                user: $user,
                sourceType: StockMovement::SOURCE_BATCH_STEP,
                sourceId: $step->id,
                reason: __('Chassis buffer handed to :factory for final assembly', ['factory' => $target->name]),
                warehouseId: $depot->id,
            );
        } finally {
            $this->context->set($previous);
        }

        return $quantity;
    }

    /** The target factory's raw-material store, where final assembly draws from. */
    private function rawDepot(Tenant $tenant): ?Warehouse
    {
        return Warehouse::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('kind', Warehouse::KIND_RAW_MATERIAL)
            ->orderByDesc('is_default')
            ->first();
    }

    private function chassisMaterial(Tenant $tenant): ?Material
    {
        return Material::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('code', self::MATERIAL_CODE)
            ->first();
    }
}
