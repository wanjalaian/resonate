/**
 * GET /api/queue/list   — returns all jobs (newest first)
 * DELETE /api/queue/list — clears completed/errored jobs
 */
import { NextRequest, NextResponse } from 'next/server';
import { queue } from '@/lib/queue';
import { getWorkerState, startWorker } from '@/lib/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    // Ensure worker is running (idempotent)
    startWorker();
    const jobs = queue.getAll().map(j => ({
        ...j,
        payload: undefined, // don't send the big payload blob to the client
    }));
    const workerState = getWorkerState();
    return NextResponse.json({ jobs, worker: workerState });
}

export async function DELETE() {
    queue.clear();
    return NextResponse.json({ ok: true });
}
