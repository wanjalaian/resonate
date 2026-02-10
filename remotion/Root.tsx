import React from 'react';
import { Composition } from 'remotion';
import { z } from 'zod';
import { VisualizerComposition } from '@/components/VisualizerComposition';
import "../app/globals.css";


const visualizerSchema = z.object({
    audioUrl: z.string().optional(),
    audioTracks: z.array(z.object({
        id: z.string(),
        url: z.string(),
        name: z.string(),
        durationInFrames: z.number()
    })).optional(),
    backgrounds: z.array(z.object({
        id: z.string(),
        type: z.enum(['image', 'video']),
        url: z.string(),
        name: z.string(),
        durationInSeconds: z.number(),
        trimStart: z.number(),
        trimEnd: z.number(),
        isBoomerang: z.boolean()
    })).optional(),
    config: z.object({
        color: z.string(),
        type: z.enum(['bars', 'wave']),
        sensitivity: z.number(),
        position: z.number(),
        orientation: z.enum(['horizontal', 'vertical']),
        showTitle: z.boolean(),
        titlePosition: z.enum(['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right']).optional().default('center')
    }).optional()
});

export const RemotionRoot = () => {
    return (
        <>
            <Composition
                id="Visualizer"
                component={VisualizerComposition}
                durationInFrames={30 * 60} // Default duration, overwritten by inputProps
                fps={30}
                width={1920}
                height={1080}
                schema={visualizerSchema}
                defaultProps={{
                    audioTracks: [],
                    config: {
                        color: '#ffffff',
                        type: 'wave',
                        sensitivity: 1.5,
                        position: 50,
                        orientation: 'horizontal',
                        showTitle: true,
                        titlePosition: 'center'
                    },
                }}
            />
        </>
    );
};
