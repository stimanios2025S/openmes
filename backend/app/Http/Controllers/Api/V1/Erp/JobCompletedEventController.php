<?php

namespace App\Http\Controllers\Api\V1\Erp;

use App\Http\Controllers\Controller;
use App\Models\BatchStep;
use App\Services\Erp\JobCompletionReporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/v1/events/job-completed — the ERP-facing end of the job.completed
 * event.
 *
 * A station closing a step already emits the event on its own (BatchService →
 * JobCompletionReporter), delivered to every webhook endpoint subscribed to
 * `job.completed`. This route is the counterpart an integration needs to run
 * against:
 *
 *  - it returns the payload that was, or would be, delivered, so the ERP team
 *    can verify the contract for a real step without waiting for one to run,
 *  - and it re-dispatches, so a delivery lost to an ERP outage can be replayed
 *    instead of the completion being re-entered by hand on the shop floor.
 *
 * Calling it twice therefore delivers twice — replayed is exactly what a replay
 * is, and the delivery log records each attempt.
 *
 * Requires the `erp:production:read` scope: it reads a completion, it does not
 * create one.
 */
class JobCompletedEventController extends Controller
{
    public function store(Request $request, JobCompletionReporter $reporter): JsonResponse
    {
        $validated = $request->validate([
            'batch_step_id' => ['required', 'integer', 'exists:batch_steps,id'],
            // False lets an integration dry-run the contract against a step it
            // has not actually completed; the default reports for real.
            'dispatch' => ['nullable', 'boolean'],
        ]);

        $step = BatchStep::findOrFail($validated['batch_step_id']);

        if (! empty($validated['dispatch'])) {
            $payload = $reporter->report($step);
        } else {
            $payload = $reporter->payload($step);
        }

        return response()->json(['data' => $payload]);
    }
}
