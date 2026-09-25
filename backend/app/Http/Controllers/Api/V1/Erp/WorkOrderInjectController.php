<?php

namespace App\Http\Controllers\Api\V1\Erp;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Erp\InjectWorkOrderRequest;
use App\Models\Tenant;
use App\Models\WorkOrder;
use App\Services\CsvImport\WorkOrderImportService;
use App\Support\FactoryPortal;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;

/**
 * ERP → OpenMES: inject a single work order into one factory's portal
 * (POST /api/v1/work-orders/inject).
 *
 * The payload names the factory (`"factory": "ADMEDCO"`), and that field decides
 * which tenant the order is written into: the request-scoped TenantContext is
 * pointed at the factory before anything is looked up, so `line_code` and
 * `product_type_code` resolve in that factory's catalogue and the created order
 * carries that factory's tenant_id. The operator who should see it is then
 * whoever is logged into that factory's portal — no per-order assignment step.
 *
 * A key that belongs to a tenant may only inject into its own factory; anything
 * else is a 403. That is the counterweight to the inject endpoint being able to
 * choose its target at all — without it, an ADMEDCO integration credential would
 * be a write primitive against MOBILIX.
 *
 * Order creation itself is delegated to WorkOrderImportService, the same service
 * behind the bulk import, so the two entry points cannot drift on validation,
 * duplicate handling or the fields they touch.
 */
class WorkOrderInjectController extends Controller
{
    public function store(
        InjectWorkOrderRequest $request,
        WorkOrderImportService $service,
        TenantContext $tenantContext,
    ): JsonResponse {
        $tenant = Tenant::findByCode($request->factoryCode());

        if (! $tenant || ! $tenant->hasPortal()) {
            // Rule::in already limits the field to the portal codes; this is the
            // case where a factory was deleted after the seeder created it.
            return response()->json(['message' => __('Unknown factory.')], 422);
        }

        $key = $request->attributes->get('api_key');
        $keyTenantId = $key?->tenant_id;

        if ($keyTenantId !== null && $keyTenantId !== $tenant->id) {
            return response()->json([
                'message' => __('This API key may only inject work orders into its own factory.'),
            ], 403);
        }

        // Point the tenant scope at the target factory for the rest of the
        // request, and back at the key's own tenant afterwards (Octane reuses
        // the worker, so leaving the context moved would leak the factory into
        // the next request served by this process).
        $tenantContext->set($tenant->id);

        $order = $request->order();

        try {
            // One order, so the report is all-or-nothing: any error entry means
            // this injection failed, and there can only ever be one.
            $report = $service->importErp([$order], $request->strategy());

            $applied = $report['errors'] === [];
            $workOrder = $applied
                ? WorkOrder::query()->where('order_no', $order['order_no'] ?? '')->first()
                : null;
        } finally {
            $tenantContext->set($keyTenantId);
        }

        return response()->json([
            'data' => [
                'factory' => $tenant->code,
                'portal_url' => route('portal.show', ['factory' => FactoryPortal::segment($tenant->code)]),
                'applied' => $applied,
                'work_order' => $workOrder ? [
                    'id' => $workOrder->id,
                    'order_no' => $workOrder->order_no,
                    'status' => $workOrder->status,
                ] : null,
                'report' => $report,
            ],
        ], $applied ? 201 : 422);
    }
}
