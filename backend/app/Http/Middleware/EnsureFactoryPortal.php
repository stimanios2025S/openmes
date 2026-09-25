<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Support\FactoryPortal;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards /portal/{factory} — the dedicated ADMEDCO and MOBILIX workspaces.
 *
 * The URL segment is the factory code, and this middleware is what makes it a
 * boundary rather than a label:
 *
 *  - an unknown code is a 404 (a tenant with no portal has no portal URL),
 *  - an ADMEDCO operator asking for /portal/mobilix is bounced back to their own
 *    portal instead of seeing a 403, which is what a mistyped link should do,
 *  - a user with no portal role at all (and no oversight role) gets a 403.
 *
 * Admin and Supervisor pass through to both, which is what lets them use the
 * context switcher. The data they then see is scoped by the controller, not by
 * this middleware.
 */
class EnsureFactoryPortal
{
    public function handle(Request $request, Closure $next): Response
    {
        $factory = strtoupper((string) $request->route('factory'));

        if (! in_array($factory, Tenant::PORTAL_CODES, true)) {
            abort(404);
        }

        $user = $request->user();

        if (! $user) {
            return redirect()->route('login');
        }

        if (FactoryPortal::allows($user, $factory)) {
            return $next($request);
        }

        // Signed in, but this is not their factory: send them to the portal they
        // do own.
        //
        // Both extra conditions matter. `$own !== $factory` is what stops a
        // redirect loop when the user's role names the factory they are standing
        // in but their account belongs to the other one: factoryCodeFor() would
        // answer "ADMEDCO" for a request to /portal/admedco, and redirecting
        // there would redirect back here forever. And `allows($user, $own)` is
        // what keeps the bounce honest — a user who cannot enter their own
        // portal is refused outright instead of being sent to a second door that
        // also refuses them.
        $own = FactoryPortal::factoryCodeFor($user);

        if ($own && $own !== $factory && FactoryPortal::allows($user, $own)) {
            return redirect()
                ->route('portal.show', ['factory' => FactoryPortal::segment($own)])
                ->with('error', __('You do not have access to that factory. You were returned to your own workspace.'));
        }

        abort(403, __('You do not have access to a factory portal.'));
    }
}
