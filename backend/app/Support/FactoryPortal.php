<?php

namespace App\Support;

use App\Models\Tenant;
use App\Models\User;

/**
 * The single source of truth for the dedicated factory portals.
 *
 * A portal is a factory-scoped operator workspace: an ADMEDCO operator lands in
 * /portal/admedco and sees ateliers A1/A2/A3 only, a MOBILIX operator lands in
 * /portal/mobilix and sees M1/M2 only.
 *
 * Two independent things together produce that isolation, and conflating them is
 * the easy mistake:
 *
 *  - the **role** (`ADMEDCO_Operator` / `MOBILIX_Operator`) decides which portal
 *    a user is sent to and may enter, and
 *  - the **tenant** on the account decides which ateliers, work orders, materials
 *    and stock they see once inside, via the existing TenantScope.
 *
 * So this class only maps roles to factory codes — it never filters data. If the
 * two ever disagree (an ADMEDCO role on a MOBILIX tenant), the portal opens but
 * shows an empty factory; EnsureFactoryPortal closes that hole by checking both.
 */
class FactoryPortal
{
    public const ROLE_ADMEDCO = 'ADMEDCO_Operator';

    public const ROLE_MOBILIX = 'MOBILIX_Operator';

    /** Portal role => the factory (tenant code) it opens. */
    public const ROLE_TO_FACTORY = [
        self::ROLE_ADMEDCO => Tenant::CODE_ADMEDCO,
        self::ROLE_MOBILIX => Tenant::CODE_MOBILIX,
    ];

    /**
     * Roles that may enter any portal, and switch between them. There is no
     * separate SuperAdmin role in this codebase — Admin is the top role — so
     * both operational oversight roles are listed.
     */
    public const UNRESTRICTED_ROLES = ['Admin', 'Supervisor'];

    /** URL segment for a factory code: /portal/admedco, /portal/mobilix. */
    public static function segment(string $factoryCode): string
    {
        return strtolower($factoryCode);
    }

    /** The factory code this user's portal role opens, or null if they hold none. */
    public static function factoryCodeFor(User $user): ?string
    {
        foreach (self::ROLE_TO_FACTORY as $role => $factoryCode) {
            if ($user->hasRole($role)) {
                return $factoryCode;
            }
        }

        return null;
    }

    /** Whether the user may enter any portal at all (and switch between them). */
    public static function isUnrestricted(User $user): bool
    {
        foreach (self::UNRESTRICTED_ROLES as $role) {
            if ($user->hasRole($role)) {
                return true;
            }
        }

        return false;
    }

    /** Whether this user may enter the portal for the given factory code. */
    public static function allows(User $user, string $factoryCode): bool
    {
        if (self::isUnrestricted($user)) {
            return true;
        }

        // The role must name this factory AND the account must belong to it,
        // otherwise the portal would open onto another factory's data (or, if the
        // role and tenant disagree, onto nothing at all).
        return self::factoryCodeFor($user) === $factoryCode
            && $user->tenant?->code === $factoryCode;
    }
}
