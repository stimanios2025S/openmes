<?php

namespace Tests\Feature\Portal;

use App\Models\Line;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\FactoryPortal;
use Database\Seeders\DualFactorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The dual-factory boundary: two factories (tenants), two dedicated portals, and
 * the rule that each factory's operators stay in their own.
 *
 * The seeder runs for real here rather than being stubbed — the codes, the
 * ateliers and the depot mapping it produces are exactly what the middleware,
 * the portals and the ERP injection key off, so a drifting seeder must fail
 * these tests rather than silently produce an empty factory.
 */
class DualFactoryPortalTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $admedco;

    private Tenant $mobilix;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DualFactorySeeder::class);

        $this->admedco = Tenant::findByCode(Tenant::CODE_ADMEDCO);
        $this->mobilix = Tenant::findByCode(Tenant::CODE_MOBILIX);
    }

    /** An operator of the given factory: the portal role plus its tenant. */
    private function operator(Tenant $factory, ?string $role = null): User
    {
        $roleName = $role ?? ($factory->code === Tenant::CODE_ADMEDCO
            ? FactoryPortal::ROLE_ADMEDCO
            : FactoryPortal::ROLE_MOBILIX);

        Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);

        $user = User::factory()->create(['tenant_id' => $factory->id]);
        $user->assignRole($roleName);

        return $user;
    }

    private function admin(): User
    {
        Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'web']);

        $user = User::factory()->create();
        $user->assignRole('Admin');

        return $user;
    }

    public function test_seeder_creates_both_factories_with_their_ateliers_and_rates(): void
    {
        $this->assertNotNull($this->admedco);
        $this->assertNotNull($this->mobilix);
        $this->assertSame('45.00', $this->admedco->hourly_rate);
        $this->assertSame('40.00', $this->mobilix->hourly_rate);

        // The physical metal flow, in the order it runs on the floor.
        $this->assertSame(
            ['COUPE', 'MEULAGE', 'POUDRAGE', 'SOUDAGE', 'USINAGE', 'VISSAGE'],
            Line::withoutGlobalScope(\App\Scopes\TenantScope::class)
                ->where('tenant_id', $this->admedco->id)->orderBy('code')->pluck('code')->all(),
        );
        $this->assertSame(
            ['ASSEMBLAGE', 'COUTURE', 'DECOUPE-BOIS', 'TAPISSAGE'],
            Line::withoutGlobalScope(\App\Scopes\TenantScope::class)
                ->where('tenant_id', $this->mobilix->id)->orderBy('code')->pluck('code')->all(),
        );
    }

    public function test_each_factory_consumes_from_its_own_raw_material_depot(): void
    {
        $admedco = Line::withoutGlobalScope(\App\Scopes\TenantScope::class)
            ->where('tenant_id', $this->admedco->id)->firstOrFail();
        $mobilix = Line::withoutGlobalScope(\App\Scopes\TenantScope::class)
            ->where('tenant_id', $this->mobilix->id)->firstOrFail();

        $this->assertSame('DEP-MP', $admedco->warehouse->code);
        $this->assertSame('DEP-MP-MBX', $mobilix->warehouse->code);
        $this->assertSame($this->admedco->id, $admedco->warehouse->tenant_id);
        $this->assertSame($this->mobilix->id, $mobilix->warehouse->tenant_id);

        // Each factory has its own finished-goods depot as well — warehouses are
        // tenant-scoped, so a single shared DEP-PF would be invisible to both.
        foreach ([$this->admedco, $this->mobilix] as $factory) {
            $this->assertDatabaseHas('warehouses', [
                'tenant_id' => $factory->id,
                'code' => 'DEP-PF',
                'kind' => Warehouse::KIND_FINISHED_GOODS,
            ]);
        }
    }

    public function test_guest_is_sent_to_login(): void
    {
        $this->get('/portal/admedco')->assertRedirect('/login');
    }

    public function test_operator_opens_their_own_portal_and_sees_only_their_ateliers(): void
    {
        $response = $this->actingAs($this->operator($this->admedco))->get('/portal/admedco');

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page
            ->component('portal/FactoryPortal')
            ->where('factory.code', 'ADMEDCO')
            ->where('canSwitch', false)
            ->has('lines', 6)
            ->has('depots', 2));

        // The portal lists its ateliers by code; the *route* through them is the
        // process template's step order (see ChaiseCatalogTest).
        $codes = collect($response->viewData('page')['props']['lines'])->pluck('code')->all();
        $this->assertSame(['COUPE', 'MEULAGE', 'POUDRAGE', 'SOUDAGE', 'USINAGE', 'VISSAGE'], $codes);
        $this->assertNotContains('M1', $codes);
        $this->assertNotContains('DECOUPE-BOIS', $codes);
    }

    public function test_operator_is_returned_to_their_own_portal_from_the_other_factory(): void
    {
        $this->actingAs($this->operator($this->admedco))
            ->get('/portal/mobilix')
            ->assertRedirect('/portal/admedco');
    }

    public function test_unknown_factory_segment_is_not_found(): void
    {
        $this->actingAs($this->operator($this->admedco))->get('/portal/renault')->assertNotFound();
    }

    public function test_admin_can_reach_both_portals_and_switch(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->get('/portal/admedco')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('factory.code', 'ADMEDCO')->where('canSwitch', true));

        $this->actingAs($admin)->get('/portal/mobilix')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('factory.code', 'MOBILIX'));
    }

    public function test_user_without_a_portal_role_is_refused(): void
    {
        $outsider = User::factory()->create(['tenant_id' => $this->admedco->id]);

        $this->actingAs($outsider)->get('/portal/admedco')->assertForbidden();
    }

    public function test_a_portal_role_on_the_wrong_tenant_is_refused(): void
    {
        // The role says ADMEDCO, the account belongs to MOBILIX — the portal must
        // not open onto a factory the account has no claim to.
        $mismatched = $this->operator($this->mobilix, FactoryPortal::ROLE_ADMEDCO);

        $this->actingAs($mismatched)->get('/portal/admedco')->assertForbidden();
    }

    public function test_a_factory_operator_lands_on_their_portal_after_login(): void
    {
        $operator = $this->operator($this->mobilix);

        $this->actingAs($operator)->get('/')->assertRedirect('/portal/mobilix');
    }

    public function test_a_factory_operator_reaches_the_shop_floor_without_the_generic_operator_role(): void
    {
        // The portal roles are their own roles, not Operator aliases: if the
        // /operator routes kept requiring `Operator`, a portal operator could
        // see their ateliers and then be refused the queue behind them.
        $this->actingAs($this->operator($this->admedco))->get('/operator/select-line')->assertOk();
    }

    public function test_operator_opens_an_atelier_of_their_own_factory(): void
    {
        $atelier = Line::withoutGlobalScope(\App\Scopes\TenantScope::class)
            ->where('tenant_id', $this->admedco->id)->where('code', 'MEULAGE')->firstOrFail();

        // No per-user line assignment anywhere: the portal grants the factory,
        // and opening one of its ateliers must not need a second grant.
        $this->actingAs($this->operator($this->admedco))
            ->post('/portal/admedco/open', ['line_id' => $atelier->id])
            ->assertRedirect('/operator/queue')
            ->assertSessionHas('selected_line_id', $atelier->id);
    }

    public function test_operator_cannot_open_another_factorys_atelier_through_their_portal(): void
    {
        $mobilixAtelier = Line::withoutGlobalScope(\App\Scopes\TenantScope::class)
            ->where('tenant_id', $this->mobilix->id)->firstOrFail();

        $this->actingAs($this->operator($this->admedco))
            ->post('/portal/admedco/open', ['line_id' => $mobilixAtelier->id])
            ->assertNotFound();
    }
}
