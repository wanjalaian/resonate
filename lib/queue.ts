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
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'jobs.sqlite');

// Singleton across HMR
const g = globalThis as any;
if (!g.__queueDb) {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
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
}

const db: Database.Database = g.__queueDb;

// --- Prepared statements ---
const stmts = {
    insert: db.prepare(`
    INSERT INTO jobs (id, label, status, progress, createdAt, payload)
    VALUES (@id, @label, @status, @progress, @createdAt, @payload)
  `),
    getById: db.prepare('SELECT * FROM jobs WHERE id = ?'),
    getAll: db.prepare('SELECT * FROM jobs ORDER BY createdAt DESC'),
    getPending: db.prepare("SELECT * FROM jobs WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 1"),
    update: db.prepare(`
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
  `),
    delete: db.prepare('DELETE FROM jobs WHERE id = ?'),
    setStatus: db.prepare('UPDATE jobs SET status = @status WHERE id = @id'),
    setProgress: db.prepare('UPDATE jobs SET progress = @progress, status = @status WHERE id = @id'),
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
        stmts.insert.run(job);
        return job;
    },

    get(id: string): QueueJob | undefined {
        return stmts.getById.get(id) as QueueJob | undefined;
    },

    getAll(): QueueJob[] {
        return stmts.getAll.all() as QueueJob[];
    },

    nextPending(): QueueJob | undefined {
        return stmts.getPending.get() as QueueJob | undefined;
    },

    update(id: string, updates: Partial<QueueJob>) {
        const existing = queue.get(id);
        if (!existing) return;
        const merged = { ...existing, ...updates };
        stmts.update.run({
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
        stmts.setProgress.run({ id, progress, status: 'rendering' });
    },

    cancel(id: string) {
        stmts.setStatus.run({ id, status: 'cancelled' });
    },

    delete(id: string) {
        stmts.delete.run(id);
    },

    clear() {
        db.exec("DELETE FROM jobs WHERE status IN ('done','error','cancelled')");
    },
};
