<?php

namespace App\Support;

/**
 * The finished-product catalogue this deployment orders.
 *
 * The plant runs two chairs and nothing else: the catalogue is closed, so a
 * legacy product type that still exists in the database (imported from the ERP,
 * left over from a demo) can no longer be picked on the work-order form or
 * pushed in through the ERP's inject endpoint. The product rows are not deleted
 * — history, revisions and BOMs keep resolving — they simply stop being
 * orderable, which is what "restricted catalogue" means operationally.
 *
 * This is the single list both enforcement points read: the Admin order form
 * (via ProductType::scopeOrderable) and POST /api/v1/work-orders/inject (via
 * Rule::in on order.product_type_code). Keeping one list is the point — a
 * second copy is how the form and the API drift apart and a legacy product gets
 * ordered again through the door nobody re-read.
 *
 * Both factories (ADMEDCO and MOBILIX) share these codes: each tenant owns its
 * own product_type row for each code — product codes are unique per tenant —
 * because each factory has its own process route and its own BOM for the same
 * chair. See database/seeders/ChaiseCatalogSeeder.php.
 */
final class ProductCatalog
{
    /** Chaise CANADA — metal chassis with armrests. */
    public const CHAISE_CANADA = 'PRD-CAN-01';

    /** Chaise G21 — standard metal chassis, no armrests. */
    public const CHAISE_G21 = 'PRD-G21-01';

    /**
     * Every orderable product code, in display order.
     *
     * @return list<string>
     */
    public static function codes(): array
    {
        return [self::CHAISE_CANADA, self::CHAISE_G21];
    }

    /** Whether a product code may be ordered (case-insensitive; ERPs vary). */
    public static function allows(?string $code): bool
    {
        return in_array(strtoupper(trim((string) $code)), self::codes(), true);
    }

    /** The display name of a catalogue code, or null when it is not one. */
    public static function nameOf(string $code): ?string
    {
        return match (strtoupper(trim($code))) {
            self::CHAISE_CANADA => 'Chaise CANADA',
            self::CHAISE_G21 => 'Chaise G21',
            default => null,
        };
    }
}
