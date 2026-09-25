<?php

namespace App\Http\Requests\Api\V1\Erp;

use App\Models\Tenant;
use App\Support\ProductCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates POST /api/v1/work-orders/inject — a single work order pushed by an
 * external ERP, addressed to one factory.
 *
 * Same canonical order shape as the bulk import (see ImportWorkOrdersRequest),
 * which is deliberate: an integration that already speaks
 * /api/v1/erp/work-orders/import can post one order here unchanged, plus the
 * `factory` field that routes it.
 *
 * As in the bulk import, line_code and product_type_code are NOT checked for
 * existence here — that is a per-order business outcome, reported back in the
 * response body, and a bad reference must not turn into a bare 422. The factory
 * code is different: it decides which tenant the order is written into, so an
 * unknown one is rejected outright.
 */
class InjectWorkOrderRequest extends FormRequest
{
    /** Authorization is handled upstream by the auth.apikey + scope middleware. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normalise the routing fields before validation. ERPs send "admedco" as
     * readily as "ADMEDCO", and Rule::in below compares verbatim — folding case
     * here means one rule covers both spellings instead of a costly
     * case-insensitive rule that would also have to be repeated in the error
     * message. The product code is folded for the same reason: PRD-CAN-01 is the
     * catalogue's own spelling and is not the ERP's to get right.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('factory')) {
            $this->merge(['factory' => strtoupper(trim((string) $this->input('factory')))]);
        }

        if ($this->has('order.product_type_code')) {
            $this->merge([
                'order' => array_replace((array) $this->input('order'), [
                    'product_type_code' => strtoupper(trim((string) $this->input('order.product_type_code'))),
                ]),
            ]);
        }
    }

    public function rules(): array
    {
        return [
            // Which factory portal the order belongs to. Case-insensitive
            // (Tenant::findByCode upper-cases it); validated against the codes
            // that actually have a portal rather than against the tenants table,
            // so a single-tenant install cannot be injected into by accident.
            'factory' => ['required', 'string', Rule::in(Tenant::PORTAL_CODES)],

            'order.order_no' => ['required', 'string', 'max:100'],
            'order.line_code' => ['required', 'string', 'max:100'],
            // The one product field that IS checked here: the catalogue is closed
            // (App\Support\ProductCatalog), so a legacy product code is refused at
            // the door instead of becoming a work order nobody can build. A code
            // that is in the catalogue but not seeded in the target factory still
            // falls through to the importer, which reports it per order.
            'order.product_type_code' => ['required', 'string', 'max:100', Rule::in(ProductCatalog::codes())],
            'order.planned_qty' => ['required', 'numeric', 'min:0.01', 'max:99999999'],
            'order.customer_order_no' => ['nullable', 'string', 'max:100'],
            'order.unit_price' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'order.priority' => ['nullable', 'integer', 'min:0', 'max:100'],
            'order.due_date' => ['nullable', 'date'],
            'order.description' => ['nullable', 'string', 'max:2000'],

            // How to treat an order_no that already exists in this factory.
            'strategy' => ['nullable', Rule::in(['update_or_create', 'skip_existing', 'error_on_duplicate'])],
        ];
    }

    /**
     * The factory code, upper-cased — the payload is not trusted to preserve
     * case, and `Rule::in` above is case-sensitive on purpose so that "admedco"
     * is normalised here rather than silently rejected.
     */
    public function factoryCode(): string
    {
        return strtoupper(trim((string) $this->input('factory')));
    }

    /**
     * A rejected product code is a closed catalogue, not a typo, and the
     * difference matters to whoever is on the other end of the integration:
     * Laravel's default message would send them looking for a misspelling.
     */
    public function messages(): array
    {
        return [
            'order.product_type_code.in' => __('Only :products can be ordered on this platform.', [
                'products' => __('Chaise CANADA').', '.__('Chaise G21'),
            ]),
        ];
    }

    public function strategy(): string
    {
        return $this->input('strategy', 'update_or_create');
    }

    /** The order fields, without the routing fields that are not columns. */
    public function order(): array
    {
        return $this->input('order', []);
    }
}
