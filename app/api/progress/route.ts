import { NextRequest, NextResponse } from 'next/server';
import { renderJobs } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'No ID' }, { status: 400 });

    const job = renderJobs.get(id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    return NextResponse.json(job);
}
