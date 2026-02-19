/**
 * Persistent render queue backed by SQLite (better-sqlite3).
 * All mutations are synchronous so no race conditions.
 */
import Database from 'better-sqlite3';
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

// --- DB setup ---
const DB_DIR = path.join(process.cwd(), '.queue');

// Singleton across HMR
const g = globalThis as any;

/**
 * Lazy initialization of the database.
 * Prevents build-time execution (and file locks) when importing this module.
 */
function getDb(): Database.Database {
    if (g.__queueDb) return g.__queueDb;

    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    const DB_PATH = path.join(DB_DIR, 'jobs.sqlite');

    // Timeout allows waiting for lock slightly, but lazy init prevents
    // the build process from grabbing it unnecessarily.
    const db = new Database(DB_PATH, { timeout: 5000 });

    // WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    // Create table if needed
    db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id            TEXT PRIMARY KEY,
      label         TEXT NOT NULL DEFAULT 'Untitled Mix',
      status        TEXT NOT NULL DEFAULT 'pending',
      progress      REAL NOT NULL DEFAULT 0,
      createdAt     INTEGER NOT NULL,
      startedAt     INTEGER,
      completedAt   INTEGER,
      outputUrl     TEXT,
      outputFileName TEXT,
      error         TEXT,
      payload       TEXT NOT NULL DEFAULT '{}',
      encoderUsed   TEXT
    )
  `);

    g.__queueDb = db;
    return db;
}

// Helper to prepare statement - lazy
function prep(sql: string) {
    return (params: any) => getDb().prepare(sql).run(params);
}
// Helper for queries
function query(sql: string) {
    return {
        get: (params?: any) => getDb().prepare(sql).get(params),
        all: (params?: any) => getDb().prepare(sql).all(params),
        run: (params?: any) => getDb().prepare(sql).run(params),
    };
}

// --- Prepared statements lazy wrappers ---
const stmts = {
    insert: `INSERT INTO jobs (id, label, status, progress, createdAt, payload) VALUES (@id, @label, @status, @progress, @createdAt, @payload)`,
    getById: 'SELECT * FROM jobs WHERE id = ?',
    getAll: 'SELECT * FROM jobs ORDER BY createdAt DESC',
    getPending: "SELECT * FROM jobs WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 1",
    update: `
    UPDATE jobs SET
      status = @status,
      progress = @progress,
      startedAt = @startedAt,
      completedAt = @completedAt,
      outputUrl = @outputUrl,
      outputFileName = @outputFileName,
      error = @error,
      encoderUsed = @encoderUsed
    WHERE id = @id
  `,
    delete: 'DELETE FROM jobs WHERE id = ?',
    setStatus: 'UPDATE jobs SET status = @status WHERE id = @id',
    setProgress: 'UPDATE jobs SET progress = @progress, status = @status WHERE id = @id',
};

// --- Queue API ---
export const queue = {
    add(id: string, label: string, payload: object): QueueJob {
        const job: QueueJob = {
            id,
            label,
            status: 'pending',
            progress: 0,
            createdAt: Date.now(),
            payload: JSON.stringify(payload),
        };
        query(stmts.insert).run(job);
        return job;
    },

    get(id: string): QueueJob | undefined {
        return query(stmts.getById).get(id) as QueueJob | undefined;
    },

    getAll(): QueueJob[] {
        return query(stmts.getAll).all() as QueueJob[];
    },

    nextPending(): QueueJob | undefined {
        return query(stmts.getPending).get() as QueueJob | undefined;
    },

    update(id: string, updates: Partial<QueueJob>) {
        const existing = queue.get(id);
        if (!existing) return;
        const merged = { ...existing, ...updates };
        query(stmts.update).run({
            id,
            status: merged.status,
            progress: merged.progress,
            startedAt: merged.startedAt ?? null,
            completedAt: merged.completedAt ?? null,
            outputUrl: merged.outputUrl ?? null,
            outputFileName: merged.outputFileName ?? null,
            error: merged.error ?? null,
            encoderUsed: merged.encoderUsed ?? null,
        });
    },

    setProgress(id: string, progress: number) {
        query(stmts.setProgress).run({ id, progress, status: 'rendering' });
    },

    cancel(id: string) {
        query(stmts.setStatus).run({ id, status: 'cancelled' });
    },

    delete(id: string) {
        query(stmts.delete).run(id);
    },

    clear() {
        getDb().exec("DELETE FROM jobs WHERE status IN ('done','error','cancelled')");
    },
};
