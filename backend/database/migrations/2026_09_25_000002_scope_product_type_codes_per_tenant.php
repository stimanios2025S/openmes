<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A product code becomes unique per tenant instead of unique installation-wide.
 *
 * A global unique works for a single-plant catalogue and breaks the moment two
 * factories build the same article from different routes: ADMEDCO welds, coats
 * and assembles the Chaise CANADA, MOBILIX cuts the wood and upholsters it, and
 * both need a product_type row carrying PRD-CAN-01. They cannot share one row —
 * products are tenant-scoped, so a row belonging to one factory is invisible to
 * the other's users, its order form, its BOMs and its ERP injection.
 *
 * The replacement index has the same shape as the one on `warehouses`:
 * COALESCE(tenant_id, 0) so a single-plant install (tenant_id NULL) still cannot
 * hold two rows sharing a code, and partial on deleted_at IS NULL so a code
 * frees up again after a soft delete — which is the rule for every soft-deleted
 * entity in this codebase, and which the plain unique this replaces violated.
 *
 * Nothing about existing rows changes: the old index was strictly stronger.
 */
return new class extends Migration
{
    public function up(): void
    {
        // DROP INDEX, not Schema::dropUnique(): by the time this runs, the
        // installation-wide unique on `code` is already a plain partial index —
        // 2026_06_15_000002_make_unique_indexes_partial_for_soft_deletes turned
        // every single-column unique on a soft-deletable table into one. Dropping
        // it as a constraint would fail on PostgreSQL with "constraint ... does
        // not exist". IF EXISTS because a fresh install is free to have neither.
        DB::statement('DROP INDEX IF EXISTS product_types_code_unique');

        DB::statement(
            'CREATE UNIQUE INDEX product_types_code_unique
             ON product_types (code, COALESCE(tenant_id, 0))
             WHERE deleted_at IS NULL'
        );
    }

    /**
     * Back to installation-wide, and back to the partial shape described above —
     * not to a table constraint, which is not what this migration found.
     *
     * It fails by design if the data now holds two tenants' rows for one code:
     * that is the situation the migration exists to allow, and deleting one of
     * them to force the rollback through would be worse than the error.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS product_types_code_unique');

        DB::statement(
            'CREATE UNIQUE INDEX product_types_code_unique
             ON product_types (code)
             WHERE deleted_at IS NULL'
        );
    }
};
