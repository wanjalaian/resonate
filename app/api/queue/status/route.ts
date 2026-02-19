/**
 * GET /api/queue/status?id=xxx  — single job status (no payload)
 * DELETE /api/queue/status?id=xxx — cancel / delete a job
 */
import { NextRequest, NextResponse } from 'next/server';
import { queue } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 });
    const job = queue.get(id);
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { payload: _p, ...safe } = job as any;
    return NextResponse.json(safe);
}

export async function DELETE(req: NextRequest) {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 });
    queue.cancel(id);
    return NextResponse.json({ ok: true });
}
