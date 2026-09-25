<?php

namespace Database\Seeders;

use App\Models\Line;
use App\Models\Tenant;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

/**
 * The dual-factory layout: ADMEDCO and MOBILIX as two tenants, each with its own
 * ateliers and its own depots.
 *
 * Each factory is a tenant, so the existing TenantScope already keeps one
 * factory's lines, work orders, materials and stock out of the other's queries.
 * The dedicated portals are a presentation of that boundary, not a second one —
 * which is why nothing here needs a "factory" column on the operational tables.
 *
 * Depots: every factory gets its own raw-material store (DEP-MP / DEP-MP-MBX)
 * and its own finished-goods store (DEP-PF). DEP-PF is deliberately one row per
 * factory rather than one shared row: warehouses are tenant-scoped — both
 * `warehouses_code_unique` and `warehouses_default_per_kind_unique` are keyed on
 * COALESCE(tenant_id, 0) — so a single tenant-less DEP-PF would be filtered out
 * of both factories' queries and neither could book stock into it.
 *
 * Each atelier is a Line pointing at its factory's raw-material depot, which is
 * the link the consumption services follow: completing a step on A1 deducts from
 * DEP-MP, on M1 from DEP-MP-MBX, with no code needed to tell them apart.
 *
 * Idempotent — DatabaseSeeder runs this on every container start.
 */
class DualFactorySeeder extends Seeder
{
    private const FINISHED_DEPOT_CODE = 'DEP-PF';

    /**
     * code => [display name, hourly rate, raw-material depot, ateliers]
     */
    private const FACTORIES = [
        Tenant::CODE_ADMEDCO => [
            'name' => 'ADMEDCO',
            // Factory labour rate, applied to hours booked against a work order.
            'hourly_rate' => 45.00,
            'raw_depot' => [
                'code' => 'DEP-MP',
                'name' => 'ADMEDCO - Matières premières (tôle, tube)',
            ],
            'ateliers' => [
                ['code' => 'A1', 'name' => 'Atelier A1 - Tôle'],
                ['code' => 'A2', 'name' => 'Atelier A2 - Gros Œuvre'],
                ['code' => 'A3', 'name' => 'Atelier A3 - Poudrage'],
            ],
        ],
        Tenant::CODE_MOBILIX => [
            'name' => 'MOBILIX',
            'hourly_rate' => 40.00,
            'raw_depot' => [
                'code' => 'DEP-MP-MBX',
                'name' => 'MOBILIX - Matières premières (panneaux, tissus, mousse)',
            ],
            'ateliers' => [
                ['code' => 'M1', 'name' => 'Atelier M1 - Découpe Bois'],
                ['code' => 'M2', 'name' => 'Atelier M2 - Tapissage'],
            ],
        ],
    ];

    public function run(): void
    {
        foreach (self::FACTORIES as $code => $factory) {
            $tenant = Tenant::updateOrCreate(
                ['code' => $code],
                ['name' => $factory['name'], 'hourly_rate' => $factory['hourly_rate']],
            );

            $rawDepot = $this->depot($tenant, $factory['raw_depot'], Warehouse::KIND_RAW_MATERIAL);

            $this->depot($tenant, [
                'code' => self::FINISHED_DEPOT_CODE,
                'name' => $factory['name'].' - Produits finis',
            ], Warehouse::KIND_FINISHED_GOODS);

            foreach ($factory['ateliers'] as $atelier) {
                Line::updateOrCreate(
                    // tenant_id is part of the key on purpose: atelier codes are
                    // only unique within a factory, so keying on the code alone
                    // would let one factory's seed reparent the other's line.
                    ['tenant_id' => $tenant->id, 'code' => $atelier['code']],
                    [
                        'name' => $atelier['name'],
                        'warehouse_id' => $rawDepot->id,
                        'is_active' => true,
                    ],
                );
            }
        }
    }

    /**
     * The factory's depot for one kind of stock, created active and marked
     * default so imports and auto-generated documents fall back to this factory's
     * own store — Warehouse::resolveDefault() is tenant-scoped, so ADMEDCO
     * resolves DEP-MP and MOBILIX resolves DEP-MP-MBX.
     *
     * `is_default` is set directly rather than through Warehouse::makeDefault():
     * that helper clears the flag on every peer of the same kind, and a seeder
     * runs with no authenticated user, so the tenant scope is not applied and it
     * would clear the other factory's default as well.
     */
    private function depot(Tenant $tenant, array $attributes, string $kind): Warehouse
    {
        return Warehouse::updateOrCreate(
            ['tenant_id' => $tenant->id, 'code' => $attributes['code']],
            [
                'name' => $attributes['name'],
                'kind' => $kind,
                'is_default' => true,
                'is_active' => true,
            ],
        );
    }
}
