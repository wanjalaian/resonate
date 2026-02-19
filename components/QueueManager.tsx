'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    X, Download, Trash2, StopCircle, Cpu, CheckCircle2,
    AlertCircle, Clock, Loader2, Play, ChevronDown, Zap, ListVideo
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface QueueJobClient {
    id: string;
    label: string;
    status: 'pending' | 'rendering' | 'done' | 'error' | 'cancelled';
    progress: number;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    outputUrl?: string;
    error?: string;
    encoderUsed?: string;
}

interface WorkerState {
    workerRunning: boolean;
    activeJobId: string | null;
    encoder: string;
}

interface QueueManagerProps {
    open: boolean;
    onClose: () => void;
}

const STATUS_CONFIG = {
    pending: { label: 'Queued', color: 'text-neutral-400', bg: 'bg-neutral-800', Icon: Clock },
    rendering: { label: 'Rendering', color: 'text-teal-400', bg: 'bg-teal-900/30', Icon: Loader2 },
    done: { label: 'Done', color: 'text-green-400', bg: 'bg-green-900/20', Icon: CheckCircle2 },
    error: { label: 'Error', color: 'text-red-400', bg: 'bg-red-900/20', Icon: AlertCircle },
    cancelled: { label: 'Cancelled', color: 'text-neutral-500', bg: 'bg-neutral-900', Icon: StopCircle },
};

function fmt(ms: number) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${s % 60}s`;
}

function JobRow({ job, onCancel, onDelete }: {
    job: QueueJobClient;
    onCancel: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const cfg = STATUS_CONFIG[job.status];
    const { Icon } = cfg;

    const duration = job.completedAt && job.startedAt
        ? fmt(job.completedAt - job.startedAt)
        : job.startedAt
            ? fmt(Date.now() - job.startedAt)
            : null;

    return (
        <div className={cn('rounded-xl border border-neutral-800 p-3 space-y-2 transition', cfg.bg)}>
            <div className="flex items-start gap-3">
                {/* Status icon */}
                <div className={cn('mt-0.5 shrink-0', cfg.color)}>
                    <Icon size={15} className={job.status === 'rendering' ? 'animate-spin' : ''} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{job.label}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider', cfg.color)}>
                            {cfg.label}
                        </span>
                        {duration && (
                            <span className="text-[10px] text-neutral-500 font-mono">{duration}</span>
                        )}
                        {job.encoderUsed && (
                            <span className="text-[10px] text-purple-400 font-mono bg-purple-900/20 px-1.5 py-0.5 rounded">
                                {job.encoderUsed}
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    {job.status === 'done' && job.outputUrl && (
                        <a
                            href={job.outputUrl}
                            download
                            className="p-1.5 text-green-400 hover:bg-green-900/30 rounded-lg transition"
                            title="Download"
                        >
                            <Download size={14} />
                        </a>
                    )}
                    {(job.status === 'pending' || job.status === 'rendering') && (
                        <button
                            onClick={() => onCancel(job.id)}
                            className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition"
                            title="Cancel"
                        >
                            <StopCircle size={14} />
                        </button>
                    )}
                    {(job.status === 'done' || job.status === 'error' || job.status === 'cancelled') && (
                        <button
                            onClick={() => onDelete(job.id)}
                            className="p-1.5 text-neutral-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition"
                            title="Remove"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            {(job.status === 'rendering' || job.status === 'pending') && (
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-teal-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(job.progress * 100)}%` }}
                    />
                </div>
            )}
            {job.status === 'rendering' && (
                <p className="text-[10px] text-neutral-500 text-right font-mono">
                    {Math.round(job.progress * 100)}%
                </p>
            )}

            {/* Error message */}
            {job.status === 'error' && job.error && (
                <p className="text-[11px] text-red-400 bg-red-900/20 rounded-lg px-3 py-2 font-mono break-all">
                    {job.error}
                </p>
            )}
        </div>
    );
}

