<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            RolesAndPermissionsSeeder::class,
            // The two factories, their depots and their ateliers. After the roles
            // seeder so the portal roles the operators are assigned already exist.
            DualFactorySeeder::class,
            IssueTypesSeeder::class,
            LineStatusSeeder::class,
            ViewTemplateSeeder::class,
            MaterialTypesSeeder::class,
            DowntimeReasonsSeeder::class,
            ScrapReasonsSeeder::class,
            LabelTemplatesSeeder::class,
            // The closed two-chair catalogue and its BOMs. After MaterialTypesSeeder
            // (materials need their type) and after DualFactorySeeder (the BOMs
            // stock the factories' depots).
            ChaiseCatalogSeeder::class,
        ]);
    }
}
