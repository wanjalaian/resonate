"use client";

import React, { useState, useMemo, useRef } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { VisualizerComposition, VisualizerConfig, AudioTrack, VisualizerPositionPreset, VISUALIZER_POSITION_PRESETS, BackgroundMedia } from '@/components/VisualizerComposition';
import {
  Play, Download, Upload, Music, Image as ImageIcon, Trash2, Plus, Film,
  Settings2, Volume2, Activity, Zap, GripVertical, Type, Video, LayoutTemplate, Loader2, Shuffle, Scissors, Repeat, X
} from 'lucide-react';
import { getVideoMetadata } from '@remotion/media-utils';
import { cn } from '@/lib/utils';
import { readID3Tags } from '@/lib/id3';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableTrackItem({
  track,
  index,
  onRemove,
  onRename,
  onJump
}: {
  track: AudioTrack,
  index: number,
  onRemove: (id: string) => void,
  onRename: (id: string, newName: string) => void,
  onJump: () => void
}) {
  const { destructured } = { destructured: 'mock' }; // dummy
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-2 bg-neutral-800/60 hover:bg-neutral-800 rounded-lg flex items-center gap-3 group border border-transparent hover:border-neutral-700 transition mb-2 cursor-pointer relative"
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('button')) return;
        onJump();
      }}
    >
      <div {...attributes} {...listeners} className="cursor-grab hover:text-teal-400 text-neutral-600 p-1">
        <GripVertical size={16} />
      </div>

      <div className="w-6 h-6 bg-neutral-700 rounded flex items-center justify-center text-xs font-bold text-neutral-400 shrink-0">
        {index + 1}
      </div>

      <div className="min-w-0 flex-1">
        <input
          value={track.name}
          onChange={(e) => onRename(track.id, e.target.value)}
          className="bg-transparent border-none text-sm font-medium text-neutral-200 w-full focus:outline-none focus:text-white truncate"
          placeholder="Track Title"
        />
        <p className="text-xs text-neutral-500">{(track.durationInFrames / 30).toFixed(1)}s</p>
      </div>

      <button onClick={() => onRemove(track.id)} className="text-neutral-500 hover:text-red-400 p-1.5 hover:bg-neutral-700 rounded-md transition opacity-0 group-hover:opacity-100 z-20">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function TrimBar({
  duration,
  trimStart,
  trimEnd,
  onUpdate
}: {
  duration: number;
  trimStart: number;
  trimEnd: number;
  onUpdate: (updates: { trimStart?: number; trimEnd?: number }) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'left' | 'right' | null>(null);

  const startPct = (trimStart / duration) * 100;
  const endPct = (trimEnd / duration) * 100;

  const getSecFromMouseX = (clientX: number): number => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return parseFloat((ratio * duration).toFixed(2));
  };

  const onMouseDown = (side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = side;

    const onMove = (me: MouseEvent) => {
      const sec = getSecFromMouseX(me.clientX);
      if (dragging.current === 'left') {
        if (sec >= 0 && sec < trimEnd - 0.2) onUpdate({ trimStart: sec });
      } else {
        if (sec > trimStart + 0.2 && sec <= duration) onUpdate({ trimEnd: sec });
      }
    };
    const onUp = () => {
      dragging.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="space-y-1">
      {/* Timeline bar */}
      <div
        ref={barRef}
        className="relative h-8 bg-neutral-950 rounded-lg overflow-visible select-none border border-neutral-800"
      >
        {/* Full clip background */}
        <div className="absolute inset-0 rounded-lg bg-neutral-800/40" />

        {/* Active trim region */}
        <div
          className="absolute top-0 bottom-0 bg-teal-500/20 border border-teal-500/50 rounded"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
        />

        {/* Left handle */}
        <div
          className="absolute top-0 bottom-0 w-3 bg-teal-400 rounded-l cursor-col-resize flex items-center justify-center group/h z-10"
          style={{ left: `calc(${startPct}% - 6px)` }}
          onMouseDown={onMouseDown('left')}
        >
          <div className="w-0.5 h-3 bg-white/60 rounded-full" />
          <div className="w-0.5 h-3 bg-white/60 rounded-full ml-0.5" />
        </div>

        {/* Right handle */}
        <div
          className="absolute top-0 bottom-0 w-3 bg-teal-400 rounded-r cursor-col-resize flex items-center justify-center z-10"
          style={{ right: `calc(${100 - endPct}% - 6px)` }}
          onMouseDown={onMouseDown('right')}
        >
          <div className="w-0.5 h-3 bg-white/60 rounded-full" />
          <div className="w-0.5 h-3 bg-white/60 rounded-full ml-0.5" />
        </div>
      </div>

      {/* Time labels */}
      <div className="flex justify-between items-center px-0.5">
        <span className="text-[10px] font-mono text-teal-400">{trimStart.toFixed(2)}s</span>
        <span className="text-[10px] text-neutral-600">{(trimEnd - trimStart).toFixed(2)}s selected</span>
        <span className="text-[10px] font-mono text-teal-400">{trimEnd.toFixed(2)}s</span>
      </div>
    </div>
  );
}

function SortableBackgroundItem({
  item,
  onRemove,
  onUpdate
}: {
  item: BackgroundMedia,
  onRemove: (id: string) => void,
  onUpdate: (id: string, updates: Partial<BackgroundMedia>) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1
  };

  const icon = item.type === 'video' ? <Film size={14} /> : <ImageIcon size={14} />;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-3 bg-neutral-900/60 hover:bg-neutral-900 rounded-xl border border-neutral-800 hover:border-neutral-700 transition mb-2 group relative"
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3">
        <div {...attributes} {...listeners} className="cursor-grab hover:text-teal-400 text-neutral-600 p-1 shrink-0">
          <GripVertical size={14} />
        </div>

        <div className="w-7 h-7 bg-neutral-800 rounded flex items-center justify-center text-neutral-500 shrink-0">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-neutral-200 truncate">{item.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-neutral-500 bg-neutral-800/80 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">{item.type}</span>
            {item.type === 'video' && (
              <span className="text-[10px] text-neutral-500 font-mono">{item.durationInSeconds.toFixed(1)}s total</span>
            )}
          </div>
        </div>

        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
          className="text-neutral-500 hover:text-red-400 p-1.5 hover:bg-neutral-800 rounded-lg transition shrink-0 z-20"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Trim bar — only for video */}
      {item.type === 'video' && (
        <div className="space-y-3">
          <TrimBar
            duration={item.durationInSeconds}
            trimStart={item.trimStart}
            trimEnd={item.trimEnd}
            onUpdate={(updates) => onUpdate(item.id, updates)}
          />

          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <div className={cn(
              "relative w-8 h-4 rounded-full transition-colors",
              item.isBoomerang ? "bg-teal-500" : "bg-neutral-700"
            )}>
              <div className={cn(
                "absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform",
                item.isBoomerang ? "translate-x-4" : "translate-x-0.5"
              )} />
              <input
                type="checkbox"
                className="sr-only"
                checked={item.isBoomerang}
                onChange={(e) => onUpdate(item.id, { isBoomerang: e.target.checked })}
              />
            </div>
            <span className={cn("text-[10px] font-semibold tracking-wide", item.isBoomerang ? "text-teal-400" : "text-neutral-500")}>BOOMERANG</span>
          </label>
        </div>
      )}
    </div>
  );
}

