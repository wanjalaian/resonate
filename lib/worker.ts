/**
 * Render worker — picks jobs from the queue one at a time and renders them.
 * Import this module once (e.g. in the API route) to start the worker loop.
 */
import path from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { execSync } from 'child_process';
import { queue, QueueJob } from './queue';

// ────────────────────────────────────────────────────────────────────────────
// GPU / Encoder detection
// ────────────────────────────────────────────────────────────────────────────

export type HWEncoder = 'h264_nvenc' | 'h264_videotoolbox' | 'h264_amf' | 'h264_qsv' | 'libx264';

function detectHWEncoder(): HWEncoder {
    try {
        // Find the ffmpeg bundled by remotion or in PATH
        const ffmpegBin = findFfmpeg();
        if (!ffmpegBin) return 'libx264';

        const out = execSync(`"${ffmpegBin}" -encoders 2>&1`, { timeout: 5000 }).toString();

        if (out.includes('h264_nvenc')) return 'h264_nvenc';
        if (out.includes('h264_videotoolbox')) return 'h264_videotoolbox';
        if (out.includes('h264_amf')) return 'h264_amf';
        if (out.includes('h264_qsv')) return 'h264_qsv';
    } catch {
        // silently fall back
    }
    return 'libx264';
}

function findFfmpeg(): string | null {
    // Check remotion's bundled ffmpeg first
    const candidates = [
        path.join(process.cwd(), 'node_modules/@remotion/compositor-linux-x64/build/remotion'),
        // macOS
        path.join(process.cwd(), 'node_modules/@remotion/compositor-darwin-arm64/build/remotion'),
        path.join(process.cwd(), 'node_modules/@remotion/compositor-darwin-x64/build/remotion'),
        // Fallback to system PATH
        'ffmpeg',
    ];
    for (const c of candidates) {
        try { execSync(`"${c}" -version 2>&1`, { timeout: 3000 }); return c; } catch { /* skip */ }
    }
    return null;
}

// Detect once at module load
let detectedEncoder: HWEncoder | null = null;
function getEncoder(): HWEncoder {
    if (!detectedEncoder) detectedEncoder = detectHWEncoder();
    return detectedEncoder;
}

// ────────────────────────────────────────────────────────────────────────────
// Worker loop
// ────────────────────────────────────────────────────────────────────────────

let workerRunning = false;
let activeJobId: string | null = null;

export function getWorkerState() {
    return { workerRunning, activeJobId, encoder: getEncoder() };
}

// Kick off the loop — safe to call multiple times (idempotent)
export function startWorker() {
    if (workerRunning) return;
    workerRunning = true;
    runLoop();
}

async function runLoop() {
    while (true) {
        const job = queue.nextPending();
        if (!job) {
            await sleep(2000); // poll every 2 s
            continue;
        }
        activeJobId = job.id;
        try {
            await renderJob(job);
        } catch (err: any) {
            console.error('[Worker] Unhandled error for job', job.id, err);
            queue.update(job.id, {
                status: 'error',
                error: err.message,
                completedAt: Date.now(),
            });
        }
        activeJobId = null;
    }
}

