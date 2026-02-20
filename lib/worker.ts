/**
 * Render worker — picks jobs from the queue one at a time and renders them.
 * Import this module once (e.g. in the API route) to start the worker loop.
 */
import path from 'path';
import { writeFile, mkdir, rm, readdir } from 'fs/promises';
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
    const resourceBase = process.cwd();
    const asarUnpacked = path.join(resourceBase, 'app.asar.unpacked');
    const appDir = fs.existsSync(path.join(resourceBase, 'app.asar')) ? path.join(resourceBase, 'app.asar') : resourceBase;
    // Compositor binaries are asarUnpacked, so check there first
    const binBase = fs.existsSync(asarUnpacked) ? asarUnpacked : appDir;
    // Check remotion's bundled ffmpeg first
    const candidates = [
        path.join(binBase, 'node_modules/@remotion/compositor-linux-x64/build/remotion'),
        // macOS
        path.join(binBase, 'node_modules/@remotion/compositor-darwin-arm64/build/remotion'),
        path.join(binBase, 'node_modules/@remotion/compositor-darwin-x64/build/remotion'),
        // Windows
        path.join(binBase, 'node_modules/@remotion/compositor-win32-x64/build/remotion.exe'),
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
        const { renderMedia, selectComposition, stitchFramesToVideo } = await import('@remotion/renderer');

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
        const resourceBase = process.cwd();
        const asarUnpacked = path.join(resourceBase, 'app.asar.unpacked');
        const appDir = fs.existsSync(path.join(resourceBase, 'app.asar'))
            ? path.join(resourceBase, 'app.asar')
            : resourceBase;
        // Remotion source files must be on real filesystem (not inside asar)
        // In packaged builds, asarUnpack extracts them to app.asar.unpacked/
        const entryBase = fs.existsSync(asarUnpacked) ? asarUnpacked : resourceBase;
        const entryPoint = path.join(entryBase, 'remotion/index.ts');
        const bundleLocation = await bundle({
            entryPoint,
            webpackOverride: (cfg: any) => {
                if (!cfg.resolve) cfg.resolve = {};
                cfg.resolve.alias = { ...(cfg.resolve.alias || {}), '@': entryBase };
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

        // ── Render Strategy: Image Sequence (Resume Capability) ────────────────
        // We use a persistent frames directory so if the worker crashes, we resume.
        // The tempDir is ephemeral (OS generic), but for resume we want a stable path.
        // Actually, let's use a subfolder in the project root's .queue folder to carry over restarts.
        const jobsDir = path.join(process.cwd(), '.queue', 'frames');
        const framesDir = path.join(jobsDir, id);
        await mkdir(framesDir, { recursive: true });

        // Check for existing frames
        const existingFiles = await readdir(framesDir).catch(() => []);
        const frameFiles = existingFiles.filter(f => /^frame-\d+\.jpeg$/.test(f));

        let startFrame = 0;
        if (frameFiles.length > 0) {
            // Find max frame number
            const maxFrame = Math.max(...frameFiles.map(f => parseInt(f.match(/(\d+)/)![1])));
            // Resume from next frame. But simple verification: do we have 0..max contiguous?
            // For robustness, simply resume from max + 1. Remotion will overwrite if we overlap?
            // Actually, safest is to start from (count) if we trust they are 0..N-1.
            // Let's use max+1.
            startFrame = maxFrame + 1;
            console.log(`[Worker] Resuming job ${id} from frame ${startFrame} (${frameFiles.length} frames found)`);
        }

        const composition = await selectComposition({ serveUrl: bundleLocation, id: 'Visualizer', inputProps });
        const totalDuration = rawTracks.reduce((acc: number, t: any) => acc + (t.durationInFrames || 0), 0);
        // Ensure accurate duration
        const durationInFrames = totalDuration > 0 ? totalDuration : 300; // default 10s
        (composition as any).durationInFrames = durationInFrames;

        const endFrame = durationInFrames - 1;

        if (startFrame <= endFrame) {
            console.log(`[Worker] Rendering frames ${startFrame} to ${endFrame} for job ${id}`);
            queue.update(id, { status: 'rendering', progress: startFrame / durationInFrames });

            await renderMedia({
                composition,
                serveUrl: bundleLocation,
                codec: 'h264', // ignored for images, but required param
                outputLocation: path.join(framesDir, 'frame-{frame}.jpeg'),
                imageFormat: 'jpeg',
                inputProps,
                frameRange: [startFrame, endFrame],
                concurrency: os.cpus().length,
                chromiumOptions: { gl: 'angle' },
                onProgress: ({ progress }) => {
                    // progress here is 0..1 for the *current range*. 
                    // We need global progress: (startFrame + (progress * (endFrame - startFrame))) / total
                    const rangeLength = endFrame - startFrame + 1;
                    const absoluteProgress = (startFrame + (progress * rangeLength)) / durationInFrames;
                    queue.setProgress(id, absoluteProgress);
                },
            });
        } else {
            console.log(`[Worker] Job ${id} already has all frames rendered. Skipping to stitch.`);
        }

        // ── Stitching ──────────────────────────────────────────────────────────
        queue.update(id, { status: 'rendering', progress: 0.99 });
        console.log(`[Worker] Stitching frames for job ${id}...`);

        const outputFileName = `render-${id}.mp4`;
        const publicDir = path.join(process.cwd(), 'public');
        const outputLocation = path.join(publicDir, outputFileName);

        const assets = Array.from({ length: durationInFrames }).map((_, i) =>
            path.join(framesDir, `frame-${i}.jpeg`)
        );

        const encoder = getEncoder();
        queue.update(id, { encoderUsed: encoder });

        // Use direct ffmpeg command for stitching (more robust than internal API)
        const ffmpegBin = findFfmpeg() || 'ffmpeg';
        const fps = composition.fps || 30;

        // Input pattern: frame-%d.jpeg (handles frame-0.jpeg, frame-1.jpeg etc)
        // Note: ffmpeg expects %d to match 0, 1, 2...
        const inputPattern = path.join(framesDir, 'frame-%d.jpeg');

        // Construct command
        // -y: overwrite output
        // -framerate: input fps
        // -i: input pattern
        // -c:v: video codec (hw accel if detected)
        // -pix_fmt: yuv420p for compatibility
        // -shortest: limit by shortest stream (only video here, but good practice)
        /* 
           Hardware Encoders:
           h264_videotoolbox (Mac) -> -c:v h264_videotoolbox -b:v 5M
           h264_nvenc (NVIDIA) -> -c:v h264_nvenc -preset p4
           h264_amf (AMD) -> -c:v h264_amf
           h264_qsv (Intel) -> -c:v h264_qsv
           libx264 (CPU) -> -c:v libx264 -preset fast -crf 23
        */

        let codecArgs = '-c:v libx264 -preset fast -crf 23';
        if (encoder === 'h264_videotoolbox') codecArgs = '-c:v h264_videotoolbox -b:v 8M -allow_sw 1';
        if (encoder === 'h264_nvenc') codecArgs = '-c:v h264_nvenc -preset p4 -b:v 5M';
        if (encoder === 'h264_amf') codecArgs = '-c:v h264_amf -b:v 5M';
        if (encoder === 'h264_qsv') codecArgs = '-c:v h264_qsv -b:v 5M';

        // Add audio from the composition? 
        // Wait, we rendered images only. Audio is missing!
        // We need to render audio separately or add it here.
        // Remotion's renderMedia usually handles audio+video.
        // But renderFrames/images doesn't output audio.
        // So we need to render audio to a file first? Or use renderMedia to MP3/WAV?
        // Actually, renderMedia({ ... }) to audio file is possible.
        // Let's first stitch video. Then if audio exists, we merge?
        // Or simpler: Just render audio once at the start (fast) to `audio.mp3`.
        // Then input it to ffmpeg.

        // For visualizer, audio is critical.
        // Let's render audio now (it's fast).
        const audioOutput = path.join(tempDir, 'audio.mp3');
        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: 'mp3',
            outputLocation: audioOutput,
            inputProps,
            concurrency: os.cpus().length,
        });

        const cmd = `"${ffmpegBin}" -y -framerate ${fps} -i "${inputPattern}" -i "${audioOutput}" ${codecArgs} -pix_fmt yuv420p -shortest "${outputLocation}"`;

        console.log(`[Worker] Executing ffmpeg: ${cmd}`);
        execSync(cmd, { stdio: 'inherit' });

        queue.update(id, {
            status: 'done',
            progress: 1,
            outputUrl: `/${outputFileName}`,
            outputFileName,
            completedAt: Date.now(),
        });

        // Cleanup frames (only on success)
        await rm(framesDir, { recursive: true, force: true });
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
