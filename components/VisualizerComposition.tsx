import React from 'react';
import { useAudioData, visualizeAudio } from '@remotion/media-utils';
import { useCurrentFrame, useVideoConfig, Audio, Img, Video, Series, Sequence } from 'remotion';

export type VisualizerPositionPreset = 'top' | 'center' | 'bottom' | 'lower-third';

export const VISUALIZER_POSITION_PRESETS: Record<VisualizerPositionPreset, number> = {
    'top': 15,
    'center': 50,
    'bottom': 85,
    'lower-third': 66,
};

export interface VisualizerConfig {
    color: string;
    type: 'bars' | 'wave';
    sensitivity: number;
    position: number; // 0 to 100 percentage (fine-tuning slider)
    visualizerPosition: VisualizerPositionPreset | 'custom'; // preset or custom
    orientation: 'horizontal' | 'vertical';
    showTitle: boolean;
    titlePosition: 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right';
}

export interface AudioTrack {
    id: string; // unique id for key
    url: string;
    name: string;
    durationInFrames: number;
}

export interface BackgroundMedia {
    id: string;
    type: 'image' | 'video';
    url: string;
    name: string;
    durationInSeconds: number; // for videos (0 for images?)
    trimStart: number; // seconds
    trimEnd: number; // seconds
    isBoomerang: boolean;
}

export interface VisualizerCompositionProps {
    audioUrl?: string; // fallback
    audioTracks?: AudioTrack[];
    backgrounds?: BackgroundMedia[];
    config?: VisualizerConfig;
}

const SingleTrackVisualizer: React.FC<{
    track: AudioTrack;
    config: VisualizerConfig;
}> = ({ track, config }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const audioData = useAudioData(track.url);

    if (!audioData) return null;

    const visualization = visualizeAudio({
        fps,
        frame,
        audioData,
        numberOfSamples: 256,
        smoothing: true,
    });

    // --- Mirrored Spectrum Logic ---
    const usefulBins = visualization.slice(0, 32);
    const leftSide = [...usefulBins].reverse();
    const rightSide = usefulBins;
    const finalBars = [...leftSide, ...rightSide];

    const bass = visualization.slice(0, 8).reduce((a, b) => a + b, 0) / 8;

    // Position Calcs
    const isVertical = config.orientation === 'vertical';
    const posPercent = config.position;

    const containerStyle: React.CSSProperties = isVertical ? {
        position: 'absolute',
        top: 0,
        left: `${posPercent}%`,
        width: 'auto',
        height: '100%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    } : {
        position: 'absolute',
        top: `${posPercent}%`,
        left: 0,
        width: '100%',
        height: 'auto',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
    };

    // Title Positioning Logic
    const getTitleStyle = (): React.CSSProperties => {
        const base: React.CSSProperties = {
            position: 'absolute',
            fontFamily: 'Inter, sans-serif',
            textShadow: '0 4px 12px rgba(0,0,0,0.8)',
            zIndex: 50,
            maxWidth: '80%',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
        };

        switch (config.titlePosition) {
            case 'top-left':
                return { ...base, top: '8%', left: '8%', alignItems: 'flex-start', textAlign: 'left' };
            case 'top-right':
                return { ...base, top: '8%', right: '8%', alignItems: 'flex-end', textAlign: 'right' };
            case 'bottom-left':
                return { ...base, bottom: '8%', left: '8%', alignItems: 'flex-start', textAlign: 'left' };
            case 'bottom-right':
                return { ...base, bottom: '8%', right: '8%', alignItems: 'flex-end', textAlign: 'right' };
            case 'center':
            default:
                return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', alignItems: 'center', textAlign: 'center' };
        }
    };

    return (
        <>
            <Audio src={track.url} />

            {/* Title Overlay */}
            {config.showTitle && (
                <div style={getTitleStyle()}>
                    <span className="text-xl font-bold text-neutral-200 uppercase tracking-widest drop-shadow-md opacity-90">
                        Now Playing:
                    </span>
                    <h1 className="text-5xl font-extrabold text-white tracking-tighter shadow-black drop-shadow-2xl">
                        {track.name}
                    </h1>
                </div>
            )}

            <div style={containerStyle} className="z-10 pointer-events-none">

                {/* BARS */}
                {config.type === 'bars' && (
                    <div className="flex gap-1" style={{ flexDirection: isVertical ? 'column' : 'row', alignItems: 'center' }}>
                        {finalBars.map((v, i) => {
                            const length = v * 250 * config.sensitivity; // Reduced multiplier
                            return (
                                <div
                                    key={i}
                                    style={{
                                        [isVertical ? 'width' : 'height']: `${Math.max(4, length)}px`,
                                        [isVertical ? 'height' : 'width']: '6px',
                                        backgroundColor: config.color,
                                        borderRadius: '2px',
                                        transition: 'all 0.1s ease',
                                        opacity: 0.95,
                                        boxShadow: `0 0 10px ${config.color}40`
                                    }}
                                />
                            );
                        })}
                    </div>
                )}

                {/* WAVE */}
                {config.type === 'wave' && (
                    <div style={{ width: isVertical ? '200px' : '100%', height: isVertical ? '100%' : '300px' }}>
                        <svg
                            viewBox={isVertical ? "0 0 200 1000" : "0 0 1000 300"}
                            preserveAspectRatio="none"
                            className="w-full h-full overflow-visible"
                        >
                            <path
                                d={isVertical ? (
                                    `M 100 0 ` +
                                    new Array(200).fill(0).map((_, i) => {
                                        const y = i * 5;
                                        const yNorm = i / 200;
                                        const envelope = Math.sin(yNorm * Math.PI);
                                        const amplitude = (20 + bass * 300) * config.sensitivity; // Reduced
                                        const wiggle = Math.sin(y * 0.1 + frame * 0.2) * (visualization[10] * 50);
                                        const xOffset = Math.sin(y * 0.02 + frame * 0.1) * amplitude * envelope + wiggle * envelope;
                                        return `L ${100 + xOffset} ${y}`;
                                    }).join(' ') +
                                    ` L 100 1000`
                                ) : (
                                    `M 0 150 ` +
                                    new Array(200).fill(0).map((_, i) => {
                                        const x = i * 5;
                                        const xNorm = i / 200;
                                        const envelope = Math.sin(xNorm * Math.PI);
                                        const amplitude = (20 + bass * 300) * config.sensitivity; // Reduced
                                        const wiggle = Math.sin(x * 0.1 + frame * 0.2) * (visualization[10] * 50);
                                        const yOffset = Math.sin(x * 0.02 + frame * 0.1) * amplitude * envelope + wiggle * envelope;
                                        return `L ${x} ${150 + yOffset}`;
                                    }).join(' ') +
                                    ` L 1000 150`
                                )}
                                fill="none"
                                stroke={config.color}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ filter: `drop-shadow(0 0 5px ${config.color})` }}
                            />
                        </svg>
                    </div>
                )}
            </div>
        </>
    );
};

