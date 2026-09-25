import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { __ } from '../../lib/i18n';
import { Button, Dropdown, StatusPill } from '@openmes/ui';
import OperatorLayout from '../../layouts/OperatorLayout';

/**
 * A dedicated factory portal — ADMEDCO at /portal/admedco, MOBILIX at
 * /portal/mobilix.
 *
 * The screen is the factory, not a chooser: its ateliers and its depots, with
 * the labour rate the factory's hours are costed at. Everything here comes from
 * `props` and is already scoped server-side to this one factory
 * (FactoryPortalController), so the page never decides what a user may see.
 *
 * The portal switcher only renders for Admin/Supervisor (`canSwitch`), which is
 * the same set of roles EnsureFactoryPortal lets into both portals — an operator
 * is never shown a door they cannot open.
 */
/** warehouse.kind (App\Models\Warehouse::KINDS) → pill + label, in both languages. */
const DEPOT_KIND = {
    raw_material: { status: 'pending', label: 'Raw materials' },
    finished_goods: { status: 'done', label: 'Finished goods' },
    mixed: { status: 'pending', label: 'Mixed' },
};

export default function FactoryPortal() {
    const { factory, lines = [], depots = [], canSwitch = false, portals = [] } = usePage().props;

    return (
        <>
            <Head title={factory.division ? `${factory.name} — ${__(factory.division)}` : factory.name} />
            <div className="max-w-6xl mx-auto">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-om-ink">
                                {/* "ADMEDCO — Metal Fabrication Division": the portal names
                                    its factory and the division it works as. */}
                                {factory.division ? `${factory.name} — ${__(factory.division)}` : factory.name}
                            </h1>
                            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-om-faint border border-om-line rounded-om-sm px-2 py-1">
                                {factory.code}
                            </span>
                        </div>
                        <p className="text-sm text-om-muted mt-2">
                            {__('Factory workspace — production ateliers and stock depots')}
                        </p>
                    </div>

                    <div className="text-right">
                        <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-om-faint">
                            {__('Labour rate')}
                        </div>
                        <div className="text-2xl font-semibold tracking-[-0.02em] text-om-ink">
                            {factory.hourly_rate}
                            <span className="text-sm font-normal text-om-muted"> DH/h</span>
                        </div>
                    </div>
                </div>

                {canSwitch && (
                    <div className="mb-6 flex flex-wrap items-center gap-2 bg-om-card border border-om-line rounded-om px-4 py-3">
                        <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-om-faint mr-1">
                            {__('Switch factory')}
                        </span>
                        {portals.map((portal) => (
                            <Link
                                key={portal.code}
                                href={`/portal/${portal.segment}`}
                                aria-current={portal.current ? 'page' : undefined}
                                className={
                                    portal.current
                                        ? 'px-3 py-1.5 rounded-om-sm text-sm font-medium bg-om-ink text-om-bg'
                                        : 'px-3 py-1.5 rounded-om-sm text-sm font-medium text-om-muted border border-om-line hover:bg-om-chip hover:text-om-ink transition-colors'
                                }
                            >
                                {portal.code}
                            </Link>
                        ))}
                    </div>
                )}

                <h2 className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-om-faint mb-3">
                    {__('Ateliers')}
                </h2>

                {lines.length === 0 ? (
                    <div className="bg-om-card border border-om-line rounded-om text-center py-12 px-6">
                        <h3 className="text-sm font-medium text-om-ink">{__('No ateliers configured')}</h3>
                        <p className="mt-1 text-sm text-om-muted">
                            {__('This factory has no active production line yet. Please contact your administrator.')}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {lines.map((line) => <AtelierCard key={line.id} line={line} factory={factory} />)}
                    </div>
                )}

                <h2 className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-om-faint mt-8 mb-3">
                    {__('Depots')}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {depots.map((depot) => (
                        <div key={depot.id} className="bg-om-card border border-om-line rounded-om p-4">
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-mono text-[11px] tracking-[0.04em] text-om-ink">{depot.code}</span>
                                <StatusPill status={DEPOT_KIND[depot.kind]?.status ?? 'pending'} label={__(DEPOT_KIND[depot.kind]?.label ?? 'Mixed')} />
                            </div>
                            <p className="text-sm text-om-muted mt-2">{depot.name}</p>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

function AtelierCard({ line, factory }) {
    const form = useForm({ line_id: line.id, workstation_id: '' });
    const submit = (e) => {
        e.preventDefault();
        // The portal's own open action, not /operator/select-line: that one
        // authorizes by per-user line assignment, which a factory operator does
        // not have (they are granted the whole factory).
        form.post(`/portal/${factory.segment}/open`);
    };

    return (
        <form onSubmit={submit}>
            <div className="bg-om-card border border-om-line rounded-om p-6 transition-shadow hover:shadow-[0_16px_40px_-24px_rgba(26,25,23,0.4)]">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold tracking-[-0.01em] text-om-ink">{line.name}</h3>
                    <StatusPill status="running" label={__('Active')} />
                </div>

                {line.description && <p className="text-sm text-om-muted mb-4">{line.description}</p>}

                <div className="border-t border-om-line2 pt-4 mb-4">
                    {line.workstations.length > 0 ? (
                        <>
                            <div className="block font-mono text-[9.5px] uppercase tracking-[0.08em] text-om-faint mb-2">
                                {__('Workstation')} <span className="text-om-faintest normal-case tracking-normal">{__('(optional)')}</span>
                            </div>
                            <Dropdown
                                aria-label={__('Workstation')}
                                value={form.data.workstation_id == null ? '' : String(form.data.workstation_id)}
                                onChange={(v) => form.setData('workstation_id', v)}
                                options={[
                                    { value: '', label: __('All workstations') },
                                    ...line.workstations.map((ws) => ({ value: String(ws.id), label: `${ws.name}${ws.code ? ` (${ws.code})` : ''}` })),
                                ]}
                                className="w-full"
                            />
                        </>
                    ) : (
                        <div className="flex items-center text-sm text-om-faint">
                            <span>{__('No workstations')}</span>
                        </div>
                    )}
                </div>

                <Button
                    type="submit"
                    variant="accent"
                    disabled={form.processing}
                    className="w-full px-6 py-4 text-[15px]"
                >
                    <span>{__('Open atelier')}</span>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                </Button>
            </div>
        </form>
    );
}

FactoryPortal.layout = (page) => <OperatorLayout>{page}</OperatorLayout>;
