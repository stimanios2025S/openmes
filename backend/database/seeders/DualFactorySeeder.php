<?php

namespace Database\Seeders;

use App\Models\Line;
use App\Models\Tenant;
use App\Models\Warehouse;
use App\Scopes\TenantScope;
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
 * the link the consumption services follow: completing a step on COUPE deducts
 * from DEP-MP, on DECOUPE-BOIS from DEP-MP-MBX, with no code needed to tell them
 * apart.
 *
 * The atelier list is the physical process flow, in order: six metal stages at
 * ADMEDCO (cut, machine, weld, grind, bolt, coat) and four wood/upholstery stages
 * at MOBILIX (cut, sew, upholster, assemble & pack). A station that is no longer
 * in the list is deactivated rather than deleted, so the batches already booked
 * against it keep their history.
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
                ['code' => 'COUPE', 'name' => 'Coupe tube & profilé'],
                ['code' => 'USINAGE', 'name' => 'Usinage / cintrage — perçage, brossage, cintrage'],
                ['code' => 'SOUDAGE', 'name' => 'Soudage châssis (MIG/TIG)'],
                ['code' => 'MEULAGE', 'name' => 'Meulage & finition des soudures'],
                ['code' => 'VISSAGE', 'name' => 'Vissage & sous-ensemble mécanique'],
                ['code' => 'POUDRAGE', 'name' => 'Poudrage & cuisson au four'],
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
                ['code' => 'DECOUPE-BOIS', 'name' => 'Découpe bois MDF & multiplex — pose des inserts'],
                ['code' => 'COUTURE', 'name' => 'Couture & matières — tissu/Skaï, mousse, zips'],
                ['code' => 'TAPISSAGE', 'name' => 'Tapissage / habillage — mousse sur panneaux bois'],
                ['code' => 'ASSEMBLAGE', 'name' => 'Assemblage final & emballage — 4 chaises par carton'],
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

            // A stage that is no longer part of the flow stops being offered —
            // this is what retires the old A1-A3 / M1-M2 ateliers on an install
            // that already ran the previous layout. Retired, not deleted: the
            // batches and work orders booked against them still resolve.
            Line::withoutGlobalScope(TenantScope::class)
                ->where('tenant_id', $tenant->id)
                ->where('is_active', true)
                ->whereNotIn('code', array_column($factory['ateliers'], 'code'))
                ->update(['is_active' => false]);
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
