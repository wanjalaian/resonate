import React from 'react';
import { useAudioData, visualizeAudio } from '@remotion/media-utils';
import { useCurrentFrame, useVideoConfig, Audio, Img, Series } from 'remotion';

export interface VisualizerConfig {
    color: string;
    type: 'bars' | 'wave';
    sensitivity: number;
    position: number; // 0 to 100 percentage
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

export interface VisualizerCompositionProps {
    audioUrl?: string; // fallback
    audioTracks?: AudioTrack[];
    bgImageUrl?: string;
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
                        {track.name.replace(/\.[^/.]+$/, "")}
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
    bgImageUrl,
    config = {
        color: '#ffffff',
        type: 'wave',
        sensitivity: 1.5,
        position: 50,
        orientation: 'horizontal',
        showTitle: true,
        titlePosition: 'center'
    },
}) => {
    const effectiveTracks = audioTracks.length > 0
        ? audioTracks
        : (audioUrl ? [{ id: 'default', url: audioUrl, durationInFrames: 30 * 60 * 30, name: 'Audio Track' }] : []);

    return (
        <div className="absolute inset-0 w-full h-full bg-black">
            {bgImageUrl ? (
                <Img src={bgImageUrl} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
                <div className="absolute inset-0 bg-neutral-900" />
            )}
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