export default function AudioVisualizerApp() {
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [backgrounds, setBackgrounds] = useState<BackgroundMedia[]>([]);

  const [showAllTracks, setShowAllTracks] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('visualizer-mix');
  const [exportMetaTitle, setExportMetaTitle] = useState('');
  const [exportMetaDesc, setExportMetaDesc] = useState('');
  const [exportTimestamps, setExportTimestamps] = useState('');

  const playerRef = useRef<PlayerRef>(null);

  const [config, setConfig] = useState<VisualizerConfig>({
    color: '#ffffff',
    type: 'wave',
    sensitivity: 1.5,
    position: 50,
    visualizerPosition: 'center',
    orientation: 'horizontal',
    showTitle: true,
    titlePosition: 'center'
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const bgSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Track existing names
    const existingNames = new Set(audioTracks.map(t => t.name));

    for (const file of files) {
      const url = URL.createObjectURL(file);
      let trackName = file.name.replace(/\.[^/.]+$/, "");
      console.log(`[AudioUpload] Processing file: ${file.name}`);

      try {
        const metadata = await readID3Tags(file);
        if (metadata.title) {
          trackName = metadata.title;
        }
      } catch (metaErr) {
        console.warn("Could not read metadata", metaErr);
      }

      // Dedupe
      let uniqueName = trackName;
      let counter = 2;
      while (existingNames.has(uniqueName)) {
        uniqueName = `${trackName} (${counter})`;
        counter++;
      }
      existingNames.add(uniqueName);

      try {
        const durationInSeconds = await getAudioDurationInSeconds(url);
        const durationInFrames = Math.ceil(durationInSeconds * 30);

        setAudioTracks(prev => [...prev, {
          id: `track-${Math.random().toString(36).substr(2, 9)}`,
          url,
          name: uniqueName,
          durationInFrames
        }]);
      } catch (err) {
        console.error("Failed", err);
        setAudioTracks(prev => [...prev, {
          id: `track-${Math.random().toString(36).substr(2, 9)}`,
          url,
          name: uniqueName,
          durationInFrames: 30 * 30
        }]);
      }
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      const url = URL.createObjectURL(file);
      let duration = 5;
      let type: 'video' | 'image' = 'image';

      if (file.type.startsWith('video/')) {
        type = 'video';
        try {
          const meta = await getVideoMetadata(url);
          duration = meta.durationInSeconds;
        } catch (err) {
          console.error("Failed", err);
          duration = 10;
        }
      }

      setBackgrounds(prev => [...prev, {
        id: `bg-${Math.random().toString(36).substr(2, 9)}`,
        type,
        url,
        name: file.name,
        durationInSeconds: duration,
        trimStart: 0,
        trimEnd: duration,
        isBoomerang: false
      }]);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setAudioTracks((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleBgDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setBackgrounds((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const removeTrack = (id: string) => setAudioTracks(prev => prev.filter(t => t.id !== id));

  const shuffleTracks = () => {
    setAudioTracks(prev => {
      const arr = [...prev];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
  };

  const renameTrack = (id: string, newName: string) => {
    setAudioTracks(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
  };

  const jumpToTrack = (index: number) => {
    if (!playerRef.current) return;
    let frame = 0;
    for (let i = 0; i < index; i++) {
      frame += audioTracks[i].durationInFrames;
    }
    playerRef.current.seekTo(frame);
  };

  const updateBackground = (id: string, updates: Partial<BackgroundMedia>) => {
    setBackgrounds(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const removeBackground = (id: string) => {
    setBackgrounds(prev => prev.filter(b => b.id !== id));
  };

  const openExportModal = () => {
    // Pre-fill timestamps from current playlist
    setExportTimestamps(timestampText);
    // Pre-fill title from first track if available
    if (!exportMetaTitle && audioTracks.length > 0) {
      setExportMetaTitle(audioTracks[0].name);
    }
    setShowExportModal(true);
  };

  const handleExport = async (fileName: string) => {
    setIsExporting(true);
    setExportProgress(0);
    try {
      const formData = new FormData();
      formData.append('config', JSON.stringify(config));

      const tracksMeta = audioTracks.map(t => ({
        id: t.id,
        name: t.name,
        durationInFrames: t.durationInFrames
      }));
      formData.append('tracks', JSON.stringify(tracksMeta));

      for (const t of audioTracks) {
        const blob = await fetch(t.url).then(r => r.blob());
        formData.append('files', blob, t.id);
      }

      const backgroundsMeta = backgrounds.map(b => ({ ...b }));
      formData.append('backgrounds', JSON.stringify(backgroundsMeta));

      for (const bg of backgrounds) {
        const blob = await fetch(bg.url).then(r => r.blob());
        formData.append('bgFiles', blob, bg.id);
      }

      const res = await fetch('/api/render', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Start failed');
      }

      const { jobId } = await res.json();

      while (true) {
        const statusRes = await fetch(`/api/progress?id=${jobId}`);
        if (!statusRes.ok) throw new Error('Status check failed');
        const job = await statusRes.json();

        if (job.status === 'error') throw new Error(job.error || "Failed");

        setExportProgress(job.progress);

        if (job.status === 'done' && job.url) {
          const a = document.createElement('a');
          a.href = job.url;
          a.download = `${fileName || 'visualizer-mix'}.mp4`;
          a.click();
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e: any) {
      console.error(e);
      alert("Export failed: " + e.message);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleExportConfirm = () => {
    // Build and download metadata.txt
    const lines: string[] = [];
    if (exportMetaTitle) lines.push(`Title: ${exportMetaTitle}`);
    if (exportMetaDesc) {
      lines.push('');
      lines.push(`Description:\n${exportMetaDesc}`);
    }
    if (exportTimestamps) {
      lines.push('');
      lines.push(`Timestamps:\n${exportTimestamps}`);
    }

    const metaBlob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const metaLink = document.createElement('a');
    metaLink.href = URL.createObjectURL(metaBlob);
    metaLink.download = `${exportFileName || 'visualizer-mix'}.metadata.txt`;
    metaLink.click();

    setShowExportModal(false);
    handleExport(exportFileName);
  };

  const totalDuration = audioTracks.reduce((acc, t) => acc + t.durationInFrames, 0);

  const timestampText = useMemo(() => {
    let currentTime = 0;
    return audioTracks.map(t => {
      const mins = Math.floor(currentTime / 60);
      const secs = Math.floor(currentTime % 60);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      const dur = t.durationInFrames / 30;
      currentTime += dur;
      return `${timeStr} - ${t.name}`;
    }).join('\n');
  }, [audioTracks]);

  return (
    <div className="h-screen bg-neutral-950 text-white font-sans flex flex-col overflow-hidden">

      {/* Header */}
      <header className="h-16 shrink-0 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Activity className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-purple-500">
            Resonate
          </h1>
        </div>

        {audioTracks.length > 0 && (
          <button
            onClick={isExporting ? undefined : openExportModal}
            disabled={isExporting}
            className="bg-white text-black px-4 py-1.5 rounded-full text-sm font-bold hover:bg-neutral-200 transition flex items-center gap-2 disabled:opacity-80 disabled:cursor-wait min-w-[140px] justify-center"
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>{Math.round(exportProgress * 100)}%</span>
              </>
            ) : (
              <>
                <Download size={16} /> Export
              </>
            )}
          </button>
        )}
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Sidebar */}
        <div className="w-[400px] bg-neutral-900 border-r border-neutral-800 flex flex-col h-full overflow-hidden shrink-0 z-10">
          <div className="p-5 overflow-y-auto custom-scrollbar space-y-8 h-full pb-20">

            {/* 1. Tracklist */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <Music size={14} /> Playlist ({audioTracks.length})
                </h3>
                <div className="flex items-center gap-1">
                  {audioTracks.length > 1 && (
                    <button onClick={shuffleTracks} className="text-[10px] uppercase bg-neutral-800 text-neutral-400 px-2 py-1 rounded hover:text-white hover:bg-neutral-700 transition flex items-center gap-1" title="Randomize order">
                      <Shuffle size={12} /> Shuffle
                    </button>
                  )}
                  <button onClick={() => setShowTimestamps(!showTimestamps)} className="text-[10px] uppercase bg-neutral-800 text-neutral-400 px-2 py-1 rounded hover:text-white transition">
                    {showTimestamps ? 'Hide Times' : 'Get Times'}
                  </button>
                </div>
              </div>

              {showTimestamps && (
                <div className="p-3 bg-neutral-950 rounded border border-neutral-800">
                  <textarea
                    readOnly
                    value={timestampText}
                    className="w-full bg-transparent text-xs text-neutral-400 h-24 focus:outline-none resize-none font-mono"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                </div>
              )}

              <div className="space-y-1">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={audioTracks.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {audioTracks.slice(0, showAllTracks ? undefined : 5).map((track, i) => (
                      <SortableTrackItem
                        key={track.id}
                        track={track}
                        index={i}
                        onRemove={removeTrack}
                        onRename={renameTrack}
                        onJump={() => jumpToTrack(i)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {audioTracks.length > 5 && (
                  <button
                    onClick={() => setShowAllTracks(!showAllTracks)}
                    className="w-full py-2 text-xs text-neutral-500 hover:text-neutral-300 transition text-center border border-dashed border-neutral-800 rounded-lg hover:border-neutral-700"
                  >
                    {showAllTracks ? 'Show Less' : `Show ${audioTracks.length - 5} More...`}
                  </button>
                )}

                <label className="block w-full cursor-pointer group mt-2">
                  <div className="p-3 rounded-lg border border-dashed border-neutral-700 group-hover:bg-neutral-800 transition flex items-center justify-center gap-2 text-sm text-neutral-400 group-hover:text-teal-400">
                    <Plus size={16} />
                    <span>Add Tracks</span>
                    <input type="file" accept="audio/*" multiple className="hidden" onChange={handleAudioUpload} />
                  </div>
                </label>
              </div>
            </div>

            <div className="h-px bg-neutral-800" />

            {/* Background Media List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  <Video size={14} /> Backgrounds
                </h3>
              </div>

              <div className="space-y-1">
                <DndContext
                  sensors={bgSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleBgDragEnd}
                >
                  <SortableContext
                    items={backgrounds.map(b => b.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {backgrounds.map(bg => (
                      <SortableBackgroundItem
                        key={bg.id}
                        item={bg}
                        onRemove={removeBackground}
                        onUpdate={updateBackground}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                <label className="block w-full cursor-pointer group mt-2">
                  <div className="p-3 rounded-lg border border-dashed border-neutral-700 group-hover:bg-neutral-800 transition flex items-center justify-center gap-2 text-sm text-neutral-400 group-hover:text-teal-400">
                    <Plus size={16} />
                    <span>Add Background</span>
                    <input type="file" accept="video/*,image/*" multiple className="hidden" onChange={handleMediaUpload} />
                  </div>
                </label>
              </div>
            </div>

            <div className="h-px bg-neutral-800" />

            {/* 2. Style Settings */}
            <div className="space-y-6">
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                <Settings2 size={14} /> Style & Layout
              </h3>

              {/* Visualizer Type */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-950 rounded-lg border border-neutral-800">
                {['bars', 'wave'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setConfig({ ...config, type: t as any })}
                    className={cn(
                      "py-1.5 text-xs font-semibold rounded-md capitalize transition",
                      config.type === t ? "bg-neutral-800 text-white shadow-sm border border-neutral-700" : "text-neutral-500 hover:text-neutral-300"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Visualizer Position */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs text-neutral-400">
                  <span>Visualizer Position</span>
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.orientation === 'vertical'}
                      onChange={(e) => setConfig({ ...config, orientation: e.target.checked ? 'vertical' : 'horizontal' })}
                      className="rounded bg-neutral-800 border-neutral-700 accent-teal-500"
                    />
                    Vertical Mode
                  </label>
                </div>

                {/* Preset buttons */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-neutral-950 rounded-lg border border-neutral-800">
                  {(Object.keys(VISUALIZER_POSITION_PRESETS) as VisualizerPositionPreset[]).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setConfig({ ...config, position: VISUALIZER_POSITION_PRESETS[preset], visualizerPosition: preset })}
                      className={cn(
                        "py-1.5 text-[10px] font-semibold rounded-md capitalize transition whitespace-nowrap",
                        config.visualizerPosition === preset
                          ? "bg-teal-500 text-black shadow-sm"
                          : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800"
                      )}
                    >
                      {preset === 'lower-third' ? 'Lower ⅓' : preset.charAt(0).toUpperCase() + preset.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Fine-tuning slider */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-neutral-500">
                    <span>Fine-tune</span>
                    <span>{config.position}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={config.position}
                    onChange={(e) => setConfig({ ...config, position: parseInt(e.target.value), visualizerPosition: 'custom' })}
                    className="w-full accent-teal-500 h-1.5 bg-neutral-800 rounded-full appearance-none cursor-pointer hover:bg-neutral-700"
                  />
                </div>
              </div>

              {/* Title Settings */}
              <div className="space-y-3 pt-2 border-t border-neutral-800/50">
                <div className="flex justify-between items-center">
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={config.showTitle}
                      onChange={(e) => setConfig({ ...config, showTitle: e.target.checked })}
                      className="rounded bg-neutral-800 border-neutral-700 accent-teal-500"
                    />
                    Show Title
                  </label>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Position</span>
                </div>

                {config.showTitle && (
                  <div className="grid grid-cols-3 gap-1 w-24 ml-auto">
                    <button onClick={() => setConfig({ ...config, titlePosition: 'top-left' })} className={cn("h-6 rounded hover:bg-neutral-700 text-[10px]", config.titlePosition === 'top-left' ? "bg-teal-500 text-black font-bold" : "bg-neutral-800 text-neutral-400")}>TL</button>
                    <div className="h-6"></div>
                    <button onClick={() => setConfig({ ...config, titlePosition: 'top-right' })} className={cn("h-6 rounded hover:bg-neutral-700 text-[10px]", config.titlePosition === 'top-right' ? "bg-teal-500 text-black font-bold" : "bg-neutral-800 text-neutral-400")}>TR</button>

                    <div className="h-6"></div>
                    <button onClick={() => setConfig({ ...config, titlePosition: 'center' })} className={cn("h-6 rounded hover:bg-neutral-700 text-[10px]", config.titlePosition === 'center' ? "bg-teal-500 text-black font-bold" : "bg-neutral-800 text-neutral-400")}>C</button>
                    <div className="h-6"></div>

                    <button onClick={() => setConfig({ ...config, titlePosition: 'bottom-left' })} className={cn("h-6 rounded hover:bg-neutral-700 text-[10px]", config.titlePosition === 'bottom-left' ? "bg-teal-500 text-black font-bold" : "bg-neutral-800 text-neutral-400")}>BL</button>
                    <div className="h-6"></div>
                    <button onClick={() => setConfig({ ...config, titlePosition: 'bottom-right' })} className={cn("h-6 rounded hover:bg-neutral-700 text-[10px]", config.titlePosition === 'bottom-right' ? "bg-teal-500 text-black font-bold" : "bg-neutral-800 text-neutral-400")}>BR</button>
                  </div>
                )}
              </div>

              {/* Color */}
              <div className="space-y-2 pt-2 border-t border-neutral-800/50">
                <div className="flex items-center gap-2 bg-neutral-800 p-2 rounded-lg border border-neutral-700">
                  <input
                    type="color"
                    value={config.color}
                    onChange={(e) => setConfig({ ...config, color: e.target.value })}
                    className="w-6 h-6 rounded bg-transparent cursor-pointer border-none p-0"
                  />
                  <span className="text-xs text-neutral-400 font-mono flex-1 ml-2">Visualizer Color</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Preview Area (Fixed) */}
        <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          />

          {audioTracks.length > 0 ? (
            <div className="w-full h-full max-w-[90%] max-h-[90%] aspect-video shadow-2xl relative">
              <Player
                ref={playerRef}
                component={VisualizerComposition}
                inputProps={{
                  audioTracks: audioTracks,
                  backgrounds: backgrounds,
                  config: config
                }}
                durationInFrames={totalDuration || 1}
                fps={30}
                compositionWidth={1920}
                compositionHeight={1080}
                style={{
                  width: '100%',
                  height: '100%',
                }}
                controls
                clickToPlay
              />
            </div>
          ) : (
            <div className="text-center space-y-4 opacity-50">
              <Music className="w-20 h-20 mx-auto text-neutral-700" />
              <p className="text-lg text-neutral-500 font-medium">Add tracks to start mixing</p>
            </div>
          )}
        </div>
      </div>

      {/* Export Metadata Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}
        >
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Download size={14} className="text-white" />
                </div>
                <h2 className="text-sm font-bold text-white">Export Settings</h2>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-neutral-500 hover:text-white p-1.5 hover:bg-neutral-800 rounded-lg transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">

              {/* File Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Video File Name</label>
                <div className="flex items-center bg-neutral-800 rounded-lg border border-neutral-700 focus-within:border-teal-500/60 transition overflow-hidden">
                  <input
                    type="text"
                    value={exportFileName}
                    onChange={(e) => setExportFileName(e.target.value)}
                    placeholder="visualizer-mix"
                    className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none placeholder:text-neutral-600"
                  />
                  <span className="px-3 text-xs text-neutral-500 font-mono border-l border-neutral-700">.mp4</span>
                </div>
              </div>

              {/* Metadata Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Metadata Title</label>
                <input
                  type="text"
                  value={exportMetaTitle}
                  onChange={(e) => setExportMetaTitle(e.target.value)}
                  placeholder="e.g. Summer Vibes Mix 2024"
                  className="w-full bg-neutral-800 border border-neutral-700 focus:border-teal-500/60 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none placeholder:text-neutral-600 transition"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Description</label>
                <textarea
                  value={exportMetaDesc}
                  onChange={(e) => setExportMetaDesc(e.target.value)}
                  placeholder="Add a description for your video..."
                  rows={3}
                  className="w-full bg-neutral-800 border border-neutral-700 focus:border-teal-500/60 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none placeholder:text-neutral-600 transition resize-none"
                />
              </div>

              {/* Timestamps */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Timestamps</label>
                  <span className="text-[10px] text-neutral-600">Auto-generated · editable</span>
                </div>
                <textarea
                  value={exportTimestamps}
                  onChange={(e) => setExportTimestamps(e.target.value)}
                  rows={4}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-teal-500/60 rounded-lg px-3 py-2.5 text-xs text-neutral-300 font-mono focus:outline-none transition resize-none"
                  placeholder="0:00 - Track Name"
                />
              </div>

              <p className="text-[10px] text-neutral-600 text-center">
                A <span className="text-neutral-400 font-mono">.metadata.txt</span> file will also be saved alongside your video.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-neutral-800">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExportConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black bg-white hover:bg-neutral-200 transition flex items-center justify-center gap-2"
              >
                <Download size={15} />
                Export Video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
