import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { renderJobs } from '@/lib/store';

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
    let jobId = Math.random().toString(36).substring(7);

    try {
        const formData = await req.formData();

        // Start Job
        renderJobs.set(jobId, { id: jobId, status: 'pending', progress: 0 });

        const configStr = formData.get('config') as string;
        const tracksStr = formData.get('tracks') as string;
        const backgroundsStr = formData.get('backgrounds') as string;
        const files = formData.getAll('files') as File[];
        const bgFiles = formData.getAll('bgFiles') as File[];

        const tempDir = path.join(os.tmpdir(), 'remotion-render-' + jobId);
        await mkdir(tempDir, { recursive: true });

        // --- BACKGROUND PROCESSING ---
        (async () => {
            let server: http.Server | null = null;
            try {
                renderJobs.set(jobId, { id: jobId, status: 'processing', progress: 0.01 });

                // Dynamic import to avoid build-time issues if not using standard next config
                const { bundle } = await import('@remotion/bundler');
                const { renderMedia, selectComposition } = await import('@remotion/renderer');

                // Save Audio Files
                const fileMap: Record<string, string> = {};
                for (const file of files) {
                    const bytes = await file.arrayBuffer();
                    // Clean filename to be safe
                    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const filePath = path.join(tempDir, safeName);
                    await writeFile(filePath, Buffer.from(bytes));
                    fileMap[file.name] = safeName; // Map original name (trackID) to safe filename
                }

                // Save Background Files
                const bgFileMap: Record<string, string> = {};
                for (const file of bgFiles) {
                    const bytes = await file.arrayBuffer();
                    const safeName = 'bg-' + file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const filePath = path.join(tempDir, safeName);
                    await writeFile(filePath, Buffer.from(bytes));
                    bgFileMap[file.name] = safeName; // Map ID to filename
                }

                // --- START LOCAL ASSET SERVER ---
                // We serve the tempDir via HTTP to avoid file:// CORS issues in headless chrome
                server = http.createServer((req, res) => {
                    // Remove leading slash
                    const fileName = (req.url || '/').substring(1);
                    // Prevent directory traversal
                    const safePath = path.join(tempDir, path.basename(fileName));

                    fs.readFile(safePath, (err, data) => {
                        if (err) {
                            res.statusCode = 404;
                            res.end('Not Found');
                            return;
                        }
                        res.setHeader('Access-Control-Allow-Origin', '*'); // Key for CORS
                        res.setHeader('Content-Type', 'application/octet-stream'); // Browser can sniff usually
                        res.end(data);
                    });
                });

                await new Promise<void>((resolve) => {
                    server!.listen(0, '127.0.0.1', () => resolve());
                });
                const address = server.address();
                // @ts-ignore
                const port = address.port; // @ts-ignore
                const baseUrl = `http://127.0.0.1:${port}`;
                console.log(`Asset server listening on ${baseUrl} serving ${tempDir}`);

                // Reconstruct Props with HTTP URLs
                const rawTracks = tracksStr ? JSON.parse(tracksStr) : [];
                const rawBackgrounds = backgroundsStr ? JSON.parse(backgroundsStr) : [];
                const config = JSON.parse(configStr);

                const audioTracks = rawTracks.map((t: any) => {
                    // t.id was sent as filename for files
                    const safeName = fileMap[t.id];
                    return {
                        ...t,
                        url: safeName ? `${baseUrl}/${safeName}` : t.url
                    };
                });

                const backgrounds = rawBackgrounds.map((b: any) => {
                    const safeName = bgFileMap[b.id];
                    return {
                        ...b,
                        url: safeName ? `${baseUrl}/${safeName}` : b.url
                    };
                });

                const inputProps = {
                    audioTracks,
                    backgrounds,
                    config
                };

                // Bundle
                const resourceBase = process.cwd();
                const asarUnpacked = path.join(resourceBase, 'app.asar.unpacked');
                // Remotion source files must be on real filesystem (not inside asar)
                const entryBase = fs.existsSync(asarUnpacked) ? asarUnpacked : resourceBase;
                const entryPoint = path.join(entryBase, 'remotion/index.ts');

                const bundleLocation = await bundle({
                    entryPoint,
                    webpackOverride: (config) => {
                        if (!config.resolve) config.resolve = {};
                        config.resolve.alias = {
                            ...(config.resolve.alias || {}),
                            '@': entryBase,
                        };

                        // Explicitly add CSS rule for Tailwind v4
                        // First, filter out any default Remotion CSS rules to prevent conflicts/double-loading
                        if (!config.module) config.module = { rules: [] };
                        config.module.rules = config.module.rules?.filter(r => {
                            return !(r && typeof r === 'object' && r.test && r.test.toString().includes('css'));
                        }) || [];

                        config.module.rules.push({
                            test: /\.css$/i,
                            use: [
                                "style-loader",
                                "css-loader",
                                {
                                    loader: "postcss-loader",
                                    options: {
                                        postcssOptions: {
                                            plugins: [
                                                ["@tailwindcss/postcss", {}]
                                            ]
                                        }
                                    }
                                }
                            ],
                        });

                        return config;
                    },
                });

                renderJobs.set(jobId, { id: jobId, status: 'processing', progress: 0.1 });

                // Select Composition
                const composition = await selectComposition({
                    serveUrl: bundleLocation,
                    id: 'Visualizer',
                    inputProps,
                });

                // Override duration to match total audio length
                const totalDuration = rawTracks.reduce((acc: number, t: any) => acc + (t.durationInFrames || 0), 0);
                if (totalDuration > 0) {
                    // @ts-ignore
                    composition.durationInFrames = totalDuration;
                }

                const outputFileName = `render-${jobId}.mp4`;
                const publicDir = path.join(process.cwd(), 'public');
                const outputLocation = path.join(publicDir, outputFileName);

                await renderMedia({
                    composition,
                    serveUrl: bundleLocation,
                    codec: 'h264',
                    outputLocation,
                    inputProps,
                    concurrency: os.cpus().length,
                    // Enable hardware acceleration if available (e.g. NVENC, VideoToolbox)
                    // @ts-ignore
                    proResProfile: 'HQ', // Ignored if h264, but good practice
                    // @ts-ignore
                    hardwareAcceleration: 'if-possible',
                    chromiumOptions: {
                        gl: 'angle',
                        // We still allow file access just in case, but rely on HTTP
                        // @ts-ignore
                        args: ['--allow-file-access-from-files']
                    },
                    onProgress: ({ progress }) => {
                        const userProgress = 0.1 + (progress * 0.9);
                        renderJobs.set(jobId, { id: jobId, status: 'processing', progress: userProgress });
                    }
                });

                console.log("Job Done:", jobId);
                renderJobs.set(jobId, { id: jobId, status: 'done', progress: 1, url: `/${outputFileName}` });

            } catch (innerErr: any) {
                console.error("Async Job Error:", innerErr);
                renderJobs.set(jobId, { id: jobId, status: 'error', progress: 0, error: innerErr.message });
            } finally {
                if (server) server.close();
            }
        })();

        return NextResponse.json({ jobId });

    } catch (err: any) {
        console.error("Sync Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