async function renderJob(job: QueueJob) {
    const { id } = job;
    const payload = JSON.parse(job.payload);
    const { config, tracks: rawTracks, backgrounds: rawBackgrounds, audioFiles, bgFileBuffers } = payload;

    queue.update(id, { status: 'rendering', startedAt: Date.now(), progress: 0.01 });

    const tempDir = path.join(os.tmpdir(), `remotion-queue-${id}`);
    await mkdir(tempDir, { recursive: true });

    let server: http.Server | null = null;

    try {
        const { bundle } = await import('@remotion/bundler');
        const { renderMedia, selectComposition } = await import('@remotion/renderer');

        // ── Write audio files ──────────────────────────────────────────────────
        const fileMap: Record<string, string> = {};
        for (const [trackId, b64] of Object.entries(audioFiles as Record<string, string>)) {
            const safeName = `audio-${trackId}.data`;
            await writeFile(path.join(tempDir, safeName), Buffer.from(b64, 'base64'));
            fileMap[trackId] = safeName;
        }

        // ── Write background files ─────────────────────────────────────────────
        const bgFileMap: Record<string, string> = {};
        for (const [bgId, b64] of Object.entries(bgFileBuffers as Record<string, string>)) {
            const safeName = `bg-${bgId}.data`;
            await writeFile(path.join(tempDir, safeName), Buffer.from(b64, 'base64'));
            bgFileMap[bgId] = safeName;
        }

        // ── Local asset HTTP server ────────────────────────────────────────────
        server = http.createServer((req, res) => {
            const fileName = (req.url || '/').substring(1);
            const safePath = path.join(tempDir, path.basename(fileName));
            fs.readFile(safePath, (err, data) => {
                if (err) { res.statusCode = 404; res.end('Not Found'); return; }
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Content-Type', 'application/octet-stream');
                res.end(data);
            });
        });

        await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
        // @ts-ignore
        const port = (server.address() as any).port;
        const baseUrl = `http://127.0.0.1:${port}`;

        const audioTracks = rawTracks.map((t: any) => ({
            ...t,
            url: fileMap[t.id] ? `${baseUrl}/${fileMap[t.id]}` : t.url,
        }));

        const backgrounds = rawBackgrounds.map((b: any) => ({
            ...b,
            url: bgFileMap[b.id] ? `${baseUrl}/${bgFileMap[b.id]}` : b.url,
        }));

        const inputProps = { audioTracks, backgrounds, config };

        // ── Bundle ─────────────────────────────────────────────────────────────
        const entryPoint = path.join(process.cwd(), 'remotion/index.ts');
        const bundleLocation = await bundle({
            entryPoint,
            webpackOverride: (cfg: any) => {
                if (!cfg.resolve) cfg.resolve = {};
                cfg.resolve.alias = { ...(cfg.resolve.alias || {}), '@': process.cwd() };
                if (!cfg.module) cfg.module = { rules: [] };
                cfg.module.rules = cfg.module.rules?.filter((r: any) =>
                    !(r && typeof r === 'object' && r.test && r.test.toString().includes('css'))
                ) || [];
                cfg.module.rules.push({
                    test: /\.css$/i,
                    use: ['style-loader', 'css-loader', {
                        loader: 'postcss-loader',
                        options: { postcssOptions: { plugins: [['@tailwindcss/postcss', {}]] } },
                    }],
                });
                return cfg;
            },
        });

        queue.setProgress(id, 0.1);

        const composition = await selectComposition({ serveUrl: bundleLocation, id: 'Visualizer', inputProps });
        const totalDuration = rawTracks.reduce((acc: number, t: any) => acc + (t.durationInFrames || 0), 0);
        if (totalDuration > 0) (composition as any).durationInFrames = totalDuration;

        // ── Output ─────────────────────────────────────────────────────────────
        const outputFileName = `render-${id}.mp4`;
        const publicDir = path.join(process.cwd(), 'public');
        const outputLocation = path.join(publicDir, outputFileName);

        const encoder = getEncoder();
        queue.update(id, { encoderUsed: encoder });
        console.log(`[Worker] Job ${id} using encoder: ${encoder}`);

        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: 'h264',
            outputLocation,
            inputProps,
            concurrency: os.cpus().length,
            // @ts-ignore — Remotion supports this on newer versions
            hardwareAcceleration: encoder !== 'libx264' ? 'if-possible' : 'disabled',
            chromiumOptions: { gl: 'angle', args: ['--allow-file-access-from-files'] },
            onProgress: ({ progress }: { progress: number }) => {
                queue.setProgress(id, 0.1 + progress * 0.9);
            },
        });

        queue.update(id, {
            status: 'done',
            progress: 1,
            outputUrl: `/${outputFileName}`,
            outputFileName,
            completedAt: Date.now(),
        });
        console.log(`[Worker] Job ${id} done ✓`);

    } finally {
        if (server) server.close();
        // Clean up temp files
        rm(tempDir, { recursive: true, force: true }).catch(() => { });
    }
}

function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}
