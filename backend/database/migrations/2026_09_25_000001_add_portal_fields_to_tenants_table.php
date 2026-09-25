<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A tenant is one factory in the dual-factory setup (ADMEDCO / MOBILIX). The
 * existing `name` is a label — editable, translated, and fine to change — so the
 * two things the portals and the ERP payloads need are added here:
 *
 *  - `code`        — the stable identifier routing keys off ("ADMEDCO" /
 *                    "MOBILIX"). Nothing should route on a display name.
 *  - `hourly_rate` — the factory's labour rate, applied to the hours a station
 *                    books against a work order. Per factory rather than global:
 *                    the two sites do not cost the same (45 vs 40 DH/h).
 *
 * Both nullable: existing single-tenant installs keep working untouched, and a
 * tenant without a code simply has no portal.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('code', 32)->nullable()->unique();
            $table->decimal('hourly_rate', 8, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->dropColumn(['code', 'hourly_rate']);
        });
    }
};
