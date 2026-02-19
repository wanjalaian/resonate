/**
 * POST /api/queue/add
 * Accepts a mix config + audio/bg file blobs and enqueues a render job.
 * Returns { jobId } immediately.
 */
import { NextRequest, NextResponse } from 'next/server';
import { queue } from '@/lib/queue';
import { startWorker } from '@/lib/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // just enqueuing, not rendering

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();

        const label = (formData.get('label') as string) || 'Untitled Mix';
        const configStr = formData.get('config') as string;
        const tracksStr = formData.get('tracks') as string;
        const bgsStr = formData.get('backgrounds') as string;
        const files = formData.getAll('files') as File[];
        const bgFiles = formData.getAll('bgFiles') as File[];

        // Convert blobs → base64 so the payload is self-contained (worker has no access to FormData)
        const audioFiles: Record<string, string> = {};
        for (const file of files) {
            const bytes = await file.arrayBuffer();
            audioFiles[file.name] = Buffer.from(bytes).toString('base64');
        }

        const bgFileBuffers: Record<string, string> = {};
        for (const file of bgFiles) {
            const bytes = await file.arrayBuffer();
            bgFileBuffers[file.name] = Buffer.from(bytes).toString('base64');
        }

        const payload = {
            config: JSON.parse(configStr),
            tracks: JSON.parse(tracksStr),
            backgrounds: JSON.parse(bgsStr || '[]'),
            audioFiles,
            bgFileBuffers,
        };

        const jobId = Math.random().toString(36).substring(7);
        queue.add(jobId, label, payload);

        // Kick off the worker (idempotent — only starts once globally)
        startWorker();

        return NextResponse.json({ jobId });
    } catch (err: any) {
        console.error('[Queue/Add]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
