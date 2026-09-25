<?php

namespace App\Services\Erp;

use App\Models\BatchStep;
use App\Models\Tenant;
use App\Models\WorkOrder;
use App\Services\Webhooks\WebhookDispatcher;
use App\Support\WebhookEventRegistry;

/**
 * Builds the `job.completed` payload — what the ERP is told every time a station
 * closes a work-order step — and hands it to the webhook dispatcher.
 *
 * The four things the ERP needs from a completion are what the payload is built
 * around: which order, how much came out, what it consumed and what it cost in
 * labour:
 *
 *  - `order_id` / `order_no`   — the work order the step belongs to,
 *  - `produced_qty`            — pieces this step passed on,
 *  - `raw_materials`           — the material lots the step consumed (ISA-95
 *                                genealogy), which is also what the stock
 *                                deduction was booked against,
 *  - `labour_hours` / `labour_cost` — the step's booked time, valued at the
 *                                factory's own rate (`tenants.hourly_rate`), so
 *                                ADMEDCO's hours are costed at 45 DH/h and
 *                                MOBILIX's at 40.
 *
 * The payload is a pure read of the step: building it never writes, and the
 * reporter is called both for the live event and from the ERP-facing
 * /api/v1/events/job-completed endpoint, so the two can never disagree on shape.
 */
class JobCompletionReporter
{
    public function __construct(private WebhookDispatcher $dispatcher) {}

    /**
     * Build the payload for a completed step and fan it out to the ERP
     * endpoints subscribed to `job.completed`.
     *
     * @return array<string, mixed> the payload as dispatched, so a caller (the
     *                              API endpoint) can hand it back to the ERP
     */
    public function report(BatchStep $step): array
    {
        $payload = $this->payload($step);

        $this->dispatcher->dispatch(WebhookEventRegistry::JOB_COMPLETED, $payload);

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(BatchStep $step): array
    {
        $step->loadMissing(['workstation', 'lotConsumptions.materialLot.material']);

        $batch = $step->batch;
        $workOrder = $batch?->workOrder;
        $tenant = $this->tenantFor($workOrder);

        // Operator-confirmed actual time wins over the recorded wall-clock diff
        // (ISA-95: the confirmed value is authoritative for reporting — same
        // precedence the performance screens use).
        $minutes = $step->actual_elapsed_minutes ?? $step->duration_minutes;
        $hours = $minutes === null ? null : round(((float) $minutes) / 60, 4);
        $rate = $tenant?->hourly_rate === null ? null : (float) $tenant->hourly_rate;

        return [
            'order_id' => $workOrder?->id,
            'order_no' => $workOrder?->order_no,
            'factory' => $tenant?->code,
            'batch_id' => $batch?->id,
            'batch_step_id' => $step->id,
            'step_name' => $step->name,
            'workstation' => $step->workstation?->name,
            'produced_qty' => (float) $step->passed_qty,
            'raw_materials' => $step->lotConsumptions
                ->map(fn ($consumption) => [
                    'material_code' => $consumption->materialLot?->material?->code,
                    'material_name' => $consumption->materialLot?->material?->name,
                    'lot_number' => $consumption->materialLot?->lot_number,
                    'quantity' => (float) $consumption->quantity_consumed,
                    'unit' => $consumption->materialLot?->material?->unit_of_measure,
                ])
                ->values()
                ->all(),
            'labour_hours' => $hours,
            'labour_rate' => $rate,
            // Both null when the step's time or the factory's rate is unknown —
            // null says "not measurable", 0.00 would say "free", and the ERP
            // would book the difference.
            'labour_cost' => $hours === null || $rate === null ? null : round($hours * $rate, 2),
            'completed_at' => optional($step->completed_at)->toIso8601String(),
        ];
    }

    /**
     * The factory a work order belongs to. Read without the tenant scope on
     * purpose: this runs from observers and from API-key requests, where the
     * ambient scope may be unset or pointed elsewhere, and the answer must be
     * the order's own tenant, not the caller's.
     */
    private function tenantFor(?WorkOrder $workOrder): ?Tenant
    {
        if ($workOrder?->tenant_id === null) {
            return null;
        }

        return Tenant::query()->find($workOrder->tenant_id);
    }
}
