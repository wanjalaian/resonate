import path from 'path';
import fs from 'fs';

export type JobStatus = 'pending' | 'rendering' | 'done' | 'error' | 'cancelled';

export interface QueueJob {
    id: string;
    label: string;           // User-defined name for the mix
    status: JobStatus;
    progress: number;        // 0–1
    createdAt: number;       // Unix ms
    startedAt?: number;
    completedAt?: number;
    outputUrl?: string;      // /public relative path when done
    error?: string;
    // Serialised config blob stored as JSON
    payload: string;         // JSON of { config, tracks, backgrounds }
    outputFileName?: string;
    // GPU info
    encoderUsed?: string;
}

const DB_DIR = path.join(process.cwd(), '.queue');
const DB_PATH = path.join(DB_DIR, 'jobs.json');

function readJobs(): QueueJob[] {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, '[]');
        return [];
    }
    try {
        const data = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function writeJobs(jobs: QueueJob[]) {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(jobs, null, 2));
}

// --- Queue API ---
export const queue = {
    add(id: string, label: string, payload: object): QueueJob {
        const jobs = readJobs();
        const job: QueueJob = {
            id,
            label,
            status: 'pending',
            progress: 0,
            createdAt: Date.now(),
            payload: JSON.stringify(payload),
        };
        jobs.push(job);
        writeJobs(jobs);
        return job;
    },

    get(id: string): QueueJob | undefined {
        return readJobs().find(j => j.id === id);
    },

    getAll(): QueueJob[] {
        return readJobs().sort((a, b) => b.createdAt - a.createdAt);
    },

    nextPending(): QueueJob | undefined {
        return readJobs()
            .filter(j => j.status === 'pending')
            .sort((a, b) => a.createdAt - b.createdAt)[0];
    },

    update(id: string, updates: Partial<QueueJob>) {
        const jobs = readJobs();
        const existingIdx = jobs.findIndex(j => j.id === id);
        if (existingIdx === -1) return;

        jobs[existingIdx] = { ...jobs[existingIdx], ...updates };
        writeJobs(jobs);
    },

    setProgress(id: string, progress: number) {
        this.update(id, { progress, status: 'rendering' });
    },

    cancel(id: string) {
        this.update(id, { status: 'cancelled' });
    },

    delete(id: string) {
        let jobs = readJobs();
        jobs = jobs.filter(j => j.id !== id);
        writeJobs(jobs);
    },

    clear() {
        let jobs = readJobs();
        jobs = jobs.filter(j => !['done', 'error', 'cancelled'].includes(j.status));
        writeJobs(jobs);
    },
};