export default function QueueManager({ open, onClose }: QueueManagerProps) {
    const [jobs, setJobs] = useState<QueueJobClient[]>([]);
    const [worker, setWorker] = useState<WorkerState | null>(null);

    const fetchJobs = useCallback(async () => {
        try {
            const res = await fetch('/api/queue/list');
            if (!res.ok) return;
            const data = await res.json();
            setJobs(data.jobs);
            setWorker(data.worker);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        if (!open) return;
        fetchJobs();
        const interval = setInterval(fetchJobs, 2000);
        return () => clearInterval(interval);
    }, [open, fetchJobs]);

    const handleCancel = async (id: string) => {
        await fetch(`/api/queue/status?id=${id}`, { method: 'DELETE' });
        fetchJobs();
    };

    const handleDelete = async (id: string) => {
        // We'll just cancel (sets cancelled) then clear
        await fetch(`/api/queue/status?id=${id}`, { method: 'DELETE' });
        fetchJobs();
    };

    const handleClearDone = async () => {
        await fetch('/api/queue/list', { method: 'DELETE' });
        fetchJobs();
    };

    const pending = jobs.filter(j => j.status === 'pending');
    const rendering = jobs.filter(j => j.status === 'rendering');
    const done = jobs.filter(j => j.status === 'done' || j.status === 'error' || j.status === 'cancelled');

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-end"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative h-full w-full max-w-md bg-neutral-900 border-l border-neutral-800 flex flex-col shadow-2xl">

                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-800 shrink-0">
                    <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <ListVideo size={14} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-sm font-bold text-white">Render Queue</h2>
                        <p className="text-[10px] text-neutral-500">
                            {pending.length} queued · {rendering.length} rendering · {done.filter(j => j.status === 'done').length} done
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition">
                        <X size={16} />
                    </button>
                </div>

                {/* Worker Status Bar */}
                {worker && (
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-neutral-950 border-b border-neutral-800 text-[11px]">
                        <Cpu size={12} className="text-purple-400 shrink-0" />
                        <span className="text-neutral-500">Encoder:</span>
                        <span className="text-purple-300 font-mono font-bold">{worker.encoder}</span>
                        {worker.encoder !== 'libx264' && (
                            <span className="ml-1 text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                GPU ⚡
                            </span>
                        )}
                        <div className="flex-1" />
                        <div className={cn(
                            'w-2 h-2 rounded-full',
                            rendering.length > 0 ? 'bg-teal-400 animate-pulse' : 'bg-neutral-700'
                        )} />
                        <span className={rendering.length > 0 ? 'text-teal-400' : 'text-neutral-600'}>
                            {rendering.length > 0 ? 'Worker active' : 'Worker idle'}
                        </span>
                    </div>
                )}

                {/* Job list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {jobs.length === 0 && (
                        <div className="text-center py-16 opacity-40">
                            <ListVideo className="mx-auto mb-3 text-neutral-600" size={36} />
                            <p className="text-sm text-neutral-500">No jobs queued yet.</p>
                            <p className="text-xs text-neutral-600 mt-1">Use "Add to Queue" to enqueue a mix.</p>
                        </div>
                    )}

                    {rendering.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Now Rendering</p>
                            {rendering.map(j => <JobRow key={j.id} job={j} onCancel={handleCancel} onDelete={handleDelete} />)}
                        </div>
                    )}

                    {pending.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Up Next ({pending.length})</p>
                            {pending.map(j => <JobRow key={j.id} job={j} onCancel={handleCancel} onDelete={handleDelete} />)}
                        </div>
                    )}

                    {done.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Completed</p>
                                <button
                                    onClick={handleClearDone}
                                    className="text-[10px] text-neutral-600 hover:text-red-400 transition"
                                >
                                    Clear all
                                </button>
                            </div>
                            {done.map(j => <JobRow key={j.id} job={j} onCancel={handleCancel} onDelete={handleDelete} />)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
