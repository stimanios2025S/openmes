<?php

namespace App\Support;

use App\Models\Tenant;

/**
 * The installation's own name, in the platform's own words: ADMEDCO and MOBILIX
 * are the two factories that run here, so the product is co-branded around them
 * rather than around the software that happens to be underneath it.
 *
 * One place, because these strings appear in three chrome regions that must not
 * drift apart: the document title (inertia.blade.php), the signed-in header
 * (AppLayout, and OperatorLayout for shop-floor accounts), and the sign-in card
 * (AuthLayout). The division line is the fourth: the header shows which factory
 * the signed-in account works for, and the factory portals show it in their own
 * title, so an ADMEDCO screen never has to say "ADMEDCO" twice and never leaves
 * the reader guessing which half of the plant they are looking at.
 *
 * Values are translation keys, not decoration: they are added to lang/en.json and
 * lang/pl.json like every other UI string (rule 2 of CLAUDE.md).
 */
final class Brand
{
    /** The document title — the platform named in full. */
    public const SYSTEM = 'ADMEDCO & MOBILIX — Production Management System';

    /** The signed-in header/navbar brand. */
    public const HEADER = 'ADMEDCO & MOBILIX Industrial Systems';

    /** The sign-in screen's heading. */
    public const LOGIN = 'ADMEDCO & MOBILIX Operations Portal';

    /** Factory code => the division it operates as. */
    public const DIVISIONS = [
        Tenant::CODE_ADMEDCO => 'Metal Fabrication Division',
        Tenant::CODE_MOBILIX => 'Wood & Upholstery Division',
    ];

    /** The division a factory code works as, or null for a tenant-less account. */
    public static function division(?string $factoryCode): ?string
    {
        if ($factoryCode === null) {
            return null;
        }

        return self::DIVISIONS[strtoupper(trim($factoryCode))] ?? null;
    }

    /**
     * The whole brand for one account: the chrome strings plus the division of
     * the factory it belongs to (null when it belongs to none, e.g. the platform
     * admin — whose header shows the co-branded system name and no division).
     *
     * @return array{system: string, header: string, login: string, division: ?string}
     */
    public static function shared(?string $factoryCode): array
    {
        return [
            'system' => self::SYSTEM,
            'header' => self::HEADER,
            'login' => self::LOGIN,
            'division' => self::division($factoryCode),
        ];
    }
}
