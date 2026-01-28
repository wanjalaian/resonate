export type RenderJob = {
    id: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    progress: number;
    url?: string;
    error?: string;
};

// Use globalThis to persist state across Next.js HMR/rebuilds in development
const globalStore = globalThis as unknown as {
    _renderJobs: Map<string, RenderJob>;
};

if (!globalStore._renderJobs) {
    globalStore._renderJobs = new Map<string, RenderJob>();
}

export const renderJobs = globalStore._renderJobs;
