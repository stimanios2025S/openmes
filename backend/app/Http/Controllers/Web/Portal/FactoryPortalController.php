<?php

namespace App\Http\Controllers\Web\Portal;

use App\Http\Controllers\Controller;
use App\Models\Line;
use App\Models\Tenant;
use App\Models\Warehouse;
use App\Scopes\TenantScope;
use App\Support\FactoryPortal;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The dedicated factory portal: /portal/admedco and /portal/mobilix.
 *
 * One controller, two workspaces. What the two portals show is derived from the
 * factory's tenant, never from the URL alone:
 *
 *  - its ateliers (the tenant's active lines) with their workstations,
 *  - its raw-material and finished-goods depots,
 *  - its labour rate (`tenants.hourly_rate`) and open work-order count.
 *
 * Scoping is explicit rather than left to TenantScope. An operator resolves to
 * their own factory either way, but an Admin switching between the two portals
 * has no tenant of their own (or belongs to the other one), so the global scope
 * would hide the very factory they asked for. The query is therefore pinned to
 * the route's factory and the global scope dropped — the middleware has already
 * established that this user may see that factory.
 */
class FactoryPortalController extends Controller
{
    public function show(Request $request, string $factory): Response
    {
        $tenant = Tenant::findByCode($factory);

        // The middleware validated the code, so this is only reachable if the
        // factory was deleted between the two — a 404 is the honest answer.
        if (! $tenant) {
            abort(404);
        }

        $user = $request->user();

        $lines = Line::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('is_active', true)
            ->with(['workstations' => fn ($query) => $query->where('is_active', true)->orderBy('name')])
            ->orderBy('code')
            ->get()
            ->map(fn (Line $line) => [
                'id' => $line->id,
                'code' => $line->code,
                'name' => $line->name,
                'description' => $line->description,
                'workstations' => $line->workstations->map(fn ($workstation) => [
                    'id' => $workstation->id,
                    'name' => $workstation->name,
                    'code' => $workstation->code,
                ])->values(),
            ])
            ->values();

        $depots = Warehouse::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('is_active', true)
            ->orderBy('code')
            ->get()
            ->map(fn (Warehouse $warehouse) => [
                'id' => $warehouse->id,
                'code' => $warehouse->code,
                'name' => $warehouse->name,
                'kind' => $warehouse->kind,
            ])
            ->values();

        return Inertia::render('portal/FactoryPortal', [
            'factory' => [
                'code' => $tenant->code,
                'name' => $tenant->name,
                // The division this factory operates as — "ADMEDCO — Metal
                // Fabrication Division" is how the portal titles itself.
                'division' => \App\Support\Brand::division($tenant->code),
                'hourly_rate' => $tenant->hourly_rate,
                'segment' => FactoryPortal::segment($tenant->code),
            ],
            'lines' => $lines,
            'depots' => $depots,
            // The switcher is only rendered for the roles that may cross the
            // boundary — an operator is never shown a door they cannot open.
            'canSwitch' => FactoryPortal::isUnrestricted($user),
            'portals' => collect(Tenant::PORTAL_CODES)
                ->map(fn (string $code) => [
                    'code' => $code,
                    'segment' => FactoryPortal::segment($code),
                    'current' => $code === $tenant->code,
                ])
                ->values(),
        ]);
    }

    /**
     * Open one of this factory's ateliers — the portal's equivalent of
     * /operator/select-line.
     *
     * The generic picker authorizes by per-user line assignment, which the
     * portal cannot rely on: a factory operator is granted a whole factory, so
     * they would be shown three ateliers and allowed into none. Here the visited
     * portal *is* the authorization (EnsureFactoryPortal already established it)
     * and the line only has to belong to that factory — which is enforced
     * explicitly, so a crafted line_id cannot open another factory's atelier.
     *
     * The session keys written are the same ones /operator/select-line writes,
     * so the queue and the workstation screen cannot tell the two entry points
     * apart.
     */
    public function open(Request $request, string $factory): RedirectResponse
    {
        $tenant = Tenant::findByCode($factory) ?? abort(404);

        $validated = $request->validate([
            'line_id' => ['required', 'integer'],
            'workstation_id' => ['nullable', 'integer'],
        ]);

        $line = Line::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('is_active', true)
            ->findOrFail($validated['line_id']);

        // A workstation is optional, and a stale one silently falls back to the
        // whole line rather than failing the selection — same as the generic
        // picker.
        $workstationId = $line->workstations()
            ->where('is_active', true)
            ->whereKey($validated['workstation_id'] ?? null)
            ->value('id');

        $request->session()->put('selected_line_id', $line->id);
        $request->session()->put('selected_workstation_id', $workstationId);

        return redirect()->route(
            $line->default_operator_view === 'workstation' ? 'operator.workstation' : 'operator.queue',
        );
    }
}
