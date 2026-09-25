<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tenant extends Model
{
    use HasFactory;

    /** ADMEDCO — sheet metal, tubing (ateliers A1/A2/A3). */
    public const CODE_ADMEDCO = 'ADMEDCO';

    /** MOBILIX — wood panels, fabrics, foam (ateliers M1/M2). */
    public const CODE_MOBILIX = 'MOBILIX';

    /**
     * The factories that have a dedicated operator portal, in display order.
     * Anything routing on a factory code should key off this list rather than
     * hard-coding the two names.
     */
    public const PORTAL_CODES = [self::CODE_ADMEDCO, self::CODE_MOBILIX];

    protected $fillable = [
        'name',
        'code',
        'hourly_rate',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'hourly_rate' => 'decimal:2',
    ];

    /**
     * Resolve a factory by its code, case-insensitively — ERP payloads are the
     * main caller and they do not reliably preserve case. Codes are stored
     * uppercase (see DualFactorySeeder).
     */
    public static function findByCode(?string $code): ?self
    {
        $code = strtoupper(trim((string) $code));

        if ($code === '') {
            return null;
        }

        return static::query()->where('code', $code)->first();
    }

    /** Whether this tenant is one of the factories with a dedicated portal. */
    public function hasPortal(): bool
    {
        return in_array($this->code, self::PORTAL_CODES, true);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(Line::class);
    }

    public function warehouses(): HasMany
    {
        return $this->hasMany(Warehouse::class);
    }

    public function workOrders(): HasMany
    {
        return $this->hasMany(WorkOrder::class);
    }

    public function processTemplates(): HasMany
    {
        return $this->hasMany(ProcessTemplate::class);
    }

    public function productTypes(): HasMany
    {
        return $this->hasMany(ProductType::class);
    }

    public function issueTypes(): HasMany
    {
        return $this->hasMany(IssueType::class);
    }
}