export const VisualizerComposition: React.FC<VisualizerCompositionProps> = ({
    audioUrl,
    audioTracks = [],
    backgrounds = [],
    config = {
        color: '#ffffff',
        type: 'wave',
        sensitivity: 1.5,
        position: 50,
        visualizerPosition: 'center',
        orientation: 'horizontal',
        showTitle: true,
        titlePosition: 'center'
    },
}) => {
    const { fps, durationInFrames } = useVideoConfig();

    // Calculate effective audio duration to ensure background loops enough
    const totalAudioDuration = audioTracks.length > 0
        ? audioTracks.reduce((acc, t) => acc + t.durationInFrames, 0)
        : (audioUrl ? 30 * 60 : 300); // fallback

    // Calculate one full loop of background sequence
    const backgroundSequence: { media: BackgroundMedia; start: number; end: number; duration: number }[] = [];

    if (backgrounds.length === 0) {
        // Default black or fallback
    } else {
        let currentFrame = 0;

        // We need to tile the backgrounds until we cover totalAudioDuration
        // But doing it statically might be huge array.
        // Better: Just make one 'Unit' sequence and leave it to the user to manage? 
        // No, user said "loop throughout the entire video".
        // So we repeat the sequence.
    }

    // Helper to render backgrounds
    const renderBackgrounds = () => {
        if (backgrounds.length === 0) {
            return <div className="absolute inset-0 bg-neutral-900" />;
        }

        // 1. Calculate duration of one full pass of the user's background playlist
        let playlistDuration = 0;
        const processedItems = backgrounds.map(bg => {
            // duration = (trimEnd - trimStart) * (isBoomerang ? 2 : 1)
            // effectiveDuration in frames
            let durationSecs = 5; // default for image
            if (bg.type === 'video') {
                durationSecs = Math.max(0, bg.trimEnd - bg.trimStart);
            }
            // boomerang: double it? (even if we don't reverse yet, we reserve space)
            // For now, boomerang just plays same clip twice (forward-forward) as placeholder
            if (bg.isBoomerang) durationSecs *= 2;

            const frames = Math.round(durationSecs * fps);
            playlistDuration += frames;
            return { ...bg, durationInFrames: frames };
        });

        if (playlistDuration === 0) return <div className="absolute inset-0 bg-neutral-900" />;

        // 2. Calculate how many loops needed
        const loops = Math.ceil(totalAudioDuration / playlistDuration) + 1;

        // 3. Render
        const elements = [];
        let accumulatedFrame = 0;

        for (let l = 0; l < loops; l++) {
            for (const item of processedItems) {
                // Determine content
                const content = (
                    <>
                        {item.type === 'image' ? (
                            <Img src={item.url} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                            <Video
                                src={item.url}
                                startFrom={Math.round(item.trimStart * fps)}
                                endAt={Math.round(item.trimEnd * fps)}
                                className="absolute inset-0 w-full h-full object-cover"
                                volume={0} // Mute background
                            />
                        )}
                    </>
                );

                elements.push(
                    <Sequence
                        key={`${l}-${item.id}`}
                        from={accumulatedFrame}
                        durationInFrames={item.durationInFrames}
                        layout="none"
                    >
                        {content}
                        {/* Boomerang Placeholder: The second half would ideally be reversed */}
                        {/* Currently logic handles boomerang by doubling duration, but we just show one instance? */}
                        {/* Wait, if duration is doubled, we need to handle the content rendering twice? */}
                        {/* Simplified: processedItems already has total duration. But Sequence content is static. */}
                        {/* Let's refine logical loop */}
                    </Sequence>
                );

                // If boomerang, add the reverse part
                // The item.durationInFrames includes both parts.
                // We should split it?
                // Actually, cleaner logic: Iterate items, if boomerang, push Forward Sequence, then Reverse Sequence.
                // But processedItems already summed it.
                // Let's rewrite loop slightly.
                accumulatedFrame += item.durationInFrames;
            }
        }

        // Correct approach for loop rendering inside Loop
        // Wait, 'elements' array with Sequence is correct.
        // But the content inside Sequence needs to handle the boomerang logic if we want to show distinct forward/back.
        // Let's stick to simple forward for now.
        // The above loop pushes one Sequence per item per loop.
        // If item is boomerang (duration * 2), this Sequence will show the video for 2x time.
        // But Video component will likely loop or turn black if it exceeds endAt-startFrom.
        // We need to explicitly handle boomerang parts.

        return <>{elements}</>;
    };

    const renderBackgroundsRefined = () => {
        if (backgrounds.length === 0) return null;

        const elements: React.ReactElement[] = [];
        let accumulatedFrame = 0;

        // Pre-compute one cycle duration to know when to stop
        const cycleDuration = backgrounds.reduce((acc, bg) => {
            const secs = bg.type === 'image' ? 5 : Math.max(0.1, bg.trimEnd - bg.trimStart);
            const frames = Math.round(secs * fps);
            return acc + frames * (bg.isBoomerang && bg.type === 'video' ? 2 : 1);
        }, 0);

        if (cycleDuration === 0) return null;

        const needed = totalAudioDuration + fps * 2; // small buffer beyond audio end

        while (accumulatedFrame < needed) {
            for (const bg of backgrounds) {
                const durationSecs = bg.type === 'image' ? 5 : Math.max(0.1, bg.trimEnd - bg.trimStart);
                const durationFrames = Math.round(durationSecs * fps);

                // Forward pass
                elements.push(
                    <Sequence
                        key={`fwd-${accumulatedFrame}`}
                        from={accumulatedFrame}
                        durationInFrames={durationFrames + 1} // +1 overlaps next clip by 1 frame → no gap
                        layout="none"
                    >
                        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                            {bg.type === 'image' ? (
                                <Img src={bg.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <Video
                                    src={bg.url}
                                    startFrom={Math.round(bg.trimStart * fps)}
                                    endAt={Math.round(bg.trimEnd * fps)}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    volume={0}
                                />
                            )}
                        </div>
                    </Sequence>
                );
                accumulatedFrame += durationFrames;

                // Boomerang reverse pass (same clip, just counted again — true reversal requires server-side)
                if (bg.isBoomerang && bg.type === 'video') {
                    elements.push(
                        <Sequence
                            key={`rev-${accumulatedFrame}`}
                            from={accumulatedFrame}
                            durationInFrames={durationFrames + 1}
                            layout="none"
                        >
                            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                                <Video
                                    src={bg.url}
                                    startFrom={Math.round(bg.trimStart * fps)}
                                    endAt={Math.round(bg.trimEnd * fps)}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    volume={0}
                                />
                            </div>
                        </Sequence>
                    );
                    accumulatedFrame += durationFrames;
                }

                if (accumulatedFrame >= needed) break;
            }
        }

        return <>{elements}</>;
    };

    const effectiveTracks = audioTracks.length > 0
        ? audioTracks
        : (audioUrl ? [{ id: 'default', url: audioUrl, durationInFrames: 30 * 60 * 30, name: 'Audio Track' }] : []);

    // Persistent "last frame" background to prevent any black flash between sequences
    const firstBg = backgrounds[0];

    return (
        <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#111' }}>
            {/* Persistent fallback layer — always visible, shows first background media */}
            {firstBg && (
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                    {firstBg.type === 'image' ? (
                        <Img src={firstBg.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <Video
                            src={firstBg.url}
                            startFrom={Math.round(firstBg.trimStart * fps)}
                            endAt={Math.round(firstBg.trimEnd * fps)}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            volume={0}
                            loop
                        />
                    )}
                </div>
            )}

            {/* Looping sequence stack */}
            {renderBackgroundsRefined()}

            <Series>
                {effectiveTracks.map((track, i) => (
                    <Series.Sequence key={`${track.id}-${i}`} durationInFrames={track.durationInFrames}>
                        <SingleTrackVisualizer track={track} config={config} />
                    </Series.Sequence>
                ))}
            </Series>
        </div>
    );
};
